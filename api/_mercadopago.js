import pg from "pg";

const { Pool } = pg;

let pool;

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.URL_DATABASE;
}

export function getMercadoPagoToken() {
  return process.env.MP_ACCESS_TOKEN || process.env.MP_ACCES_TOKEN;
}

export function getBaseUrl(req) {
  return (
    process.env.APP_BASE_URL ||
    process.env.VITE_APP_BASE_URL ||
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`
  ).replace(/\/$/, "");
}

export function db() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");
  pool ||= new Pool({
    connectionString,
    ssl:
      /127\.0\.0\.1|localhost/.test(connectionString) ||
      connectionString.includes("sslmode=disable")
        ? false
        : { rejectUnauthorized: false },
  });
  return pool;
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export function bearer(req) {
  const value = req.headers.authorization || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7) : "";
}

export async function authenticatedUser(client, req) {
  const token = bearer(req);
  if (!token) return null;
  const user = await supabaseUser(token);
  if (!user?.id) return null;
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
    user.id,
  ]);
  return user.id;
}

export async function supabaseUser(token) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_AUTH_CONFIG_REQUIRED");
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: key },
  });
  if (!response.ok) return null;
  return response.json();
}

export async function mercadoPago(path, options = {}) {
  const token = getMercadoPagoToken();
  if (!token) throw new Error("MP_ACCESS_TOKEN_REQUIRED");
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "MERCADOPAGO_ERROR");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
