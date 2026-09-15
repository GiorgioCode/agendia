import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CalendarDays,
  Users,
  ShieldCheck,
  Clock3,
  ArrowUpRight,
  Leaf,
} from "lucide-react";
import { rows, configured } from "../lib/supabase";
import type { Plan } from "../types/models";
import { ErrorState, Loading } from "../components/ui";
export function Pricing({ compact = false }: { compact?: boolean }) {
  const q = useQuery({
    queryKey: ["plans"],
    queryFn: () => rows<Plan>("plans"),
    enabled: configured,
  });
  return (
    <section className="pricing-section" id="planes">
      <div className="section-title">
        <p className="eyebrow">A TU MEDIDA</p>
        <h2>Un espacio para cada consultorio.</h2>
        <p className="muted">
          Elegí el plan que acompaña a tu equipo. Empezá con 14 días de prueba.
        </p>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : !configured ? (
        <div className="notice">
          Los planes estarán disponibles cuando se conecte Supabase.
        </div>
      ) : (
        <div className="plan-grid">
          {q.data
            ?.filter((p) => p.active)
            .map((p, i) => (
              <article
                className={`card plan ${i === 1 ? "featured" : ""}`}
                key={p.id}
              >
                {i === 1 && (
                  <span className="plan-ribbon">
                    PARA EQUIPOS EN CRECIMIENTO
                  </span>
                )}
                <p className="eyebrow">{p.code}</p>
                <h3>{p.name}</h3>
                <p className="muted">{p.description}</p>
                <p className="price">
                  {p.price == null
                    ? "Consultar"
                    : new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: p.currency,
                      }).format(p.price)}
                  {p.price != null && <small>/mes</small>}
                </p>
                <ul className="check-list">
                  <li>
                    <Check size={17} />
                    {p.max_professionals ?? "Sin límite de"} profesionales
                  </li>
                  <li>
                    <Check size={17} />
                    {p.max_admins ?? "Sin límite de"} administradores
                  </li>
                  <li>
                    <Check size={17} />
                    Reservas online y agenda compartida
                  </li>
                  <li>
                    <Check size={17} />
                    Tu consultorio con identidad propia
                  </li>
                </ul>
                <Link
                  className={`btn ${i === 1 ? "" : "secondary"}`}
                  to={`/signup?plan=${p.code}`}
                >
                  Elegir {p.name}
                  <ArrowRight size={16} />
                </Link>
              </article>
            ))}
        </div>
      )}
      {!compact && (
        <p className="muted centered">
          Sin pagos automáticos. La contratación y los cambios de plan se
          coordinan con soporte.
        </p>
      )}
    </section>
  );
}
function AgendaPreview() {
  return (
    <div className="hero-preview" aria-label="Vista ilustrativa de la agenda">
      <div className="preview-top">
        <div className="preview-logo">
          <CalendarDays size={17} /> MI CONSULTORIO
        </div>
        <span className="badge active">Todo en orden</span>
      </div>
      <div className="preview-title">
        <div>
          <small className="muted">UN DÍA MÁS SIMPLE</small>
          <h3>Tu agenda, al día.</h3>
        </div>
        <span className="date-tile">
          LUN<strong>21</strong>
        </span>
      </div>
      <div className="preview-days">
        {["L 21", "M 22", "M 23", "J 24", "V 25"].map((v, i) => (
          <span key={v} className={i === 0 ? "selected" : ""}>
            {v}
          </span>
        ))}
      </div>
      <div className="preview-slot">
        <time>09:00</time>
        <div className="preview-appointment">
          <span className="avatar mint">LG</span>
          <div>
            <strong>Consulta general</strong>
            <small>Dra. Laura Gómez · 30 min</small>
          </div>
          <span className="tiny-dot" />
        </div>
      </div>
      <div className="preview-slot">
        <time>09:30</time>
        <div className="preview-available">
          Horario disponible <span>+</span>
        </div>
      </div>
      <div className="preview-slot">
        <time>10:00</time>
        <div className="preview-appointment blue">
          <span className="avatar lavender">MP</span>
          <div>
            <strong>Primera consulta</strong>
            <small>Dr. Martín Pérez · 30 min</small>
          </div>
          <span className="tiny-dot" />
        </div>
      </div>
      <div className="preview-bottom">
        <ShieldCheck size={15} /> Un lugar seguro para tu equipo y tus pacientes
      </div>
      <div className="floating-note">
        <span className="note-icon">
          <Check size={20} />
        </span>
        <div>
          <strong>Un turno menos por coordinar.</strong>
          <small>Más tiempo para lo que importa.</small>
        </div>
      </div>
    </div>
  );
}
export function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="pill">
            <span /> MENOS GESTIÓN, MÁS ATENCIÓN
          </span>
          <h1>
            Tu tiempo,
            <br />
            bien <em>cuidado.</em>
          </h1>
          <p className="hero-description">
            La agenda de tu consultorio, simple y en un solo lugar. Organizá a
            tu equipo y dejá que tus pacientes reserven cuando lo necesiten.
          </p>
          <div className="button-row">
            <Link className="btn large" to="/signup">
              Crear mi consultorio
              <ArrowUpRight size={18} />
            </Link>
            <a className="btn secondary large" href="#como-funciona">
              Conocer Agendia
              <ArrowRight size={18} />
            </a>
          </div>
          <div className="hero-footnote">
            <Check size={15} />
            14 días de prueba<span>·</span>
            <Check size={15} />
            Sin tarjeta de crédito
          </div>
        </div>
        <AgendaPreview />
      </section>
      <section className="trust-strip">
        <span>PENSADA PARA QUIENES CUIDAN</span>
        <strong>Consultorios</strong>
        <span className="separator" />
        <strong>Profesionales independientes</strong>
        <span className="separator" />
        <strong>Centros de salud</strong>
        <Leaf size={22} />
      </section>
      <section className="features-section" id="como-funciona">
        <div className="section-title left">
          <p className="eyebrow">TODO EN SU LUGAR</p>
          <h2>
            Menos idas y vueltas.
            <br />
            Más espacio para atender.
          </h2>
        </div>
        <div className="feature-grid">
          {[
            {
              icon: CalendarDays,
              title: "Una agenda que acompaña",
              text: "Horarios, excepciones y turnos de todo tu equipo. Una vista clara para organizar cada día.",
            },
            {
              icon: Clock3,
              title: "Reservas a cualquier hora",
              text: "Tus pacientes eligen profesional y horario desde la página de tu consultorio, sin llamadas.",
            },
            {
              icon: Users,
              title: "Tu equipo, conectado",
              text: "Cada persona con el acceso que necesita. Pacientes y turnos organizados en un mismo espacio.",
            },
            {
              icon: ShieldCheck,
              title: "Cada consultorio, su espacio",
              text: "Información protegida y una página con tu logo, tus colores y tu identidad.",
            },
          ].map((x) => (
            <article className="feature" key={x.title}>
              <span className="feature-icon">
                <x.icon size={23} />
              </span>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </article>
          ))}
        </div>
      </section>
      <Pricing compact />
      <section className="bottom-cta">
        <span className="feature-icon">
          <CalendarDays />
        </span>
        <h2>Hacé lugar para un día más simple.</h2>
        <p>Tu próximo paso empieza con una agenda ordenada.</p>
        <Link to="/signup" className="btn light">
          Crear mi consultorio
          <ArrowUpRight size={18} />
        </Link>
      </section>
    </>
  );
}
