begin;
create extension if not exists btree_gist;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter table public.tenants add column responsible_name text not null default '';
alter table public.tenants add constraint tenant_colors check ((primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$') and (secondary_color is null or secondary_color ~ '^#[0-9a-fA-F]{6}$'));
alter table public.tenants add constraint tenant_logo_path check (logo_path is null or split_part(logo_path,'/',1) = id::text);
alter table public.professional_schedules add constraint duration_bounded check (appointment_duration <= 1440);
alter table public.schedule_exceptions add constraint duration_bounded check (appointment_duration <= 1440);
alter table public.professional_schedules add constraint schedules_no_overlap exclude using gist (tenant_id with =, professional_id with =, day_of_week with =, tsrange(date '2000-01-01' + start_time,date '2000-01-01' + end_time,'[)') with &&) where (active);
alter table public.schedule_exceptions add constraint exceptions_no_overlap exclude using gist (tenant_id with =, professional_id with =, exception_date with =, tsrange(exception_date + start_time,exception_date + end_time,'[)') with &&) where (type = 'CUSTOM_HOURS');
alter table public.appointments add constraint appointments_no_overlap exclude using gist (tenant_id with =, professional_id with =, tsrange(appointment_date + start_time,appointment_date + end_time,'[)') with &&) where (status <> 'CANCELLED');

-- The tenant lock serializes critical mutations, including plan changes and quotas.
create function private.lock_tenant(p_id uuid) returns void language sql volatile security definer set search_path = '' as $$ select pg_advisory_xact_lock(hashtextextended(p_id::text,17)); $$;
create function private.operational(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.tenants where id=p_id and active) and public.tenant_has_active_subscription(p_id); $$;
create function private.role_in(p_id uuid,p_roles text[]) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.tenant_members where tenant_id=p_id and user_id=auth.uid() and active and role=any(p_roles)); $$;
create function private.staff(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select private.operational(p_id) and private.role_in(p_id,array['TENANT_ADMIN','OPERATOR']); $$;
create function private.admin(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select private.operational(p_id) and private.role_in(p_id,array['TENANT_ADMIN']); $$;
create or replace function public.can_manage_tenant(p_tenant_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select private.staff(p_tenant_id); $$;

create function private.guard_tenant_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_max int;
begin
 v_id := case when tg_table_name='tenants' then new.id else coalesce((to_jsonb(new)->>'tenant_id')::uuid,(to_jsonb(old)->>'tenant_id')::uuid) end;
 perform private.lock_tenant(v_id);
 if tg_op='UPDATE' and tg_table_name<>'tenants' and to_jsonb(new)->>'tenant_id' is distinct from to_jsonb(old)->>'tenant_id' then raise exception 'TENANT_ID_IMMUTABLE'; end if;
 if tg_table_name='tenants' then
   if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'INVALID_TIMEZONE'; end if;
   if tg_op='UPDATE' and (new.slug<>old.slug or new.id<>old.id) then raise exception 'TENANT_ID_IMMUTABLE'; end if;
 elsif tg_table_name='professionals' and tg_op<>'DELETE' and (to_jsonb(new)->>'active')::boolean then
   select p.max_professionals into v_max from public.subscriptions s join public.plans p on p.id=s.plan_id where s.tenant_id=v_id and s.status<>'CANCELLED';
   if v_max is not null and (select count(*) from public.professionals where tenant_id=v_id and active and id<>new.id)>=v_max then raise exception 'PLAN_LIMIT_REACHED'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger aa_tenant_guard before insert or update on public.tenants for each row execute function private.guard_tenant_write();
do $$ declare t text; begin foreach t in array array['professionals','patients','professional_schedules','schedule_exceptions','appointments','subscriptions','tenant_members'] loop execute format('create trigger aa_tenant_guard before insert or update or delete on public.%I for each row execute function private.guard_tenant_write()',t); end loop; end $$;

-- Replace permissive policies. Patients read safe projections through RPC only.
do $$ declare p record; begin for p in select tablename,policyname from pg_policies where schemaname='public' loop execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop; end $$;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.plans to anon,authenticated;
create policy plans_read on public.plans for select to anon,authenticated using(active);
grant select on public.tenants,public.subscriptions,public.tenant_members to authenticated;
create policy tenants_read on public.tenants for select to authenticated using(private.role_in(id,array['TENANT_ADMIN','OPERATOR']));
create policy subscriptions_read on public.subscriptions for select to authenticated using(private.role_in(tenant_id,array['TENANT_ADMIN','OPERATOR']));
create policy members_read on public.tenant_members for select to authenticated using(user_id=auth.uid() or private.admin(tenant_id));
grant update(name,description,phone,email,address,website,timezone,logo_path,primary_color,secondary_color,welcome_text,responsible_name) on public.tenants to authenticated;
create policy tenants_edit on public.tenants for update to authenticated using(private.admin(id)) with check(private.admin(id));
do $$ declare t text; begin
 foreach t in array array['professionals','professional_schedules','schedule_exceptions'] loop
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy staff_read on public.%I for select to authenticated using(private.staff(tenant_id))',t);
 execute format('create policy admin_insert on public.%I for insert to authenticated with check(private.admin(tenant_id))',t);
 execute format('create policy admin_update on public.%I for update to authenticated using(private.admin(tenant_id)) with check(private.admin(tenant_id))',t);
 end loop;
end $$;
grant delete on public.professional_schedules,public.schedule_exceptions to authenticated;
create policy admin_delete on public.professional_schedules for delete to authenticated using(private.admin(tenant_id));
create policy admin_delete on public.schedule_exceptions for delete to authenticated using(private.admin(tenant_id));
grant select,insert,update on public.patients to authenticated;
create policy staff_read on public.patients for select to authenticated using(private.staff(tenant_id));
create policy staff_insert on public.patients for insert to authenticated with check(private.staff(tenant_id) and user_id is null);
create policy staff_update on public.patients for update to authenticated using(private.staff(tenant_id)) with check(private.staff(tenant_id));
grant select on public.appointments to authenticated;
create policy staff_read on public.appointments for select to authenticated using(private.staff(tenant_id));

create function private.protect_patient_identity() returns trigger language plpgsql set search_path='' as $$ begin
 if new.id<>old.id or new.user_id is distinct from old.user_id then raise exception 'PATIENT_FIELD_NOT_EDITABLE'; end if; return new; end $$;
create trigger protect_patient_identity before update on public.patients for each row execute function private.protect_patient_identity();

-- Bounded, timestamp-based generation avoids TIME arithmetic wrapping at midnight.
create or replace function public.get_available_slots(p_tenant_slug text,p_professional_id uuid,p_target_date date)
returns table(start_time time,end_time time) language sql stable security definer set search_path='' as $$
 with tenant as (select id,timezone from public.tenants where slug=lower(p_tenant_slug) and private.operational(id)),
 context as (select t.*,timezone(t.timezone,now()) as local_now from tenant t join public.professionals p on p.tenant_id=t.id and p.id=p_professional_id and p.active
 where p_target_date between timezone(t.timezone,now())::date and timezone(t.timezone,now())::date+730
 and not exists(select 1 from public.schedule_exceptions e where e.tenant_id=t.id and e.professional_id=p_professional_id and e.exception_date=p_target_date and e.type='CLOSED')),
 custom as (select e.start_time,e.end_time,coalesce(e.appointment_duration,30) duration from public.schedule_exceptions e join context c on c.id=e.tenant_id where e.professional_id=p_professional_id and e.exception_date=p_target_date and e.type='CUSTOM_HOURS'),
 ranges as (select * from custom union all select s.start_time,s.end_time,s.appointment_duration from public.professional_schedules s join context c on c.id=s.tenant_id where s.professional_id=p_professional_id and s.active and s.day_of_week=extract(isodow from p_target_date) and not exists(select 1 from custom)),
 slots as (select c.id,c.local_now,c.timezone,g as start_at,g+make_interval(mins=>r.duration) as end_at from context c cross join ranges r cross join lateral generate_series(p_target_date+r.start_time,p_target_date+r.end_time-make_interval(mins=>r.duration),make_interval(mins=>r.duration)) g)
 select s.start_at::time,case when s.end_at::date>p_target_date then time '24:00' else s.end_at::time end from slots s where s.start_at>s.local_now
 and ((s.start_at at time zone s.timezone) at time zone s.timezone)=s.start_at
 and ((s.end_at at time zone s.timezone) at time zone s.timezone)=s.end_at
 and (s.end_at at time zone s.timezone)-(s.start_at at time zone s.timezone)=s.end_at-s.start_at
 and not exists(select 1 from public.schedule_exceptions e where e.tenant_id=s.id and e.professional_id=p_professional_id and e.exception_date=p_target_date and e.type='BLOCKED' and (e.start_time is null or tsrange(p_target_date+e.start_time,p_target_date+e.end_time,'[)') && tsrange(s.start_at,s.end_at,'[)')))
 and not exists(select 1 from public.appointments a where a.tenant_id=s.id and a.professional_id=p_professional_id and a.appointment_date=p_target_date and a.status<>'CANCELLED' and tsrange(a.appointment_date+a.start_time,a.appointment_date+a.end_time,'[)') && tsrange(s.start_at,s.end_at,'[)')) order by s.start_at;
$$;
create function public.get_available_days(p_tenant_slug text,p_professional_id uuid,p_month date) returns table(day date) language sql stable security definer set search_path='' as $$
 select d::date from generate_series(date_trunc('month',p_month::timestamp),date_trunc('month',p_month::timestamp)+interval '1 month - 1 day',interval '1 day') d where exists(select 1 from public.get_available_slots(p_tenant_slug,p_professional_id,d::date)); $$;
create function public.get_public_tenant_by_hostname(p_hostname text) returns table(slug text) language sql stable security definer set search_path='' as $$ select t.slug from public.tenant_domains d join public.tenants t on t.id=d.tenant_id where d.hostname=lower(p_hostname) and d.verified and private.operational(t.id); $$;

-- Rate limiting is per authenticated user and UTC hour, not IP or browser state.
create table private.request_limits(user_id uuid not null,bucket timestamptz not null,requests int not null,primary key(user_id,bucket));
create function private.rate_limit() returns void language plpgsql security definer set search_path='' as $$ declare n int; begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 insert into private.request_limits values(auth.uid(),date_trunc('hour',now()),1) on conflict(user_id,bucket) do update set requests=private.request_limits.requests+1 returning requests into n;
 if n>120 then raise exception 'RATE_LIMITED'; end if;
 delete from private.request_limits where user_id=auth.uid() and bucket<now()-interval '1 day';
end $$;

create or replace function public.create_tenant(p_name text,p_slug text,p_timezone text default 'America/Argentina/Buenos_Aires',p_plan_code text default 'BASIC') returns table(tenant_id uuid,tenant_slug text) language plpgsql security definer set search_path='' as $$
declare t uuid; p uuid; begin
 perform private.rate_limit();
 if nullif(trim(p_name),'') is null or p_slug is null or lower(p_slug)!~'^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>63 then raise exception 'INVALID_TENANT_NAME'; end if;
 if (select count(*) from public.tenant_members where user_id=auth.uid() and role='TENANT_ADMIN')>=5 then raise exception 'PLAN_LIMIT_REACHED'; end if;
 select id into p from public.plans where code=p_plan_code and active;
 if p is null then raise exception 'PLAN_NOT_FOUND'; end if;
 insert into public.tenants(name,slug,timezone) values(trim(p_name),lower(p_slug),p_timezone) returning id into t;
 insert into public.subscriptions(tenant_id,plan_id,status,trial_ends_at) values(t,p,'TRIALING',now()+interval '14 days');
 insert into public.tenant_members(tenant_id,user_id,role) values(t,auth.uid(),'TENANT_ADMIN');
 return query select t,lower(p_slug);
 exception when unique_violation then raise exception 'SLUG_TAKEN'; end $$;
create function public.register_tenant(p_name text,p_slug text,p_responsible_name text,p_phone text,p_email text,p_timezone text default 'America/Argentina/Buenos_Aires',p_plan_code text default 'BASIC') returns table(tenant_id uuid,tenant_slug text) language plpgsql security definer set search_path='' as $$ declare r record; begin
 if nullif(trim(p_responsible_name),'') is null or nullif(trim(p_phone),'') is null or p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_TENANT_DATA'; end if;
 select * into r from public.create_tenant(p_name,p_slug,p_timezone,p_plan_code);
 update public.tenants set responsible_name=trim(p_responsible_name),phone=trim(p_phone),email=trim(p_email) where id=r.tenant_id;
 return query select r.tenant_id,r.tenant_slug; end $$;

create or replace function public.ensure_patient_profile(p_tenant_slug text,p_first_name text,p_last_name text,p_dni text default null,p_phone text default null,p_email text default null) returns uuid language plpgsql security definer set search_path='' as $$ declare t uuid; p uuid; begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 select id into t from public.tenants where slug=lower(p_tenant_slug);
 if t is null then raise exception 'TENANT_NOT_FOUND'; end if;
 perform private.lock_tenant(t);
 if not private.operational(t) then raise exception 'SUBSCRIPTION_INACTIVE'; end if;
 if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null or nullif(trim(p_phone),'') is null or p_email is null or p_email!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_PATIENT_DATA'; end if;
 if exists(select 1 from public.patients where tenant_id=t and user_id=auth.uid() and not active) then raise exception 'PATIENT_INACTIVE'; end if;
 insert into public.patients(tenant_id,user_id,first_name,last_name,dni,phone,email) values(t,auth.uid(),trim(p_first_name),trim(p_last_name),nullif(trim(p_dni),''),trim(p_phone),trim(p_email)) on conflict(tenant_id,user_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,dni=excluded.dni,phone=excluded.phone,email=excluded.email returning id into p;
 return p; exception when unique_violation then raise exception 'PATIENT_DATA_CONFLICT'; end $$;
create function public.get_my_profiles() returns table(id uuid,tenant_id uuid,tenant_slug text,tenant_name text,first_name text,last_name text,dni text,phone text,email text) language sql stable security definer set search_path='' as $$ select p.id,p.tenant_id,t.slug,t.name,p.first_name,p.last_name,p.dni,p.phone,p.email from public.patients p join public.tenants t on t.id=p.tenant_id where p.user_id=auth.uid(); $$;
create function public.get_my_appointments() returns table(id uuid,tenant_id uuid,tenant_name text,tenant_slug text,timezone text,professional_name text,specialty text,appointment_date date,start_time time,end_time time,status text,reason text) language sql stable security definer set search_path='' as $$ select a.id,a.tenant_id,t.name,t.slug,t.timezone,pr.first_name||' '||pr.last_name,pr.specialty,a.appointment_date,a.start_time,a.end_time,a.status,a.reason from public.appointments a join public.patients p on p.id=a.patient_id and p.tenant_id=a.tenant_id join public.tenants t on t.id=a.tenant_id join public.professionals pr on pr.id=a.professional_id and pr.tenant_id=a.tenant_id where p.user_id=auth.uid() order by a.appointment_date desc,a.start_time desc; $$;

-- Shared mutation path. Lock before checking ownership, subscription and availability.
create function private.reserve(p_tenant uuid,p_professional uuid,p_patient uuid,p_date date,p_start time,p_reason text,p_notes text,p_source text,p_existing uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tenants; finish time; result uuid; old_status text; begin
 perform private.lock_tenant(p_tenant);
 select * into t from public.tenants where id=p_tenant;
 if not found then raise exception 'TENANT_NOT_FOUND'; end if;
 if not t.active then raise exception 'TENANT_INACTIVE'; end if;
 if not public.tenant_has_active_subscription(p_tenant) then raise exception 'SUBSCRIPTION_INACTIVE'; end if;
 if not exists(select 1 from public.professionals where id=p_professional and tenant_id=p_tenant) then raise exception 'PROFESSIONAL_NOT_FOUND'; end if;
 if not exists(select 1 from public.professionals where id=p_professional and tenant_id=p_tenant and active) then raise exception 'PROFESSIONAL_INACTIVE'; end if;
 if not exists(select 1 from public.patients where id=p_patient and tenant_id=p_tenant and active) then raise exception 'PATIENT_NOT_FOUND'; end if;
 if p_date is null or p_start is null or p_date+p_start<=timezone(t.timezone,now()) then raise exception 'INVALID_SLOT'; end if;
 if p_existing is not null then
   select status into old_status from public.appointments where id=p_existing and tenant_id=p_tenant for update;
   if old_status in ('COMPLETED','NO_SHOW') then raise exception 'APPOINTMENT_FINALIZED'; end if;
   update public.appointments set status='CANCELLED' where id=p_existing;
 end if;
 select s.end_time into finish from public.get_available_slots(t.slug,p_professional,p_date) s where s.start_time=p_start;
 if finish is null then raise exception 'SLOT_UNAVAILABLE'; end if;
 if p_existing is null then
 insert into public.appointments(tenant_id,professional_id,patient_id,appointment_date,start_time,end_time,reason,notes,source,created_by) values(p_tenant,p_professional,p_patient,p_date,p_start,finish,nullif(trim(p_reason),''),nullif(trim(p_notes),''),p_source,auth.uid()) returning id into result;
 else update public.appointments set professional_id=p_professional,appointment_date=p_date,start_time=p_start,end_time=finish,status=case when old_status='CANCELLED' then 'CONFIRMED' else old_status end where id=p_existing returning id into result;
 end if;
 return result;
 exception when unique_violation or exclusion_violation then raise exception 'SLOT_UNAVAILABLE'; end $$;
create or replace function public.book_appointment(p_tenant_slug text,p_professional_id uuid,p_target_date date,p_start_time time,p_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$ declare t uuid; p uuid; begin
 perform private.rate_limit();
 select id into t from public.tenants where slug=lower(p_tenant_slug);
 if t is null then raise exception 'TENANT_NOT_FOUND'; end if;
 perform private.lock_tenant(t);
 select id into p from public.patients where tenant_id=t and user_id=auth.uid() and active;
 if p is null then raise exception 'PATIENT_PROFILE_REQUIRED'; end if;
 return private.reserve(t,p_professional_id,p,p_target_date,p_start_time,p_reason,null,'PATIENT'); end $$;
create or replace function public.admin_create_appointment(p_tenant_id uuid,p_professional_id uuid,p_patient_id uuid,p_target_date date,p_start_time time,p_reason text default null,p_notes text default null) returns uuid language plpgsql security definer set search_path='' as $$ begin
 perform private.lock_tenant(p_tenant_id);
 if not private.staff(p_tenant_id) then raise exception 'UNAUTHORIZED'; end if;
 return private.reserve(p_tenant_id,p_professional_id,p_patient_id,p_target_date,p_start_time,p_reason,p_notes,case when private.admin(p_tenant_id) then 'ADMIN' else 'OPERATOR' end); end $$;
create or replace function public.admin_reschedule_appointment(p_appointment_id uuid,p_professional_id uuid,p_target_date date,p_start_time time) returns boolean language plpgsql security definer set search_path='' as $$ declare a public.appointments; begin
 select * into a from public.appointments where id=p_appointment_id;
 if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
 perform private.lock_tenant(a.tenant_id);
 if not private.staff(a.tenant_id) then raise exception 'UNAUTHORIZED'; end if;
 perform private.reserve(a.tenant_id,p_professional_id,a.patient_id,p_target_date,p_start_time,a.reason,a.notes,a.source,a.id); return true; end $$;
create or replace function public.admin_set_appointment_status(p_appointment_id uuid,p_status text) returns boolean language plpgsql security definer set search_path='' as $$ declare a public.appointments; begin
 select * into a from public.appointments where id=p_appointment_id;
 if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
 perform private.lock_tenant(a.tenant_id);
 if not private.staff(a.tenant_id) then raise exception 'UNAUTHORIZED'; end if;
 select * into a from public.appointments where id=p_appointment_id for update;
 if p_status is null or p_status not in ('PENDING','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW') then raise exception 'INVALID_STATUS'; end if;
 if a.status in ('COMPLETED','NO_SHOW') and p_status<>a.status then raise exception 'APPOINTMENT_FINALIZED'; end if;
 if a.status='CANCELLED' and p_status<>'CANCELLED' then raise exception 'CANCELLED_APPOINTMENT_REQUIRES_RESCHEDULE'; end if;
 if p_status in ('COMPLETED','NO_SHOW') and a.appointment_date+a.start_time>timezone((select timezone from public.tenants where id=a.tenant_id),now()) then raise exception 'APPOINTMENT_IN_FUTURE'; end if;
 update public.appointments set status=p_status where id=a.id; return true; end $$;
-- Existing cancellation RPC checks patient ownership and future date; trigger takes tenant lock.

create function public.manage_member(p_tenant_id uuid,p_email text,p_role text,p_active boolean default true) returns uuid language plpgsql security definer set search_path='' as $$ declare u uuid; m uuid; maximum int; begin
 perform private.lock_tenant(p_tenant_id);
 if not private.admin(p_tenant_id) then raise exception 'UNAUTHORIZED'; end if;
 if p_role is null or p_role not in ('TENANT_ADMIN','OPERATOR') or p_active is null then raise exception 'INVALID_ROLE'; end if;
 select id into u from auth.users where lower(email)=lower(trim(p_email));
 if u is null then raise exception 'REGISTERED_USER_REQUIRED'; end if;
 if exists(select 1 from public.tenant_members where tenant_id=p_tenant_id and user_id=u and active and role='TENANT_ADMIN') and (not p_active or p_role<>'TENANT_ADMIN') and (select count(*) from public.tenant_members where tenant_id=p_tenant_id and active and role='TENANT_ADMIN')<=1 then raise exception 'LAST_ADMIN_REQUIRED'; end if;
 if p_active and p_role='TENANT_ADMIN' then
 select p.max_admins into maximum from public.subscriptions s join public.plans p on p.id=s.plan_id where s.tenant_id=p_tenant_id and s.status<>'CANCELLED';
 if maximum is not null and (select count(*) from public.tenant_members where tenant_id=p_tenant_id and role='TENANT_ADMIN' and active and user_id<>u)>=maximum then raise exception 'PLAN_LIMIT_REACHED'; end if;
 end if;
 insert into public.tenant_members(tenant_id,user_id,role,active) values(p_tenant_id,u,p_role,p_active) on conflict(tenant_id,user_id) do update set role=excluded.role,active=excluded.active returning id into m; return m; end $$;
create function public.get_tenant_members(p_tenant_id uuid) returns table(id uuid,email text,role text,active boolean) language plpgsql stable security definer set search_path='' as $$ begin
 if not private.admin(p_tenant_id) then raise exception 'UNAUTHORIZED'; end if;
 return query select m.id,u.email::text,m.role,m.active from public.tenant_members m join auth.users u on u.id=m.user_id where m.tenant_id=p_tenant_id; end $$;

create function public.platform_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_platform_admin() then raise exception 'UNAUTHORIZED'; end if;
 return jsonb_build_object('tenants',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'active',t.active,'created_at',t.created_at,'subscription_id',s.id,'status',s.status,'plan_id',s.plan_id,'plan_name',p.name)),'[]'::jsonb) from public.tenants t left join lateral (select * from public.subscriptions where tenant_id=t.id order by created_at desc limit 1) s on true left join public.plans p on p.id=s.plan_id),'plans',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.plans p)); end $$;
create function public.platform_update_tenant(p_tenant_id uuid,p_active boolean,p_status text,p_plan_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare sub uuid; lim public.plans; begin
 if not public.is_platform_admin() then raise exception 'UNAUTHORIZED'; end if;
 perform private.lock_tenant(p_tenant_id);
 select * into lim from public.plans where id=p_plan_id and active;
 if lim.id is null then raise exception 'PLAN_NOT_FOUND'; end if;
 if (lim.max_professionals is not null and (select count(*) from public.professionals where tenant_id=p_tenant_id and active)>lim.max_professionals) or (lim.max_admins is not null and (select count(*) from public.tenant_members where tenant_id=p_tenant_id and active and role='TENANT_ADMIN')>lim.max_admins) then raise exception 'PLAN_LIMIT_REACHED'; end if;
 update public.tenants set active=p_active where id=p_tenant_id;
 select id into sub from public.subscriptions where tenant_id=p_tenant_id order by created_at desc limit 1;
 if sub is null then raise exception 'TENANT_NOT_FOUND'; end if;
 update public.subscriptions set status=p_status,plan_id=p_plan_id,trial_ends_at=case when p_status='TRIALING' then now()+interval '14 days' else trial_ends_at end,current_period_end=null where id=sub;
 end $$;

-- Logos are public, but only an active tenant administrator may write them.
drop policy if exists tenant_assets_insert on storage.objects;
drop policy if exists tenant_assets_update on storage.objects;
drop policy if exists tenant_assets_delete on storage.objects;
create function private.asset_admin(p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$ begin return private.admin(split_part(p_name,'/',1)::uuid); exception when invalid_text_representation then return false; end $$;
create policy asset_insert on storage.objects for insert to authenticated with check(bucket_id='tenant-assets' and private.asset_admin(name));
create policy asset_update on storage.objects for update to authenticated using(bucket_id='tenant-assets' and private.asset_admin(name)) with check(bucket_id='tenant-assets' and private.asset_admin(name));
create policy asset_delete on storage.objects for delete to authenticated using(bucket_id='tenant-assets' and private.asset_admin(name));
create policy asset_read on storage.objects for select to anon,authenticated using(bucket_id='tenant-assets');
update storage.buckets set file_size_limit=2097152,allowed_mime_types=array['image/png','image/jpeg','image/webp'] where id='tenant-assets';

revoke execute on all functions in schema public from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.operational(uuid),private.role_in(uuid,text[]),private.staff(uuid),private.admin(uuid),private.asset_admin(text) to authenticated;
grant execute on function public.get_public_tenant_by_slug(text),public.get_public_tenant_by_hostname(text),public.get_public_professionals(text),public.get_available_slots(text,uuid,date),public.get_available_days(text,uuid,date) to anon,authenticated;
grant execute on function public.is_platform_admin(),public.register_tenant(text,text,text,text,text,text,text),public.ensure_patient_profile(text,text,text,text,text,text),public.get_my_profiles(),public.get_my_appointments(),public.book_appointment(text,uuid,date,time,text),public.cancel_own_appointment(uuid),public.admin_create_appointment(uuid,uuid,uuid,date,time,text,text),public.admin_reschedule_appointment(uuid,uuid,date,time),public.admin_set_appointment_status(uuid,text),public.manage_member(uuid,text,text,boolean),public.get_tenant_members(uuid),public.platform_overview(),public.platform_update_tenant(uuid,boolean,text,uuid) to authenticated;
commit;
