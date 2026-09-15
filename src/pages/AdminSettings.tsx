import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  DataForm,
  ErrorState,
  Heading,
  Loading,
  requiredText,
  ActionButton,
  StatusBadge,
} from "../components/ui";
import { assetUrl, rpc, rows, supabase } from "../lib/supabase";
import type { Plan } from "../types/models";
import { useAdmin } from "./AdminLayout";
const settingsSchema = z.object({
  name: requiredText,
  responsible_name: requiredText,
  description: z.string().max(2000),
  phone: z.string().max(80),
  email: z.union([z.literal(""), z.email()]),
  address: z.string().max(500),
  website: z
    .string()
    .refine((v) => !v || /^https?:\/\//.test(v), "Usá una URL http o https"),
  timezone: requiredText,
  primary_color: z.string().regex(/^#[\da-fA-F]{6}$/),
  secondary_color: z.string().regex(/^#[\da-fA-F]{6}$/),
  welcome_text: z.string().max(500),
});
export function Settings() {
  const { tenant } = useAdmin(),
    cache = useQueryClient(),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState<unknown>(null);
  return (
    <>
      <Heading eyebrow="TU IDENTIDAD" title="Configuración del consultorio">
        Personalizá el espacio que ven tus pacientes.
      </Heading>
      <section className="card form-card">
        <div className="logo-upload">
          {tenant.logo_path && (
            <img
              src={assetUrl(tenant.logo_path)}
              alt={`Logo de ${tenant.name}`}
            />
          )}
          <label>
            Logo del consultorio
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setError(null);
                setUploading(true);
                try {
                  if (
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    ) ||
                    file.size > 2 * 1024 * 1024
                  )
                    throw new Error("LOGO_INVALID");
                  const ext =
                    file.type === "image/jpeg"
                      ? "jpg"
                      : file.type.split("/")[1];
                  const path = `${tenant.id}/${crypto.randomUUID()}.${ext}`;
                  const { error: uploadError } = await supabase.storage
                    .from("tenant-assets")
                    .upload(path, file);
                  if (uploadError) throw uploadError;
                  const { error: saveError } = await supabase
                    .from("tenants")
                    .update({ logo_path: path })
                    .eq("id", tenant.id);
                  if (saveError) {
                    await supabase.storage.from("tenant-assets").remove([path]);
                    throw saveError;
                  }
                  if (tenant.logo_path)
                    await supabase.storage
                      .from("tenant-assets")
                      .remove([tenant.logo_path]);
                  await cache.invalidateQueries();
                } catch (err) {
                  setError(err);
                } finally {
                  setUploading(false);
                }
              }}
            />
            <small className="muted">PNG, JPG o WebP. Máximo 2 MB.</small>
          </label>
        </div>
        {error != null && <ErrorState error={error} />}
        <DataForm
          key={tenant.id}
          schema={settingsSchema}
          values={{
            name: tenant.name,
            responsible_name: tenant.responsible_name || "",
            description: tenant.description || "",
            phone: tenant.phone || "",
            email: tenant.email || "",
            address: tenant.address || "",
            website: tenant.website || "",
            timezone: tenant.timezone,
            primary_color: tenant.primary_color || "#176b5b",
            secondary_color: tenant.secondary_color || "#e4eee8",
            welcome_text: tenant.welcome_text || "",
          }}
          fields={[
            { name: "name", label: "Nombre comercial", required: true },
            { name: "responsible_name", label: "Responsable", required: true },
            { name: "phone", label: "Teléfono", type: "tel" },
            { name: "email", label: "Email", type: "email" },
            { name: "address", label: "Dirección" },
            { name: "website", label: "Sitio web", type: "url" },
            {
              name: "timezone",
              label: "Zona horaria IANA",
              hint: "Ejemplo: America/Argentina/Buenos_Aires",
            },
            { name: "primary_color", label: "Color principal", type: "color" },
            {
              name: "secondary_color",
              label: "Color secundario",
              type: "color",
            },
            { name: "welcome_text", label: "Texto de bienvenida" },
            { name: "description", label: "Descripción", type: "textarea" },
          ]}
          onSubmit={async (v) => {
            const { error } = await supabase
              .from("tenants")
              .update(v)
              .eq("id", tenant.id);
            if (error) throw error;
            await cache.invalidateQueries();
          }}
        />
      </section>
    </>
  );
}
export function Members() {
  const { tenant } = useAdmin(),
    cache = useQueryClient();
  const q = useQuery({
    queryKey: ["members", tenant.id],
    queryFn: () => rpc("get_tenant_members", { p_tenant_id: tenant.id }),
  });
  return (
    <>
      <Heading title="Tu equipo">
        Agregá personas que ya tengan una cuenta de Agendia. Podés cambiar su
        rol usando el mismo email.
      </Heading>
      <section className="card section-block">
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : (
          q.data?.map((m) => (
            <div className="list-row" key={m.id}>
              <div>
                <strong>{m.email}</strong> <StatusBadge status={m.role} />
                {!m.active && <span className="badge cancelled">Inactivo</span>}
              </div>
              <ActionButton
                confirm={
                  m.active
                    ? "¿Desactivar el acceso de esta persona?"
                    : undefined
                }
                action={async () => {
                  await rpc("manage_member", {
                    p_tenant_id: tenant.id,
                    p_email: m.email,
                    p_role: m.role,
                    p_active: !m.active,
                  });
                  await cache.invalidateQueries();
                }}
              >
                {m.active ? "Desactivar" : "Activar"}
              </ActionButton>
            </div>
          ))
        )}
      </section>
      <section className="card form-card">
        <h2>Agregar o cambiar miembro</h2>
        <DataForm
          schema={z.object({
            email: z.email("Email inválido"),
            role: z.enum(["TENANT_ADMIN", "OPERATOR"]),
          })}
          values={{ email: "", role: "OPERATOR" }}
          fields={[
            {
              name: "email",
              label: "Email registrado",
              type: "email",
              required: true,
            },
            {
              name: "role",
              label: "Rol",
              options: [
                { value: "OPERATOR", label: "Operador — pacientes y turnos" },
                {
                  value: "TENANT_ADMIN",
                  label: "Administrador — configuración y equipo",
                },
              ],
            },
          ]}
          onSubmit={async (v) => {
            await rpc("manage_member", {
              p_tenant_id: tenant.id,
              p_email: v.email,
              p_role: v.role,
              p_active: true,
            });
            await cache.invalidateQueries();
          }}
        />
      </section>
    </>
  );
}
const signupSchema = z.object({
  name: requiredText,
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Usá minúsculas, números y guiones"),
  responsible_name: requiredText,
  phone: requiredText,
  email: z.email("Email inválido"),
  timezone: requiredText,
  plan_code: requiredText,
});
export function Signup() {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: () => rows<Plan>("plans"),
  });
  return (
    <div className="narrow">
      <Heading
        eyebrow="EMPEZÁ CON AGENDIA"
        title="Un espacio para tu consultorio."
      >
        14 días para conocer una forma más simple de organizarte.
      </Heading>
      <section className="card">
        {plans.isLoading ? (
          <Loading />
        ) : plans.error ? (
          <ErrorState error={plans.error} />
        ) : (
          <DataForm
            schema={signupSchema}
            values={{
              name: "",
              slug: "",
              responsible_name: "",
              phone: "",
              email: "",
              timezone: "America/Argentina/Buenos_Aires",
              plan_code: params.get("plan") || "BASIC",
            }}
            fields={[
              { name: "name", label: "Nombre del consultorio", required: true },
              {
                name: "slug",
                label: "Dirección de tu consultorio",
                required: true,
                hint: "Tu página: /t/nombre-del-consultorio",
              },
              {
                name: "responsible_name",
                label: "Nombre del responsable",
                required: true,
              },
              { name: "phone", label: "Teléfono", type: "tel", required: true },
              {
                name: "email",
                label: "Email del consultorio",
                type: "email",
                required: true,
              },
              { name: "timezone", label: "Zona horaria", required: true },
              {
                name: "plan_code",
                label: "Plan",
                options: plans.data?.map((p) => ({
                  value: p.code,
                  label: p.name,
                })),
              },
            ]}
            submitLabel="Crear consultorio"
            onSubmit={async (v) => {
              const result = await rpc("register_tenant", {
                p_name: v.name,
                p_slug: v.slug,
                p_responsible_name: v.responsible_name,
                p_phone: v.phone,
                p_email: v.email,
                p_timezone: v.timezone,
                p_plan_code: v.plan_code,
              });
              await cache.invalidateQueries();
              navigate(`/admin/${result[0].tenant_slug}/onboarding`);
            }}
          />
        )}
      </section>
    </div>
  );
}
export function Onboarding() {
  const { tenant, base } = useAdmin();
  return (
    <>
      <Heading
        eyebrow="BIENVENIDO"
        title="Hagamos lugar para tus primeros turnos."
      >
        Completá estos pasos a tu ritmo. Podés volver a ellos desde el menú.
      </Heading>
      <div className="onboarding-list">
        {[
          {
            title: "La información de tu consultorio",
            text: "Revisá los datos de contacto y la zona horaria.",
            to: "/settings",
          },
          {
            title: "Tu identidad",
            text: "Agregá tu logo, tus colores y un mensaje de bienvenida.",
            to: "/settings",
          },
          {
            title: "Tu primer profesional",
            text: "Cargá los datos de quien va a atender.",
            to: "/professionals/new",
          },
          {
            title: "Los horarios de atención",
            text: "Elegí un profesional y configurá sus rangos semanales.",
            to: "/professionals",
          },
        ].map((s, i) => (
          <Link className="card onboarding-step" key={s.title} to={base + s.to}>
            <span>{i + 1}</span>
            <div>
              <h2>{s.title}</h2>
              <p className="muted">{s.text}</p>
            </div>
            <span>→</span>
          </Link>
        ))}
        <div className="card onboarding-step">
          <span>5</span>
          <div>
            <h2>Tu página pública</h2>
            <Link className="text-link" to={`/t/${tenant.slug}`}>
              /t/{tenant.slug} ↗
            </Link>
          </div>
        </div>
      </div>
      <div className="button-row">
        <Link className="btn" to={base}>
          Finalizar
        </Link>
        <Link className="btn secondary" to={base}>
          Completar más tarde
        </Link>
      </div>
    </>
  );
}
