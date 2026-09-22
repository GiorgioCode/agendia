import { test, expect } from "@playwright/test";
import { mockSupabase, proId } from "./fixtures";
import { mkdir } from "node:fs/promises";
test("landing, prices, and mobile navigation", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu tiempo, bien cuidado." }),
  ).toBeVisible();
  await expect(page.getByText("Consultar", { exact: true })).toBeVisible();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: "Buscar turno", exact: true })
    .click();
  await expect(page).toHaveURL(/directorio/);
  await expect(
    page.getByRole("heading", {
      name: "Encontrá un turno con el prestador indicado.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/directory-mobile.png",
    fullPage: true,
  });
});
test("directory filters providers by public specialty and links to tenant page", async ({
  page,
}) => {
  const state = await mockSupabase(page);
  await page.goto("/directorio");
  await page.getByPlaceholder("Buscar por nombre o especialidad").fill("demo");
  await page.getByLabel("Especialidad").selectOption("Odontología General");
  await expect(
    page.getByRole("heading", { name: "Clínica Demo" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ver página y turnos" }).click();
  await expect(page).toHaveURL(/\/t\/clinica-demo/);
  expect(state.calls.some((c) => c.name === "search_public_providers")).toBe(
    true,
  );
});
test("public availability preserves reservation through login and confirms via RPC", async ({
  page,
}) => {
  const state = await mockSupabase(page);
  await page.goto(`/t/clinica-demo/professionals/${proId}`);
  await expect(
    page.getByRole("heading", { name: "Laura Gómez" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "09:00 09:30" }).click();
  await expect(page).toHaveURL(/login\?next=/);
  await page.getByLabel("Email").fill("test@example.test");
  await page.getByLabel("Contraseña").fill("password123");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirmá tu turno" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "INTERNAL_NOTE_DO_NOT_EXPOSE",
  );
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu turno está confirmado." }),
  ).toBeVisible();
  expect(
    state.calls.find((c) => c.name === "book_appointment")?.body
      .p_professional_id,
  ).toBe(proId);
  await page.getByRole("link", { name: "Ver mis turnos" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu salud, en agenda." }),
  ).toBeVisible();
});
test("slot conflict is explained and user can choose another time", async ({
  page,
}) => {
  await mockSupabase(page, { signedIn: true, conflict: true });
  await page.goto(
    `/t/clinica-demo/book/${proId}?date=2099-01-01&time=09:00:00`,
  );
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.getByRole("alert")).toContainText("ya no está disponible");
  await page.getByRole("link", { name: "Elegir otro horario" }).click();
  await expect(
    page.getByRole("heading", { name: "Laura Gómez" }),
  ).toBeVisible();
});
test("patient can cancel own future booking through keyboard-accessible confirmation", async ({
  page,
}) => {
  await mockSupabase(page, { signedIn: true });
  await page.goto(
    `/t/clinica-demo/book/${proId}?date=2099-01-01&time=09:00:00`,
  );
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await page.getByRole("link", { name: "Ver mis turnos" }).click();
  await page.getByRole("button", { name: "Cancelar turno" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Cancelar turno" }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
});
test("admin creates a clinic, completes onboarding steps and creates a professional", async ({
  page,
}) => {
  const state = await mockSupabase(page, { role: "admin", signedIn: true });
  await page.goto("/signup");
  await page.getByRole("button", { name: "Clínica" }).click();
  await page.getByLabel("Nombre de la clínica").fill("Centro Nuevo");
  await page.getByLabel("Dirección pública").fill("centro-nuevo");
  await page.getByLabel("Nombre del responsable").fill("Responsable");
  await page.getByLabel("Teléfono").fill("555");
  await page.getByLabel("Email del consultorio").fill("clinic@example.test");
  await page
    .getByRole("button", { name: "Crear consultorio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Hagamos lugar para tus primeros turnos.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Tu primer profesional/ }).click();
  await page.getByLabel("Nombre").fill("Martín");
  await page.getByLabel("Apellido").fill("Pérez");
  await page.getByLabel("Especialidad").fill("Ortodoncia");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("heading", { name: "Profesionales", exact: true }),
  ).toBeVisible();
  expect(
    state.calls.some(
      (c) => c.name === "professionals" && c.body.first_name === "Martín",
    ),
  ).toBe(true);
  expect(
    state.calls.some(
      (c) =>
        c.name === "register_tenant" && c.body.p_provider_type === "CLINIC",
    ),
  ).toBe(true);
});
test("operator can create and reschedule appointments but cannot open settings", async ({
  page,
}) => {
  const state = await mockSupabase(page, { role: "operator", signedIn: true });
  await page.goto("/admin/clinica-demo");
  await expect(
    page.getByRole("heading", { name: "Un día bien organizado." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Nuevo turno", exact: true }).click();
  await page.getByLabel("Profesional").selectOption(proId);
  await page
    .getByLabel("Paciente")
    .selectOption("a0000000-0000-4000-8000-000000000003");
  await page.getByLabel("Fecha").fill("2099-01-01");
  await page.getByLabel("Horario").selectOption("09:00:00");
  await page.getByRole("button", { name: "Crear turno" }).click();
  await page.getByRole("link", { name: "Ver turno →" }).click();
  await page.getByLabel("Fecha").fill("2099-01-02");
  await page.getByLabel("Horario").selectOption("10:00:00");
  await page.getByRole("button", { name: "Confirmar reprogramación" }).click();
  expect(
    state.calls.some((c) => c.name === "admin_reschedule_appointment"),
  ).toBe(true);
  await page.goto("/admin/clinica-demo/settings");
  await expect(
    page.getByText("No tenés permiso para acceder a esta sección."),
  ).toBeVisible();
});
test("admin can force Mercado Pago checkout for a selected plan", async ({
  page,
}) => {
  const state = await mockSupabase(page, {
    role: "admin",
    signedIn: true,
    paidPlan: true,
  });
  await page.goto("/admin/clinica-demo/subscription");
  await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cambiar y pagar" }),
  ).toBeVisible();
  await page.goto("/admin/clinica-demo/subscription?plan=BASIC&checkout=1");
  await expect(
    page.getByText("Preparando el pago del plan BASIC"),
  ).toBeVisible();
  await expect
    .poll(() =>
      state.calls.some(
        (c) =>
          c.name === "create-preference" &&
          c.body.plan_code === "BASIC" &&
          c.body.tenant_id === "a0000000-0000-4000-8000-000000000001",
      ),
    )
    .toBe(true);
  await expect(page).toHaveURL(/mercadopago\.com\.ar/);
});
test("protected routes require login and unknown tenant stays private", async ({
  page,
}) => {
  await mockSupabase(page);
  await page.goto("/admin/clinica-demo");
  await expect(page).toHaveURL(/login/);
  await page.goto("/t/unknown");
  await expect(
    page.getByText("Este consultorio no está disponible en este momento."),
  ).toBeVisible();
});

test("registration and password recovery show email confirmation without losing the return path", async ({
  page,
}) => {
  await mockSupabase(page);
  await page.goto("/register?next=%2Fsignup");
  await page.getByLabel("Email").fill("new@example.test");
  await page.getByLabel("Contraseña").fill("password123");
  const signup = page.waitForRequest((r) =>
    r.url().includes("/auth/v1/signup"),
  );
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  expect(new URL((await signup).url()).searchParams.get("redirect_to")).toBe(
    new URL("/auth/callback?next=%2Fsignup", page.url()).href,
  );
  await expect(page.getByRole("status")).toContainText("Revisá tu correo");
  await expect(
    page.getByRole("link", { name: "Volver a iniciar sesión" }),
  ).toHaveAttribute("href", "/login?next=%2Fsignup");
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("new@example.test");
  const recovery = page.waitForRequest((r) =>
    r.url().includes("/auth/v1/recover"),
  );
  await page.getByRole("button", { name: "Enviar instrucciones" }).click();
  expect(new URL((await recovery).url()).searchParams.get("redirect_to")).toBe(
    new URL("/reset-password", page.url()).href,
  );
  await expect(page.getByRole("status")).toContainText("Revisá tu correo");
});

test("admin weekly hours reject invalid ranges before calling Supabase", async ({
  page,
}) => {
  const state = await mockSupabase(page, { signedIn: true, role: "admin" });
  await page.goto(`/admin/clinica-demo/professionals/${proId}/schedule`);
  await page.getByLabel("Desde", { exact: true }).first().fill("13:00");
  await page.getByLabel("Hasta", { exact: true }).first().fill("12:00");
  await page.getByRole("button", { name: "Agregar horario" }).click();
  await expect(
    page.getByText("El fin debe ser posterior al inicio"),
  ).toBeVisible();
  expect(state.calls.some((c) => c.name === "professional_schedules")).toBe(
    false,
  );
  await page.getByLabel("Hasta", { exact: true }).first().fill("17:00");
  await page.getByRole("button", { name: "Agregar horario" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Guardado correctamente",
  );
  expect(
    state.calls.some(
      (c) =>
        c.name === "professional_schedules" &&
        c.body.appointment_duration === 30,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/admin-schedules.png",
    fullPage: true,
  });
});
