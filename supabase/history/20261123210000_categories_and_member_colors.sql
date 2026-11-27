-- Expense categories (built-in ones live in the app; custom ones per group) and member colors.
-- Additive only: existing rows keep working (null category, null color).

-- ─── Member color ─────────────────────────────────────────────────────────

alter table public.members
  add column color text check (color ~ '^#[0-9A-Fa-f]{6}$');

-- ─── Expense category ─────────────────────────────────────────────────────
-- Holds either a built-in id ("food", "transport"…) or a custom category id, so it has no
-- foreign key. If a custom category is deleted, the app shows its expenses as uncategorized.

alter table public.expenses
  add column category text check (char_length(category) between 1 and 64);

create index on public.expenses (group_id, category);

-- ─── Custom categories ────────────────────────────────────────────────────

create table public.categories (
  id         text primary key,
  group_id   text not null references public.groups (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create index on public.categories (group_id);

alter table public.categories enable row level security;

create policy "categories of joined groups" on public.categories
  for all to authenticated
  using (private.has_group_access(group_id)) with check (private.has_group_access(group_id));

grant select, insert, update, delete on public.categories to authenticated;

alter publication supabase_realtime add table public.categories;

-- ─── create_group: also store each member's color ─────────────────────────

create or replace function public.create_group(p_id text, p_name text, p_currency text, p_members jsonb)
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
    insert into public.groups (id, name, currency, invite_code) values (p_id, p_name, p_currency, v_code);
    insert into public.group_access (group_id, user_id) values (p_id, (select auth.uid()));
  end if;

  insert into public.members (id, group_id, name, position, color)
    select m ->> 'id', p_id, m ->> 'name', (t.ord - 1)::int, nullif(m ->> 'color', '')
    from jsonb_array_elements(p_members) with ordinality as t(m, ord)
  on conflict (id) do nothing;

  return v_code;
end;
$$;
