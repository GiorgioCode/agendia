-- =====================================================================
-- SaaS Multitenant de Gestión y Reserva de Turnos
-- Supabase / PostgreSQL
--
-- Ejecutar en:
--   Supabase Dashboard -> SQL Editor
-- o mediante migraciones de Supabase CLI.
--
-- Modelo:
--   Shared Database + Shared Schema + tenant_id + RLS
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. EXTENSIONES
-- ---------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 2. TABLAS GLOBALES
-- ---------------------------------------------------------------------

create table if not exists public.plans (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    description text,
    price numeric(12,2),
    currency text not null default 'ARS',
    max_professionals integer,
    max_admins integer,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    constraint plans_price_check check (price is null or price >= 0),
    constraint plans_max_professionals_check check (max_professionals is null or max_professionals > 0),
    constraint plans_max_admins_check check (max_admins is null or max_admins > 0)
);

create table if not exists public.tenants (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    description text,
    phone text,
    email text,
    address text,
    website text,
    timezone text not null default 'America/Argentina/Buenos_Aires',
    logo_path text,
    primary_color text,
    secondary_color text,
    welcome_text text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tenants_slug_format_check
        check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.tenant_domains (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    hostname text not null unique,
    verified boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    plan_id uuid not null references public.plans(id),
    status text not null,
    starts_at timestamptz not null default now(),
    trial_ends_at timestamptz,
    current_period_end timestamptz,
    provider text,
    provider_subscription_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint subscriptions_status_check
        check (status in ('TRIALING','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED'))
);

create table if not exists public.tenant_members (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    constraint tenant_members_role_check
        check (role in ('TENANT_ADMIN','OPERATOR','PROFESSIONAL')),
    constraint tenant_members_tenant_user_unique
        unique (tenant_id, user_id)
);

-- Soporte técnico para is_platform_admin().
-- No se expone directamente al frontend.
create table if not exists public.platform_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. TABLAS DE NEGOCIO MULTITENANT
-- ---------------------------------------------------------------------

create table if not exists public.professionals (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    first_name text not null,
    last_name text not null,
    specialty text not null,
    registration_number text,
    phone text,
    email text,
    description text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint professionals_tenant_id_id_unique
        unique (tenant_id, id)
);

create table if not exists public.patients (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    first_name text not null,
    last_name text not null,
    dni text,
    phone text,
    email text,
    notes text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint patients_tenant_id_id_unique
        unique (tenant_id, id),
    constraint patients_tenant_user_unique
        unique (tenant_id, user_id)
);

create unique index if not exists patients_tenant_dni_unique
    on public.patients (tenant_id, dni)
    where dni is not null;

create table if not exists public.professional_schedules (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    professional_id uuid not null,
    day_of_week integer not null,
    start_time time not null,
    end_time time not null,
    appointment_duration integer not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),

    constraint professional_schedules_professional_fk
        foreign key (tenant_id, professional_id)
        references public.professionals (tenant_id, id)
        on delete cascade,

    constraint professional_schedules_day_check
        check (day_of_week between 1 and 7),

    constraint professional_schedules_time_check
        check (start_time < end_time),

    constraint professional_schedules_duration_check
        check (appointment_duration > 0)
);

create table if not exists public.schedule_exceptions (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    professional_id uuid not null,
    exception_date date not null,
    type text not null,
    start_time time,
    end_time time,
    appointment_duration integer,
    reason text,
    created_at timestamptz not null default now(),

    constraint schedule_exceptions_professional_fk
        foreign key (tenant_id, professional_id)
        references public.professionals (tenant_id, id)
        on delete cascade,

    constraint schedule_exceptions_type_check
        check (type in ('CLOSED','CUSTOM_HOURS','BLOCKED')),

    constraint schedule_exceptions_time_check
        check (
            (start_time is null and end_time is null)
            or
            (start_time is not null and end_time is not null and start_time < end_time)
        ),

    constraint schedule_exceptions_duration_check
        check (appointment_duration is null or appointment_duration > 0),

    constraint schedule_exceptions_custom_hours_check
        check (
            type <> 'CUSTOM_HOURS'
            or
            (start_time is not null and end_time is not null)
        )
);

create table if not exists public.appointments (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    professional_id uuid not null,
    patient_id uuid not null,
    appointment_date date not null,
    start_time time not null,
    end_time time not null,
    status text not null default 'CONFIRMED',
    reason text,
    notes text,
    source text not null default 'PATIENT',
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint appointments_professional_fk
        foreign key (tenant_id, professional_id)
        references public.professionals (tenant_id, id),

    constraint appointments_patient_fk
        foreign key (tenant_id, patient_id)
        references public.patients (tenant_id, id),

    constraint appointments_time_check
        check (start_time < end_time),

    constraint appointments_status_check
        check (status in ('PENDING','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),

    constraint appointments_source_check
        check (source in ('PATIENT','ADMIN','OPERATOR'))
);

-- ---------------------------------------------------------------------
-- 4. ÍNDICES
-- ---------------------------------------------------------------------

create index if not exists tenants_slug_idx
    on public.tenants (slug);

create index if not exists tenant_domains_hostname_idx
    on public.tenant_domains (hostname);

create index if not exists subscriptions_tenant_status_idx
    on public.subscriptions (tenant_id, status);

create unique index if not exists subscriptions_one_current_per_tenant
    on public.subscriptions (tenant_id)
    where status in ('TRIALING','ACTIVE','PAST_DUE','SUSPENDED');

create index if not exists tenant_members_user_idx
    on public.tenant_members (user_id);

create index if not exists tenant_members_tenant_idx
    on public.tenant_members (tenant_id);

create index if not exists professionals_tenant_active_idx
    on public.professionals (tenant_id, active);

create index if not exists patients_tenant_idx
    on public.patients (tenant_id);

create index if not exists patients_user_idx
    on public.patients (user_id);

create index if not exists professional_schedules_lookup_idx
    on public.professional_schedules
    (tenant_id, professional_id, day_of_week, active);

create index if not exists schedule_exceptions_lookup_idx
    on public.schedule_exceptions
    (tenant_id, professional_id, exception_date, type);

create index if not exists appointments_professional_date_idx
    on public.appointments
    (tenant_id, professional_id, appointment_date);

create index if not exists appointments_patient_idx
    on public.appointments
    (tenant_id, patient_id);

create index if not exists appointments_status_idx
    on public.appointments
    (tenant_id, status);

-- Protección adicional para dos reservas del mismo inicio de slot.
-- CANCELLED libera el horario.
create unique index if not exists appointments_unique_blocking_slot
    on public.appointments
    (tenant_id, professional_id, appointment_date, start_time)
    where status in ('PENDING','CONFIRMED','COMPLETED','NO_SHOW');

-- ---------------------------------------------------------------------
-- 5. TRIGGERS updated_at
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_tenants_updated_at on public.tenants;
create trigger trg_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_professionals_updated_at on public.professionals;
create trigger trg_professionals_updated_at
before update on public.professionals
for each row execute function public.set_updated_at();

drop trigger if exists trg_patients_updated_at on public.patients;
create trigger trg_patients_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

-- El tenant de una fila existente no puede cambiar.
create or replace function public.prevent_tenant_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.tenant_id is distinct from old.tenant_id then
        raise exception 'TENANT_ID_IMMUTABLE';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_professionals_tenant_immutable on public.professionals;
create trigger trg_professionals_tenant_immutable
before update on public.professionals
for each row execute function public.prevent_tenant_change();

drop trigger if exists trg_patients_tenant_immutable on public.patients;
create trigger trg_patients_tenant_immutable
before update on public.patients
for each row execute function public.prevent_tenant_change();

drop trigger if exists trg_schedules_tenant_immutable on public.professional_schedules;
create trigger trg_schedules_tenant_immutable
before update on public.professional_schedules
for each row execute function public.prevent_tenant_change();

drop trigger if exists trg_exceptions_tenant_immutable on public.schedule_exceptions;
create trigger trg_exceptions_tenant_immutable
before update on public.schedule_exceptions
for each row execute function public.prevent_tenant_change();

drop trigger if exists trg_appointments_tenant_immutable on public.appointments;
create trigger trg_appointments_tenant_immutable
before update on public.appointments
for each row execute function public.prevent_tenant_change();

-- Impide horarios semanales activos superpuestos.
create or replace function public.validate_professional_schedule_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.active = true and exists (
        select 1
        from public.professional_schedules s
        where s.tenant_id = new.tenant_id
          and s.professional_id = new.professional_id
          and s.day_of_week = new.day_of_week
          and s.active = true
          and s.id <> new.id
          and not (
              new.end_time <= s.start_time
              or new.start_time >= s.end_time
          )
    ) then
        raise exception 'SCHEDULE_OVERLAP';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_validate_professional_schedule_overlap
on public.professional_schedules;

create trigger trg_validate_professional_schedule_overlap
before insert or update on public.professional_schedules
for each row execute function public.validate_professional_schedule_overlap();

-- CUSTOM_HOURS no puede superponerse con otro CUSTOM_HOURS del mismo día.
create or replace function public.validate_custom_hours_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.type = 'CUSTOM_HOURS' and exists (
        select 1
        from public.schedule_exceptions e
        where e.tenant_id = new.tenant_id
          and e.professional_id = new.professional_id
          and e.exception_date = new.exception_date
          and e.type = 'CUSTOM_HOURS'
          and e.id <> new.id
          and not (
              new.end_time <= e.start_time
              or new.start_time >= e.end_time
          )
    ) then
        raise exception 'CUSTOM_HOURS_OVERLAP';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_validate_custom_hours_overlap
on public.schedule_exceptions;

create trigger trg_validate_custom_hours_overlap
before insert or update on public.schedule_exceptions
for each row execute function public.validate_custom_hours_overlap();

-- Un paciente normal no puede editar campos internos/sensibles.
create or replace function public.protect_patient_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is not null
       and old.user_id = auth.uid()
       and not public.can_manage_tenant(old.tenant_id) then

        if new.user_id is distinct from old.user_id
           or new.notes is distinct from old.notes
           or new.active is distinct from old.active then
            raise exception 'PATIENT_FIELD_NOT_EDITABLE';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_protect_patient_sensitive_fields on public.patients;
create trigger trg_protect_patient_sensitive_fields
before update on public.patients
for each row execute function public.protect_patient_sensitive_fields();

-- ---------------------------------------------------------------------
-- 6. FUNCIONES AUXILIARES DE AUTORIZACIÓN
-- ---------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
    );
$$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = p_tenant_id
          and tm.user_id = auth.uid()
          and tm.active = true
    );
$$;

create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = p_tenant_id
          and tm.user_id = auth.uid()
          and tm.active = true
          and tm.role = 'TENANT_ADMIN'
    );
$$;

create or replace function public.can_manage_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_platform_admin()
        or exists (
            select 1
            from public.tenant_members tm
            where tm.tenant_id = p_tenant_id
              and tm.user_id = auth.uid()
              and tm.active = true
              and tm.role in ('TENANT_ADMIN','OPERATOR')
        );
$$;

create or replace function public.tenant_has_active_subscription(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.subscriptions s
        where s.tenant_id = p_tenant_id
          and (
                s.status = 'ACTIVE'
                or (
                    s.status = 'TRIALING'
                    and (s.trial_ends_at is null or s.trial_ends_at >= now())
                )
          )
          and (s.current_period_end is null or s.current_period_end >= now())
    );
$$;

-- ---------------------------------------------------------------------
-- 7. RPC: CREAR TENANT
-- ---------------------------------------------------------------------

create or replace function public.create_tenant(
    p_name text,
    p_slug text,
    p_timezone text default 'America/Argentina/Buenos_Aires',
    p_plan_code text default 'BASIC'
)
returns table (
    tenant_id uuid,
    tenant_slug text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_tenant_id uuid;
    v_plan_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'UNAUTHORIZED';
    end if;

    if p_name is null or btrim(p_name) = '' then
        raise exception 'INVALID_TENANT_NAME';
    end if;

    if p_slug is null
       or lower(p_slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
        raise exception 'INVALID_TENANT_SLUG';
    end if;

    select p.id
      into v_plan_id
      from public.plans p
     where p.code = p_plan_code
       and p.active = true
     limit 1;

    if v_plan_id is null then
        raise exception 'PLAN_NOT_FOUND';
    end if;

    insert into public.tenants (name, slug, timezone)
    values (btrim(p_name), lower(p_slug), coalesce(nullif(p_timezone,''), 'America/Argentina/Buenos_Aires'))
    returning id into v_tenant_id;

    insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant_id, v_user_id, 'TENANT_ADMIN');

    insert into public.subscriptions (
        tenant_id,
        plan_id,
        status,
        starts_at
    )
    values (
        v_tenant_id,
        v_plan_id,
        'TRIALING',
        now()
    );

    return query
    select v_tenant_id, lower(p_slug);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC PÚBLICAS
-- ---------------------------------------------------------------------

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
    welcome_text text
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
        t.welcome_text
    from public.tenants t
    where t.slug = lower(p_slug)
      and t.active = true
      and public.tenant_has_active_subscription(t.id)
    limit 1;
$$;

create or replace function public.get_public_professionals(p_tenant_slug text)
returns table (
    id uuid,
    first_name text,
    last_name text,
    specialty text,
    description text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        p.id,
        p.first_name,
        p.last_name,
        p.specialty,
        p.description
    from public.professionals p
    join public.tenants t on t.id = p.tenant_id
    where t.slug = lower(p_tenant_slug)
      and t.active = true
      and public.tenant_has_active_subscription(t.id)
      and p.active = true
    order by p.last_name, p.first_name;
$$;

-- ---------------------------------------------------------------------
-- 9. RPC: DISPONIBILIDAD
-- ---------------------------------------------------------------------

create or replace function public.get_available_slots(
    p_tenant_slug text,
    p_professional_id uuid,
    p_target_date date
)
returns table (
    start_time time,
    end_time time
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid;
    v_timezone text;
    v_now_local timestamp;
    v_range record;
    v_slot_start time;
    v_slot_end time;
    v_duration integer;
    v_has_custom boolean;
begin
    select t.id, t.timezone
      into v_tenant_id, v_timezone
      from public.tenants t
     where t.slug = lower(p_tenant_slug)
       and t.active = true
     limit 1;

    if v_tenant_id is null then
        return;
    end if;

    if not public.tenant_has_active_subscription(v_tenant_id) then
        return;
    end if;

    if not exists (
        select 1
        from public.professionals p
        where p.id = p_professional_id
          and p.tenant_id = v_tenant_id
          and p.active = true
    ) then
        return;
    end if;

    v_now_local := timezone(v_timezone, now());

    if p_target_date < v_now_local::date then
        return;
    end if;

    if exists (
        select 1
        from public.schedule_exceptions e
        where e.tenant_id = v_tenant_id
          and e.professional_id = p_professional_id
          and e.exception_date = p_target_date
          and e.type = 'CLOSED'
    ) then
        return;
    end if;

    select exists (
        select 1
        from public.schedule_exceptions e
        where e.tenant_id = v_tenant_id
          and e.professional_id = p_professional_id
          and e.exception_date = p_target_date
          and e.type = 'CUSTOM_HOURS'
    )
    into v_has_custom;

    if v_has_custom then
        for v_range in
            select
                e.start_time,
                e.end_time,
                coalesce(
                    e.appointment_duration,
                    (
                        select min(s.appointment_duration)
                        from public.professional_schedules s
                        where s.tenant_id = v_tenant_id
                          and s.professional_id = p_professional_id
                          and s.active = true
                    ),
                    30
                ) as appointment_duration
            from public.schedule_exceptions e
            where e.tenant_id = v_tenant_id
              and e.professional_id = p_professional_id
              and e.exception_date = p_target_date
              and e.type = 'CUSTOM_HOURS'
            order by e.start_time
        loop
            v_duration := v_range.appointment_duration;
            v_slot_start := v_range.start_time;

            while v_slot_start + make_interval(mins => v_duration) <= v_range.end_time loop
                v_slot_end := v_slot_start + make_interval(mins => v_duration);

                if not (
                    p_target_date = v_now_local::date
                    and v_slot_start <= v_now_local::time
                )
                and not exists (
                    select 1
                    from public.schedule_exceptions b
                    where b.tenant_id = v_tenant_id
                      and b.professional_id = p_professional_id
                      and b.exception_date = p_target_date
                      and b.type = 'BLOCKED'
                      and (
                            (b.start_time is null and b.end_time is null)
                            or
                            not (
                                v_slot_end <= b.start_time
                                or v_slot_start >= b.end_time
                            )
                      )
                )
                and not exists (
                    select 1
                    from public.appointments a
                    where a.tenant_id = v_tenant_id
                      and a.professional_id = p_professional_id
                      and a.appointment_date = p_target_date
                      and a.status in ('PENDING','CONFIRMED','COMPLETED','NO_SHOW')
                      and not (
                          v_slot_end <= a.start_time
                          or v_slot_start >= a.end_time
                      )
                ) then
                    start_time := v_slot_start;
                    end_time := v_slot_end;
                    return next;
                end if;

                v_slot_start := v_slot_end;
            end loop;
        end loop;
    else
        for v_range in
            select
                s.start_time,
                s.end_time,
                s.appointment_duration
            from public.professional_schedules s
            where s.tenant_id = v_tenant_id
              and s.professional_id = p_professional_id
              and s.day_of_week = extract(isodow from p_target_date)::integer
              and s.active = true
            order by s.start_time
        loop
            v_duration := v_range.appointment_duration;
            v_slot_start := v_range.start_time;

            while v_slot_start + make_interval(mins => v_duration) <= v_range.end_time loop
                v_slot_end := v_slot_start + make_interval(mins => v_duration);

                if not (
                    p_target_date = v_now_local::date
                    and v_slot_start <= v_now_local::time
                )
                and not exists (
                    select 1
                    from public.schedule_exceptions b
                    where b.tenant_id = v_tenant_id
                      and b.professional_id = p_professional_id
                      and b.exception_date = p_target_date
                      and b.type = 'BLOCKED'
                      and (
                            (b.start_time is null and b.end_time is null)
                            or
                            not (
                                v_slot_end <= b.start_time
                                or v_slot_start >= b.end_time
                            )
                      )
                )
                and not exists (
                    select 1
                    from public.appointments a
                    where a.tenant_id = v_tenant_id
                      and a.professional_id = p_professional_id
                      and a.appointment_date = p_target_date
                      and a.status in ('PENDING','CONFIRMED','COMPLETED','NO_SHOW')
                      and not (
                          v_slot_end <= a.start_time
                          or v_slot_start >= a.end_time
                      )
                ) then
                    start_time := v_slot_start;
                    end_time := v_slot_end;
                    return next;
                end if;

                v_slot_start := v_slot_end;
            end loop;
        end loop;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. RPC: PERFIL DE PACIENTE
-- ---------------------------------------------------------------------

create or replace function public.ensure_patient_profile(
    p_tenant_slug text,
    p_first_name text,
    p_last_name text,
    p_dni text default null,
    p_phone text default null,
    p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_tenant_id uuid;
    v_patient_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'UNAUTHORIZED';
    end if;

    select t.id
      into v_tenant_id
      from public.tenants t
     where t.slug = lower(p_tenant_slug)
       and t.active = true
     limit 1;

    if v_tenant_id is null then
        raise exception 'TENANT_NOT_FOUND';
    end if;

    if not public.tenant_has_active_subscription(v_tenant_id) then
        raise exception 'SUBSCRIPTION_INACTIVE';
    end if;

    if p_first_name is null or btrim(p_first_name) = ''
       or p_last_name is null or btrim(p_last_name) = '' then
        raise exception 'INVALID_PATIENT_DATA';
    end if;

    insert into public.patients (
        tenant_id,
        user_id,
        first_name,
        last_name,
        dni,
        phone,
        email
    )
    values (
        v_tenant_id,
        v_user_id,
        btrim(p_first_name),
        btrim(p_last_name),
        nullif(btrim(p_dni), ''),
        nullif(btrim(p_phone), ''),
        nullif(btrim(p_email), '')
    )
    on conflict (tenant_id, user_id)
    do update set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        dni = excluded.dni,
        phone = excluded.phone,
        email = excluded.email,
        active = true,
        updated_at = now()
    returning id into v_patient_id;

    return v_patient_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 11. RPC: RESERVA ATÓMICA DEL PACIENTE
-- ---------------------------------------------------------------------

create or replace function public.book_appointment(
    p_tenant_slug text,
    p_professional_id uuid,
    p_target_date date,
    p_start_time time,
    p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_tenant_id uuid;
    v_patient_id uuid;
    v_end_time time;
    v_appointment_id uuid;
    v_lock_key bigint;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'UNAUTHORIZED';
    end if;

    select t.id
      into v_tenant_id
      from public.tenants t
     where t.slug = lower(p_tenant_slug)
       and t.active = true
     limit 1;

    if v_tenant_id is null then
        raise exception 'TENANT_NOT_FOUND';
    end if;

    if not public.tenant_has_active_subscription(v_tenant_id) then
        raise exception 'SUBSCRIPTION_INACTIVE';
    end if;

    select p.id
      into v_patient_id
      from public.patients p
     where p.tenant_id = v_tenant_id
       and p.user_id = v_user_id
       and p.active = true
     limit 1;

    if v_patient_id is null then
        raise exception 'PATIENT_PROFILE_REQUIRED';
    end if;

    -- Serializa reservas del mismo profesional y fecha.
    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' ||
        p_professional_id::text || ':' ||
        p_target_date::text,
        0
    );

    perform pg_advisory_xact_lock(v_lock_key);

    select s.end_time
      into v_end_time
      from public.get_available_slots(
            p_tenant_slug,
            p_professional_id,
            p_target_date
      ) s
     where s.start_time = p_start_time
     limit 1;

    if v_end_time is null then
        raise exception 'SLOT_UNAVAILABLE';
    end if;

    insert into public.appointments (
        tenant_id,
        professional_id,
        patient_id,
        appointment_date,
        start_time,
        end_time,
        status,
        reason,
        source,
        created_by
    )
    values (
        v_tenant_id,
        p_professional_id,
        v_patient_id,
        p_target_date,
        p_start_time,
        v_end_time,
        'CONFIRMED',
        nullif(btrim(p_reason), ''),
        'PATIENT',
        v_user_id
    )
    returning id into v_appointment_id;

    return v_appointment_id;

exception
    when unique_violation then
        raise exception 'SLOT_UNAVAILABLE';
end;
$$;

-- ---------------------------------------------------------------------
-- 12. RPC: CANCELACIÓN DEL PROPIO PACIENTE
-- ---------------------------------------------------------------------

create or replace function public.cancel_own_appointment(
    p_appointment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'UNAUTHORIZED';
    end if;

    update public.appointments a
       set status = 'CANCELLED'
     where a.id = p_appointment_id
       and a.status in ('PENDING','CONFIRMED')
       and exists (
           select 1
           from public.patients p
           join public.tenants t
             on t.id = a.tenant_id
           where p.id = a.patient_id
             and p.tenant_id = a.tenant_id
             and p.user_id = v_user_id
             and (a.appointment_date + a.start_time) > timezone(t.timezone, now())
       );

    if not found then
        raise exception 'APPOINTMENT_NOT_CANCELLABLE';
    end if;

    return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. RPC ADMIN: CREAR TURNO
-- ---------------------------------------------------------------------

create or replace function public.admin_create_appointment(
    p_tenant_id uuid,
    p_professional_id uuid,
    p_patient_id uuid,
    p_target_date date,
    p_start_time time,
    p_reason text default null,
    p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_slug text;
    v_end_time time;
    v_appointment_id uuid;
    v_lock_key bigint;
    v_source text;
begin
    if not public.can_manage_tenant(p_tenant_id) then
        raise exception 'UNAUTHORIZED';
    end if;

    select t.slug
      into v_slug
      from public.tenants t
     where t.id = p_tenant_id
       and t.active = true;

    if v_slug is null then
        raise exception 'TENANT_NOT_FOUND';
    end if;

    if not exists (
        select 1
        from public.patients p
        where p.id = p_patient_id
          and p.tenant_id = p_tenant_id
          and p.active = true
    ) then
        raise exception 'PATIENT_NOT_FOUND';
    end if;

    v_lock_key := hashtextextended(
        p_tenant_id::text || ':' ||
        p_professional_id::text || ':' ||
        p_target_date::text,
        0
    );

    perform pg_advisory_xact_lock(v_lock_key);

    select s.end_time
      into v_end_time
      from public.get_available_slots(
            v_slug,
            p_professional_id,
            p_target_date
      ) s
     where s.start_time = p_start_time
     limit 1;

    if v_end_time is null then
        raise exception 'SLOT_UNAVAILABLE';
    end if;

    select case
             when exists (
                select 1
                from public.tenant_members tm
                where tm.tenant_id = p_tenant_id
                  and tm.user_id = auth.uid()
                  and tm.role = 'OPERATOR'
                  and tm.active = true
             )
             then 'OPERATOR'
             else 'ADMIN'
           end
      into v_source;

    insert into public.appointments (
        tenant_id,
        professional_id,
        patient_id,
        appointment_date,
        start_time,
        end_time,
        status,
        reason,
        notes,
        source,
        created_by
    )
    values (
        p_tenant_id,
        p_professional_id,
        p_patient_id,
        p_target_date,
        p_start_time,
        v_end_time,
        'CONFIRMED',
        nullif(btrim(p_reason), ''),
        nullif(btrim(p_notes), ''),
        v_source,
        auth.uid()
    )
    returning id into v_appointment_id;

    return v_appointment_id;

exception
    when unique_violation then
        raise exception 'SLOT_UNAVAILABLE';
end;
$$;

-- ---------------------------------------------------------------------
-- 14. RPC ADMIN: REPROGRAMAR TURNO
-- ---------------------------------------------------------------------

create or replace function public.admin_reschedule_appointment(
    p_appointment_id uuid,
    p_professional_id uuid,
    p_target_date date,
    p_start_time time
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid;
    v_slug text;
    v_old_status text;
    v_end_time time;
    v_lock_key bigint;
begin
    select a.tenant_id, a.status
      into v_tenant_id, v_old_status
      from public.appointments a
     where a.id = p_appointment_id
     for update;

    if v_tenant_id is null then
        raise exception 'APPOINTMENT_NOT_FOUND';
    end if;

    if not public.can_manage_tenant(v_tenant_id) then
        raise exception 'UNAUTHORIZED';
    end if;

    select t.slug
      into v_slug
      from public.tenants t
     where t.id = v_tenant_id
       and t.active = true;

    if v_slug is null then
        raise exception 'TENANT_NOT_FOUND';
    end if;

    v_lock_key := hashtextextended(
        v_tenant_id::text || ':' ||
        p_professional_id::text || ':' ||
        p_target_date::text,
        0
    );

    perform pg_advisory_xact_lock(v_lock_key);

    -- Libera temporalmente el slot actual dentro de la misma transacción.
    -- Si algo falla, toda la transacción se revierte.
    update public.appointments
       set status = 'CANCELLED'
     where id = p_appointment_id;

    select s.end_time
      into v_end_time
      from public.get_available_slots(
            v_slug,
            p_professional_id,
            p_target_date
      ) s
     where s.start_time = p_start_time
     limit 1;

    if v_end_time is null then
        raise exception 'SLOT_UNAVAILABLE';
    end if;

    update public.appointments
       set professional_id = p_professional_id,
           appointment_date = p_target_date,
           start_time = p_start_time,
           end_time = v_end_time,
           status = case
                      when v_old_status = 'CANCELLED' then 'CONFIRMED'
                      else v_old_status
                    end,
           updated_at = now()
     where id = p_appointment_id;

    return true;

exception
    when unique_violation then
        raise exception 'SLOT_UNAVAILABLE';
end;
$$;

-- ---------------------------------------------------------------------
-- 15. RPC ADMIN: CAMBIAR ESTADO
-- ---------------------------------------------------------------------

create or replace function public.admin_set_appointment_status(
    p_appointment_id uuid,
    p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tenant_id uuid;
    v_current_status text;
begin
    if p_status not in ('PENDING','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW') then
        raise exception 'INVALID_STATUS';
    end if;

    select a.tenant_id, a.status
      into v_tenant_id, v_current_status
      from public.appointments a
     where a.id = p_appointment_id
     for update;

    if v_tenant_id is null then
        raise exception 'APPOINTMENT_NOT_FOUND';
    end if;

    if not public.can_manage_tenant(v_tenant_id) then
        raise exception 'UNAUTHORIZED';
    end if;

    -- Un turno cancelado no se reactiva directamente, porque su slot
    -- puede haber sido ocupado. Debe pasar por admin_reschedule_appointment().
    if v_current_status = 'CANCELLED' and p_status <> 'CANCELLED' then
        raise exception 'CANCELLED_APPOINTMENT_REQUIRES_RESCHEDULE';
    end if;

    update public.appointments
       set status = p_status
     where id = p_appointment_id;

    return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 16. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tenant_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.professionals enable row level security;
alter table public.patients enable row level security;
alter table public.professional_schedules enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.appointments enable row level security;

-- PLANES --------------------------------------------------------------

drop policy if exists "plans_public_read_active" on public.plans;
create policy "plans_public_read_active"
on public.plans
for select
to anon, authenticated
using (active = true or public.is_platform_admin());

drop policy if exists "plans_platform_manage" on public.plans;
create policy "plans_platform_manage"
on public.plans
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- TENANTS -------------------------------------------------------------

drop policy if exists "tenants_member_read" on public.tenants;
create policy "tenants_member_read"
on public.tenants
for select
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_member(id)
);

drop policy if exists "tenants_admin_update" on public.tenants;
create policy "tenants_admin_update"
on public.tenants
for update
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_admin(id)
)
with check (
    public.is_platform_admin()
    or public.is_tenant_admin(id)
);

-- DOMINIOS ------------------------------------------------------------

drop policy if exists "tenant_domains_member_read" on public.tenant_domains;
create policy "tenant_domains_member_read"
on public.tenant_domains
for select
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_member(tenant_id)
);

drop policy if exists "tenant_domains_admin_manage" on public.tenant_domains;
create policy "tenant_domains_admin_manage"
on public.tenant_domains
for all
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_admin(tenant_id)
)
with check (
    public.is_platform_admin()
    or public.is_tenant_admin(tenant_id)
);

-- SUSCRIPCIONES -------------------------------------------------------

drop policy if exists "subscriptions_member_read" on public.subscriptions;
create policy "subscriptions_member_read"
on public.subscriptions
for select
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_member(tenant_id)
);

drop policy if exists "subscriptions_platform_manage" on public.subscriptions;
create policy "subscriptions_platform_manage"
on public.subscriptions
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- MIEMBROS ------------------------------------------------------------

drop policy if exists "tenant_members_read" on public.tenant_members;
create policy "tenant_members_read"
on public.tenant_members
for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.is_tenant_admin(tenant_id)
);

drop policy if exists "tenant_members_admin_manage" on public.tenant_members;
create policy "tenant_members_admin_manage"
on public.tenant_members
for all
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_admin(tenant_id)
)
with check (
    public.is_platform_admin()
    or public.is_tenant_admin(tenant_id)
);

-- PLATFORM ADMINS -----------------------------------------------------

-- Sin policies de lectura/escritura para clientes normales.
-- Se administra con service_role o SQL Editor.

-- PROFESIONALES -------------------------------------------------------

drop policy if exists "professionals_member_read" on public.professionals;
create policy "professionals_member_read"
on public.professionals
for select
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_member(tenant_id)
);

drop policy if exists "professionals_admin_manage" on public.professionals;
create policy "professionals_admin_manage"
on public.professionals
for all
to authenticated
using (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
)
with check (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
);

-- PACIENTES -----------------------------------------------------------

drop policy if exists "patients_read" on public.patients;
create policy "patients_read"
on public.patients
for select
to authenticated
using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
);

drop policy if exists "patients_own_update" on public.patients;
create policy "patients_own_update"
on public.patients
for update
to authenticated
using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
)
with check (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
);

drop policy if exists "patients_admin_insert" on public.patients;
create policy "patients_admin_insert"
on public.patients
for insert
to authenticated
with check (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
);

-- HORARIOS ------------------------------------------------------------

drop policy if exists "schedules_member_read" on public.professional_schedules;
create policy "schedules_member_read"
on public.professional_schedules
for select
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_member(tenant_id)
);

drop policy if exists "schedules_admin_manage" on public.professional_schedules;
create policy "schedules_admin_manage"
on public.professional_schedules
for all
to authenticated
using (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
)
with check (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
);

-- EXCEPCIONES ---------------------------------------------------------

drop policy if exists "exceptions_member_read" on public.schedule_exceptions;
create policy "exceptions_member_read"
on public.schedule_exceptions
for select
to authenticated
using (
    public.is_platform_admin()
    or public.is_tenant_member(tenant_id)
);

drop policy if exists "exceptions_admin_manage" on public.schedule_exceptions;
create policy "exceptions_admin_manage"
on public.schedule_exceptions
for all
to authenticated
using (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
)
with check (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
);

-- TURNOS --------------------------------------------------------------

drop policy if exists "appointments_read" on public.appointments;
create policy "appointments_read"
on public.appointments
for select
to authenticated
using (
    public.is_platform_admin()
    or public.can_manage_tenant(tenant_id)
    or exists (
        select 1
        from public.patients p
        where p.id = appointments.patient_id
          and p.tenant_id = appointments.tenant_id
          and p.user_id = auth.uid()
    )
);

-- No se crean policies INSERT/UPDATE/DELETE para appointments.
-- Las escrituras se hacen exclusivamente mediante RPC controladas.

-- ---------------------------------------------------------------------
-- 17. PRIVILEGIOS
-- ---------------------------------------------------------------------

-- Tablas públicas mínimas.
grant select on public.plans to anon, authenticated;

-- Authenticated puede leer las tablas según RLS.
grant select on public.tenants to authenticated;
grant select, insert, update, delete on public.tenant_domains to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.tenant_members to authenticated;
grant select, insert, update, delete on public.professionals to authenticated;
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.professional_schedules to authenticated;
grant select, insert, update, delete on public.schedule_exceptions to authenticated;
grant select on public.appointments to authenticated;

-- Evitar escrituras directas sobre turnos.
revoke insert, update, delete on public.appointments from anon, authenticated;

-- La tabla global de administradores no se expone.
revoke all on public.platform_admins from anon, authenticated;

-- PostgreSQL concede EXECUTE sobre funciones nuevas a PUBLIC por defecto.
-- Se revoca explícitamente y luego se habilitan solo las RPC necesarias.
revoke all on function public.set_updated_at() from public;
revoke all on function public.prevent_tenant_change() from public;
revoke all on function public.validate_professional_schedule_overlap() from public;
revoke all on function public.validate_custom_hours_overlap() from public;
revoke all on function public.protect_patient_sensitive_fields() from public;

revoke all on function public.create_tenant(text,text,text,text) from public;
revoke all on function public.get_public_tenant_by_slug(text) from public;
revoke all on function public.get_public_professionals(text) from public;
revoke all on function public.get_available_slots(text,uuid,date) from public;
revoke all on function public.ensure_patient_profile(text,text,text,text,text,text) from public;
revoke all on function public.book_appointment(text,uuid,date,time,text) from public;
revoke all on function public.cancel_own_appointment(uuid) from public;
revoke all on function public.admin_create_appointment(uuid,uuid,uuid,date,time,text,text) from public;
revoke all on function public.admin_reschedule_appointment(uuid,uuid,date,time) from public;
revoke all on function public.admin_set_appointment_status(uuid,text) from public;

-- Funciones auxiliares no necesitan invocación directa del cliente.
revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.is_tenant_admin(uuid) from public;
revoke all on function public.can_manage_tenant(uuid) from public;
revoke all on function public.tenant_has_active_subscription(uuid) from public;

-- RPC expuestas.
grant execute on function public.create_tenant(text,text,text,text) to authenticated;

grant execute on function public.get_public_tenant_by_slug(text)
    to anon, authenticated;

grant execute on function public.get_public_professionals(text)
    to anon, authenticated;

grant execute on function public.get_available_slots(text,uuid,date)
    to anon, authenticated;

grant execute on function public.ensure_patient_profile(text,text,text,text,text,text)
    to authenticated;

grant execute on function public.book_appointment(text,uuid,date,time,text)
    to authenticated;

grant execute on function public.cancel_own_appointment(uuid)
    to authenticated;

grant execute on function public.admin_create_appointment(uuid,uuid,uuid,date,time,text,text)
    to authenticated;

grant execute on function public.admin_reschedule_appointment(uuid,uuid,date,time)
    to authenticated;

grant execute on function public.admin_set_appointment_status(uuid,text)
    to authenticated;

-- ---------------------------------------------------------------------
-- 18. STORAGE PARA BRANDING
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('tenant-assets', 'tenant-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "tenant_assets_insert" on storage.objects;
create policy "tenant_assets_insert"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'tenant-assets'
    and exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.active = true
          and tm.role in ('TENANT_ADMIN','OPERATOR')
          and tm.tenant_id::text = (storage.foldername(name))[1]
    )
);

drop policy if exists "tenant_assets_update" on storage.objects;
create policy "tenant_assets_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'tenant-assets'
    and exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.active = true
          and tm.role in ('TENANT_ADMIN','OPERATOR')
          and tm.tenant_id::text = (storage.foldername(name))[1]
    )
)
with check (
    bucket_id = 'tenant-assets'
    and exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.active = true
          and tm.role in ('TENANT_ADMIN','OPERATOR')
          and tm.tenant_id::text = (storage.foldername(name))[1]
    )
);

drop policy if exists "tenant_assets_delete" on storage.objects;
create policy "tenant_assets_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'tenant-assets'
    and exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.active = true
          and tm.role in ('TENANT_ADMIN','OPERATOR')
          and tm.tenant_id::text = (storage.foldername(name))[1]
    )
);

-- ---------------------------------------------------------------------
-- 19. SEED MÍNIMO DE PLANES
-- ---------------------------------------------------------------------

insert into public.plans (
    code,
    name,
    description,
    price,
    currency,
    max_professionals,
    max_admins,
    active
)
values
    (
        'BASIC',
        'Basic',
        'Plan inicial para consultorios pequeños.',
        null,
        'ARS',
        5,
        2,
        true
    ),
    (
        'PRO',
        'Pro',
        'Plan para consultorios con más profesionales y operadores.',
        null,
        'ARS',
        20,
        10,
        true
    )
on conflict (code) do nothing;

commit;

-- =====================================================================
-- NOTAS DE USO
-- =====================================================================
--
-- 1. Crear usuarios mediante Supabase Auth.
--
-- 2. El primer usuario crea su tenant llamando:
--
--    select * from public.create_tenant(
--      'Clínica Demo',
--      'clinica-demo',
--      'America/Argentina/Buenos_Aires',
--      'BASIC'
--    );
--
-- 3. Para registrar/actualizar el perfil del paciente:
--
--    select public.ensure_patient_profile(
--      'clinica-demo',
--      'Juan',
--      'Pérez',
--      '30111222',
--      '+54...',
--      'juan@example.com'
--    );
--
-- 4. Disponibilidad pública:
--
--    select * from public.get_available_slots(
--      'clinica-demo',
--      '<professional_uuid>',
--      '2026-09-20'
--    );
--
-- 5. Reserva autenticada:
--
--    select public.book_appointment(
--      'clinica-demo',
--      '<professional_uuid>',
--      '2026-09-20',
--      '09:30',
--      'Consulta'
--    );
--
-- 6. Para convertir un usuario en administrador global de plataforma,
--    ejecutar desde SQL Editor/service_role:
--
--    insert into public.platform_admins(user_id)
--    values ('<auth_user_uuid>');
--
-- =====================================================================
