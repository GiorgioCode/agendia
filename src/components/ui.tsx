import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ArrowUpRight,
  Check,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { errorMessage } from "../lib/errors";
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Agendia, inicio">
      <span className="brand-symbol">
        <CalendarDays size={21} />
      </span>
      agendia<span className="brand-dot">.</span>
    </Link>
  );
}
export function Loading() {
  return (
    <div className="state" role="status">
      <LoaderCircle className="spin" size={22} /> Cargando…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={18} />
      <span>{errorMessage(error)}</span>
      {retry && (
        <button className="btn small secondary" onClick={retry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="state empty">
      <CalendarDays size={26} />
      <p>{children}</p>
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    CONFIRMED: "Confirmado",
    COMPLETED: "Atendido",
    CANCELLED: "Cancelado",
    NO_SHOW: "Ausente",
    TRIALING: "En prueba",
    ACTIVE: "Activa",
    PAST_DUE: "Pendiente de pago",
    SUSPENDED: "Suspendida",
    TENANT_ADMIN: "Administrador",
    OPERATOR: "Operador",
  };
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {labels[status] ?? status}
    </span>
  );
}
export function ExternalLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={16} />
    </Link>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  hint?: string;
};
export const requiredText = z
  .string()
  .trim()
  .min(1, "Completá este campo")
  .max(500, "Máximo 500 caracteres");
export function DataForm<T extends FieldValues>({
  schema,
  fields,
  values,
  onSubmit,
  submitLabel = "Guardar cambios",
  children,
}: {
  schema: z.ZodType<T, T>;
  fields: Field[];
  values?: DefaultValues<T>;
  onSubmit: (values: T) => Promise<unknown>;
  submitLabel?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const [failure, setFailure] = useState<unknown>(null),
    [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<T>({ resolver: zodResolver(schema), defaultValues: values });
  return (
    <form
      className="data-form"
      onSubmit={handleSubmit(async (value) => {
        setFailure(null);
        setSuccess(false);
        try {
          await onSubmit(value);
          setSuccess(true);
        } catch (error) {
          setFailure(error);
        }
      })}
      noValidate
    >
      {fields.map((field) => {
        const name = field.name as Path<T>,
          err = errors[name];
        const props = {
          ...register(name),
          id: id + field.name,
          "aria-invalid": Boolean(err),
          "aria-describedby": err ? id + field.name + "-error" : undefined,
        };
        return (
          <div
            className={field.type === "textarea" ? "field wide" : "field"}
            key={field.name}
          >
            <label htmlFor={props.id}>
              {field.label}
              {field.required && <span aria-hidden="true"> *</span>}
            </label>
            {field.options ? (
              <select {...props}>
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea rows={3} {...props} />
            ) : (
              <input
                {...props}
                type={field.type ?? "text"}
                min={field.min}
                max={field.max}
                autoComplete={
                  field.type === "password"
                    ? "current-password"
                    : field.type === "email"
                      ? "email"
                      : undefined
                }
              />
            )}{" "}
            {field.hint && <small className="muted">{field.hint}</small>}
            {err && (
              <small className="field-error" id={id + field.name + "-error"}>
                {String(err.message)}
              </small>
            )}
          </div>
        );
      })}
      {children}
      <div className="form-footer">
        {failure != null && <ErrorState error={failure} />}{" "}
        {success && (
          <p className="notice success" role="status">
            <Check size={18} /> Guardado correctamente.
          </p>
        )}
        <button className="btn" disabled={isSubmitting} type="submit">
          {isSubmitting ? (
            <>
              <LoaderCircle size={16} className="spin" />
              Guardando…
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
export function ActionButton({
  children,
  action,
  confirm,
}: {
  children: ReactNode;
  action: () => Promise<unknown>;
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [asking, setAsking] = useState(false);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      await action();
      setAsking(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="action">
      <button
        type="button"
        className="btn small secondary"
        disabled={busy}
        onClick={() => (confirm ? setAsking(true) : void run())}
      >
        {busy ? "Procesando…" : children}
      </button>
      {asking && (
        <ConfirmDialog onClose={() => setAsking(false)}>
          <h2>Confirmar acción</h2>
          <p>{confirm}</p>
          {error != null && <ErrorState error={error} />}
          <div className="button-row">
            <button
              autoFocus
              className="btn secondary"
              disabled={busy}
              onClick={() => setAsking(false)}
            >
              Volver
            </button>
            <button className="btn" disabled={busy} onClick={() => void run()}>
              Confirmar
            </button>
          </div>
        </ConfirmDialog>
      )}
      {error != null && !asking && <ErrorState error={error} />}
    </span>
  );
}

function ConfirmDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="modal"
      aria-label="Confirmar acción"
      onCancel={onClose}
    >
      {children}
    </dialog>,
    document.body,
  );
}
