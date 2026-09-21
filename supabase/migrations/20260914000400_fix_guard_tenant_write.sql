-- Repair installations that applied the earlier version of migration 002.
-- Run this whole file once in Supabase SQL Editor, then re-run the failed seed.
-- Safe to re-run: this replaces only the trigger function and preserves data.
begin;

create or replace function private.guard_tenant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_new jsonb := '{}'::jsonb;
    v_old jsonb := '{}'::jsonb;
    v_tenant_id uuid;
    v_max_professionals integer;
begin
    -- This trigger is shared by tables with different columns. Never access
    -- NEW.tenant_id or NEW.active directly: those fields do not exist everywhere.
    if tg_op <> 'DELETE' then
        v_new := to_jsonb(new);
    end if;
    if tg_op <> 'INSERT' then
        v_old := to_jsonb(old);
    end if;

    if tg_table_name = 'tenants' then
        v_tenant_id := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
    else
        v_tenant_id := coalesce(v_new ->> 'tenant_id', v_old ->> 'tenant_id')::uuid;
    end if;

    perform private.lock_tenant(v_tenant_id);

    if tg_op = 'UPDATE' and tg_table_name <> 'tenants' then
        if (v_new ->> 'tenant_id') is distinct from (v_old ->> 'tenant_id') then
            raise exception 'TENANT_ID_IMMUTABLE';
        end if;
    end if;

    if tg_table_name = 'tenants' and tg_op <> 'DELETE' then
        if not exists (
            select 1 from pg_catalog.pg_timezone_names
            where name = v_new ->> 'timezone'
        ) then
            raise exception 'INVALID_TIMEZONE';
        end if;
        if tg_op = 'UPDATE' then
            if (v_new ->> 'slug') is distinct from (v_old ->> 'slug')
               or (v_new ->> 'id') is distinct from (v_old ->> 'id') then
                raise exception 'TENANT_ID_IMMUTABLE';
            end if;
        end if;
    elsif tg_table_name = 'professionals' and tg_op <> 'DELETE' then
        if (v_new ->> 'active')::boolean then
            select p.max_professionals into v_max_professionals
            from public.subscriptions s
            join public.plans p on p.id = s.plan_id
            where s.tenant_id = v_tenant_id and s.status <> 'CANCELLED';

            if v_max_professionals is not null and (
                select count(*) from public.professionals
                where tenant_id = v_tenant_id
                  and active
                  and id <> (v_new ->> 'id')::uuid
            ) >= v_max_professionals then
                raise exception 'PLAN_LIMIT_REACHED';
            end if;
        end if;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

revoke all on function private.guard_tenant_write() from public, anon, authenticated;
commit;
