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
            Pacientes que encuentran turnos más fácil. Clínicas y profesionales
            que organizan su agenda en un solo lugar.
          </p>
          <div className="button-row">
            <Link className="btn large" to="/directorio">
              Buscar turno
              <ArrowUpRight size={18} />
            </Link>
            <Link className="btn secondary large" to="/signup">
              Soy prestador
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-footnote">
            <Check size={15} />
            Directorio por especialidad<span>·</span>
            <Check size={15} />
            Reservas online
          </div>
        </div>
        <AgendaPreview />
      </section>
      <section className="trust-strip">
        <span>DOS CAMINOS, UNA AGENDA</span>
        <strong>Pacientes</strong>
        <span className="separator" />
        <strong>Consultorios</strong>
        <span className="separator" />
        <strong>Profesionales independientes</strong>
        <Leaf size={22} />
      </section>
      <section className="features-section" id="como-funciona">
        <div className="section-title left">
          <p className="eyebrow">TODO EN SU LUGAR</p>
          <h2>
            Buscar, reservar y atender.
            <br />
            Cada persona en su flujo.
          </h2>
        </div>
        <div className="feature-grid">
          {[
            {
              icon: CalendarDays,
              title: "Pacientes encuentran turnos",
              text: "Un directorio por especialidad permite llegar a clínicas y profesionales con reserva online.",
            },
            {
              icon: Clock3,
              title: "Reservas a cualquier hora",
              text: "Cada prestador conserva su página pública y sus horarios disponibles para confirmar turnos.",
            },
            {
              icon: Users,
              title: "Prestadores con identidad propia",
              text: "Clínicas y profesionales independientes administran equipo, pacientes y agenda desde su panel.",
            },
            {
              icon: ShieldCheck,
              title: "Páginas diferenciadas",
              text: "Plantillas, colores, imágenes y textos hacen que cada perfil público se sienta propio.",
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
        <h2>Elegí cómo querés empezar.</h2>
        <p>Buscá atención o abrí el espacio de tu práctica.</p>
        <Link to="/directorio" className="btn light">
          Buscar turno
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/signup" className="btn light">
          Registrar prestador
          <ArrowUpRight size={18} />
        </Link>
      </section>
    </>
  );
}
