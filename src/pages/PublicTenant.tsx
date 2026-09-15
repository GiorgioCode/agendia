import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  MapPin,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { z } from "zod";
import { assetUrl, rpc } from "../lib/supabase";
import { useTenantResolution } from "../lib/useTenantResolution";
import {
  displayDate,
  monthCells,
  shiftMonth,
  timeLabel,
  todayIn,
} from "../lib/dates";
import { useAuth } from "../app/providers";
import {
  DataForm,
  Empty,
  ErrorState,
  Heading,
  Loading,
  requiredText,
} from "../components/ui";
import type { Tenant } from "../types/models";
const TenantContext = createContext<Tenant | null>(null);
export function useTenant() {
  const t = useContext(TenantContext);
  if (!t) throw new Error("TENANT_NOT_FOUND");
  return t;
}
export function TenantLayout() {
  const { tenantSlug } = useParams();
  const location = useLocation();
  const resolution = useTenantResolution(location.pathname);
  const slug = resolution.slug || tenantSlug || "";
  const q = useQuery({
    queryKey: ["tenant", slug],
    queryFn: () => rpc("get_public_tenant_by_slug", { p_slug: slug }),
    enabled: !resolution.loading && !resolution.error,
  });
  if (resolution.error) return <ErrorState error={resolution.error} />;
  if (resolution.loading || q.isLoading) return <Loading />;
  if (q.error)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const t = q.data?.[0];
  if (!t)
    return <Empty>Este consultorio no está disponible en este momento.</Empty>;
  return (
    <TenantContext.Provider value={t}>
      <div
        className="tenant-shell"
        style={
          {
            "--tenant-primary": t.primary_color || "#176b5b",
            "--tenant-secondary": t.secondary_color || "#e4eee8",
          } as CSSProperties
        }
      >
        <div className="tenant-brand">
          <Link to={`/t/${t.slug}`}>
            {t.logo_path ? (
              <img src={assetUrl(t.logo_path)} alt="" />
            ) : (
              <span className="brand-symbol">
                <CalendarDays size={22} />
              </span>
            )}
            <strong>{t.name}</strong>
          </Link>
          <Link className="text-link" to="/account">
            Mis turnos
          </Link>
        </div>
        <Outlet />
      </div>
    </TenantContext.Provider>
  );
}
export function TenantHome() {
  const t = useTenant();
  const q = useQuery({
    queryKey: ["professionals-public", t.id],
    queryFn: () => rpc("get_public_professionals", { p_tenant_slug: t.slug }),
  });
  return (
    <>
      <section className="tenant-intro">
        <p className="eyebrow">BIENVENIDO A {t.name.toUpperCase()}</p>
        <h1>{t.welcome_text || "Un espacio para cuidar de vos."}</h1>
        <p className="muted">
          {t.description ||
            "Encontrá a tu profesional y reservá tu próximo turno."}
        </p>
        <div className="contact-row">
          {t.address && (
            <span>
              <MapPin size={17} />
              {t.address}
            </span>
          )}
          {t.phone && (
            <span>
              <Phone size={17} />
              {t.phone}
            </span>
          )}
          {t.email && (
            <span>
              <Mail size={17} />
              {t.email}
            </span>
          )}
        </div>
        {t.website && /^https?:\/\//.test(t.website) && (
          <a
            className="text-link"
            href={t.website}
            rel="noreferrer"
            target="_blank"
          >
            Visitar sitio web <ArrowRight size={14} />
          </a>
        )}
      </section>
      <Heading eyebrow="NUESTRO EQUIPO" title="Elegí tu profesional">
        Consultá los horarios disponibles y reservá online.
      </Heading>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data?.length ? (
        <Empty>No hay profesionales disponibles.</Empty>
      ) : (
        <div className="professional-grid">
          {q.data.map((p) => (
            <article key={p.id} className="card professional-card">
              <span className="avatar large mint">
                {p.first_name[0]}
                {p.last_name[0]}
              </span>
              <p className="eyebrow">{p.specialty}</p>
              <h2>
                {p.first_name} {p.last_name}
              </h2>
              <p className="muted">
                {p.description || "Atención con turno previo."}
              </p>
              <Link
                className="btn secondary"
                to={`/t/${t.slug}/professionals/${p.id}`}
              >
                Ver disponibilidad
                <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function Availability() {
  const t = useTenant(),
    { professionalId } = useParams(),
    navigate = useNavigate(),
    { session } = useAuth();
  const [date, setDate] = useState(todayIn(t.timezone)),
    [month, setMonth] = useState(date.slice(0, 7) + "-01");
  const professionals = useQuery({
    queryKey: ["professionals-public", t.id],
    queryFn: () => rpc("get_public_professionals", { p_tenant_slug: t.slug }),
  });
  const q = useQuery({
    queryKey: ["slots", t.id, professionalId, date],
    queryFn: () =>
      rpc("get_available_slots", {
        p_tenant_slug: t.slug,
        p_professional_id: professionalId,
        p_target_date: date,
      }),
  });
  const days = useQuery({
    queryKey: ["days", t.id, professionalId, month],
    queryFn: () =>
      rpc("get_available_days", {
        p_tenant_slug: t.slug,
        p_professional_id: professionalId,
        p_month: month,
      }),
  });
  const p = professionals.data?.find((p) => p.id === professionalId);
  if (professionals.isLoading) return <Loading />;
  if (professionals.error) return <ErrorState error={professionals.error} />;
  if (!p) return <Empty>No encontramos al profesional.</Empty>;
  return (
    <>
      <Link className="text-link" to={`/t/${t.slug}`}>
        <ChevronLeft size={16} />
        Todos los profesionales
      </Link>
      <Heading eyebrow={p.specialty} title={`${p.first_name} ${p.last_name}`}>
        {p.description || "Elegí el día y el horario de tu próxima consulta."}
      </Heading>
      <div className="booking-grid">
        <section className="card calendar">
          <div className="calendar-heading">
            <button
              className="icon-btn"
              aria-label="Mes anterior"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft size={20} />
            </button>
            <h2>
              {new Intl.DateTimeFormat("es-AR", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(month + "T12:00:00Z"))}
            </h2>
            <button
              className="icon-btn"
              aria-label="Mes siguiente"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="calendar-grid">
            {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((d) => (
              <span className="weekday" key={d}>
                {d}
              </span>
            ))}
            {monthCells(month).map((d, i) =>
              d ? (
                <button
                  key={d}
                  className={`calendar-day ${d === date ? "selected" : ""} ${days.data?.some((x) => x.day === d) ? "available" : ""}`}
                  aria-label={displayDate(d)}
                  aria-pressed={d === date}
                  disabled={d < todayIn(t.timezone)}
                  onClick={() => setDate(d)}
                >
                  {Number(d.slice(-2))}
                  <span />
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
          {days.error ? (
            <ErrorState error={days.error} />
          ) : (
            <p className="calendar-legend">
              <span className="tiny-dot" />
              {days.isFetching
                ? "Consultando días…"
                : "Días con turnos disponibles"}
            </p>
          )}
        </section>
        <section className="card">
          <p className="eyebrow">HORARIOS DISPONIBLES</p>
          <h2>{displayDate(date)}</h2>
          <p className="muted small-text">Zona horaria: {t.timezone}</p>
          {q.isLoading ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} retry={() => void q.refetch()} />
          ) : !q.data?.length ? (
            <Empty>No hay horarios disponibles para esta fecha.</Empty>
          ) : (
            <div className="slot-grid">
              {q.data.map((s) => (
                <button
                  className="slot"
                  key={s.start_time}
                  onClick={() => {
                    const next = `/t/${t.slug}/book/${professionalId}?date=${date}&time=${s.start_time}`;
                    navigate(
                      session
                        ? next
                        : `/login?next=${encodeURIComponent(next)}`,
                    );
                  }}
                >
                  {timeLabel(s.start_time)}
                  <small>{timeLabel(s.end_time)}</small>
                </button>
              ))}
            </div>
          )}
          <p className="booking-hint">
            La disponibilidad se confirma al reservar.
          </p>
        </section>
      </div>
    </>
  );
}
const profileSchema = z.object({
  first_name: requiredText,
  last_name: requiredText,
  phone: requiredText,
  email: z.email("Ingresá un email válido"),
  dni: z.string().max(30).optional(),
});
export const profileFields = [
  { name: "first_name", label: "Nombre", required: true },
  { name: "last_name", label: "Apellido", required: true },
  { name: "phone", label: "Teléfono", type: "tel", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "dni", label: "DNI (opcional)" },
];
export { profileSchema };
export function Booking() {
  const t = useTenant(),
    { professionalId } = useParams(),
    { session, loading: authLoading } = useAuth(),
    navigate = useNavigate(),
    cache = useQueryClient(),
    location = useLocation();
  const params = new URLSearchParams(location.search),
    date = params.get("date") || "",
    time = params.get("time") || "";
  const [completed, setCompleted] = useState<string | null>(null);
  const profiles = useQuery({
    queryKey: ["my-profiles", session?.user.id],
    queryFn: () => rpc("get_my_profiles"),
    enabled: !!session,
  });
  const professionals = useQuery({
    queryKey: ["professionals-public", t.id],
    queryFn: () => rpc("get_public_professionals", { p_tenant_slug: t.slug }),
  });
  const profile = profiles.data?.find((x) => x.tenant_id === t.id),
    p = professionals.data?.find((x) => x.id === professionalId);
  useEffect(() => {
    if (!authLoading && !session)
      navigate(
        `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
        { replace: true },
      );
  }, [authLoading, session, navigate, location.pathname, location.search]);
  if (authLoading || !session || profiles.isLoading || professionals.isLoading)
    return <Loading />;
  if (profiles.error || professionals.error)
    return <ErrorState error={profiles.error || professionals.error} />;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}(:\d{2})?$/.test(time) ||
    !p
  )
    return (
      <Empty>Seleccioná un horario desde la página del profesional.</Empty>
    );
  if (completed)
    return (
      <section className="card confirmation">
        <span className="success-circle">✓</span>
        <p className="eyebrow">TODO LISTO</p>
        <h1>Tu turno está confirmado.</h1>
        <p>
          {p.first_name} {p.last_name} · {displayDate(date)} · {timeLabel(time)}
        </p>
        <Link className="btn" to="/account/appointments">
          Ver mis turnos
          <ArrowRight size={16} />
        </Link>
      </section>
    );
  return (
    <>
      <Heading eyebrow="UN PASO MÁS" title="Confirmá tu turno">
        {p.first_name} {p.last_name} · {displayDate(date)} · {timeLabel(time)} ·{" "}
        {t.timezone}
      </Heading>
      <div className="card form-card">
        <DataForm
          key={profile?.id || "new"}
          schema={profileSchema.extend({
            reason: z.string().max(2000).optional(),
          })}
          fields={[
            ...profileFields,
            {
              name: "reason",
              label: "Motivo de consulta (opcional)",
              type: "textarea",
            },
          ]}
          values={{
            first_name: profile?.first_name || "",
            last_name: profile?.last_name || "",
            phone: profile?.phone || "",
            email: profile?.email || session.user.email || "",
            dni: profile?.dni || "",
            reason: "",
          }}
          submitLabel="Confirmar reserva"
          onSubmit={async (v) => {
            await rpc("ensure_patient_profile", {
              p_tenant_slug: t.slug,
              p_first_name: v.first_name,
              p_last_name: v.last_name,
              p_phone: v.phone,
              p_email: v.email,
              p_dni: v.dni,
            });
            try {
              const id = await rpc("book_appointment", {
                p_tenant_slug: t.slug,
                p_professional_id: professionalId,
                p_target_date: date,
                p_start_time: time,
                p_reason: v.reason,
              });
              setCompleted(id);
            } finally {
              await cache.invalidateQueries({ queryKey: ["slots", t.id] });
              await cache.invalidateQueries({ queryKey: ["days", t.id] });
              await cache.invalidateQueries({ queryKey: ["my-appointments"] });
              await cache.invalidateQueries({ queryKey: ["my-profiles"] });
            }
          }}
        />
        <Link
          className="text-link"
          to={`/t/${t.slug}/professionals/${professionalId}`}
        >
          Elegir otro horario
        </Link>
      </div>
    </>
  );
}
