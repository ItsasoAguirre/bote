-- Uneven splits (by shares or exact amounts) and several payers per expense.
-- Additive: existing expenses get split_mode 'equal' and no payers, so they keep their meaning.

-- Sum of an object's integer values, e.g. {"a": 800, "b": 400} → 1200. Fails on non-integers.
create function private.jsonb_int_sum(j jsonb)
returns bigint
language sql immutable set search_path = ''
as $$
  select coalesce(sum(value::bigint), 0) from jsonb_each_text(j);
$$;
revoke execute on function private.jsonb_int_sum(jsonb) from public, anon;
grant execute on function private.jsonb_int_sum(jsonb) to authenticated;

alter table public.expenses
  add column split_mode text not null default 'equal'
    check (split_mode in ('equal', 'shares', 'amounts')),
  -- Weights ('shares') or cents ('amounts') per member id. Null for 'equal'.
  add column split_values jsonb
    check (split_values is null or jsonb_typeof(split_values) = 'object'),
  -- Cents paid by each member id when several paid. Null: paid_by paid everything.
  add column payers jsonb
    check (payers is null or jsonb_typeof(payers) = 'object');

-- The database refuses inconsistent expenses, whatever the client sends.
alter table public.expenses
  add constraint expenses_split_values_present
    check (split_mode = 'equal' or split_values is not null),
  add constraint expenses_amounts_add_up
    check (split_mode <> 'amounts' or private.jsonb_int_sum(split_values) = amount),
  add constraint expenses_shares_positive
    check (split_mode <> 'shares' or private.jsonb_int_sum(split_values) > 0),
  add constraint expenses_payers_add_up
    check (payers is null or private.jsonb_int_sum(payers) = amount);
