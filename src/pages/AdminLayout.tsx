import { createContext, useContext, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  CalendarDays,
  Settings,
  UserCog,
  CreditCard,
  ArrowUpRight,
  Compass,
} from "lucide-react";
import { rows, supabase } from "../lib/supabase";
import { useAuth } from "../app/providers";
import type { Membership, Subscription, Tenant, Role } from "../types/models";
import { Empty, ErrorState, Loading, StatusBadge } from "../components/ui";
type AdminContextType = {
  tenant: Tenant;
  role: Role;
  base: string;
  subscription: Subscription | undefined;
};
const AdminContext = createContext<AdminContextType | null>(null);
export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("UNAUTHORIZED");
  return value;
}
export function AdminOnly({ children }: { children: ReactNode }) {
  const { role } = useAdmin();
  return role === "TENANT_ADMIN" ? (
    children
  ) : (
    <Empty>No tenés permiso para acceder a esta sección.</Empty>
  );
}
export function useMemberships() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["memberships", session?.user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_members")
        .select("tenant_id,role,active,tenants(*)")
        .eq("user_id", session!.user.id)
        .eq("active", true)
        .in("role", ["TENANT_ADMIN", "OPERATOR"]);
      if (error) throw error;
      return data as unknown as Membership[];
    },
    enabled: !!session,
  });
}
export function AdminIndex() {
  const q = useMemberships();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data?.length === 1)
    return <Navigate to={`/admin/${q.data[0].tenants.slug}`} replace />;
  return (
    <>
      <h1>Mis espacios</h1>
      {!q.data?.length ? (
        <Empty>
          No tenés una membresía administrativa.{" "}
          <Link to="/signup">Registrar prestador</Link>
        </Empty>
      ) : (
        <div className="professional-grid">
          {q.data.map((m) => (
            <Link
              className="card"
              key={m.tenant_id}
              to={`/admin/${m.tenants.slug}`}
            >
              <h2>{m.tenants.name}</h2>
              <StatusBadge status={m.role} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function AdminLayout() {
  const { tenantSlug } = useParams(),
    memberships = useMemberships();
  const member = memberships.data?.find((m) => m.tenants.slug === tenantSlug);
  const sub = useQuery({
    queryKey: ["subscription", member?.tenant_id],
    queryFn: () =>
      rows<Subscription>("subscriptions", member!.tenant_id, "*,plans(*)"),
    enabled: !!member,
  });
  if (memberships.isLoading || (member && sub.isLoading)) return <Loading />;
  if (memberships.error || sub.error)
    return <ErrorState error={memberships.error || sub.error} />;
  if (!member)
    return (
      <Empty>
        No tenés acceso a este espacio.{" "}
        <Link to="/admin">Ver mis espacios</Link>
      </Empty>
    );
  const subscription =
      sub.data?.find((s) => s.status !== "CANCELLED") || sub.data?.[0],
    tenant = member.tenants,
    base = `/admin/${tenant.slug}`;
  const live =
    tenant.active &&
    subscription &&
    ["TRIALING", "ACTIVE"].includes(subscription.status) &&
    (!subscription.current_period_end ||
      new Date(subscription.current_period_end) > new Date()) &&
    (subscription.status !== "TRIALING" ||
      !subscription.trial_ends_at ||
      new Date(subscription.trial_ends_at) > new Date());
  const links = [
    { to: "", label: "Resumen", icon: LayoutDashboard },
    { to: "/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/appointments", label: "Turnos", icon: Compass },
    { to: "/patients", label: "Pacientes", icon: Users },
    ...(member.role === "TENANT_ADMIN"
      ? [
          { to: "/professionals", label: "Profesionales", icon: Stethoscope },
          { to: "/members", label: "Equipo", icon: UserCog },
          { to: "/settings", label: "Configuración", icon: Settings },
        ]
      : []),
    { to: "/subscription", label: "Suscripción", icon: CreditCard },
  ];
  return (
    <AdminContext.Provider
      value={{ tenant, role: member.role, base, subscription }}
    >
      <div className="admin-layout">
        <aside className="sidebar">
          <div className="sidebar-tenant">
            <span className="avatar mint">
              {tenant.name.slice(0, 2).toUpperCase()}
            </span>
            <strong>{tenant.name}</strong>
            <StatusBadge status={member.role} />
          </div>
          <nav aria-label="Administración">
            {links.map((l) => (
              <NavLink key={l.to} end={!l.to} to={base + l.to}>
                <l.icon size={18} />
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <Link to={`/t/${tenant.slug}`}>
              Ver página pública
              <ArrowUpRight size={16} />
            </Link>
            <Link to="/admin">Cambiar espacio</Link>
          </div>
        </aside>
        <section className="admin-content">
          {!live ? (
            <>
              <div className="notice error">
                La suscripción de este espacio no está habilitada. Contactá a
                soporte para reactivarla.
              </div>
              <SubscriptionPage />
            </>
          ) : (
            <Outlet />
          )}
        </section>
      </div>
    </AdminContext.Provider>
  );
}
export function SubscriptionPage() {
  const { subscription: s } = useAdmin();
  return (
    <>
      <h1>Tu suscripción</h1>
      {s ? (
        <div className="card subscription-card">
          <p className="eyebrow">PLAN ACTUAL</p>
          <h2>{s.plans.name}</h2>
          <StatusBadge status={s.status} />
          <dl>
            <dt>Inicio</dt>
            <dd>{new Date(s.starts_at).toLocaleDateString("es-AR")}</dd>
            <dt>Fin de prueba</dt>
            <dd>
              {s.trial_ends_at
                ? new Date(s.trial_ends_at).toLocaleDateString("es-AR")
                : "—"}
            </dd>
            <dt>Profesionales</dt>
            <dd>{s.plans.max_professionals ?? "Sin límite"}</dd>
            <dt>Administradores</dt>
            <dd>{s.plans.max_admins ?? "Sin límite"}</dd>
            <dt>Precio mensual</dt>
            <dd>
              {s.plans.price == null
                ? "Consultar"
                : `${s.plans.price} ${s.plans.currency}`}
            </dd>
          </dl>
          <p className="muted">
            Para modificar el plan, contactá al responsable de la plataforma
            mediante el canal de soporte acordado al contratar.
          </p>
        </div>
      ) : (
        <Empty>No hay una suscripción registrada.</Empty>
      )}
    </>
  );
}
