import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  DataForm,
  Heading,
  Loading,
  ErrorState,
  Empty,
  ActionButton,
} from "../components/ui";
import { rows, saveRow, supabase } from "../lib/supabase";
import type { Schedule, Exception, Professional } from "../types/models";
import { useAdmin } from "./AdminLayout";
import { displayDate, timeLabel, todayIn } from "../lib/dates";
const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const time = z.string().regex(/^\d{2}:\d{2}$/, "Ingresá un horario válido");
const scheduleSchema = z
  .object({
    day_of_week: z.string(),
    start_time: time,
    end_time: time,
    appointment_duration: z
      .string()
      .refine(
        (v) =>
          Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 1440,
        "Usá una duración entre 1 y 1440 minutos",
      ),
  })
  .refine((v) => v.start_time < v.end_time, {
    path: ["end_time"],
    message: "El fin debe ser posterior al inicio",
  });
const exceptionSchema = z
  .object({
    exception_date: z.string().min(10),
    type: z.enum(["CLOSED", "CUSTOM_HOURS", "BLOCKED"]),
    start_time: z.string(),
    end_time: z.string(),
    appointment_duration: z.string(),
    reason: z.string().max(2000),
  })
  .refine(
    (v) =>
      v.type === "CLOSED" ||
      (v.type === "BLOCKED" && !v.start_time && !v.end_time) ||
      (/^\d{2}:\d{2}$/.test(v.start_time) &&
        /^\d{2}:\d{2}$/.test(v.end_time) &&
        v.start_time < v.end_time),
    { path: ["end_time"], message: "Completá un rango de horas válido" },
  )
  .refine(
    (v) =>
      v.type !== "CUSTOM_HOURS" ||
      (Number(v.appointment_duration) > 0 &&
        Number(v.appointment_duration) <= 1440),
    {
      path: ["appointment_duration"],
      message: "Ingresá la duración del turno",
    },
  );
export function AdminSchedules() {
  const { tenant, base } = useAdmin(),
    { id } = useParams(),
    cache = useQueryClient();
  const q = useQuery({
      queryKey: ["schedules", tenant.id, id],
      queryFn: () => rows<Schedule>("professional_schedules", tenant.id),
    }),
    exceptions = useQuery({
      queryKey: ["exceptions", tenant.id, id],
      queryFn: () => rows<Exception>("schedule_exceptions", tenant.id),
    }),
    pros = useQuery({
      queryKey: ["professionals", tenant.id],
      queryFn: () => rows<Professional>("professionals", tenant.id),
    });
  const pro = pros.data?.find((p) => p.id === id);
  async function remove(table: string, rowId: string) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("id", rowId);
    if (error) throw error;
    await cache.invalidateQueries();
  }
  if (pros.isLoading) return <Loading />;
  if (pros.error) return <ErrorState error={pros.error} />;
  if (!pro) return <Empty>No encontramos al profesional.</Empty>;
  return (
    <>
      <Link className="text-link" to={`${base}/professionals`}>
        ← Profesionales
      </Link>
      <Heading
        eyebrow={`${pro.first_name} ${pro.last_name}`}
        title="Horarios y excepciones"
      >
        Los horarios se interpretan en {tenant.timezone}. Los cambios no
        cancelan turnos existentes.
      </Heading>
      <div className="card section-block">
        <h2>Horario semanal</h2>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : (
          <div className="schedule-list">
            {q.data
              ?.filter((s) => s.professional_id === id)
              .map((s) => (
                <div className="list-row" key={s.id}>
                  <span>
                    <strong>{weekdays[s.day_of_week - 1]}</strong> ·{" "}
                    {timeLabel(s.start_time)}–{timeLabel(s.end_time)} ·{" "}
                    {s.appointment_duration} min
                  </span>
                  <ActionButton
                    confirm="¿Eliminar este rango de atención? Los turnos existentes se conservarán."
                    action={() => remove("professional_schedules", s.id)}
                  >
                    Eliminar
                  </ActionButton>
                </div>
              ))}
          </div>
        )}
        <h3>Agregar rango</h3>
        <DataForm
          schema={scheduleSchema}
          fields={[
            {
              name: "day_of_week",
              label: "Día",
              options: weekdays.map((v, i) => ({
                value: String(i + 1),
                label: v,
              })),
            },
            { name: "start_time", label: "Desde", type: "time" },
            { name: "end_time", label: "Hasta", type: "time" },
            {
              name: "appointment_duration",
              label: "Duración (minutos)",
              type: "number",
              min: 1,
              max: 1440,
            },
          ]}
          values={{
            day_of_week: "1",
            start_time: "08:00",
            end_time: "12:00",
            appointment_duration: "30",
          }}
          submitLabel="Agregar horario"
          onSubmit={async (v) => {
            await saveRow("professional_schedules", tenant.id, {
              ...v,
              professional_id: id,
              day_of_week: Number(v.day_of_week),
              appointment_duration: Number(v.appointment_duration),
              active: true,
            });
            await cache.invalidateQueries();
          }}
        />
      </div>
      <div className="card section-block">
        <h2>Excepciones</h2>
        {exceptions.isLoading ? (
          <Loading />
        ) : exceptions.error ? (
          <ErrorState error={exceptions.error} />
        ) : (
          <div className="schedule-list">
            {exceptions.data
              ?.filter((e) => e.professional_id === id)
              .map((e) => (
                <div className="list-row" key={e.id}>
                  <span>
                    <strong>{displayDate(e.exception_date)}</strong> ·{" "}
                    {
                      {
                        CLOSED: "Día cerrado",
                        CUSTOM_HOURS: "Horario especial",
                        BLOCKED: "Bloqueo",
                      }[e.type]
                    }{" "}
                    {e.start_time &&
                      `${timeLabel(e.start_time)}–${timeLabel(e.end_time!)}`}{" "}
                    {e.reason && `· ${e.reason}`}
                  </span>
                  <ActionButton
                    confirm="¿Eliminar esta excepción?"
                    action={() => remove("schedule_exceptions", e.id)}
                  >
                    Eliminar
                  </ActionButton>
                </div>
              ))}
          </div>
        )}
        <p className="muted">
          Un día cerrado tiene prioridad. Los horarios especiales reemplazan al
          horario semanal. Dejá las horas vacías para bloquear un día completo.
        </p>
        <DataForm
          schema={exceptionSchema}
          values={{
            exception_date: todayIn(tenant.timezone),
            type: "CLOSED",
            start_time: "",
            end_time: "",
            appointment_duration: "30",
            reason: "",
          }}
          fields={[
            { name: "exception_date", label: "Fecha", type: "date" },
            {
              name: "type",
              label: "Tipo",
              options: [
                { value: "CLOSED", label: "Día cerrado" },
                { value: "CUSTOM_HOURS", label: "Horario especial" },
                { value: "BLOCKED", label: "Bloqueo" },
              ],
            },
            { name: "start_time", label: "Desde", type: "time" },
            { name: "end_time", label: "Hasta", type: "time" },
            {
              name: "appointment_duration",
              label: "Duración para horario especial",
              type: "number",
              min: 1,
              max: 1440,
            },
            { name: "reason", label: "Motivo interno", type: "textarea" },
          ]}
          submitLabel="Agregar excepción"
          onSubmit={async (v) => {
            await saveRow("schedule_exceptions", tenant.id, {
              ...v,
              professional_id: id,
              start_time: v.type === "CLOSED" ? null : v.start_time || null,
              end_time: v.type === "CLOSED" ? null : v.end_time || null,
              appointment_duration:
                v.type === "CUSTOM_HOURS"
                  ? Number(v.appointment_duration)
                  : null,
            });
            await cache.invalidateQueries();
          }}
        />
      </div>
    </>
  );
}
