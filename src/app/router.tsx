import { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useAuth } from "./providers";
import { configured, rpc, supabase } from "../lib/supabase";
import { Brand, Empty, ErrorState, Loading } from "../components/ui";
import { Home, Pricing } from "../pages/Marketing";
import { AuthPage, AuthCallback } from "../pages/Auth";
import {
  Availability,
  Booking,
  TenantHome,
  TenantLayout,
} from "../pages/PublicTenant";
const Account = lazy(() =>
  import("../pages/Account").then((m) => ({ default: m.Account })),
);
import {
  AdminIndex,
  AdminLayout,
  AdminOnly,
  SubscriptionPage,
} from "../pages/AdminLayout";
const PeopleList = lazy(() =>
  import("../pages/AdminPeople").then((m) => ({ default: m.PeopleList })),
);
const PersonForm = lazy(() =>
  import("../pages/AdminPeople").then((m) => ({ default: m.PersonForm })),
);
const AdminSchedules = lazy(() =>
  import("../pages/AdminSchedules").then((m) => ({
    default: m.AdminSchedules,
  })),
);
const Dashboard = lazy(() =>
  import("../pages/AdminAppointments").then((m) => ({ default: m.Dashboard })),
);
const AppointmentList = lazy(() =>
  import("../pages/AdminAppointments").then((m) => ({
    default: m.AppointmentList,
  })),
);
const AppointmentForm = lazy(() =>
  import("../pages/AdminAppointments").then((m) => ({
    default: m.AppointmentForm,
  })),
);
const Settings = lazy(() =>
  import("../pages/AdminSettings").then((m) => ({ default: m.Settings })),
);
const Members = lazy(() =>
  import("../pages/AdminSettings").then((m) => ({ default: m.Members })),
);
const Signup = lazy(() =>
  import("../pages/AdminSettings").then((m) => ({ default: m.Signup })),
);
const Onboarding = lazy(() =>
  import("../pages/AdminSettings").then((m) => ({ default: m.Onboarding })),
);
const Platform = lazy(() =>
  import("../pages/Platform").then((m) => ({ default: m.Platform })),
);
import { useTenantResolution } from "../lib/useTenantResolution";
function Shell() {
  const { session } = useAuth(),
    [menu, setMenu] = useState(false),
    location = useLocation();
  const platform = useQuery({
    queryKey: ["platform-role", session?.user.id],
    queryFn: () => rpc("is_platform_admin"),
    enabled: !!session,
  });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <>
      <a href="#main" className="skip-link">
        Saltar al contenido
      </a>
      <header className="site-header">
        <Brand />
        <button
          className="icon-btn mobile-menu"
          aria-label="Abrir menú"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <nav
          className={menu ? "site-nav open" : "site-nav"}
          aria-label="Navegación principal"
          onClick={() => setMenu(false)}
        >
          {!session ? (
            <>
              <NavLink to="/pricing">Planes</NavLink>
              <NavLink to="/login">Iniciar sesión</NavLink>
              <Link className="btn small" to="/signup">
                Crear consultorio
                <ArrowUpRight size={15} />
              </Link>
            </>
          ) : (
            <>
              <NavLink to="/account">Mis turnos</NavLink>
              <NavLink to="/admin">Mi consultorio</NavLink>
              {platform.data && <NavLink to="/platform">Plataforma</NavLink>}
              <button
                className="btn small secondary"
                onClick={async () => {
                  const { error } = await supabase.auth.signOut();
                  if (error) await supabase.auth.signOut({ scope: "local" });
                }}
              >
                Salir
              </button>
            </>
          )}
        </nav>
      </header>
      {!configured && location.pathname !== "/" && (
        <div className="container">
          <ErrorState error={new Error("CONFIGURATION_REQUIRED")} />
        </div>
      )}
      <main
        id="main"
        className={location.pathname === "/" ? "" : "container page-container"}
      >
        <Outlet />
      </main>
      <footer className="site-footer">
        <Brand />
        <p>Tu tiempo, bien cuidado.</p>
        <small>© {new Date().getFullYear()} Agendia</small>
      </footer>
    </>
  );
}
function RequireAuth() {
  const { session, loading } = useAuth(),
    location = useLocation();
  if (loading) return <Loading />;
  return session ? (
    <Outlet />
  ) : (
    <Navigate
      to={`${location.pathname === "/signup" ? "/register" : "/login"}?next=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}
function HostHome() {
  const { slug, loading, error } = useTenantResolution("/");
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  return slug ? <Navigate to={`/t/${slug}`} replace /> : <Home />;
}

export function AppRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<HostHome />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="register" element={<AuthPage mode="register" />} />
            <Route
              path="forgot-password"
              element={<AuthPage mode="forgot" />}
            />
            <Route path="reset-password" element={<AuthPage mode="reset" />} />
            <Route path="auth/callback" element={<AuthCallback />} />
            <Route path="t/:tenantSlug" element={<TenantLayout />}>
              <Route index element={<TenantHome />} />
              <Route path="professionals" element={<TenantHome />} />
              <Route
                path="professionals/:professionalId"
                element={<Availability />}
              />
              <Route path="book/:professionalId" element={<Booking />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route path="signup" element={<Signup />} />
              <Route path="account/*" element={<Account />} />
              <Route path="admin" element={<AdminIndex />} />
              <Route path="admin/:tenantSlug" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="agenda" element={<AppointmentList agenda />} />
                <Route path="appointments" element={<AppointmentList />} />
                <Route path="appointments/new" element={<AppointmentForm />} />
                <Route path="appointments/:id" element={<AppointmentForm />} />
                <Route
                  path="appointments/:id/edit"
                  element={<AppointmentForm />}
                />
                <Route
                  path="patients"
                  element={<PeopleList kind="patients" />}
                />
                <Route
                  path="patients/new"
                  element={<PersonForm kind="patients" />}
                />
                <Route
                  path="patients/:id"
                  element={<PersonForm kind="patients" />}
                />
                <Route
                  path="patients/:id/edit"
                  element={<PersonForm kind="patients" />}
                />
                <Route
                  path="professionals"
                  element={
                    <AdminOnly>
                      <PeopleList kind="professionals" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="professionals/new"
                  element={
                    <AdminOnly>
                      <PersonForm kind="professionals" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="professionals/:id"
                  element={
                    <AdminOnly>
                      <PersonForm kind="professionals" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="professionals/:id/edit"
                  element={
                    <AdminOnly>
                      <PersonForm kind="professionals" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="professionals/:id/schedule"
                  element={
                    <AdminOnly>
                      <AdminSchedules />
                    </AdminOnly>
                  }
                />
                <Route
                  path="professionals/:id/exceptions"
                  element={
                    <AdminOnly>
                      <AdminSchedules />
                    </AdminOnly>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <AdminOnly>
                      <Settings />
                    </AdminOnly>
                  }
                />
                <Route
                  path="members"
                  element={
                    <AdminOnly>
                      <Members />
                    </AdminOnly>
                  }
                />
                <Route
                  path="onboarding"
                  element={
                    <AdminOnly>
                      <Onboarding />
                    </AdminOnly>
                  }
                />
                <Route path="subscription" element={<SubscriptionPage />} />
              </Route>
              <Route path="platform/*" element={<Platform />} />
            </Route>
            <Route
              path="*"
              element={
                <Empty>
                  No encontramos esta página.{" "}
                  <Link to="/">Volver al inicio</Link>
                </Empty>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </Suspense>
  );
}
