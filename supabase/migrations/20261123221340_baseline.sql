-- Baseline: the complete schema of the app (applied once to every environment).
-- Local: `npx supabase start` / `npx supabase db reset` applies it. Dev and prod: already applied.
-- Later changes go in NEW migration files after this one; never edit this file.
-- The step-by-step history that led here is kept in supabase/history/ for reference.
--
-- Access model: there is no sign-up. Every device signs in anonymously and gets a user id.
-- A device can only see a group after creating it or joining it with its invite code
-- (rows in group_access). All tables are protected by Row Level Security.

-- ─── Helpers needed by the tables ──────────────────────────────────────────

create schema if not exists private;

-- Sum of an object's integer values, e.g. {"a": 800, "b": 400} → 1200. Fails on non-integers.
create function private.jsonb_int_sum(j jsonb)
returns bigint
language sql immutable set search_path = ''
as $$
  select coalesce(sum(value::bigint), 0) from jsonb_each_text(j);
$$;
revoke execute on function private.jsonb_int_sum(jsonb) from public, anon;
grant execute on function private.jsonb_int_sum(jsonb) to authenticated;

-- ─── Tables ────────────────────────────────────────────────────────────────

create table public.groups (
  id          text primary key,
  name        text not null check (char_length(name) between 1 and 100),
  -- 'expenses': shared expenses. 'loan': a lender and borrowers who repay. Fixed at creation.
  type        text not null default 'expenses' check (type in ('expenses', 'loan')),
  currency    text not null default 'EUR' check (char_length(currency) = 3),
  invite_code text not null unique,
  emoji       text check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  -- Only the creator can delete the group for everyone.
  created_by  uuid references auth.users (id) on delete set null
);

create table public.group_access (
  group_id  text not null references public.groups (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- Per-user: hides the group from this user's list.
  archived  boolean not null default false,
  primary key (group_id, user_id)
);

create table public.members (
  id       text primary key,
  group_id text not null references public.groups (id) on delete cascade,
  name     text not null check (char_length(name) between 1 and 60),
  position integer not null default 0,
  color    text check (color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Custom categories per group. Built-in ones ("food", "transport"…) live in the app.
create table public.categories (
  id         text primary key,
  group_id   text not null references public.groups (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id          text primary key,
  group_id    text not null references public.groups (id) on delete cascade,
  kind        text not null check (kind in ('expense', 'transfer')),
  title       text not null check (char_length(title) between 1 and 200),
  amount      integer not null check (amount > 0),        -- cents
  paid_by     text not null references public.members (id),
  split_among text[] not null check (cardinality(split_among) > 0),
  date        timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Built-in or custom category id (no foreign key). Null for transfers / uncategorized.
  category    text check (char_length(category) between 1 and 64),
  -- How the amount is divided: equally, by whole-number weights, or by exact cents.
  split_mode   text not null default 'equal' check (split_mode in ('equal', 'shares', 'amounts')),
  -- Weights ('shares') or cents ('amounts') per member id. Null for 'equal'.
  split_values jsonb check (split_values is null or jsonb_typeof(split_values) = 'object'),
  -- Cents paid by each member id when several paid. Null: paid_by paid everything.
  payers       jsonb check (payers is null or jsonb_typeof(payers) = 'object'),
  -- The database refuses inconsistent expenses, whatever the client sends.
  constraint expenses_split_values_present check (split_mode = 'equal' or split_values is not null),
  constraint expenses_amounts_add_up check (split_mode <> 'amounts' or private.jsonb_int_sum(split_values) = amount),
  constraint expenses_shares_positive check (split_mode <> 'shares' or private.jsonb_int_sum(split_values) > 0),
  constraint expenses_payers_add_up check (payers is null or private.jsonb_int_sum(payers) = amount)
);

create index on public.group_access (user_id);
create index on public.members (group_id);
create index on public.categories (group_id);
create index on public.expenses (group_id);
create index on public.expenses (group_id, category);

-- ─── Privileges ───────────────────────────────────────────────────────────
-- New Supabase projects do not grant table privileges to the API roles automatically.
-- RLS (below) decides which rows each user sees; these grants only allow the operations
-- the app needs. anon gets nothing.

grant select on public.groups to authenticated;
-- Only name, currency and emoji are editable; invite_code and id are not.
grant update (name, currency, emoji) on public.groups to authenticated;
grant select on public.group_access to authenticated;
grant update (archived) on public.group_access to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;

-- Access helper used by the RLS policies. It lives in a schema the API doesn't expose,
-- so it can't be called directly as an RPC.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.has_group_access(gid text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_access
    where group_id = gid and user_id = (select auth.uid())
  );
$$;
revoke execute on function private.has_group_access(text) from public, anon;
grant execute on function private.has_group_access(text) to authenticated;

-- ─── Row Level Security ───────────────────────────────────────────────────

alter table public.groups       enable row level security;
alter table public.group_access enable row level security;
alter table public.members      enable row level security;
alter table public.categories   enable row level security;
alter table public.expenses     enable row level security;

create policy "read joined groups" on public.groups
  for select to authenticated using (private.has_group_access(id));
create policy "edit joined groups" on public.groups
  for update to authenticated
  using (private.has_group_access(id)) with check (private.has_group_access(id));

create policy "read own access" on public.group_access
  for select to authenticated using (user_id = (select auth.uid()));
create policy "update own access" on public.group_access
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "members of joined groups" on public.members
  for all to authenticated
  using (private.has_group_access(group_id)) with check (private.has_group_access(group_id));

create policy "categories of joined groups" on public.categories
  for all to authenticated
  using (private.has_group_access(group_id)) with check (private.has_group_access(group_id));

create policy "expenses of joined groups" on public.expenses
  for all to authenticated
  using (private.has_group_access(group_id)) with check (private.has_group_access(group_id));

-- ─── Functions ────────────────────────────────────────────────────────────
-- Creating, joining and leaving go through these functions, so nobody can insert
-- group_access rows directly or list groups they have not joined.

-- Creates the group and its members in one transaction. Retrying with the same id is safe.
create function public.create_group(
  p_id text,
  p_name text,
  p_currency text,
  p_members jsonb,
  p_emoji text default null,
  p_type text default 'expenses'
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  select invite_code into v_code from public.groups where id = p_id;
  if v_code is not null then
    -- Retry of a create this user already made: fine. Someone else's id: refuse.
    if not private.has_group_access(p_id) then
      raise exception 'group id already in use' using errcode = '23505';
    end if;
  else
    loop
      v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      exit when not exists (select 1 from public.groups where invite_code = v_code);
    end loop;
    insert into public.groups (id, name, currency, invite_code, emoji, created_by, type)
      values (
        p_id, p_name, p_currency, v_code, nullif(trim(p_emoji), ''), (select auth.uid()),
        coalesce(p_type, 'expenses')
      );
    insert into public.group_access (group_id, user_id) values (p_id, (select auth.uid()));
  end if;

  insert into public.members (id, group_id, name, position, color)
    select m ->> 'id', p_id, m ->> 'name', (t.ord - 1)::int, nullif(m ->> 'color', '')
    from jsonb_array_elements(p_members) with ordinality as t(m, ord)
  on conflict (id) do nothing;

  return v_code;
end;
$$;

create function public.join_group(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_id text;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  select id into v_id from public.groups where invite_code = upper(trim(p_code));
  if v_id is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  insert into public.group_access (group_id, user_id) values (v_id, (select auth.uid()))
    on conflict do nothing;
  return v_id;
end;
$$;

-- Leaving removes the group from this device. The group is deleted when nobody is left.
create function public.leave_group(p_group_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.group_access where group_id = p_group_id and user_id = (select auth.uid());
  delete from public.groups g
    where g.id = p_group_id
      and not exists (select 1 from public.group_access a where a.group_id = g.id);
end;
$$;

-- Deletes the group with all its members, categories and expenses, for everyone.
create function public.delete_group(p_group_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.groups
    where id = p_group_id and created_by = (select auth.uid())
  ) then
    raise exception 'only the creator can delete this group' using errcode = '42501';
  end if;
  delete from public.groups where id = p_group_id;
end;
$$;

revoke execute on function public.create_group(text, text, text, jsonb, text, text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.leave_group(text) from public, anon;
revoke execute on function public.delete_group(text) from public, anon;
grant execute on function public.create_group(text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.leave_group(text) to authenticated;
grant execute on function public.delete_group(text) to authenticated;

-- ─── Realtime ─────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.groups, public.members, public.categories, public.expenses;

-- ═══ Recurring expenses (monthly) ═══════════════════════════════════════════

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
