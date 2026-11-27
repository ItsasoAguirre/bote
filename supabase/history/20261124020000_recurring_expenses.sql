-- Monthly recurring expenses (and loan repayments).
-- A rule stores the expense to repeat, the day of the month and the next date it's due.
-- An hourly pg_cron job creates every due expense, so it works even if nobody opens the app.

-- ─── Date helpers (mirror src/lib/recurring.ts) ───────────────────────────

-- The occurrence in a month: p_day, or the month's last day if it's shorter.
create function private.recurring_occurrence(p_year int, p_month int, p_day int)
returns date
language sql immutable set search_path = ''
as $$
  select make_date(p_year, p_month, 1)
    + (least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int) - 1);
$$;

-- First occurrence strictly after p_after for a monthly rule on p_day.
create function private.next_occurrence(p_after date, p_day int)
returns date
language plpgsql immutable set search_path = ''
as $$
declare
  v_same date := private.recurring_occurrence(extract(year from p_after)::int, extract(month from p_after)::int, p_day);
  v_next date := (date_trunc('month', p_after) + interval '1 month')::date;
begin
  if v_same > p_after then
    return v_same;
  end if;
  return private.recurring_occurrence(extract(year from v_next)::int, extract(month from v_next)::int, p_day);
end;
$$;

revoke execute on function private.recurring_occurrence(int, int, int) from public, anon, authenticated;
revoke execute on function private.next_occurrence(date, int) from public, anon, authenticated;

-- ─── Rules ────────────────────────────────────────────────────────────────

create table public.recurring_expenses (
  id           text primary key,
  group_id     text not null references public.groups (id) on delete cascade,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  -- The expense to repeat (same fields and rules as public.expenses).
  kind         text not null check (kind in ('expense', 'transfer')),
  title        text not null check (char_length(title) between 1 and 200),
  amount       integer not null check (amount > 0),
  paid_by      text not null references public.members (id),
  split_among  text[] not null check (cardinality(split_among) > 0),
  split_mode   text not null default 'equal' check (split_mode in ('equal', 'shares', 'amounts')),
  split_values jsonb check (split_values is null or jsonb_typeof(split_values) = 'object'),
  payers       jsonb check (payers is null or jsonb_typeof(payers) = 'object'),
  category     text check (char_length(category) between 1 and 64),
  -- Schedule
  day_of_month integer not null check (day_of_month between 1 and 31),
  next_date    date not null,
  active       boolean not null default true,
  -- Set when the job had to pause the rule (e.g. a member it uses was removed).
  last_error   text,
  created_at   timestamptz not null default now(),
  constraint recurring_split_values_present check (split_mode = 'equal' or split_values is not null),
  constraint recurring_amounts_add_up check (split_mode <> 'amounts' or private.jsonb_int_sum(split_values) = amount),
  constraint recurring_shares_positive check (split_mode <> 'shares' or private.jsonb_int_sum(split_values) > 0),
  constraint recurring_payers_add_up check (payers is null or private.jsonb_int_sum(payers) = amount)
);

create index on public.recurring_expenses (group_id);
create index on public.recurring_expenses (next_date) where active;

alter table public.recurring_expenses enable row level security;

create policy "recurring of joined groups" on public.recurring_expenses
  for all to authenticated
  using (private.has_group_access(group_id)) with check (private.has_group_access(group_id));

grant select, insert, update, delete on public.recurring_expenses to authenticated;

-- Expenses created by a rule point back to it (kept if the rule is deleted).
alter table public.expenses
  add column recurring_id text references public.recurring_expenses (id) on delete set null;

alter publication supabase_realtime add table public.recurring_expenses;

-- ─── Generator ────────────────────────────────────────────────────────────

-- Creates every due expense (catching up missed months) and advances next_date.
-- A rule that fails (e.g. it references a removed member) is paused with the error,
-- without blocking the others. Dates are in Spain's time zone.
create function private.generate_recurring_expenses(
  p_today date default (now() at time zone 'Europe/Madrid')::date
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r public.recurring_expenses;
  v_date date;
  v_count integer := 0;
  v_guard integer;
begin
  for r in
    select * from public.recurring_expenses
    where active and next_date <= p_today
    order by next_date
    for update skip locked
  loop
    begin
      v_date := r.next_date;
      v_guard := 0;
      while v_date <= p_today and v_guard < 36 loop
        insert into public.expenses (
          id, group_id, kind, title, amount, paid_by, split_among,
          split_mode, split_values, payers, category, date, recurring_id
        ) values (
          gen_random_uuid()::text, r.group_id, r.kind, r.title, r.amount, r.paid_by, r.split_among,
          r.split_mode, r.split_values, r.payers, r.category,
          (v_date + time '12:00') at time zone 'Europe/Madrid', r.id
        );
        v_count := v_count + 1;
        v_guard := v_guard + 1;
        v_date := private.next_occurrence(v_date, r.day_of_month);
      end loop;
      update public.recurring_expenses set next_date = v_date, last_error = null where id = r.id;
    exception when others then
      update public.recurring_expenses set active = false, last_error = sqlerrm where id = r.id;
    end;
  end loop;
  return v_count;
end;
$$;

-- Only the scheduled job runs it.
revoke execute on function private.generate_recurring_expenses(date) from public, anon, authenticated;

-- ─── Schedule: every hour, at minute 5 ────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'generate-recurring-expenses',
  '5 * * * *',
  $$select private.generate_recurring_expenses()$$
);
