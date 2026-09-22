import type { Page } from "@playwright/test";
export const tenantId = "a0000000-0000-4000-8000-000000000001";
export const proId = "a0000000-0000-4000-8000-000000000002";
export const patientId = "a0000000-0000-4000-8000-000000000003";
const userId = "a0000000-0000-4000-8000-000000000004";
export async function mockSupabase(
  page: Page,
  {
    role = "patient",
    signedIn = false,
    conflict = false,
    paidPlan = false,
  }: {
    role?: "patient" | "admin" | "operator";
    signedIn?: boolean;
    conflict?: boolean;
    paidPlan?: boolean;
  } = {},
) {
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
  const session = {
    access_token: token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "test-refresh",
    user,
  };
  if (signedIn)
    await page.addInitScript(
      (session) =>
        localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
      session,
    );
  const plan = {
    id: "a0000000-0000-4000-8000-000000000009",
    name: "Basic",
    code: "BASIC",
    active: true,
    price: paidPlan ? 15000 : null,
    currency: "ARS",
    max_professionals: 5,
    max_admins: 2,
    description: "Para tu consultorio.",
  };
  const tenant = {
    id: tenantId,
    name: "Clínica Demo",
    slug: "clinica-demo",
    timezone: "America/Argentina/Buenos_Aires",
    active: true,
    responsible_name: "Responsable Demo",
    primary_color: "#176b5b",
    secondary_color: "#e4eee8",
    description: "Atención cercana para tu salud.",
    phone: "555",
    email: "clinic@example.test",
    address: "Av. Demo 123",
    welcome_text: "Tu sonrisa, en buenas manos.",
    provider_type: "CLINIC",
    page_template: "CLASSIC",
    hero_image_path: null,
    tagline: "Odontología cercana",
    logo_path: null,
    website: null,
  };
  const professional = {
    id: proId,
    tenant_id: tenantId,
    first_name: "Laura",
    last_name: "Gómez",
    specialty: "Odontología General",
    active: true,
    description: "Atención integral.",
    email: "internal@example.test",
  };
  const patient = {
    id: patientId,
    tenant_id: tenantId,
    first_name: "Ana",
    last_name: "Paciente",
    phone: "555",
    email: "test@example.test",
    dni: "123",
    active: true,
    notes: "INTERNAL_NOTE_DO_NOT_EXPOSE",
  };
  const profiles = [
    {
      ...patient,
      notes: undefined,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
    },
  ];
  const appointments: Record<string, unknown>[] = [];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/mercadopago/create-preference", async (route) => {
    calls.push({
      name: "create-preference",
      body: route.request().postDataJSON() || {},
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        preference_id: "pref-test",
        init_point:
          "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-test",
      }),
    });
  });
  await page.route("https://www.mercadopago.com.ar/**", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main>Checkout Pro</main>",
    }),
  );
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      body = request.postDataJSON() || {},
      method = request.method();
    const reply = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
        headers: { "access-control-allow-origin": "*" },
      });
    if (url.pathname.includes("/auth/v1/token")) return reply(session);
    if (url.pathname.includes("/auth/v1/user")) return reply(user);
    if (url.pathname.includes("/auth/v1/logout"))
      return route.fulfill({ status: 204 });
    if (url.pathname.includes("/auth/v1/signup"))
      return reply({ user, session: null });
    if (url.pathname.includes("/auth/v1/recover")) return reply({});
    if (url.pathname.includes("/rest/v1/rpc/")) {
      const name = url.pathname.split("/").at(-1)!;
      calls.push({ name, body });
      if (name === "is_platform_admin") return reply(false);
      if (name === "get_public_tenant_by_slug")
        return reply(body.p_slug === tenant.slug ? [tenant] : []);
      if (name === "get_public_professionals")
        return reply([
          {
            id: proId,
            first_name: professional.first_name,
            last_name: professional.last_name,
            specialty: professional.specialty,
            description: professional.description,
          },
        ]);
      if (name === "get_public_specialties")
        return reply([{ specialty: professional.specialty }]);
      if (name === "search_public_providers")
        return reply([
          {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            provider_type: tenant.provider_type,
            description: tenant.description,
            tagline: tenant.tagline,
            address: tenant.address,
            phone: tenant.phone,
            email: tenant.email,
            logo_path: tenant.logo_path,
            hero_image_path: tenant.hero_image_path,
            primary_color: tenant.primary_color,
            secondary_color: tenant.secondary_color,
            specialties: [professional.specialty],
          },
        ]);
      if (name === "get_available_days") return reply([]);
      if (name === "get_available_slots")
        return reply([
          { start_time: "09:00:00", end_time: "09:30:00" },
          { start_time: "10:00:00", end_time: "10:30:00" },
        ]);
      if (name === "get_my_profiles") return reply(profiles);
      if (name === "get_my_appointments")
        return reply(
          appointments.map((a) => ({
            ...a,
            notes: undefined,
            tenant_name: tenant.name,
            tenant_slug: tenant.slug,
            timezone: tenant.timezone,
            professional_name: "Laura Gómez",
            specialty: "Odontología General",
          })),
        );
      if (name === "ensure_patient_profile") return reply(patientId);
      if (name === "book_appointment" || name === "admin_create_appointment") {
        if (conflict)
          return reply({ code: "P0001", message: "SLOT_UNAVAILABLE" }, 400);
        const id = "a0000000-0000-4000-8000-000000000010";
        appointments.push({
          id,
          tenant_id: tenantId,
          professional_id: proId,
          patient_id: patientId,
          appointment_date: body.p_target_date,
          start_time: body.p_start_time,
          end_time: "09:30:00",
          status: "CONFIRMED",
          reason: body.p_reason,
          notes: body.p_notes,
          professionals: professional,
          patients: patient,
        });
        return reply(id);
      }
      if (
        name === "cancel_own_appointment" ||
        name === "admin_set_appointment_status"
      ) {
        const a = appointments.find((a) => a.id === body.p_appointment_id);
        if (a) a.status = body.p_status || "CANCELLED";
        return reply(true);
      }
      if (name === "admin_reschedule_appointment") {
        const a = appointments.find((a) => a.id === body.p_appointment_id);
        if (a) {
          a.appointment_date = body.p_target_date;
          a.start_time = body.p_start_time;
        }
        return reply(true);
      }
      if (name === "register_tenant") {
        tenant.name = body.p_name;
        tenant.slug = body.p_slug;
        return reply([{ tenant_id: tenantId, tenant_slug: tenant.slug }]);
      }
      if (name === "get_tenant_members") return reply([]);
      if (name === "manage_member") return reply(userId);
      return reply({ message: `Unmocked RPC: ${name}` }, 500);
    }
    const table = url.pathname.split("/").at(-1)!;
    if (method === "POST" || method === "PATCH") {
      calls.push({ name: table, body });
      return reply({ id: proId });
    }
    if (method === "DELETE") return route.fulfill({ status: 204 });
    if (table === "plans") return reply([plan]);
    if (table === "tenants") return reply([tenant]);
    if (table === "tenant_members")
      return reply(
        role === "patient"
          ? []
          : [
              {
                tenant_id: tenantId,
                user_id: userId,
                role: role === "admin" ? "TENANT_ADMIN" : "OPERATOR",
                active: true,
                tenants: tenant,
              },
            ],
      );
    if (table === "subscriptions")
      return reply([
        {
          id: "subscription",
          tenant_id: tenantId,
          plan_id: plan.id,
          status: "ACTIVE",
          starts_at: new Date().toISOString(),
          trial_ends_at: null,
          current_period_end: null,
          plans: plan,
        },
      ]);
    if (table === "professionals") return reply([professional]);
    if (table === "patients") return reply([patient]);
    if (table === "appointments") return reply(appointments);
    if (["professional_schedules", "schedule_exceptions"].includes(table))
      return reply([]);
    return reply({ message: "Unmocked endpoint" }, 500);
  });
  return { calls, appointments, tenant };
}
