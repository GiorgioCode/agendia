export type Role = "TENANT_ADMIN" | "OPERATOR";
export type AppointmentStatus =
  "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  max_professionals: number | null;
  max_admins: number | null;
  active: boolean;
}
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  logo_path: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  welcome_text: string | null;
  active?: boolean;
  responsible_name?: string;
}
export interface Professional {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  description: string | null;
  registration_number: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
}
export interface Patient {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  dni: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
}
export interface Profile extends Omit<Patient, "notes" | "active"> {
  tenant_slug: string;
  tenant_name: string;
}
export interface Schedule {
  id: string;
  tenant_id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  appointment_duration: number;
  active: boolean;
}
export interface Exception {
  id: string;
  tenant_id: string;
  professional_id: string;
  exception_date: string;
  type: "CLOSED" | "CUSTOM_HOURS" | "BLOCKED";
  start_time: string | null;
  end_time: string | null;
  appointment_duration: number | null;
  reason: string | null;
}
export interface Appointment {
  id: string;
  tenant_id: string;
  professional_id: string;
  patient_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  source: string;
  professionals?: Professional;
  patients?: Patient;
}
export interface MyAppointment extends Omit<
  Appointment,
  "professional_id" | "patient_id" | "notes" | "source"
> {
  tenant_name: string;
  tenant_slug: string;
  timezone: string;
  professional_name: string;
  specialty: string;
}
export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plans: Plan;
}
export interface Membership {
  tenant_id: string;
  role: Role;
  active: boolean;
  tenants: Tenant;
}
export interface Member {
  id: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Slot {
  start_time: string;
  end_time: string;
}
export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
  subscription_id: string;
  status: string;
  plan_id: string;
  plan_name: string;
}
export type PublicProfessional = Pick<
  Professional,
  "id" | "first_name" | "last_name" | "specialty" | "description"
>;
export interface RpcResults {
  get_public_tenant_by_slug: Tenant[];
  get_public_tenant_by_hostname: { slug: string }[];
  get_public_professionals: PublicProfessional[];
  get_available_slots: Slot[];
  get_available_days: { day: string }[];
  register_tenant: { tenant_id: string; tenant_slug: string }[];
  ensure_patient_profile: string;
  get_my_profiles: Profile[];
  get_my_appointments: MyAppointment[];
  book_appointment: string;
  cancel_own_appointment: boolean;
  admin_create_appointment: string;
  admin_reschedule_appointment: boolean;
  admin_set_appointment_status: boolean;
  admin_update_appointment_details: boolean;
  is_platform_admin: boolean;
  manage_member: string;
  get_tenant_members: Member[];
  platform_overview: { tenants: PlatformTenant[]; plans: Plan[] };
  platform_update_tenant: null;
}
