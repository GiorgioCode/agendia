import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Search, Stethoscope } from "lucide-react";
import type { CSSProperties } from "react";
import { assetUrl, rpc } from "../lib/supabase";
import { Empty, ErrorState, Loading } from "../components/ui";

const providerLabels = {
  CLINIC: "Clínica",
  INDEPENDENT_PROFESSIONAL: "Profesional independiente",
};

export function Directory() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "",
    specialty = params.get("specialty") || "";
  const specialties = useQuery({
    queryKey: ["public-specialties"],
    queryFn: () => rpc("get_public_specialties"),
  });
  const providers = useQuery({
    queryKey: ["public-providers", query, specialty],
    queryFn: () =>
      rpc("search_public_providers", {
        p_query: query || null,
        p_specialty: specialty || null,
      }),
  });
  function update(next: { q?: string; specialty?: string }) {
    const p = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next))
      value ? p.set(key, value) : p.delete(key);
    setParams(p, { replace: true });
  }
  return (
    <>
      <section className="directory-hero">
        <div>
          <p className="eyebrow">PACIENTES</p>
          <h1>Encontrá un turno con el prestador indicado.</h1>
          <p className="muted">
            Buscá clínicas y profesionales por nombre, especialidad o servicio
            disponible.
          </p>
        </div>
        <div className="directory-search" role="search">
          <label>
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Buscar por nombre o especialidad"
            />
          </label>
          <select
            aria-label="Especialidad"
            value={specialty}
            onChange={(e) => update({ specialty: e.target.value })}
          >
            <option value="">Todas las especialidades</option>
            {specialties.data?.map((s) => (
              <option key={s.specialty} value={s.specialty}>
                {s.specialty}
              </option>
            ))}
          </select>
        </div>
      </section>
      {specialties.error && <ErrorState error={specialties.error} />}
      {providers.isLoading ? (
        <Loading />
      ) : providers.error ? (
        <ErrorState
          error={providers.error}
          retry={() => void providers.refetch()}
        />
      ) : !providers.data?.length ? (
        <Empty>No encontramos prestadores con esos filtros.</Empty>
      ) : (
        <div className="directory-grid">
          {providers.data.map((p) => (
            <article
              className="card directory-card"
              key={p.id}
              style={
                {
                  "--tenant-primary": p.primary_color || "#176b5b",
                  "--tenant-secondary": p.secondary_color || "#e4eee8",
                } as CSSProperties
              }
            >
              {p.hero_image_path && (
                <img
                  className="directory-cover"
                  src={assetUrl(p.hero_image_path)}
                  alt=""
                />
              )}
              <div className="directory-card-body">
                <div className="directory-title">
                  {p.logo_path ? (
                    <img src={assetUrl(p.logo_path)} alt="" />
                  ) : (
                    <span className="avatar mint">{p.name.slice(0, 2)}</span>
                  )}
                  <div>
                    <span className="badge active">
                      {providerLabels[p.provider_type]}
                    </span>
                    <h2>{p.name}</h2>
                  </div>
                </div>
                <p className="muted">{p.tagline || p.description}</p>
                {p.address && (
                  <p className="small-text directory-location">
                    <MapPin size={15} />
                    {p.address}
                  </p>
                )}
                <div className="specialty-list">
                  {p.specialties.slice(0, 5).map((s) => (
                    <span key={s}>
                      <Stethoscope size={14} />
                      {s}
                    </span>
                  ))}
                </div>
                <Link className="btn secondary" to={`/t/${p.slug}`}>
                  Ver página y turnos
                  <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
