import { db, json, mercadoPago, readJson } from "../_mercadopago.js";

const statusMap = {
  approved: "APPROVED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  in_process: "IN_PROCESS",
  pending: "PENDING",
};

export default async function handler(req, res) {
  if (!["POST", "GET"].includes(req.method))
    return json(res, 405, { message: "Method not allowed" });
  const client = await db().connect();
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const body = req.method === "POST" ? await readJson(req) : {};
    const type = body.type || body.topic || url.searchParams.get("type");
    const id =
      body.data?.id ||
      body.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    if (!id || (type && !["payment", "merchant_order"].includes(type)))
      return json(res, 200, { received: true });
    if (type === "merchant_order") return json(res, 200, { received: true });

    const payment = await mercadoPago(`/v1/payments/${encodeURIComponent(id)}`);
    const externalReference = payment.external_reference;
    const mapped = statusMap[payment.status] || "PENDING";
    if (!externalReference)
      return json(res, 200, { received: true, ignored: "missing_reference" });

    await client.query("begin");
    const { rows } = await client.query(
      `
      update public.subscription_payments
         set provider_payment_id = $1,
             status = $2,
             raw_payload = coalesce(raw_payload, '{}'::jsonb) || $3::jsonb
       where id = $4
       returning tenant_id, subscription_id, plan_id, amount, currency
      `,
      [
        String(payment.id),
        mapped,
        JSON.stringify({ payment }),
        externalReference,
      ],
    );
    const record = rows[0];
    if (record && mapped === "APPROVED") {
      await client.query(
        `
        update public.subscriptions
           set status = 'ACTIVE',
               plan_id = $1,
               provider = 'mercadopago',
               provider_subscription_id = $2,
               current_period_end = now() + interval '1 month'
         where id = $3
           and tenant_id = $4
        `,
        [
          record.plan_id,
          String(payment.id),
          record.subscription_id,
          record.tenant_id,
        ],
      );
    }
    await client.query("commit");
    return json(res, 200, { received: true });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return json(res, error.status || 500, {
      message: error.message || "WEBHOOK_ERROR",
      detail: error.data,
    });
  } finally {
    client.release();
  }
}
