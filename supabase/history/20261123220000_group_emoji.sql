-- Group emoji (optional). Additive only: existing groups keep a null emoji and the app shows a default.

alter table public.groups
  add column emoji text check (char_length(emoji) between 1 and 16);

-- Members of a group can change its emoji, like its name and currency.
grant update (emoji) on public.groups to authenticated;

-- create_group gains an optional p_emoji. The signature changes, so the old function is replaced.
drop function public.create_group(text, text, text, jsonb);

create function public.create_group(
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
    insert into public.groups (id, name, currency, invite_code, emoji)
      values (p_id, p_name, p_currency, v_code, nullif(trim(p_emoji), ''));
    insert into public.group_access (group_id, user_id) values (p_id, (select auth.uid()));
  end if;

  insert into public.members (id, group_id, name, position, color)
    select m ->> 'id', p_id, m ->> 'name', (t.ord - 1)::int, nullif(m ->> 'color', '')
    from jsonb_array_elements(p_members) with ordinality as t(m, ord)
  on conflict (id) do nothing;

  return v_code;
end;
$$;

revoke execute on function public.create_group(text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_group(text, text, text, jsonb, text) to authenticated;
