-- Archive (per user) and delete (for everyone, creator only) groups.

-- ─── Archive: a per-user flag on the user's own access row ────────────────

alter table public.group_access
  add column archived boolean not null default false;

grant update (archived) on public.group_access to authenticated;

create policy "update own access" on public.group_access
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── Creator: only they can delete the group for everyone ─────────────────

alter table public.groups
  add column created_by uuid references auth.users (id) on delete set null;

-- Existing groups: the first person who joined is taken as the creator.
update public.groups g
set created_by = (
  select a.user_id from public.group_access a
  where a.group_id = g.id
  order by a.joined_at
  limit 1
)
where g.created_by is null;

-- create_group now records the creator (same signature, so create or replace keeps the grants).
create or replace function public.create_group(
  p_id text, p_name text, p_currency text, p_members jsonb, p_emoji text default null
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
    insert into public.groups (id, name, currency, invite_code, emoji, created_by)
      values (p_id, p_name, p_currency, v_code, nullif(trim(p_emoji), ''), (select auth.uid()));
    insert into public.group_access (group_id, user_id) values (p_id, (select auth.uid()));
  end if;

  insert into public.members (id, group_id, name, position, color)
    select m ->> 'id', p_id, m ->> 'name', (t.ord - 1)::int, nullif(m ->> 'color', '')
    from jsonb_array_elements(p_members) with ordinality as t(m, ord)
  on conflict (id) do nothing;

  return v_code;
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

revoke execute on function public.delete_group(text) from public, anon;
grant execute on function public.delete_group(text) to authenticated;
