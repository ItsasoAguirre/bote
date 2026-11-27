-- Incomes: money coming into the group from outside (e.g. a Bizum Ana got that is for Beto).
-- paid_by = who received it; split_among / split_values = who it belongs to (split like an expense).
-- The app treats it as an expense with the opposite sign; it is never counted as spending.

alter table public.expenses drop constraint expenses_kind_check;
alter table public.expenses
  add constraint expenses_kind_check check (kind in ('expense', 'transfer', 'income'));

alter table public.recurring_expenses drop constraint recurring_expenses_kind_check;
alter table public.recurring_expenses
  add constraint recurring_expenses_kind_check check (kind in ('expense', 'transfer', 'income'));

-- Notifications: an income notifies the people it is for (except its author and whoever received it).
--   One owner:  "Ana ha recibido 50,00 € para ti · Bizum de Carlos"
--   Several:    "💰 Devolución Ikea · 30,00 € (lo recibió Ana)"
create or replace function private.notify_new_expense()
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
  elsif new.kind = 'income' then
    if cardinality(new.split_among) = 1 then
      v_body := coalesce(v_payer, 'Alguien') || ' ha recibido '
        || private.format_money(new.amount, v_group.currency) || ' para ti · ' || new.title;
    else
      v_body := '💰 ' || new.title || ' · ' || private.format_money(new.amount, v_group.currency)
        || ' (lo recibió ' || coalesce(v_payer, '?') || ')';
    end if;
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
    and case new.kind
      when 'transfer' then a.member_id = new.split_among[1]
      when 'income' then a.member_id = any (new.split_among) and a.member_id <> new.paid_by
      else true
    end;

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
