-- Explicit privileges, independent of each project's defaults.
-- Supabase projects don't all start with the same default grants: newer ones give the API roles
-- nothing, others give anon/authenticated ALL privileges on new tables. Granting on top of those
-- defaults left extra rights in some environments (e.g. updating any column of a group).
-- So: start from nothing, then grant only what the app needs. RLS still decides which rows.

revoke all on table
  public.groups, public.group_access, public.members, public.categories,
  public.expenses, public.recurring_expenses
from anon, authenticated;

grant select on public.groups to authenticated;
-- Only name, currency and emoji are editable; id, invite_code, type and created_by are not.
grant update (name, currency, emoji) on public.groups to authenticated;
grant select on public.group_access to authenticated;
-- Only the per-user archive flag is editable.
grant update (archived) on public.group_access to authenticated;
grant select, insert, update, delete on
  public.members, public.categories, public.expenses, public.recurring_expenses
to authenticated;

-- RPCs: only signed-in users call them (the admin role doesn't need to).
revoke execute on function
  public.create_group(text, text, text, jsonb, text, text),
  public.join_group(text),
  public.leave_group(text),
  public.delete_group(text)
from service_role;

-- join_group / leave_group exactly as in the baseline (some environments had an earlier,
-- equivalent version). create or replace keeps their grants.
create or replace function public.join_group(p_code text)
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
create or replace function public.leave_group(p_group_id text)
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
