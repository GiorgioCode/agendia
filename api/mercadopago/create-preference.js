import {
  authenticatedUser,
  db,
  getBaseUrl,
  json,
  mercadoPago,
  readJson,
} from "../_mercadopago.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return json(res, 405, { message: "Method not allowed" });
  const client = await db().connect();
  try {
    const body = await readJson(req);
    const tenantId = String(body.tenant_id || "");
    const planId = String(body.plan_id || "");
    if (!tenantId || !planId)
      return json(res, 400, { message: "TENANT_AND_PLAN_REQUIRED" });

    await client.query("begin");
    const userId = await authenticatedUser(client, req);
    if (!userId) {
      await client.query("rollback");
      return json(res, 401, { message: "UNAUTHORIZED" });
    }
    const { rows } = await client.query(
      `
      select
        t.id tenant_id,
        t.name tenant_name,
        s.id subscription_id,
        p.id plan_id,
        p.name plan_name,
        p.description,
        p.price,
        p.currency
      from public.tenants t
      join public.tenant_members tm on tm.tenant_id = t.id
      join lateral (
        select *
        from public.subscriptions
        where tenant_id = t.id
          and status <> 'CANCELLED'
        order by created_at desc
        limit 1
      ) s on true
      join public.plans p on p.id = $2 and p.active = true
      where t.id = $1
        and tm.user_id = $3
        and tm.active = true
        and tm.role = 'TENANT_ADMIN'
      limit 1
      `,
      [tenantId, planId, userId],
    );
    const checkout = rows[0];
    if (!checkout) {
      await client.query("rollback");
      return json(res, 403, { message: "UNAUTHORIZED" });
    }
    if (checkout.price == null || Number(checkout.price) <= 0) {
      await client.query("rollback");
      return json(res, 400, { message: "PLAN_NOT_PAYABLE" });
    }

    const payment = await client.query(
      `
      insert into public.subscription_payments
        (tenant_id, subscription_id, plan_id, user_id, amount, currency)
      values ($1,$2,$3,$4,$5,$6)
      returning id
      `,
      [
        checkout.tenant_id,
        checkout.subscription_id,
        checkout.plan_id,
        userId,
        checkout.price,
        checkout.currency,
      ],
    );
    const paymentId = payment.rows[0].id;
    const base = getBaseUrl(req);
    const preference = await mercadoPago("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            id: checkout.plan_id,
            title: `Agendia - ${checkout.plan_name}`,
            description:
              checkout.description || `Plan ${checkout.plan_name} de Agendia`,
            quantity: 1,
            currency_id: checkout.currency || "ARS",
            unit_price: Number(checkout.price),
          },
        ],
        external_reference: paymentId,
        metadata: {
          payment_id: paymentId,
          tenant_id: checkout.tenant_id,
          subscription_id: checkout.subscription_id,
          plan_id: checkout.plan_id,
        },
        back_urls: {
          success: `${base}/admin/${encodeURIComponent(body.tenant_slug || "")}/subscription?payment=success`,
          pending: `${base}/admin/${encodeURIComponent(body.tenant_slug || "")}/subscription?payment=pending`,
          failure: `${base}/admin/${encodeURIComponent(body.tenant_slug || "")}/subscription?payment=failure`,
        },
        notification_url: `${base}/api/mercadopago/webhook`,
        statement_descriptor: "AGENDIA",
        auto_return: "approved",
      }),
    });

    await client.query(
      `
      update public.subscription_payments
         set provider_preference_id = $1,
             checkout_url = $2,
             raw_payload = $3
       where id = $4
      `,
      [
        preference.id,
        preference.init_point,
        JSON.stringify(preference),
        paymentId,
      ],
    );
    await client.query("commit");
    return json(res, 200, {
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return json(res, error.status || 500, {
      message: error.message || "CHECKOUT_ERROR",
      detail: error.data,
    });
  } finally {
    client.release();
  }
}
