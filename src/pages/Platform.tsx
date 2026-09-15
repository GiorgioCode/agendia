import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../lib/supabase";
import {
  DataForm,
  Empty,
  ErrorState,
  Heading,
  Loading,
  StatusBadge,
} from "../components/ui";
import { z } from "zod";
export function Platform() {
  const [search, setSearch] = useState(""),
    cache = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => rpc("platform_overview"),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <Heading eyebrow="PLATAFORMA" title="Organizaciones y planes">
        Administración de suscripciones. Acceso exclusivo del equipo de Agendia.
      </Heading>
      <label className="field">
        Buscar organización
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre o dirección…"
        />
      </label>
      <div className="section-block">
        {q.data?.tenants
          .filter((t) =>
            `${t.name} ${t.slug}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((t) => (
            <details className="card profile-details" key={t.id}>
              <summary>
                {t.name} <StatusBadge status={t.status} />
              </summary>
              <p className="muted">
                /t/{t.slug} · Alta:{" "}
                {new Date(t.created_at).toLocaleDateString("es-AR")} ·{" "}
                {t.plan_name}
              </p>
              <DataForm
                schema={z.object({
                  active: z.enum(["true", "false"]),
                  status: z.enum([
                    "TRIALING",
                    "ACTIVE",
                    "PAST_DUE",
                    "SUSPENDED",
                    "CANCELLED",
                  ]),
                  plan_id: z.uuid(),
                })}
                values={{
                  active: t.active ? "true" : "false",
                  status: t.status as "ACTIVE",
                  plan_id: t.plan_id,
                }}
                fields={[
                  {
                    name: "active",
                    label: "Organización",
                    options: [
                      { value: "true", label: "Activa" },
                      { value: "false", label: "Inactiva" },
                    ],
                  },
                  {
                    name: "status",
                    label: "Suscripción",
                    options: [
                      { value: "TRIALING", label: "Prueba de 14 días" },
                      { value: "ACTIVE", label: "Activa" },
                      { value: "PAST_DUE", label: "Pendiente de pago" },
                      { value: "SUSPENDED", label: "Suspendida" },
                      { value: "CANCELLED", label: "Cancelada" },
                    ],
                  },
                  {
                    name: "plan_id",
                    label: "Plan",
                    options: q.data?.plans
                      .filter((p) => p.active)
                      .map((p) => ({ value: p.id, label: p.name })),
                  },
                ]}
                onSubmit={async (v) => {
                  await rpc("platform_update_tenant", {
                    p_tenant_id: t.id,
                    p_active: v.active === "true",
                    p_status: v.status,
                    p_plan_id: v.plan_id,
                  });
                  await cache.invalidateQueries();
                }}
              />
            </details>
          ))}
        {!q.data?.tenants.length && (
          <Empty>Todavía no hay organizaciones.</Empty>
        )}
      </div>
      <h2>Planes de la plataforma</h2>
      <div className="professional-grid">
        {q.data?.plans.map((p) => (
          <article key={p.id} className="card">
            <h3>{p.name}</h3>
            <p>
              {p.max_professionals ?? "Sin límite de"} profesionales ·{" "}
              {p.max_admins ?? "Sin límite de"} administradores
            </p>
            <p className="muted">
              {p.price == null ? "Consultar" : `${p.price} ${p.currency}`} ·{" "}
              {p.active ? "Activo" : "Inactivo"}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
