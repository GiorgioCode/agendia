-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price numeric CHECK (price IS NULL OR price >= 0::numeric),
  currency text NOT NULL DEFAULT 'ARS'::text,
  max_professionals integer CHECK (max_professionals IS NULL OR max_professionals > 0),
  max_admins integer CHECK (max_admins IS NULL OR max_admins > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 500),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
  description text,
  phone text,
  email text,
  address text,
  website text CHECK (website IS NULL OR website = ''::text OR website ~ '^https?://'::text),
  timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'::text,
  logo_path text,
  primary_color text,
  secondary_color text,
  welcome_text text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  responsible_name text NOT NULL DEFAULT ''::text,
  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tenant_domains (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hostname text NOT NULL UNIQUE,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenant_domains_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_domains_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['TRIALING'::text, 'ACTIVE'::text, 'PAST_DUE'::text, 'SUSPENDED'::text, 'CANCELLED'::text])),
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  trial_ends_at timestamp with time zone,
  current_period_end timestamp with time zone,
  provider text,
  provider_subscription_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id)
);
CREATE TABLE public.tenant_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['TENANT_ADMIN'::text, 'OPERATOR'::text, 'PROFESSIONAL'::text])),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenant_members_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT tenant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.platform_admins (
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id),
  CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.professionals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  specialty text NOT NULL,
  registration_number text,
  phone text,
  email text,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT professionals_pkey PRIMARY KEY (id),
  CONSTRAINT professionals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT professionals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.patients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  dni text,
  phone text,
  email text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT patients_pkey PRIMARY KEY (id),
  CONSTRAINT patients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT patients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.professional_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  appointment_duration integer NOT NULL CHECK (appointment_duration > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT professional_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT professional_schedules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT professional_schedules_professional_fk FOREIGN KEY (professional_id) REFERENCES public.professionals(id),
  CONSTRAINT professional_schedules_professional_fk FOREIGN KEY (tenant_id) REFERENCES public.professionals(tenant_id)
);
CREATE TABLE public.schedule_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  exception_date date NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['CLOSED'::text, 'CUSTOM_HOURS'::text, 'BLOCKED'::text])),
  start_time time without time zone,
  end_time time without time zone,
  appointment_duration integer CHECK (appointment_duration IS NULL OR appointment_duration > 0),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT schedule_exceptions_pkey PRIMARY KEY (id),
  CONSTRAINT schedule_exceptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT schedule_exceptions_professional_fk FOREIGN KEY (professional_id) REFERENCES public.professionals(id),
  CONSTRAINT schedule_exceptions_professional_fk FOREIGN KEY (tenant_id) REFERENCES public.professionals(tenant_id)
);
CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  appointment_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'NO_SHOW'::text])),
  reason text,
  notes text,
  source text NOT NULL DEFAULT 'PATIENT'::text CHECK (source = ANY (ARRAY['PATIENT'::text, 'ADMIN'::text, 'OPERATOR'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_patient_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT appointments_patient_fk FOREIGN KEY (tenant_id) REFERENCES public.patients(tenant_id),
  CONSTRAINT appointments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT appointments_professional_fk FOREIGN KEY (professional_id) REFERENCES public.professionals(id),
  CONSTRAINT appointments_professional_fk FOREIGN KEY (tenant_id) REFERENCES public.professionals(tenant_id)
);