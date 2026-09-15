begin;
-- Validate meaningful fields at the database boundary as well as in the UI.
alter table public.tenants add constraint tenant_name_valid check (length(btrim(name)) between 1 and 500);
alter table public.professionals add constraint professional_names_valid check (length(btrim(first_name)) between 1 and 500 and length(btrim(last_name)) between 1 and 500 and length(btrim(specialty)) between 1 and 500);
alter table public.patients add constraint patient_names_valid check (length(btrim(first_name)) between 1 and 500 and length(btrim(last_name)) between 1 and 500);
alter table public.appointments add constraint appointment_text_bounded check ((reason is null or length(reason)<=2000) and (notes is null or length(notes)<=4000));
alter table public.tenants add constraint website_http_only check (website is null or website='' or website ~ '^https?://');

-- Take the tenant lock before a row lock, like booking and rescheduling.
create or replace function public.cancel_own_appointment(p_appointment_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare t uuid; a public.appointments; tz text; begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 select tenant_id into t from public.appointments where id=p_appointment_id;
 if t is null then raise exception 'APPOINTMENT_NOT_CANCELLABLE'; end if;
 perform private.lock_tenant(t);
 select * into a from public.appointments where id=p_appointment_id for update;
 select timezone into tz from public.tenants where id=t;
 if a.status not in ('PENDING','CONFIRMED') or a.appointment_date+a.start_time<=timezone(tz,now())
 or not exists(select 1 from public.patients where id=a.patient_id and tenant_id=t and user_id=auth.uid()) then raise exception 'APPOINTMENT_NOT_CANCELLABLE'; end if;
 update public.appointments set status='CANCELLED' where id=a.id;
 return true;
end $$;

create function public.admin_update_appointment_details(p_appointment_id uuid,p_reason text,p_notes text)
returns boolean language plpgsql security definer set search_path='' as $$ declare t uuid; begin
 select tenant_id into t from public.appointments where id=p_appointment_id;
 if t is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
 perform private.lock_tenant(t);
 if not private.staff(t) then raise exception 'UNAUTHORIZED'; end if;
 update public.appointments set reason=nullif(btrim(p_reason),''),notes=nullif(btrim(p_notes),'') where id=p_appointment_id;
 return true;
end $$;
revoke all on function public.admin_update_appointment_details(uuid,text,text) from public,anon;
grant execute on function public.admin_update_appointment_details(uuid,text,text) to authenticated;

-- Tenant administrators cannot change a row identifier to bypass identity links.
create function private.prevent_id_change() returns trigger language plpgsql set search_path='' as $$ begin
 if new.id is distinct from old.id then raise exception 'RECORD_ID_IMMUTABLE'; end if; return new;
end $$;
create trigger immutable_professional_id before update on public.professionals for each row execute function private.prevent_id_change();
create trigger immutable_schedule_id before update on public.professional_schedules for each row execute function private.prevent_id_change();
create trigger immutable_exception_id before update on public.schedule_exceptions for each row execute function private.prevent_id_change();
revoke all on function private.prevent_id_change() from public,anon,authenticated;
commit;
