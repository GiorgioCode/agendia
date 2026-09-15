const messages: Record<string, string> = {
  LOGO_INVALID: "Elegí una imagen PNG, JPG o WebP de hasta 2 MB.",
  CONFIGURATION_REQUIRED:
    "Falta conectar Supabase. Revisá las variables de entorno indicadas en el README.",
  UNAUTHORIZED: "No tenés permiso para realizar esta acción.",
  TENANT_NOT_FOUND: "No encontramos este consultorio.",
  TENANT_INACTIVE: "Este consultorio no está activo.",
  SUBSCRIPTION_INACTIVE:
    "La suscripción no está habilitada. Contactá al administrador.",
  PROFESSIONAL_NOT_FOUND: "No encontramos al profesional.",
  PROFESSIONAL_INACTIVE: "El profesional no está atendiendo.",
  PATIENT_NOT_FOUND: "El paciente no está disponible.",
  PATIENT_PROFILE_REQUIRED: "Completá tus datos antes de reservar.",
  PATIENT_INACTIVE: "Tu perfil está inactivo. Contactá al consultorio.",
  INVALID_SLOT: "Elegí una fecha y un horario futuro válidos.",
  SLOT_UNAVAILABLE:
    "El horario seleccionado ya no está disponible. Elegí otro.",
  DATE_BLOCKED: "El día está bloqueado.",
  OUTSIDE_WORKING_HOURS: "El horario está fuera de la agenda.",
  PLAN_LIMIT_REACHED: "Se alcanzó el límite del plan.",
  SLUG_TAKEN: "Esta dirección ya está en uso. Elegí otra.",
  INVALID_TENANT_NAME: "Revisá el nombre y la dirección del consultorio.",
  INVALID_TENANT_DATA: "Completá los datos del consultorio.",
  INVALID_PATIENT_DATA: "Completá nombre, apellido, teléfono y email.",
  PATIENT_DATA_CONFLICT:
    "Esos datos ya están registrados. Contactá al consultorio.",
  INVALID_TIMEZONE: "La zona horaria no es válida.",
  SCHEDULE_OVERLAP: "Este rango se superpone con otro horario.",
  CUSTOM_HOURS_OVERLAP: "Este horario especial se superpone con otro.",
  LAST_ADMIN_REQUIRED: "El consultorio debe conservar un administrador activo.",
  REGISTERED_USER_REQUIRED:
    "La persona debe registrarse antes de incorporarse al equipo.",
  APPOINTMENT_NOT_CANCELLABLE: "Este turno ya no se puede cancelar.",
  APPOINTMENT_FINALIZED: "Un turno finalizado no se puede modificar.",
  APPOINTMENT_IN_FUTURE: "No podés finalizar un turno antes de su horario.",
  CANCELLED_APPOINTMENT_REQUIRES_RESCHEDULE:
    "Para recuperar un turno cancelado, reprogramalo.",
  RATE_LIMITED: "Alcanzaste el límite de solicitudes. Intentá más tarde.",
};
export function errorMessage(error: unknown): string {
  const text =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error);
  for (const [code, message] of Object.entries(messages))
    if (text.includes(code)) return message;
  if (text.includes("Invalid login credentials"))
    return "El email o la contraseña no son correctos.";
  if (text.includes("Email not confirmed"))
    return "Confirmá tu email para iniciar sesión.";
  if (text.includes("already registered"))
    return "Este email ya está registrado.";
  if (text.includes("rate limit"))
    return "Esperá un momento antes de volver a intentarlo.";
  if (text.includes("Failed to fetch"))
    return "No pudimos conectar. Revisá tu conexión e intentá nuevamente.";
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "23P01"
  )
    return "El horario se superpone con otro registro.";
  return "No pudimos completar la operación. Revisá los datos e intentá nuevamente.";
}
