alter table public.tenants
  add column if not exists provider_type text not null default 'CLINIC',
  add column if not exists page_template text not null default 'CLASSIC',
  add column if not exists hero_image_path text,
  add column if not exists tagline text;

alter table public.tenants
  drop constraint if exists tenants_provider_type_check,
  add constraint tenants_provider_type_check
    check (provider_type in ('CLINIC','INDEPENDENT_PROFESSIONAL'));

alter table public.tenants
  drop constraint if exists tenants_page_template_check,
  add constraint tenants_page_template_check
    check (page_template in ('CLASSIC','EDITORIAL','COMPACT'));

create index if not exists professionals_specialty_active_idx
  on public.professionals (active, specialty);

drop function if exists public.get_public_tenant_by_slug(text);

create or replace function public.get_public_tenant_by_slug(p_slug text)
returns table (
    id uuid,
    name text,
    slug text,
    description text,
    phone text,
    email text,
    address text,
    website text,
    timezone text,
    logo_path text,
    primary_color text,
    secondary_color text,
    welcome_text text,
    provider_type text,
    page_template text,
    hero_image_path text,
    tagline text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        t.id,
        t.name,
        t.slug,
        t.description,
        t.phone,
        t.email,
        t.address,
        t.website,
        t.timezone,
        t.logo_path,
        t.primary_color,
        t.secondary_color,
        t.welcome_text,
        t.provider_type,
        t.page_template,
        t.hero_image_path,
        t.tagline
    from public.tenants t
    where t.slug = lower(p_slug)
      and t.active = true
      and public.tenant_has_active_subscription(t.id)
    limit 1;
$$;

create or replace function public.get_public_specialties()
returns table (specialty text)
language sql
stable
security definer
set search_path = public
as $$
    select distinct trim(p.specialty) as specialty
    from public.professionals p
    join public.tenants t on t.id = p.tenant_id
    where p.active = true
      and nullif(trim(p.specialty), '') is not null
      and t.active = true
      and public.tenant_has_active_subscription(t.id)
    order by trim(p.specialty);
$$;

create or replace function public.search_public_providers(
    p_query text default null,
    p_specialty text default null
)
returns table (
    id uuid,
    name text,
    slug text,
    provider_type text,
    description text,
    tagline text,
    address text,
    phone text,
    email text,
    logo_path text,
    hero_image_path text,
    primary_color text,
    secondary_color text,
    specialties text[]
)
language sql
stable
security definer
set search_path = public
as $$
    with public_tenants as (
        select
            t.id,
            t.name,
            t.slug,
            t.provider_type,
            t.description,
            t.tagline,
            t.address,
            t.phone,
            t.email,
            t.logo_path,
            t.hero_image_path,
            t.primary_color,
            t.secondary_color,
            array_agg(distinct trim(p.specialty) order by trim(p.specialty)) as specialties
        from public.tenants t
        join public.professionals p on p.tenant_id = t.id
        where t.active = true
          and public.tenant_has_active_subscription(t.id)
          and p.active = true
          and nullif(trim(p.specialty), '') is not null
        group by t.id
    )
    select
        pt.id,
        pt.name,
        pt.slug,
        pt.provider_type,
        pt.description,
        pt.tagline,
        pt.address,
        pt.phone,
        pt.email,
        pt.logo_path,
        pt.hero_image_path,
        pt.primary_color,
        pt.secondary_color,
        pt.specialties
    from public_tenants pt
    where (
        nullif(trim(p_query), '') is null
        or pt.name ilike '%' || trim(p_query) || '%'
        or coalesce(pt.description, '') ilike '%' || trim(p_query) || '%'
        or coalesce(pt.tagline, '') ilike '%' || trim(p_query) || '%'
        or exists (
            select 1
            from unnest(pt.specialties) s
            where s ilike '%' || trim(p_query) || '%'
        )
    )
      and (
        nullif(trim(p_specialty), '') is null
        or exists (
            select 1
            from unnest(pt.specialties) s
            where lower(s) = lower(trim(p_specialty))
        )
      )
    order by pt.name;
$$;

drop function if exists public.register_tenant(text,text,text,text,text,text,text);
drop function if exists public.create_tenant(text,text,text,text);

create or replace function public.create_tenant(
    p_name text,
    p_slug text,
    p_timezone text default 'America/Argentina/Buenos_Aires',
    p_plan_code text default 'BASIC',
    p_provider_type text default 'CLINIC'
)
returns table(tenant_id uuid, tenant_slug text)
language plpgsql
security definer
set search_path=''
as $$
declare
    t uuid;
    p uuid;
    v_provider_type text := coalesce(nullif(trim(p_provider_type), ''), 'CLINIC');
begin
    perform private.rate_limit();
    if nullif(trim(p_name), '') is null
       or p_slug is null
       or lower(p_slug) !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or length(p_slug) > 63 then
        raise exception 'INVALID_TENANT_NAME';
    end if;
    if v_provider_type not in ('CLINIC', 'INDEPENDENT_PROFESSIONAL') then
        raise exception 'INVALID_TENANT_DATA';
    end if;
    if (select count(*) from public.tenant_members where user_id = auth.uid() and role = 'TENANT_ADMIN') >= 5 then
        raise exception 'PLAN_LIMIT_REACHED';
    end if;
    select id into p from public.plans where code = p_plan_code and active;
    if p is null then
        raise exception 'PLAN_NOT_FOUND';
    end if;
    insert into public.tenants(name, slug, timezone, provider_type)
    values(trim(p_name), lower(p_slug), p_timezone, v_provider_type)
    returning id into t;
    insert into public.subscriptions(tenant_id, plan_id, status, trial_ends_at)
    values(t, p, 'TRIALING', now() + interval '14 days');
    insert into public.tenant_members(tenant_id, user_id, role)
    values(t, auth.uid(), 'TENANT_ADMIN');
    return query select t, lower(p_slug);
exception when unique_violation then
    raise exception 'SLUG_TAKEN';
end $$;

create or replace function public.register_tenant(
    p_name text,
    p_slug text,
    p_responsible_name text,
    p_phone text,
    p_email text,
    p_timezone text default 'America/Argentina/Buenos_Aires',
    p_plan_code text default 'BASIC',
    p_provider_type text default 'CLINIC'
)
returns table(tenant_id uuid, tenant_slug text)
language plpgsql
security definer
set search_path=''
as $$
declare
    r record;
begin
    if nullif(trim(p_responsible_name), '') is null
       or nullif(trim(p_phone), '') is null
       or p_email is null
       or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'INVALID_TENANT_DATA';
    end if;
    select * into r from public.create_tenant(
        p_name,
        p_slug,
        p_timezone,
        p_plan_code,
        p_provider_type
    );
    update public.tenants
       set responsible_name = trim(p_responsible_name),
           phone = trim(p_phone),
           email = trim(p_email)
     where id = r.tenant_id;
    return query select r.tenant_id, r.tenant_slug;
end $$;

grant execute on function public.get_public_specialties() to anon, authenticated;
grant execute on function public.search_public_providers(text,text) to anon, authenticated;
grant execute on function public.register_tenant(text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_tenant(text,text,text,text,text) to authenticated;
