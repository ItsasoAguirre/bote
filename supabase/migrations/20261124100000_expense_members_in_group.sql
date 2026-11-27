-- Every member an expense (or recurring rule) refers to must belong to the same group:
-- paid_by, split_among, and the keys of payers / split_values. Foreign keys can't express this
-- (arrays and JSON keys, and paid_by alone only checks the member exists in *some* group),
-- so a trigger checks it, whatever the client sends.

create function private.check_expense_members()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_missing text;
begin
  select x into v_missing
  from (
    select new.paid_by as x
    union select unnest(new.split_among)
    union select jsonb_object_keys(coalesce(new.payers, '{}'::jsonb))
    union select jsonb_object_keys(coalesce(new.split_values, '{}'::jsonb))
  ) refs
  where not exists (
    select 1 from public.members m where m.id = refs.x and m.group_id = new.group_id
  )
  limit 1;

  if v_missing is not null then
    raise exception 'member % is not in this group', v_missing using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke execute on function private.check_expense_members() from public, anon, authenticated;

create trigger expenses_members_in_group
  before insert or update on public.expenses
  for each row execute function private.check_expense_members();

create trigger recurring_members_in_group
  before insert or update on public.recurring_expenses
  for each row execute function private.check_expense_members();
