import { db, getDatabaseUrl, getMercadoPagoToken, json } from "./_mercadopago.js";

const CHECK_TIMEOUT_MS = 3000;

async function withTimeout(task) {
  return Promise.race([
    task,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("CHECK_TIMEOUT")), CHECK_TIMEOUT_MS),
    ),
  ]);
}

async function checkDatabase() {
  if (!getDatabaseUrl()) return { status: "not_configured" };
  const client = await withTimeout(db().connect());
  try {
    await withTimeout(client.query("select 1"));
    return { status: "up" };
  } finally {
    client.release();
  }
}

async function checkSupabaseAuth() {
  const baseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!baseUrl) return { status: "not_configured" };

  const response = await withTimeout(
    fetch(`${baseUrl.replace(/\/$/, "")}/auth/v1/health`),
  );
  return { status: response.ok ? "up" : "down", http_status: response.status };
}

async function checkMercadoPago() {
  if (!getMercadoPagoToken()) return { status: "not_configured" };

  const response = await withTimeout(
    fetch("https://api.mercadopago.com/users/me", {
      headers: { authorization: `Bearer ${getMercadoPagoToken()}` },
    }),
  );
  return { status: response.ok ? "up" : "down", http_status: response.status };
}

async function runCheck(check) {
  try {
    return await check();
  } catch (error) {
    return { status: "down", error: error.message || "CHECK_FAILED" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    return json(res, 405, { status: "error", message: "Method not allowed" });
  }

  const services = Object.fromEntries(
    await Promise.all([
      ["database", runCheck(checkDatabase)],
      ["supabase_auth", runCheck(checkSupabaseAuth)],
      ["mercadopago", runCheck(checkMercadoPago)],
    ].map(async ([name, result]) => [name, await result])),
  );
  const configuredServices = Object.values(services).filter(
    ({ status }) => status !== "not_configured",
  );
  const hasFailure = configuredServices.some(({ status }) => status === "down");
  const status = hasFailure ? "degraded" : "ok";

  return json(res, hasFailure ? 503 : 200, {
    status,
    timestamp: new Date().toISOString(),
    services,
  });
}
