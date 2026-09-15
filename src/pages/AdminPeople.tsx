import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { z } from "zod";
import {
  DataForm,
  Empty,
  ErrorState,
  Heading,
  Loading,
  requiredText,
  ActionButton,
} from "../components/ui";
import { rows, saveRow } from "../lib/supabase";
import type { Professional, Patient } from "../types/models";
import { useAdmin } from "./AdminLayout";
const common = {
  first_name: requiredText,
  last_name: requiredText,
  phone: z.string().max(80),
  email: z.union([z.literal(""), z.email("Email inválido")]),
  active: z.enum(["true", "false"]),
};
const professionalSchema = z.object({
  ...common,
  specialty: requiredText,
  registration_number: z.string().max(100),
  description: z.string().max(2000),
});
const patientSchema = z.object({
  ...common,
  dni: z.string().max(30),
  notes: z.string().max(4000),
});
export function PeopleList({ kind }: { kind: "professionals" | "patients" }) {
  const { tenant, base, role } = useAdmin(),
    [search, setSearch] = useState(""),
    cache = useQueryClient();
  const q = useQuery({
    queryKey: [kind, tenant.id],
    queryFn: () => rows<Professional & Patient>(kind, tenant.id),
  });
  const list = q.data?.filter((p) =>
    `${p.first_name} ${p.last_name} ${p.dni || ""} ${p.email || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="TU CONSULTORIO"
        title={kind === "professionals" ? "Profesionales" : "Pacientes"}
        action={
          <Link className="btn" to={`${base}/${kind}/new`}>
            <Plus size={17} />
            {kind === "professionals"
              ? "Agregar profesional"
              : "Agregar paciente"}
          </Link>
        }
      >
        Toda la información de tu{" "}
        {kind === "professionals" ? "equipo" : "consultorio"}, en un lugar.
      </Heading>
      <label className="search">
        <Search size={19} />
        <input
          aria-label="Buscar por nombre, DNI o email"
          placeholder="Buscar por nombre, DNI o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : !list?.length ? (
        <Empty>No hay resultados para mostrar.</Empty>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>{kind === "professionals" ? "Especialidad" : "DNI"}</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="name-link" to={`${base}/${kind}/${p.id}`}>
                      {p.first_name} {p.last_name}
                    </Link>
                  </td>
                  <td>
                    {kind === "professionals" ? p.specialty : p.dni || "—"}
                  </td>
                  <td>{p.email || p.phone || "—"}</td>
                  <td>
                    <span
                      className={`badge ${p.active ? "active" : "cancelled"}`}
                    >
                      {p.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="button-row">
                      <Link
                        className="text-link"
                        to={`${base}/${kind}/${p.id}`}
                      >
                        Editar
                      </Link>
                      {kind === "professionals" && role === "TENANT_ADMIN" && (
                        <Link
                          className="text-link"
                          to={`${base}/professionals/${p.id}/schedule`}
                        >
                          Horarios
                        </Link>
                      )}
                      <ActionButton
                        confirm={
                          p.active
                            ? "¿Querés desactivar este registro? Se conservará su historial."
                            : undefined
                        }
                        action={async () => {
                          await saveRow(
                            kind,
                            tenant.id,
                            { active: !p.active },
                            p.id,
                          );
                          await cache.invalidateQueries();
                        }}
                      >
                        {p.active ? "Desactivar" : "Activar"}
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export function PersonForm({ kind }: { kind: "professionals" | "patients" }) {
  const { tenant, base } = useAdmin(),
    { id } = useParams(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const isNew = !id || id === "new";
  const q = useQuery({
    queryKey: [kind, tenant.id],
    queryFn: () => rows<Professional & Patient>(kind, tenant.id),
  });
  const person = q.data?.find((p) => p.id === id);
  if (!isNew && q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (!isNew && !person) return <Empty>No encontramos el registro.</Empty>;
  const shared = [
    { name: "first_name", label: "Nombre", required: true },
    { name: "last_name", label: "Apellido", required: true },
    { name: "phone", label: "Teléfono", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    {
      name: "active",
      label: "Estado",
      options: [
        { value: "true", label: "Activo" },
        { value: "false", label: "Inactivo" },
      ],
    },
  ];
  const commonValues = {
    first_name: person?.first_name || "",
    last_name: person?.last_name || "",
    phone: person?.phone || "",
    email: person?.email || "",
    active: person?.active === false ? ("false" as const) : ("true" as const),
  };
  async function save(v: Record<string, unknown>) {
    await saveRow(
      kind,
      tenant.id,
      Object.fromEntries(
        Object.entries({ ...v, active: v.active === "true" }).map(([k, v]) => [
          k,
          typeof v === "string" && v === "" ? null : v,
        ]),
      ),
      isNew ? undefined : id,
    );
    await cache.invalidateQueries();
    navigate(`${base}/${kind}`);
  }
  return (
    <>
      <Link className="text-link" to={`${base}/${kind}`}>
        ← Volver al listado
      </Link>
      <Heading
        title={`${isNew ? "Agregar" : "Editar"} ${kind === "professionals" ? "profesional" : "paciente"}`}
      />
      <section className="card form-card">
        {kind === "professionals" ? (
          <DataForm
            key={id}
            schema={professionalSchema}
            values={{
              ...commonValues,
              specialty: person?.specialty || "",
              registration_number: person?.registration_number || "",
              description: person?.description || "",
            }}
            fields={[
              ...shared,
              { name: "specialty", label: "Especialidad", required: true },
              { name: "registration_number", label: "Matrícula" },
              {
                name: "description",
                label: "Descripción pública",
                type: "textarea",
              },
            ]}
            onSubmit={save}
          />
        ) : (
          <DataForm
            key={id}
            schema={patientSchema}
            values={{
              ...commonValues,
              dni: person?.dni || "",
              notes: person?.notes || "",
            }}
            fields={[
              ...shared,
              { name: "dni", label: "DNI" },
              { name: "notes", label: "Notas internas", type: "textarea" },
            ]}
            onSubmit={save}
          />
        )}
      </section>
      {kind === "professionals" && !isNew && (
        <Link
          className="btn secondary"
          to={`${base}/professionals/${id}/schedule`}
        >
          Configurar horarios y excepciones
        </Link>
      )}
    </>
  );
}
