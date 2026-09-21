-- Agendia: two demonstration clinics with working email/password accounts.
-- Execute manually in Supabase SQL Editor AFTER migrations 001, 002, 003 and 004.
-- This is an optional seed, not an automatic production migration.
-- Initial credentials are documented in docs/demo-access.md.
-- Re-running preserves existing passwords and changes to existing demo records.

begin;
set local search_path = public, extensions, pg_catalog;
select pg_advisory_xact_lock(hashtextextended('agendia-demo-clinics-v1', 0));

create temporary table agendia_demo_clinics (
    tenant_id uuid primary key,
    user_id uuid not null,
    subscription_id uuid not null,
    name text not null,
    slug text not null,
    responsible_name text not null,
    email text not null,
    initial_password text not null,
    phone text not null,
    address text not null,
    description text not null,
    primary_color text not null,
    secondary_color text not null
) on commit drop;

insert into agendia_demo_clinics values
(
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000003',
    'Clínica del Sur', 'clinica-del-sur-demo', 'Mariana Torres',
    'admin.sur@example.com', 'Sur!fuKqqxuCRCzsaeAj9a',
    '+54 11 5555-0201', 'Av. Demo Sur 1250, Buenos Aires',
    'Clínica de demostración con atención médica y odontológica integral.',
    '#176b5b', '#e4eee8'
),
(
    'e2000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000003',
    'Centro Médico Belgrano', 'centro-medico-belgrano-demo', 'Diego Ramírez',
    'admin.belgrano@example.com', 'Bel!cCTUe-AVcvHqs9eB4Z',
    '+54 11 5555-0202', 'Av. Demo Belgrano 2400, Buenos Aires',
    'Centro de demostración con especialistas para acompañar tu salud.',
    '#335b91', '#e8eef8'
);

-- Abort rather than take over any pre-existing account or unrelated tenant.
do $$
declare c record;
begin
    if to_regprocedure('public.admin_update_appointment_details(uuid,text,text)') is null then
        raise exception 'Aplicá las migraciones 001, 002, 003 y 004 antes de ejecutar este seed.';
    end if;
    if not exists (select 1 from public.plans where code = 'BASIC' and active) then
        raise exception 'Se necesita el plan BASIC activo.';
    end if;
    for c in select * from agendia_demo_clinics loop
        if exists (
            select 1 from auth.users u
            where (lower(u.email) = c.email or u.id = c.user_id)
              and (
                  u.id <> c.user_id
                  or u.email is distinct from c.email
                  or u.raw_app_meta_data ->> 'agendia_demo_seed' is distinct from 'clinics-v1'
              )
        ) then
            raise exception 'Cuenta demo en conflicto: %. No se modificó ninguna cuenta.', c.email;
        end if;
        if exists (
            select 1 from public.tenants t
            where (t.slug = c.slug or t.id = c.tenant_id)
              and (t.id <> c.tenant_id or t.slug <> c.slug)
        ) then
            raise exception 'Consultorio demo en conflicto: %.', c.slug;
        end if;
    end loop;
end $$;

-- Supabase Auth requires the password hash, confirmed email and empty token strings.
-- pgcrypto may live in public or extensions; the transaction search_path supports both.
insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, email_change_confirm_status,
    phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
)
select
    '00000000-0000-0000-0000-000000000000'::uuid,
    c.user_id, 'authenticated', 'authenticated', c.email,
    crypt(c.initial_password, gen_salt('bf', 10)),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                      'agendia_demo_seed', 'clinics-v1'),
    jsonb_build_object('full_name', c.responsible_name),
    false, now(), now(), '', '', '', '', '', 0, '', '', '', false, false
from agendia_demo_clinics c
where not exists (select 1 from auth.users u where u.id = c.user_id);

insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at
)
select
    gen_random_uuid(), c.user_id::text, c.user_id,
    jsonb_build_object('sub', c.user_id::text, 'email', c.email,
                      'email_verified', true, 'phone_verified', false),
    'email', now(), now()
from agendia_demo_clinics c
where not exists (
    select 1 from auth.identities i
    where i.provider = 'email' and i.provider_id = c.user_id::text
);

insert into public.tenants (
    id, name, slug, responsible_name, description, phone, email, address,
    timezone, primary_color, secondary_color, welcome_text, active
)
select c.tenant_id, c.name, c.slug, c.responsible_name, c.description,
       c.phone, c.email, c.address, 'America/Argentina/Buenos_Aires',
       c.primary_color, c.secondary_color,
       'Bienvenido a ' || c.name || '. Elegí tu profesional y reservá tu turno.', true
from agendia_demo_clinics c
where not exists (select 1 from public.tenants t where t.id = c.tenant_id);

-- ACTIVE keeps these demonstration clinics available without trial expiration.
insert into public.subscriptions (id, tenant_id, plan_id, status, starts_at)
select c.subscription_id, c.tenant_id, p.id, 'ACTIVE', now()
from agendia_demo_clinics c
join public.plans p on p.code = 'BASIC'
where not exists (select 1 from public.subscriptions s where s.tenant_id = c.tenant_id);

insert into public.tenant_members (tenant_id, user_id, role, active)
select c.tenant_id, c.user_id, 'TENANT_ADMIN', true
from agendia_demo_clinics c
where not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = c.tenant_id and m.user_id = c.user_id
);

create temporary table agendia_demo_professionals (
    id uuid primary key,
    tenant_id uuid not null,
    first_name text not null,
    last_name text not null,
    specialty text not null,
    description text not null,
    duration integer not null
) on commit drop;

insert into agendia_demo_professionals values
('e1000000-0000-4000-8000-000000000101', 'e1000000-0000-4000-8000-000000000001',
 'Laura', 'Gómez', 'Odontología General', 'Prevención, controles y atención odontológica integral.', 30),
('e1000000-0000-4000-8000-000000000102', 'e1000000-0000-4000-8000-000000000001',
 'Martín', 'Pérez', 'Clínica Médica', 'Consultas generales y seguimiento de la salud de adultos.', 20),
('e1000000-0000-4000-8000-000000000103', 'e1000000-0000-4000-8000-000000000001',
 'Sofía', 'Fernández', 'Pediatría', 'Controles y atención de niños y adolescentes.', 30),
('e1000000-0000-4000-8000-000000000104', 'e1000000-0000-4000-8000-000000000001',
 'Lucas', 'Romero', 'Kinesiología', 'Evaluación funcional y sesiones de rehabilitación.', 40),
('e2000000-0000-4000-8000-000000000101', 'e2000000-0000-4000-8000-000000000001',
 'Ana', 'López', 'Dermatología', 'Consultas y controles dermatológicos.', 30),
('e2000000-0000-4000-8000-000000000102', 'e2000000-0000-4000-8000-000000000001',
 'Diego', 'Sánchez', 'Cardiología', 'Evaluación cardiológica y controles preventivos.', 40),
('e2000000-0000-4000-8000-000000000103', 'e2000000-0000-4000-8000-000000000001',
 'Valentina', 'Ruiz', 'Nutrición', 'Consultas nutricionales y acompañamiento personalizado.', 30),
('e2000000-0000-4000-8000-000000000104', 'e2000000-0000-4000-8000-000000000001',
 'Gabriel', 'Acosta', 'Traumatología', 'Atención de lesiones y seguimiento del aparato locomotor.', 20);

insert into public.professionals (
    id, tenant_id, first_name, last_name, specialty, description, active
)
select p.id, p.tenant_id, p.first_name, p.last_name, p.specialty, p.description, true
from agendia_demo_professionals p
where not exists (select 1 from public.professionals existing where existing.id = p.id);

-- Each professional: Monday-Friday, 08:00-12:00 and 14:00-18:00.
-- Deterministic IDs let this seed be re-run without changing edited schedules.
insert into public.professional_schedules (
    id, tenant_id, professional_id, day_of_week,
    start_time, end_time, appointment_duration, active
)
select
    md5('agendia-demo-clinics-v1:' || p.id::text || ':' || d.day::text || ':' || r.period)::uuid,
    p.tenant_id, p.id, d.day, r.start_time, r.end_time, p.duration, true
from agendia_demo_professionals p
cross join generate_series(1, 5) as d(day)
cross join (values
    ('morning', time '08:00', time '12:00'),
    ('afternoon', time '14:00', time '18:00')
) as r(period, start_time, end_time)
where not exists (
    select 1 from public.professional_schedules s
    where s.id = md5('agendia-demo-clinics-v1:' || p.id::text || ':' || d.day::text || ':' || r.period)::uuid
);

-- Summary; all fictional data. No platform administrator is created.
select c.name as clinica, c.email as email_administrador,
       '/admin/' || c.slug as panel,
       '/t/' || c.slug as pagina_publica,
       (select count(*) from public.professionals p where p.tenant_id = c.tenant_id) as profesionales
from agendia_demo_clinics c order by c.name;

commit;
