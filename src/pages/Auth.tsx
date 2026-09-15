import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../app/providers";
import { DataForm, Loading } from "../components/ui";
import { safeReturn } from "../lib/tenantResolver";
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset";
}) {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    { session, loading } = useAuth(),
    [sent, setSent] = useState(false);
  const next = safeReturn(params.get("next"));
  const email = z.email("Ingresá un email válido"),
    password = z
      .string()
      .min(mode === "login" ? 1 : 8, "Usá al menos 8 caracteres");
  const schema = z.object({
    email: mode === "reset" ? z.string().optional() : email,
    password: mode === "forgot" ? z.string().optional() : password,
  });
  if (loading) return <Loading />;
  if (session && (mode === "login" || mode === "register"))
    return <Navigate to={next} replace />;
  const title = {
    login: "Qué bueno verte de nuevo.",
    register: "Tu próxima consulta empieza acá.",
    forgot: "Recuperá tu acceso.",
    reset: "Elegí una nueva contraseña.",
  }[mode];
  const base = (
    import.meta.env.VITE_APP_BASE_URL || window.location.origin
  ).replace(/\/$/, "");
  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <p className="eyebrow">TU TIEMPO, BIEN CUIDADO</p>
        <h2>
          Un día más simple.
          <br />
          Una atención más cercana.
        </h2>
        <p>Tu consultorio y tus turnos, en un mismo lugar.</p>
        <div className="auth-art">
          <span>ag</span>
          <span>✓</span>
        </div>
      </aside>
      <section className="card auth-card">
        <p className="eyebrow">
          {mode === "register" ? "CREAR CUENTA" : "BIENVENIDO A AGENDIA"}
        </p>
        <h1>{title}</h1>
        {sent ? (
          <div className="notice success" role="status">
            Revisá tu correo para continuar. Si la dirección corresponde a una
            cuenta, recibirás las instrucciones.
          </div>
        ) : (
          <DataForm
            schema={schema}
            fields={[
              ...(mode !== "reset"
                ? [
                    {
                      name: "email",
                      label: "Email",
                      type: "email",
                      required: true,
                    },
                  ]
                : []),
              ...(mode !== "forgot"
                ? [
                    {
                      name: "password",
                      label: "Contraseña",
                      type: "password",
                      required: true,
                    },
                  ]
                : []),
            ]}
            submitLabel={
              {
                login: "Iniciar sesión",
                register: "Crear cuenta",
                forgot: "Enviar instrucciones",
                reset: "Guardar contraseña",
              }[mode]
            }
            onSubmit={async (v) => {
              if (!configured) throw new Error("CONFIGURATION_REQUIRED");
              if (mode === "login") {
                const { error } = await supabase.auth.signInWithPassword({
                  email: v.email!,
                  password: v.password!,
                });
                if (error) throw error;
                navigate(next);
              }
              if (mode === "register") {
                const { data, error } = await supabase.auth.signUp({
                  email: v.email!,
                  password: v.password!,
                  options: {
                    emailRedirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}`,
                  },
                });
                if (error) throw error;
                if (data.session) navigate(next);
                else setSent(true);
              }
              if (mode === "forgot") {
                const { error } = await supabase.auth.resetPasswordForEmail(
                  v.email!,
                  { redirectTo: `${base}/reset-password` },
                );
                if (error) throw error;
                setSent(true);
              }
              if (mode === "reset") {
                const { error } = await supabase.auth.updateUser({
                  password: v.password!,
                });
                if (error) throw error;
                navigate("/account");
              }
            }}
          />
        )}
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <Link to={`/register?next=${encodeURIComponent(next)}`}>
                Crear una cuenta
              </Link>
              <Link to="/forgot-password">Olvidé mi contraseña</Link>
            </>
          ) : (
            <Link to={`/login?next=${encodeURIComponent(next)}`}>
              Volver a iniciar sesión
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
export function AuthCallback() {
  const { loading, session } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <Loading />;
  return (
    <Navigate
      to={session ? safeReturn(params.get("next")) : "/login"}
      replace
    />
  );
}
