-- Push notifications in each device's language (es, en, eu).
-- The app sends its language when it registers the token, and again when the user changes it.

alter table public.push_tokens
  add column locale text not null default 'es' check (locale in ('es', 'en', 'eu'));

-- register_push_token gains an optional p_locale. Older app versions keep calling it with two
-- arguments and get 'es'.
drop function public.register_push_token(text, text);

create function public.register_push_token(p_token text, p_platform text, p_locale text default 'es')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_locale text := case when p_locale in ('es', 'en', 'eu') then p_locale else 'es' end;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.push_tokens (token, user_id, platform, locale, updated_at)
    values (p_token, (select auth.uid()), p_platform, v_locale, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, locale = excluded.locale, updated_at = now();
end;
$$;

revoke execute on function public.register_push_token(text, text, text) from public, anon, service_role;
grant execute on function public.register_push_token(text, text, text) to authenticated;

-- Money as each language writes it: es/eu "1.234,50 €", en "€1,234.50".
create function private.format_money(p_cents integer, p_currency text, p_locale text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_locale = 'en' then
      case p_currency when 'EUR' then '€' when 'GBP' then '£' when 'USD' then 'US$' else p_currency || ' ' end
        || to_char(p_cents / 100.0, 'FM999,999,999,990.00')
    else
      translate(to_char(p_cents / 100.0, 'FM999,999,999,990.00'), ',.', '.,')
        || ' ' || case p_currency when 'EUR' then '€' when 'GBP' then '£' when 'USD' then 'US$' else p_currency end
  end;
$$;
revoke execute on function private.format_money(integer, text, text) from public, anon, authenticated;

-- Notification text for one movement in one language. Basque templates never attach a case
-- suffix to a name (it depends on how the name ends), so the payer goes before a colon or in
-- parentheses.
create function private.push_body(
  p_kind text, p_title text, p_money text, p_payer text, p_single_owner boolean, p_recurring boolean, p_locale text
)
returns text
language sql immutable set search_path = ''
as $$
  select case p_locale
    when 'en' then case
      when p_kind = 'transfer' then coalesce(p_payer, 'Someone') || ' paid you ' || p_money
      when p_kind = 'income' and p_single_owner then
        coalesce(p_payer, 'Someone') || ' received ' || p_money || ' for you · ' || p_title
      when p_kind = 'income' then '💰 ' || p_title || ' · ' || p_money || ' (received by ' || coalesce(p_payer, '?') || ')'
      else case when p_recurring then '🔁 ' else '' end
        || p_title || ' · ' || p_money || ' (paid by ' || coalesce(p_payer, '?') || ')'
    end
    when 'eu' then case
      when p_kind = 'transfer' then coalesce(p_payer, 'Norbait') || ': ' || p_money || ' ordaindu dizu'
      when p_kind = 'income' and p_single_owner then
        coalesce(p_payer, 'Norbait') || ': ' || p_money || ' jaso du zuretzat · ' || p_title
      when p_kind = 'income' then '💰 ' || p_title || ' · ' || p_money || ' (jasotzailea: ' || coalesce(p_payer, '?') || ')'
      else case when p_recurring then '🔁 ' else '' end
        || p_title || ' · ' || p_money || ' (ordaintzailea: ' || coalesce(p_payer, '?') || ')'
    end
    else case
      when p_kind = 'transfer' then coalesce(p_payer, 'Alguien') || ' te ha pagado ' || p_money
      when p_kind = 'income' and p_single_owner then
        coalesce(p_payer, 'Alguien') || ' ha recibido ' || p_money || ' para ti · ' || p_title
      when p_kind = 'income' then '💰 ' || p_title || ' · ' || p_money || ' (lo recibió ' || coalesce(p_payer, '?') || ')'
      else case when p_recurring then '🔁 ' else '' end
        || p_title || ' · ' || p_money || ' (pagó ' || coalesce(p_payer, '?') || ')'
    end
  end;
$$;
revoke execute on function private.push_body(text, text, text, text, boolean, boolean, text) from public, anon, authenticated;

-- Same recipients as before; each message now uses its device's language.
create or replace function private.notify_new_expense()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_group public.groups;
  v_payer text;
  v_title text;
  v_messages jsonb;
begin
  select * into v_group from public.groups where id = new.group_id;
  select name into v_payer from public.members where id = new.paid_by;
  v_title := coalesce(v_group.emoji, '👥') || ' ' || v_group.name;

  -- Devices of the group's users who should hear about it, with their language.
  with recipients as (
    select distinct t.token, t.locale
    from public.group_access a
    join public.push_tokens t on t.user_id = a.user_id
    where a.group_id = new.group_id
      and not a.muted
      and (new.created_by is null or a.user_id <> new.created_by)
      and case new.kind
        when 'transfer' then a.member_id = new.split_among[1]
        when 'income' then a.member_id = any (new.split_among) and a.member_id <> new.paid_by
        else true
      end
  )
  select jsonb_agg(jsonb_build_object(
      'to', r.token,
      'title', v_title,
      'body', private.push_body(
        new.kind, new.title, private.format_money(new.amount, v_group.currency, r.locale), v_payer,
        cardinality(new.split_among) = 1, new.recurring_id is not null, r.locale),
      'data', jsonb_build_object('groupId', new.group_id),
      'sound', 'default',
      'channelId', 'default',
      'priority', 'high'
    ) order by r.token)
  into v_messages
  from recipients r;

  if v_messages is null then
    return new;
  end if;

  -- Expo accepts up to 100 messages per request.
  for i in 0 .. jsonb_array_length(v_messages) - 1 by 100 loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := (
        select jsonb_agg(e.m order by e.n)
        from jsonb_array_elements(v_messages) with ordinality as e(m, n)
        where e.n > i and e.n <= i + 100
      ),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end loop;
  return new;
exception when others then
  -- Notifications must never stop an expense from being saved.
  raise warning 'push notification not sent: %', sqlerrm;
  return new;
end;
$$;

-- Only the notification used the two-argument version.
drop function private.format_money(integer, text);
