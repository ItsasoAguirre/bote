-- Group type: 'expenses' (shared expenses, the default) or 'loan' (a lender and one or more
-- borrowers who repay). Additive: existing groups become 'expenses'. The type is fixed at
-- creation, so it is not added to the columns members can update.

alter table public.groups
  add column type text not null default 'expenses' check (type in ('expenses', 'loan'));

-- create_group gains p_type. The signature changes, so the old function is replaced.
drop function public.create_group(text, text, text, jsonb, text);

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

revoke execute on function public.create_group(text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.create_group(text, text, text, jsonb, text, text) to authenticated;
