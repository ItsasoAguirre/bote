-- Push notifications, sent from the database through Expo's push service:
-- - New expense in a group → everyone else in the group (not the author, not muted).
-- - Repayment (transfer) → only the person who receives it: "Ben te ha pagado 20,00 €".
-- - Expenses created by the monthly job have no author → everyone (or the recipient).
-- pg_net sends the request only after the transaction commits, so a failed insert never notifies.

create extension if not exists pg_net with schema extensions;

-- ─── Device tokens ────────────────────────────────────────────────────────

create table public.push_tokens (
  token      text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform   text check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);

create index on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "read own tokens" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;

-- Writes go through these functions. A token belongs to a device, so registering it moves it to
-- the current user (e.g. after reinstalling the app, which creates a new anonymous user).
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
    values (p_token, (select auth.uid()), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create function public.unregister_push_token(p_token text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid());
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon, service_role;
revoke execute on function public.unregister_push_token(text) from public, anon, service_role;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ─── Per-user group settings ──────────────────────────────────────────────

alter table public.group_access
  -- Who I am in this group ("¿Quién eres?"), so "te han pagado" reaches the right person.
  add column member_id text references public.members (id) on delete set null,
  -- Mute this group's notifications (only for me).
  add column muted boolean not null default false;

grant update (member_id, muted) on public.group_access to authenticated;

-- member_id must be a member of that same group.
create function private.check_access_member()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.member_id is not null and not exists (
    select 1 from public.members m where m.id = new.member_id and m.group_id = new.group_id
  ) then
    raise exception 'member % is not in this group', new.member_id using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_access_member() from public, anon, authenticated;

create trigger group_access_member_in_group
  before insert or update of member_id on public.group_access
  for each row execute function private.check_access_member();

-- ─── Author of an expense ─────────────────────────────────────────────────
-- So the author isn't notified of their own expense. Null for expenses created by the monthly job.

alter table public.expenses
  add column created_by uuid default auth.uid() references auth.users (id) on delete set null;

-- ─── Money text for notifications: 1234.5 EUR → "1.234,50 €" ──────────────

create function private.format_money(p_cents integer, p_currency text)
returns text
language sql immutable set search_path = ''
as $$
  select translate(to_char(p_cents / 100.0, 'FM999,999,999,990.00'), ',.', '.,')
    || ' ' || case p_currency when 'EUR' then '€' when 'GBP' then '£' when 'USD' then 'US$' else p_currency end;
$$;
revoke execute on function private.format_money(integer, text) from public, anon, authenticated;

-- ─── Sending ──────────────────────────────────────────────────────────────

create function private.notify_new_expense()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_group public.groups;
  v_payer text;
  v_title text;
  v_body text;
  v_tokens text[];
  v_batch text[];
begin
  select * into v_group from public.groups where id = new.group_id;
  select name into v_payer from public.members where id = new.paid_by;
  v_title := coalesce(v_group.emoji, '👥') || ' ' || v_group.name;

  if new.kind = 'transfer' then
    v_body := coalesce(v_payer, 'Alguien') || ' te ha pagado ' || private.format_money(new.amount, v_group.currency);
  else
    v_body := case when new.recurring_id is not null then '🔁 ' else '' end
      || new.title || ' · ' || private.format_money(new.amount, v_group.currency)
      || ' (pagó ' || coalesce(v_payer, '?') || ')';
  end if;

  -- Devices of the group's users who should hear about it.
  select array_agg(distinct t.token) into v_tokens
  from public.group_access a
  join public.push_tokens t on t.user_id = a.user_id
  where a.group_id = new.group_id
    and not a.muted
    and (new.created_by is null or a.user_id <> new.created_by)
    and (new.kind <> 'transfer' or a.member_id = new.split_among[1]);

  if v_tokens is null then
    return new;
  end if;

  -- Expo accepts up to 100 messages per request.
  for i in 1 .. cardinality(v_tokens) by 100 loop
    v_batch := v_tokens[i : i + 99];
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := (
        select jsonb_agg(jsonb_build_object(
          'to', tok,
          'title', v_title,
          'body', v_body,
          'data', jsonb_build_object('groupId', new.group_id),
          'sound', 'default',
          'channelId', 'default',
          'priority', 'high'
        ))
        from unnest(v_batch) as tok
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
revoke execute on function private.notify_new_expense() from public, anon, authenticated;

create trigger expenses_notify
  after insert on public.expenses
  for each row execute function private.notify_new_expense();
