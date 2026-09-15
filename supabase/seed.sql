-- Optional demonstration data. No production credentials or Auth users.
begin;
insert into public.tenants(id,name,slug,responsible_name,description,address,phone,email,welcome_text,primary_color,secondary_color)
values('d0000000-0000-4000-8000-000000000001','Clínica Demo','clinica-demo','Responsable Demo','Un equipo dedicado a cuidar tu sonrisa. Reservá tu consulta online.','Av. Siempre Viva 123, Buenos Aires','+54 11 5555-0100','consultas@example.com','Tu sonrisa, en buenas manos.','#176b5b','#e4eee8') on conflict(id) do nothing;
insert into public.subscriptions(id,tenant_id,plan_id,status,trial_ends_at)
select 'd0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001',id,'TRIALING',now()+interval '14 days' from public.plans where code='BASIC' on conflict(id) do nothing;
insert into public.professionals(id,tenant_id,first_name,last_name,specialty,description) values
('d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000001','Laura','Gómez','Odontología General','Prevención y atención integral para tu salud bucal.'),
('d0000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000001','Martín','Pérez','Ortodoncia','Una atención cercana para acompañar tu tratamiento.'),
('d0000000-0000-4000-8000-000000000013','d0000000-0000-4000-8000-000000000001','Ana','López','Endodoncia','Cuidamos tus dientes con una atención personalizada.') on conflict(id) do nothing;
insert into public.professional_schedules(id,tenant_id,professional_id,day_of_week,start_time,end_time,appointment_duration) values
('d0000000-0000-4000-8000-000000000021','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011',1,'08:00','12:00',30),
('d0000000-0000-4000-8000-000000000022','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011',3,'14:00','18:00',30),
('d0000000-0000-4000-8000-000000000023','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011',5,'08:00','12:00',30),
('d0000000-0000-4000-8000-000000000024','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000012',2,'09:00','13:00',30),
('d0000000-0000-4000-8000-000000000025','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000013',4,'09:00','13:00',30) on conflict(id) do nothing;
commit;
