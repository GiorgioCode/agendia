import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarDays, Users, Stethoscope, Clock3 } from "lucide-react";
import { z } from "zod";
import {
  DataForm,
  Empty,
  ErrorState,
  Heading,
  Loading,
  StatusBadge,
  ActionButton,
} from "../components/ui";
import { rows, rpc } from "../lib/supabase";
import type { Appointment, Professional, Patient } from "../types/models";
import { displayDate, timeLabel, todayIn } from "../lib/dates";
import { useAdmin } from "./AdminLayout";
export function useAppointments() {
  const { tenant } = useAdmin();
  return useQuery({
    queryKey: ["appointments", tenant.id],
    queryFn: () =>
      rows<Appointment>(
        "appointments",
        tenant.id,
        "*,professionals(*),patients(*)",
      ),
  });
}
function AppointmentRows({ items }: { items: Appointment[] }) {
  const { base } = useAdmin();
  return !items.length ? (
    <Empty>No hay turnos para mostrar.</Empty>
  ) : (
    <div className="table-wrap card">
      <table>
        <thead>
          <tr>
            <th>Fecha y hora</th>
            <th>Paciente</th>
            <th>Profesional</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>
                {displayDate(a.appointment_date)}
                <small className="block muted">
                  {timeLabel(a.start_time)}–{timeLabel(a.end_time)}
                </small>
              </td>
              <td>
                {a.patients?.first_name} {a.patients?.last_name}
              </td>
              <td>
                {a.professionals?.first_name} {a.professionals?.last_name}
              </td>
              <td>
                <StatusBadge status={a.status} />
              </td>
              <td>
                <Link className="text-link" to={`${base}/appointments/${a.id}`}>
                  Ver turno →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Dashboard() {
  const { tenant, base, subscription } = useAdmin(),
    q = useAppointments();
  const pros = useQuery({
      queryKey: ["professionals", tenant.id],
      queryFn: () => rows<Professional>("professionals", tenant.id),
    }),
    patients = useQuery({
      queryKey: ["patients", tenant.id],
      queryFn: () => rows<Patient>("patients", tenant.id),
    });
  const today = todayIn(tenant.timezone),
    todayItems =
      q.data?.filter(
        (a) => a.appointment_date === today && a.status !== "CANCELLED",
      ) || [];
  const slots = useQuery({
    queryKey: [
      "dashboard-slots",
      tenant.id,
      today,
      pros.data?.map((p) => p.id).join(","),
    ],
    queryFn: async () => {
      const result = await Promise.all(
        pros
          .data!.filter((p) => p.active)
          .map((p) =>
            rpc("get_available_slots", {
              p_tenant_slug: tenant.slug,
              p_professional_id: p.id,
              p_target_date: today,
            }),
          ),
      );
      return result.reduce((n, r) => n + r.length, 0);
    },
    enabled: !!pros.data,
  });
  const upcoming = (q.data || [])
    .filter((a) => a.appointment_date >= today && a.status !== "CANCELLED")
    .sort((a, b) =>
      (a.appointment_date + a.start_time).localeCompare(
        b.appointment_date + b.start_time,
      ),
    )
    .slice(0, 6);
  return (
    <>
      <Heading
        eyebrow={displayDate(today).toUpperCase()}
        title="Un día bien organizado."
        action={
          <Link className="btn" to={`${base}/appointments/new`}>
            <Plus size={17} />
            Nuevo turno
          </Link>
        }
      >
        Bienvenido a {tenant.name}. Este es el resumen de tu consultorio.
      </Heading>
      <div className="metrics">
        {[
          {
            label: "Turnos de hoy",
            value: todayItems.length,
            icon: CalendarDays,
          },
          {
            label: "Profesionales activos",
            value: pros.data?.filter((p) => p.active).length,
            icon: Stethoscope,
          },
          {
            label: "Pacientes registrados",
            value: patients.data?.length,
            icon: Users,
          },
          { label: "Horarios libres hoy", value: slots.data, icon: Clock3 },
        ].map((x) => (
          <div className="card metric" key={x.label}>
            <span className="feature-icon">
              <x.icon size={20} />
            </span>
            <p>{x.label}</p>
            <strong>{x.value ?? "—"}</strong>
          </div>
        ))}
      </div>
      {(pros.error || patients.error || slots.error) && (
        <ErrorState error={pros.error || patients.error || slots.error} />
      )}
      <div className="section-heading">
        <h2>Próximos turnos</h2>
        <Link to={`${base}/agenda`} className="text-link">
          Ver agenda →
        </Link>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <AppointmentRows items={upcoming} />
      )}
      <div className="dashboard-bottom">
        <div className="card">
          <p className="eyebrow">TU CONSULTORIO ONLINE</p>
          <h3>Todo listo para recibir reservas.</h3>
          <Link className="text-link" to={`/t/${tenant.slug}`}>
            /t/{tenant.slug} ↗
          </Link>
        </div>
        <div className="card">
          <p className="eyebrow">TU PLAN</p>
          <h3>{subscription?.plans.name}</h3>
          {subscription && <StatusBadge status={subscription.status} />}
          <Link className="text-link" to={`${base}/subscription`}>
            Ver suscripción →
          </Link>
        </div>
      </div>
    </>
  );
}
export function AppointmentList({ agenda = false }: { agenda?: boolean }) {
  const { tenant, base } = useAdmin(),
    q = useAppointments(),
    [date, setDate] = useState(agenda ? todayIn(tenant.timezone) : ""),
    [professional, setProfessional] = useState("");
  const pros = useQuery({
    queryKey: ["professionals", tenant.id],
    queryFn: () => rows<Professional>("professionals", tenant.id),
  });
  const slots = useQuery({
    queryKey: ["slots", tenant.id, professional, date],
    queryFn: () =>
      rpc("get_available_slots", {
        p_tenant_slug: tenant.slug,
        p_professional_id: professional,
        p_target_date: date,
      }),
    enabled: agenda && !!professional && !!date,
  });
  return (
    <>
      <Heading
        eyebrow="ADMINISTRACIÓN"
        title={agenda ? "Tu agenda" : "Turnos"}
        action={
          <Link className="btn" to={`${base}/appointments/new`}>
            <Plus size={17} />
            Nuevo turno
          </Link>
        }
      />
      <div className="filter-row">
        <label>
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Profesional
          <select
            value={professional}
            onChange={(e) => setProfessional(e.target.value)}
          >
            <option value="">Todos los profesionales</option>
            {pros.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pros.error && <ErrorState error={pros.error} />}{" "}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <AppointmentRows
          items={(q.data || [])
            .filter(
              (a) =>
                (!date || a.appointment_date === date) &&
                (!professional || a.professional_id === professional),
            )
            .sort((a, b) =>
              (a.appointment_date + a.start_time).localeCompare(
                b.appointment_date + b.start_time,
              ),
            )}
        />
      )}{" "}
      {agenda && (
        <section className="card section-block">
          <h2>Horarios disponibles</h2>
          {!professional || !date ? (
            <p className="muted">
              Elegí un profesional y una fecha para consultar los horarios
              libres.
            </p>
          ) : slots.isLoading ? (
            <Loading />
          ) : slots.error ? (
            <ErrorState error={slots.error} />
          ) : !slots.data?.length ? (
            <Empty>No hay horarios disponibles.</Empty>
          ) : (
            <div className="slot-grid">
              {slots.data.map((s) => (
                <Link
                  className="slot"
                  key={s.start_time}
                  to={`${base}/appointments/new?professional=${professional}&date=${date}&time=${s.start_time}`}
                >
                  {timeLabel(s.start_time)}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
export function AppointmentForm() {
  const { tenant, base } = useAdmin(),
    { id } = useParams(),
    q = useAppointments(),
    navigate = useNavigate(),
    cache = useQueryClient();
  const existing = q.data?.find((a) => a.id === id);
  const params = new URLSearchParams(window.location.search);
  const [professional, setProfessional] = useState(
      params.get("professional") || "",
    ),
    [date, setDate] = useState(params.get("date") || todayIn(tenant.timezone)),
    [patient, setPatient] = useState(""),
    [slot, setSlot] = useState(params.get("time") || "");
  const pros = useQuery({
      queryKey: ["professionals", tenant.id],
      queryFn: () => rows<Professional>("professionals", tenant.id),
    }),
    patients = useQuery({
      queryKey: ["patients", tenant.id],
      queryFn: () => rows<Patient>("patients", tenant.id),
    });
  const chosenPro = professional || existing?.professional_id || "",
    chosenPatient = patient || existing?.patient_id || "";
  const slots = useQuery({
    queryKey: ["slots", tenant.id, chosenPro, date],
    queryFn: () =>
      rpc("get_available_slots", {
        p_tenant_slug: tenant.slug,
        p_professional_id: chosenPro,
        p_target_date: date,
      }),
    enabled: !!chosenPro,
  });
  if (q.isLoading || pros.isLoading || patients.isLoading) return <Loading />;
  if (q.error || pros.error || patients.error)
    return <ErrorState error={q.error || pros.error || patients.error} />;
  if (id && id !== "new" && !existing)
    return <Empty>No encontramos el turno.</Empty>;
  const finalized =
    existing && ["COMPLETED", "NO_SHOW"].includes(existing.status);
  return (
    <>
      <Link className="text-link" to={`${base}/appointments`}>
        ← Todos los turnos
      </Link>
      <Heading title={existing ? "Detalle del turno" : "Nuevo turno"}>
        {existing
          ? `${existing.patients?.first_name} ${existing.patients?.last_name} · ${displayDate(existing.appointment_date)} · ${timeLabel(existing.start_time)}`
          : "Seleccioná paciente, profesional y horario."}
      </Heading>
      {existing && (
        <section className="card section-block">
          <StatusBadge status={existing.status} />
          <p>{existing.reason || "Sin motivo registrado"}</p>
          {existing.notes && (
            <p className="muted">Notas internas: {existing.notes}</p>
          )}
          <div className="button-row">
            {!finalized &&
              existing.status !== "CANCELLED" &&
              ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"]
                .filter((s) => s !== existing.status)
                .map((s) => (
                  <ActionButton
                    key={s}
                    confirm="¿Confirmás el cambio de estado del turno?"
                    action={async () => {
                      await rpc("admin_set_appointment_status", {
                        p_appointment_id: existing.id,
                        p_status: s,
                      });
                      await cache.invalidateQueries();
                    }}
                  >
                    <StatusBadge status={s} />
                  </ActionButton>
                ))}
          </div>
        </section>
      )}
      {existing && (
        <details className="card section-block profile-details">
          <summary>Editar motivo y notas internas</summary>
          <DataForm
            key={existing.id}
            schema={z.object({
              reason: z.string().max(2000),
              notes: z.string().max(4000),
            })}
            values={{
              reason: existing.reason || "",
              notes: existing.notes || "",
            }}
            fields={[
              { name: "reason", label: "Motivo de consulta", type: "textarea" },
              { name: "notes", label: "Notas internas", type: "textarea" },
            ]}
            onSubmit={async (values) => {
              await rpc("admin_update_appointment_details", {
                p_appointment_id: existing.id,
                p_reason: values.reason,
                p_notes: values.notes,
              });
              await cache.invalidateQueries({
                queryKey: ["appointments", tenant.id],
              });
            }}
          />
        </details>
      )}
      {!finalized && (
        <section className="card form-card">
          <h2>{existing ? "Reprogramar" : "Datos del turno"}</h2>
          <div className="data-form">
            <label className="field">
              Profesional
              <select
                value={chosenPro}
                onChange={(e) => {
                  setProfessional(e.target.value);
                  setSlot("");
                }}
              >
                <option value="">Seleccioná un profesional</option>
                {pros.data
                  ?.filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Paciente
              <select
                value={chosenPatient}
                disabled={!!existing}
                onChange={(e) => setPatient(e.target.value)}
              >
                <option value="">Seleccioná un paciente</option>
                {patients.data
                  ?.filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Fecha
              <input
                type="date"
                value={date}
                min={todayIn(tenant.timezone)}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSlot("");
                }}
              />
            </label>
            <label className="field">
              Horario
              <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                <option value="">Seleccioná un horario</option>
                {slots.data?.map((s) => (
                  <option key={s.start_time} value={s.start_time}>
                    {timeLabel(s.start_time)}–{timeLabel(s.end_time)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {slots.error && <ErrorState error={slots.error} />}{" "}
          {chosenPro && !slots.isFetching && !slots.data?.length && (
            <p className="muted">
              No hay horarios disponibles para esta fecha.
            </p>
          )}
          <DataForm
            schema={z.object({
              reason: z.string().max(2000).optional(),
              notes: z.string().max(4000).optional(),
            })}
            fields={
              existing
                ? []
                : [
                    {
                      name: "reason",
                      label: "Motivo de consulta",
                      type: "textarea",
                    },
                    {
                      name: "notes",
                      label: "Notas internas",
                      type: "textarea",
                    },
                  ]
            }
            values={{ reason: "", notes: "" }}
            submitLabel={existing ? "Confirmar reprogramación" : "Crear turno"}
            onSubmit={async (v) => {
              if (!chosenPro || !chosenPatient || !date || !slot)
                throw new Error("INVALID_SLOT");
              try {
                if (existing)
                  await rpc("admin_reschedule_appointment", {
                    p_appointment_id: existing.id,
                    p_professional_id: chosenPro,
                    p_target_date: date,
                    p_start_time: slot,
                  });
                else
                  await rpc("admin_create_appointment", {
                    p_tenant_id: tenant.id,
                    p_professional_id: chosenPro,
                    p_patient_id: chosenPatient,
                    p_target_date: date,
                    p_start_time: slot,
                    p_reason: v.reason,
                    p_notes: v.notes,
                  });
                navigate(`${base}/appointments`);
              } finally {
                await cache.invalidateQueries();
              }
            }}
          />
        </section>
      )}
    </>
  );
}
