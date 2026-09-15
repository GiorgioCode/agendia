import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { todayIn, displayDate } from "../../src/lib/dates";
test("real Supabase: register clinic, schedule, patient login, booking and cancellation", async ({
  page,
  browser,
}) => {
  const suffix = Date.now().toString(36),
    slug = `live-${suffix}`,
    email = `admin-${suffix}@example.test`,
    password = "AgendiaLocalTest123!";
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Un espacio para tu consultorio." }),
  ).toBeVisible();
  await page.getByLabel("Nombre del consultorio").fill("Prueba de integración");
  await page.getByLabel("Dirección de tu consultorio").fill(slug);
  await page
    .getByLabel("Nombre del responsable")
    .fill("Administrador de prueba");
  await page.getByLabel("Teléfono").fill("555");
  await page.getByLabel("Email del consultorio").fill(email);
  await page
    .getByRole("button", { name: "Crear consultorio", exact: true })
    .click();
  await page.getByRole("link", { name: /Tu primer profesional/ }).click();
  await page.getByLabel("Nombre", { exact: false }).fill("Laura");
  await page.getByLabel("Apellido").fill("Gómez");
  await page.getByLabel("Especialidad").fill("Odontología");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByRole("link", { name: "Horarios", exact: true }).click();
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const day = todayIn("America/Argentina/Buenos_Aires", tomorrow);
  const weekday = new Date(day + "T12:00:00Z").getUTCDay() || 7;
  await page.getByLabel("Día", { exact: true }).selectOption(String(weekday));
  await page.getByRole("button", { name: "Agregar horario" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Guardado correctamente",
  );
  // Another browser session proves the patient flow doesn't inherit tenant membership.
  const patientContext = await browser.newContext();
  const patient = await patientContext.newPage();
  await patient.goto(`http://127.0.0.1:5175/t/${slug}`);
  await patient.getByRole("link", { name: "Ver disponibilidad" }).click();
  const month = new Date(day + "T12:00:00Z").getUTCMonth();
  if (new Date().getUTCMonth() !== month)
    await patient.getByRole("button", { name: "Mes siguiente" }).click();
  await patient
    .getByRole("button", { name: displayDate(day), exact: true })
    .click();
  await patient.getByRole("button", { name: "08:00 08:30" }).click();
  await patient.getByRole("link", { name: "Crear una cuenta" }).click();
  await patient.getByLabel("Email").fill(`patient-${suffix}@example.test`);
  await patient.getByLabel("Contraseña").fill(password);
  await patient
    .getByRole("button", { name: "Crear cuenta", exact: true })
    .click();
  await patient.getByLabel("Nombre", { exact: false }).fill("Ana");
  await patient.getByLabel("Apellido").fill("Paciente");
  await patient.getByLabel("Teléfono").fill("555");
  await patient.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(
    patient.getByRole("heading", { name: "Tu turno está confirmado." }),
  ).toBeVisible();
  await patient.getByRole("link", { name: "Ver mis turnos" }).click();
  await patient.getByRole("button", { name: "Cancelar turno" }).click();
  await patient.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(patient.getByText("Cancelado", { exact: true })).toBeVisible();
  await patientContext.close();
  const client = createClient(
    process.env.AGENDIA_LOCAL_SUPABASE_URL!,
    process.env.AGENDIA_LOCAL_SUPABASE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await client.rpc("get_public_tenant_by_slug", {
    p_slug: slug,
  });
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
});
