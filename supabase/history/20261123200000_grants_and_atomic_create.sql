-- Fix: "permission denied for table groups" (HTTP 403).
-- New Supabase projects don't grant table privileges to the API roles automatically, so the
-- app's queries were rejected before RLS was evaluated. RLS still decides which rows each
-- user sees; these grants only allow the operations the app needs.

-- ─── 1. Table privileges (least privilege; anon gets nothing) ─────────────

grant select on public.groups to authenticated;
-- Only name and currency are editable; invite_code and id are not.
grant update (name, currency) on public.groups to authenticated;
grant select on public.group_access to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;

-- ─── 2. Move the access helper out of the API-exposed schema ──────────────

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

drop policy "read joined groups" on public.groups;
drop policy "edit joined groups" on public.groups;
drop policy "members of joined groups" on public.members;
drop policy "expenses of joined groups" on public.expenses;

create policy "read joined groups" on public.groups
  for select to authenticated using (private.has_group_access(id));
create policy "edit joined groups" on public.groups
  for update to authenticated
  using (private.has_group_access(id)) with check (private.has_group_access(id));
create policy "members of joined groups" on public.members
  for all to authenticated
  using (private.has_group_access(group_id)) with check (private.has_group_access(group_id));
create policy "expenses of joined groups" on public.expenses
  for all to authenticated
  using (private.has_group_access(group_id)) with check (private.has_group_access(group_id));

drop function public.has_group_access(text);

-- ─── 3. Create the group and its members in one transaction ───────────────
-- Before, members were inserted in a second request; if it failed, an empty group was left
-- behind. Now it is atomic, and retrying with the same id is safe (idempotent).

drop function public.create_group(text, text, text);

create function public.create_group(p_id text, p_name text, p_currency text, p_members jsonb)
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

  insert into public.members (id, group_id, name, position)
    select m ->> 'id', p_id, m ->> 'name', (t.ord - 1)::int
    from jsonb_array_elements(p_members) with ordinality as t(m, ord)
  on conflict (id) do nothing;

  return v_code;
end;
$$;

revoke execute on function public.create_group(text, text, text, jsonb) from public, anon;
grant execute on function public.create_group(text, text, text, jsonb) to authenticated;
