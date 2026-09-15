import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../lib/supabase";
import { useAuth } from "../app/providers";
import {
  DataForm,
  Heading,
  Loading,
  ErrorState,
  Empty,
  StatusBadge,
  ActionButton,
} from "../components/ui";
import { displayDate, isFuture, timeLabel } from "../lib/dates";
import { profileFields, profileSchema } from "./PublicTenant";
export function Account() {
  const { session } = useAuth(),
    cache = useQueryClient();
  const appointments = useQuery({
    queryKey: ["my-appointments", session?.user.id],
    queryFn: () => rpc("get_my_appointments"),
  });
  const profiles = useQuery({
    queryKey: ["my-profiles", session?.user.id],
    queryFn: () => rpc("get_my_profiles"),
  });
  return (
    <>
      <Heading eyebrow="MI CUENTA" title="Tu salud, en agenda.">
        Consultá tus turnos y mantené actualizados tus datos.
      </Heading>
      {appointments.isLoading ? (
        <Loading />
      ) : appointments.error ? (
        <ErrorState error={appointments.error} />
      ) : !appointments.data?.length ? (
        <Empty>
          Todavía no tenés turnos. Ingresá al enlace de tu consultorio para
          reservar.
        </Empty>
      ) : (
        ["Próximos turnos", "Turnos anteriores", "Cancelados"].map(
          (label, i) => {
            const items = appointments
              .data!.filter((a) =>
                i === 2
                  ? a.status === "CANCELLED"
                  : a.status !== "CANCELLED" &&
                    (i === 0
                      ? isFuture(a.appointment_date, a.start_time, a.timezone)
                      : !isFuture(
                          a.appointment_date,
                          a.start_time,
                          a.timezone,
                        )),
              )
              .sort((a, b) =>
                i === 0
                  ? (a.appointment_date + a.start_time).localeCompare(
                      b.appointment_date + b.start_time,
                    )
                  : 0,
              );
            return (
              <section className="section-block" key={label}>
                <h2>{label}</h2>
                {!items.length ? (
                  <p className="muted">No hay turnos en esta sección.</p>
                ) : (
                  items.map((a) => (
                    <article className="card appointment-card" key={a.id}>
                      <div className="appointment-date">
                        <strong>
                          {new Date(
                            a.appointment_date + "T12:00:00Z",
                          ).getUTCDate()}
                        </strong>
                        <span>{timeLabel(a.start_time)}</span>
                      </div>
                      <div className="grow">
                        <h3>{a.professional_name}</h3>
                        <Link className="text-link" to={`/t/${a.tenant_slug}`}>
                          {a.tenant_name}
                        </Link>
                        <p className="muted small-text">
                          {displayDate(a.appointment_date)} · {a.timezone}
                        </p>
                        {a.reason && <p className="small-text">{a.reason}</p>}
                      </div>
                      <StatusBadge status={a.status} />
                      {i === 0 &&
                        ["PENDING", "CONFIRMED"].includes(a.status) && (
                          <ActionButton
                            confirm="¿Querés cancelar este turno? El horario volverá a estar disponible."
                            action={async () => {
                              await rpc("cancel_own_appointment", {
                                p_appointment_id: a.id,
                              });
                              await cache.invalidateQueries({
                                queryKey: ["my-appointments"],
                              });
                              await cache.invalidateQueries({
                                queryKey: ["slots", a.tenant_id],
                              });
                              await cache.invalidateQueries({
                                queryKey: ["days", a.tenant_id],
                              });
                            }}
                          >
                            Cancelar turno
                          </ActionButton>
                        )}
                    </article>
                  ))
                )}
              </section>
            );
          },
        )
      )}
      <section className="section-block">
        <h2>Mis datos por consultorio</h2>
        {profiles.isLoading ? (
          <Loading />
        ) : profiles.error ? (
          <ErrorState error={profiles.error} />
        ) : !profiles.data?.length ? (
          <p className="muted">
            Completá tus datos al reservar por primera vez.
          </p>
        ) : (
          profiles.data.map((p) => (
            <details className="card profile-details" key={p.id}>
              <summary>{p.tenant_name}</summary>
              <DataForm
                schema={profileSchema}
                fields={profileFields}
                values={{
                  first_name: p.first_name,
                  last_name: p.last_name,
                  phone: p.phone || "",
                  email: p.email || "",
                  dni: p.dni || "",
                }}
                onSubmit={async (v) => {
                  await rpc("ensure_patient_profile", {
                    p_tenant_slug: p.tenant_slug,
                    p_first_name: v.first_name,
                    p_last_name: v.last_name,
                    p_phone: v.phone,
                    p_email: v.email,
                    p_dni: v.dni,
                  });
                  await cache.invalidateQueries({ queryKey: ["my-profiles"] });
                }}
              />
            </details>
          ))
        )}
      </section>
    </>
  );
}
