# Especificación de Aplicación Web
## SaaS Multitenant de Gestión y Reserva de Turnos para Consultorios y Profesionales

---

# 1. Objetivo

Desarrollar una aplicación web SaaS multitenant para la gestión y reserva de turnos de consultorios, centros de salud y profesionales independientes.

La aplicación debe permitir que múltiples organizaciones utilicen una misma plataforma y una misma infraestructura lógica, manteniendo aislamiento estricto de datos entre tenants.

Cada organización contratante debe disponer de:

- Un espacio independiente dentro del SaaS.
- Una URL pública derivada de un `slug`.
- Soporte opcional para subdominio.
- Identidad visual configurable.
- Profesionales propios.
- Horarios propios.
- Pacientes propios.
- Turnos propios.
- Administradores y operadores propios.
- Configuración propia.
- Datos completamente aislados mediante `tenant_id` y Row Level Security de Supabase.

El sistema debe permitir que cualquier visitante pueda consultar libremente los profesionales y horarios disponibles de un tenant, pero únicamente los usuarios registrados y autenticados pueden solicitar turnos.

La aplicación nunca debe permitir:

- Reservar un turno fuera del horario configurado de un profesional.
- Reservar sobre un slot ya ocupado.
- Reservar un slot que haya dejado de estar disponible entre la consulta y la confirmación.
- Acceder a datos pertenecientes a otro tenant.
- Exponer datos privados de pacientes en las vistas públicas.

---

# 2. Modelo SaaS multitenant

El sistema debe utilizar un modelo multitenant de base de datos compartida con separación lógica por `tenant_id`.

Todas las tablas que almacenen información propia de un consultorio o profesional deben contener:

```text
tenant_id uuid NOT NULL
```

El aislamiento no debe depender únicamente del frontend.

Debe estar aplicado principalmente mediante:

- PostgreSQL.
- Foreign Keys.
- Constraints.
- Funciones SQL/RPC.
- Row Level Security.
- Políticas RLS basadas en usuario, tenant y rol.

El frontend nunca debe confiar en un `tenant_id` enviado arbitrariamente por el navegador para autorizar operaciones.

---

# 3. Stack tecnológico obligatorio

## Frontend

Utilizar:

- React.
- Vite.
- TypeScript.
- React Router.
- Tailwind CSS.
- Supabase JavaScript Client.

Opcionales únicamente si aportan valor claro:

- React Hook Form.
- Zod.
- TanStack Query.

Evitar Redux para el MVP.

---

## Backend y servicios

Utilizar Supabase como plataforma backend.

Servicios requeridos:

- Supabase PostgreSQL.
- Supabase Auth.
- Supabase Row Level Security.
- Supabase Database Functions / RPC.
- Supabase Storage para logos o imágenes institucionales.
- Supabase Realtime únicamente si resulta útil para refrescar agenda.
- Supabase Edge Functions solamente cuando una operación no pueda resolverse correctamente mediante PostgreSQL/RPC o cuando se necesite una operación privilegiada.

No desarrollar un backend REST tradicional separado.

---

# 4. Principios de arquitectura

La aplicación debe seguir estos principios:

1. Un único frontend React/Vite.
2. Un único proyecto Supabase para el MVP.
3. Base PostgreSQL compartida.
4. Todas las entidades de negocio deben estar asociadas al tenant.
5. RLS obligatorio.
6. Las operaciones críticas deben ejecutarse de manera transaccional en PostgreSQL.
7. Las reservas de turnos deben ser atómicas.
8. El frontend no debe decidir por sí solo si un turno es válido.
9. La disponibilidad debe calcularse a partir de horarios, excepciones y turnos existentes.
10. Los datos de distintos tenants nunca deben mezclarse.

---

# 5. Concepto de tenant

Un `tenant` representa una organización que contrata el SaaS.

Puede representar:

- Consultorio odontológico.
- Consultorio médico.
- Centro de salud.
- Clínica pequeña.
- Profesional independiente.
- Grupo de profesionales.

Ejemplos:

```text
Clínica del Sur
Consultorio Dental Norte
Dr. Juan Pérez
Centro Médico Belgrano
```

---

# 6. Acceso por URL

Cada tenant debe poseer un `slug` único.

Ejemplo:

```text
clinica-del-sur
dental-norte
dr-juan-perez
```

Debe existir como mínimo una modalidad por ruta:

```text
https://app.midominio.com/t/clinica-del-sur
```

También debe dejarse preparada la arquitectura para soportar:

```text
https://clinica-del-sur.midominio.com
```

El sistema debe resolver el tenant a partir de:

1. Subdominio, cuando se encuentre configurado.
2. Ruta `/t/:tenantSlug`, como mecanismo obligatorio y fallback.

No debe permitirse cambiar manualmente el tenant activo para acceder a información ajena.

---

# 7. Personalización del tenant

Cada tenant debe poder configurar:

- Nombre comercial.
- Descripción.
- Logo.
- Color principal.
- Color secundario.
- Teléfono.
- Email.
- Dirección.
- Sitio web opcional.
- Texto de bienvenida.
- Zona horaria.
- Estado activo/inactivo.

La personalización debe ser moderada.

No implementar un constructor de sitios completo.

---

# 8. Tipos de usuario

## 8.1 Visitante público

No requiere autenticación.

Puede:

- Ingresar al sitio público de un tenant.
- Ver información pública del consultorio.
- Ver profesionales activos.
- Ver especialidades.
- Seleccionar un profesional.
- Consultar días de atención.
- Consultar slots disponibles.
- Consultar calendario mensual.

No puede:

- Solicitar un turno.
- Consultar pacientes.
- Consultar quién ocupa un horario.
- Ver motivo de otros turnos.
- Acceder al panel administrativo.

Cuando intenta reservar debe ser enviado al registro o login.

---

## 8.2 Paciente autenticado

Debe autenticarse mediante Supabase Auth.

Puede:

- Registrarse.
- Iniciar sesión.
- Completar sus datos.
- Consultar disponibilidad pública.
- Solicitar un turno.
- Consultar sus propios turnos.
- Cancelar sus propios turnos futuros cuando la política del tenant lo permita.
- Consultar el estado de sus turnos.

No puede:

- Ver datos de otros pacientes.
- Crear turnos a nombre de otra persona.
- Administrar profesionales.
- Modificar horarios.
- Acceder a datos administrativos.

---

## 8.3 Administrador del tenant

Debe autenticarse mediante Supabase Auth.

Puede:

- Administrar los datos del tenant.
- Gestionar profesionales.
- Gestionar pacientes.
- Gestionar horarios.
- Gestionar turnos.
- Configurar branding.
- Consultar agenda.
- Gestionar miembros internos del tenant, si se implementa esta opción.

Solo puede acceder a su tenant.

---

## 8.4 Operador del tenant

Rol opcional pero recomendado.

Puede:

- Consultar agenda.
- Crear turnos.
- Editar turnos.
- Gestionar pacientes.

No debe poder:

- Eliminar tenant.
- Cambiar suscripción.
- Administrar datos globales de la plataforma.

---

## 8.5 Administrador de plataforma

Rol interno del SaaS.

Puede:

- Ver tenants.
- Activar o suspender tenants.
- Ver planes.
- Ver estados de suscripción.
- Realizar soporte administrativo.

No debe utilizarse para las operaciones cotidianas de un consultorio.

Las funciones privilegiadas deben ejecutarse únicamente desde un contexto seguro.

---

# 9. Registro y contratación del SaaS

Debe existir un flujo de alta de un nuevo tenant.

Ruta sugerida:

```text
/signup
```

Proceso:

1. El usuario crea una cuenta.
2. Confirma email si Supabase Auth se configura con confirmación.
3. Introduce:
   - Nombre del consultorio.
   - Nombre del responsable.
   - Slug deseado.
   - Teléfono.
   - Email.
4. Selecciona un plan.
5. Se crea el tenant.
6. Se crea la relación del usuario como `TENANT_ADMIN`.
7. Se crea una suscripción inicial.
8. El usuario accede al onboarding.

Para el MVP, la contratación puede manejar estados:

```text
TRIALING
ACTIVE
PAST_DUE
SUSPENDED
CANCELLED
```

La integración con una pasarela de pagos no es obligatoria para el MVP.

La arquitectura debe permitir agregar posteriormente Mercado Pago, Stripe u otro proveedor sin modificar el modelo central de turnos.

---

# 10. Planes SaaS

Crear tabla:

```text
plans
```

Campos sugeridos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| code | text | UNIQUE NOT NULL |
| name | text | NOT NULL |
| description | text | nullable |
| price | numeric | nullable |
| currency | text | default 'ARS' |
| max_professionals | integer | nullable |
| max_admins | integer | nullable |
| active | boolean | default true |
| created_at | timestamptz | default now() |

Ejemplos:

```text
BASIC
PRO
ENTERPRISE
```

---

# 11. Tabla `tenants`

Representa organizaciones contratantes.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| name | text | NOT NULL |
| slug | text | UNIQUE NOT NULL |
| description | text | nullable |
| phone | text | nullable |
| email | text | nullable |
| address | text | nullable |
| website | text | nullable |
| timezone | text | NOT NULL |
| logo_path | text | nullable |
| primary_color | text | nullable |
| secondary_color | text | nullable |
| welcome_text | text | nullable |
| active | boolean | default true |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

El `slug` debe ser:

- Único.
- Normalizado.
- En minúsculas.
- Sin espacios.
- Apto para URL.

---

# 12. Tabla `tenant_domains`

Permite asociar hostnames a tenants.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants |
| hostname | text | UNIQUE NOT NULL |
| verified | boolean | default false |
| created_at | timestamptz | default now() |

Ejemplos:

```text
clinica-del-sur.midominio.com
turnos.clinicadelsur.com.ar
```

El soporte de dominio personalizado puede quedar fuera del MVP.

El soporte por `slug` es obligatorio.

---

# 13. Tabla `subscriptions`

Relaciona tenants con planes.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants |
| plan_id | uuid | FK plans |
| status | text | NOT NULL |
| starts_at | timestamptz | NOT NULL |
| trial_ends_at | timestamptz | nullable |
| current_period_end | timestamptz | nullable |
| provider | text | nullable |
| provider_subscription_id | text | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Estados válidos:

```text
TRIALING
ACTIVE
PAST_DUE
SUSPENDED
CANCELLED
```

Solo un tenant con suscripción habilitada puede operar normalmente.

---

# 14. Tabla `tenant_members`

Relaciona usuarios autenticados con tenants.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants |
| user_id | uuid | FK auth.users |
| role | text | NOT NULL |
| active | boolean | default true |
| created_at | timestamptz | default now() |

Constraint único:

```text
UNIQUE (tenant_id, user_id)
```

Roles:

```text
TENANT_ADMIN
OPERATOR
PROFESSIONAL
```

---

# 15. Tabla `professionals`

Representa profesionales del tenant.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants NOT NULL |
| user_id | uuid | FK auth.users nullable |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| specialty | text | NOT NULL |
| registration_number | text | nullable |
| phone | text | nullable |
| email | text | nullable |
| description | text | nullable |
| active | boolean | default true |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Todo acceso debe filtrar por `tenant_id`.

---

# 16. Tabla `patients`

Representa pacientes vinculados a un tenant.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants NOT NULL |
| user_id | uuid | FK auth.users nullable |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| dni | text | nullable |
| phone | text | nullable |
| email | text | nullable |
| notes | text | nullable |
| active | boolean | default true |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

La unicidad de DNI, si se utiliza, debe ser por tenant:

```text
UNIQUE (tenant_id, dni)
```

No implementar un `UNIQUE(dni)` global.

Un mismo usuario de Supabase Auth puede ser paciente de múltiples tenants y tener un registro diferente en cada uno.

---

# 17. Tabla `professional_schedules`

Representa horarios habituales semanales de atención.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants NOT NULL |
| professional_id | uuid | FK professionals NOT NULL |
| day_of_week | integer | NOT NULL |
| start_time | time | NOT NULL |
| end_time | time | NOT NULL |
| appointment_duration | integer | NOT NULL |
| active | boolean | default true |
| created_at | timestamptz | default now() |

Valores:

```text
1 = lunes
2 = martes
3 = miércoles
4 = jueves
5 = viernes
6 = sábado
7 = domingo
```

Validaciones:

- `start_time < end_time`
- `appointment_duration > 0`
- El horario debe pertenecer al mismo tenant que el profesional.
- No deben existir rangos superpuestos para el mismo profesional y día.

---

# 18. Excepciones de agenda

Crear tabla:

```text
schedule_exceptions
```

Debe permitir registrar:

- Vacaciones.
- Feriados.
- Licencias.
- Horarios especiales.
- Bloqueos manuales.
- Aperturas extraordinarias.

Campos sugeridos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants |
| professional_id | uuid | FK professionals |
| exception_date | date | NOT NULL |
| type | text | NOT NULL |
| start_time | time | nullable |
| end_time | time | nullable |
| reason | text | nullable |
| created_at | timestamptz | default now() |

Tipos sugeridos:

```text
CLOSED
CUSTOM_HOURS
BLOCKED
```

---

# 19. Tabla `appointments`

Representa turnos.

Campos:

| Campo | Tipo | Restricción |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK tenants NOT NULL |
| professional_id | uuid | FK professionals NOT NULL |
| patient_id | uuid | FK patients NOT NULL |
| appointment_date | date | NOT NULL |
| start_time | time | NOT NULL |
| end_time | time | NOT NULL |
| status | text | NOT NULL |
| reason | text | nullable |
| notes | text | nullable |
| source | text | NOT NULL |
| created_by | uuid | FK auth.users nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Estados:

```text
PENDING
CONFIRMED
COMPLETED
CANCELLED
NO_SHOW
```

Origen:

```text
PATIENT
ADMIN
OPERATOR
```

---

# 20. Relaciones principales

```text
plans
  |
  +---- subscriptions
          |
          +---- tenants
                  |
                  +---- tenant_members
                  |
                  +---- professionals
                  |       |
                  |       +---- professional_schedules
                  |       |
                  |       +---- schedule_exceptions
                  |       |
                  |       +---- appointments
                  |
                  +---- patients
                          |
                          +---- appointments
```

Todas las entidades subordinadas a un tenant deben tener el mismo `tenant_id`.

---

# 21. Integridad entre tenant y relaciones

No debe ser posible crear accidentalmente:

- Un turno del tenant A con un profesional del tenant B.
- Un turno del tenant A con un paciente del tenant B.
- Un horario del tenant A para un profesional del tenant B.

Se recomienda aplicar integridad compuesta.

Ejemplo conceptual:

```text
professionals:
UNIQUE (tenant_id, id)

patients:
UNIQUE (tenant_id, id)
```

Y foreign keys compuestas en `appointments`:

```text
(tenant_id, professional_id)
-> professionals(tenant_id, id)

(tenant_id, patient_id)
-> patients(tenant_id, id)
```

Aplicar estrategia equivalente a horarios y excepciones.

---

# 22. Disponibilidad

Los slots disponibles no deben almacenarse como filas permanentes.

Deben calcularse dinámicamente.

Proceso:

```text
horario semanal
+
excepciones del día
-
bloqueos
-
turnos activos
=
slots disponibles
```

Ejemplo:

```text
Horario:
08:00 - 12:00

Duración:
30 minutos
```

Slots:

```text
08:00
08:30
09:00
09:30
10:00
10:30
11:00
11:30
```

Si existen turnos:

```text
08:30 ocupado
10:00 ocupado
```

La API de disponibilidad debe devolver:

```text
08:00
09:00
09:30
10:30
11:00
11:30
```

---

# 23. Reglas de generación de slots

Un slot es válido únicamente cuando:

1. Pertenece a un rango de atención activo.
2. Respeta la duración configurada.
3. No excede la hora final del rango.
4. No está bloqueado por una excepción.
5. No se superpone con un turno activo.
6. La fecha no está cerrada.
7. El profesional está activo.
8. El tenant está activo.
9. La suscripción del tenant permite operar.

---

# 24. Reserva pública

La disponibilidad puede consultarse sin autenticación.

La reserva requiere autenticación.

Flujo:

```text
Visitante
    |
    +-- selecciona profesional
    |
    +-- selecciona fecha
    |
    +-- consulta disponibilidad
    |
    +-- selecciona horario
    |
    +-- si no está autenticado:
    |      login / registro
    |
    +-- confirma datos
    |
    +-- solicita reserva
```

Después del login, la aplicación debe intentar conservar:

- tenant.
- profesional.
- fecha.
- slot seleccionado.

Antes de insertar el turno, el backend debe volver a validar todo.

---

# 25. Reserva atómica

La creación de un turno es una operación crítica.

No debe implementarse mediante:

```text
SELECT disponibilidad
+
INSERT desde frontend
```

como única protección.

Debe existir una función PostgreSQL/RPC transaccional.

Nombre sugerido:

```text
book_appointment()
```

Responsabilidades:

1. Obtener el usuario autenticado.
2. Resolver el paciente correspondiente al tenant.
3. Validar tenant activo.
4. Validar profesional activo.
5. Validar fecha.
6. Validar agenda.
7. Validar excepciones.
8. Validar duración.
9. Verificar superposición.
10. Insertar el turno.
11. Devolver turno creado.
12. Fallar completamente si existe conflicto.

La función debe ejecutar la verificación y creación dentro de una misma transacción.

---

# 26. Protección contra doble reserva

El sistema debe estar preparado para que dos usuarios intenten reservar el mismo slot simultáneamente.

Debe existir protección a nivel PostgreSQL.

Como mínimo:

- Validación dentro de función transaccional.
- Índices adecuados.
- Constraint o estrategia equivalente para evitar colisiones.

Para slots discretos puede utilizarse un índice único parcial conceptual sobre:

```text
tenant_id
professional_id
appointment_date
start_time
```

aplicado a estados que bloquean agenda.

Los estados que bloquean deben incluir:

```text
PENDING
CONFIRMED
COMPLETED
NO_SHOW
```

`CANCELLED` no debe bloquear.

Si se permite duración variable, se recomienda además una protección de superposición basada en rangos temporales.

---

# 27. Función pública de disponibilidad

Crear función/RPC segura:

```text
get_available_slots(
  tenant_slug,
  professional_id,
  target_date
)
```

Debe devolver solamente datos necesarios.

Ejemplo:

```json
[
  {
    "start_time": "08:00",
    "end_time": "08:30"
  },
  {
    "start_time": "09:00",
    "end_time": "09:30"
  }
]
```

No debe devolver:

- patient_id.
- nombres de pacientes.
- motivos.
- notas.
- ids de turnos ocupados.

---

# 28. Registro de pacientes

Supabase Auth debe soportar registro público.

Método mínimo:

```text
Email + Password
```

Opcional posteriormente:

- Magic Link.
- Google OAuth.
- Apple.
- Otros proveedores.

Después de autenticarse, el usuario debe completar:

- Nombre.
- Apellido.
- Teléfono.
- DNI opcional.
- Email.

Al reservar por primera vez dentro de un tenant, debe existir o crearse un registro `patients` asociado al:

```text
tenant_id
user_id
```

---

# 29. Perfil del paciente

Ruta sugerida:

```text
/account
```

Mostrar:

- Datos personales.
- Próximos turnos.
- Turnos anteriores.
- Turnos cancelados.

El usuario únicamente puede ver turnos cuyo `patient.user_id` coincida con `auth.uid()`.

---

# 30. Cancelación por paciente

Ruta o acción:

```text
/account/appointments/:id/cancel
```

Debe validar:

- El turno pertenece al paciente autenticado.
- Pertenece al tenant correspondiente.
- No se encuentra ya cancelado.
- No se encuentra finalizado.
- Cumple la política de cancelación del tenant.

Para el MVP puede permitirse cancelar cualquier turno futuro.

Cancelar significa:

```text
status = CANCELLED
```

Nunca borrar físicamente el turno.

---

# 31. Sitio público del tenant

Ruta principal:

```text
/t/:tenantSlug
```

Mostrar:

- Logo.
- Nombre.
- Descripción.
- Dirección.
- Contacto.
- Profesionales activos.
- Especialidades.
- Botón "Ver turnos".

No mostrar información interna.

---

# 32. Profesionales públicos

Ruta:

```text
/t/:tenantSlug/professionals
```

Mostrar:

- Nombre.
- Apellido.
- Especialidad.
- Descripción pública.
- Botón "Ver disponibilidad".

---

# 33. Disponibilidad pública

Ruta:

```text
/t/:tenantSlug/professionals/:professionalId
```

Mostrar:

- Profesional.
- Especialidad.
- Calendario mensual.
- Días con atención.
- Slots disponibles para una fecha.
- Botón para solicitar turno.

Los slots ocupados no deben mostrarse.

---

# 34. Login y registro de pacientes

Rutas:

```text
/login
/register
/forgot-password
/reset-password
```

Después del login, si existe una intención de reserva pendiente, volver al flujo del tenant correspondiente.

---

# 35. Área administrativa del tenant

Ruta sugerida:

```text
/admin
```

Debe requerir autenticación y membresía en un tenant.

Si un usuario administrativo pertenece a más de un tenant, puede utilizarse:

```text
/admin/:tenantSlug
```

Para el MVP puede asumirse un tenant administrativo activo por sesión.

El frontend nunca debe autorizar solo por ruta.

Supabase RLS debe aplicar la autorización real.

---

# 36. Dashboard administrativo

Mostrar:

- Turnos de hoy.
- Próximos turnos.
- Profesionales activos.
- Pacientes registrados.
- Slots disponibles del día.
- Estado básico de suscripción.

No agregar gráficos complejos en el MVP.

---

# 37. CRUD de profesionales

Rutas sugeridas:

```text
/admin/professionals
/admin/professionals/new
/admin/professionals/:id
/admin/professionals/:id/edit
/admin/professionals/:id/schedule
```

Funciones:

- Crear.
- Ver.
- Editar.
- Activar/desactivar.
- Configurar agenda.

Evitar borrado físico cuando existan datos relacionados.

---

# 38. Configuración de agenda

Debe permitir crear múltiples rangos por día.

Ejemplo:

```text
Lunes
08:00 - 12:00
14:00 - 18:00
30 minutos
```

Validaciones:

- Inicio menor que fin.
- Duración mayor que cero.
- No superposición.
- Tenant coincidente.
- Profesional coincidente.

---

# 39. Gestión de excepciones

Ruta sugerida:

```text
/admin/professionals/:id/exceptions
```

Permitir:

- Bloquear día completo.
- Bloquear intervalo.
- Configurar horario especial.

Ejemplo:

```text
20/09/2026
CLOSED
Vacaciones
```

---

# 40. CRUD de pacientes

Rutas:

```text
/admin/patients
/admin/patients/new
/admin/patients/:id
/admin/patients/:id/edit
```

Mostrar únicamente pacientes del tenant.

Búsqueda:

- Nombre.
- Apellido.
- DNI.
- Email.

---

# 41. CRUD de turnos

Rutas:

```text
/admin/appointments
/admin/appointments/new
/admin/appointments/:id
/admin/appointments/:id/edit
```

Funciones:

- Crear.
- Ver.
- Reprogramar.
- Cancelar.
- Cambiar estado.

La reprogramación debe usar validación de disponibilidad equivalente a una reserva nueva.

---

# 42. Agenda administrativa

Debe permitir seleccionar:

- Profesional.
- Fecha.

Mostrar:

```text
08:00 | Disponible
08:30 | Ocupado
09:00 | Disponible
09:30 | Ocupado
```

Para administradores se puede mostrar el paciente asociado al turno.

Los usuarios públicos nunca deben ver esa información.

---

# 43. Configuración del tenant

Ruta:

```text
/admin/settings
```

Permitir editar:

- Nombre.
- Descripción.
- Logo.
- Dirección.
- Teléfono.
- Email.
- Colores.
- Texto de bienvenida.
- Zona horaria.

---

# 44. Suscripción

Ruta:

```text
/admin/subscription
```

Mostrar:

- Plan actual.
- Estado.
- Fecha de inicio.
- Fin de prueba si corresponde.
- Límites del plan.

Para el MVP, el cambio real de plan puede requerir intervención del administrador de plataforma.

---

# 45. Panel de plataforma

Ruta sugerida:

```text
/platform
```

Solo accesible por administradores globales.

Funciones mínimas:

- Listar tenants.
- Buscar tenants.
- Ver estado.
- Activar.
- Suspender.
- Consultar plan.
- Consultar fecha de alta.

No mostrar clínicamente información sensible salvo que sea estrictamente necesario.

---

# 46. Row Level Security

RLS debe estar habilitado en todas las tablas con información sensible.

Como mínimo:

```text
tenants
tenant_members
subscriptions
professionals
patients
professional_schedules
schedule_exceptions
appointments
```

No utilizar la `service_role` desde el navegador.

---

# 47. Funciones auxiliares RLS

Crear funciones SQL seguras equivalentes a:

```text
is_tenant_member(tenant_id)
is_tenant_admin(tenant_id)
is_platform_admin()
can_manage_tenant(tenant_id)
is_own_patient_record(patient_id)
```

Deben utilizar `auth.uid()`.

Evitar duplicar lógica compleja en todas las policies.

---

# 48. Políticas públicas

El rol `anon` puede acceder únicamente a información pública.

Debe poder leer:

- Tenant activo por slug.
- Branding público.
- Profesionales activos.
- Horarios necesarios para calcular disponibilidad.
- Resultado de funciones públicas de disponibilidad.

No debe poder leer directamente:

- Tabla completa de pacientes.
- Turnos privados.
- Motivos.
- Notas.
- Datos administrativos.
- Suscripciones internas.

Es preferible exponer disponibilidad mediante RPC o vistas seguras en lugar de abrir lectura directa indiscriminada sobre `appointments`.

---

# 49. Políticas del paciente

Usuario autenticado paciente puede:

- Leer sus propios registros de paciente.
- Actualizar campos permitidos de su perfil.
- Leer sus propios turnos.
- Crear turnos únicamente a través de la función de reserva.
- Cancelar sus propios turnos mediante función controlada.

No permitir `INSERT` directo indiscriminado en `appointments` desde cliente.

---

# 50. Políticas administrativas

Un miembro administrativo de un tenant puede gestionar únicamente filas donde:

```text
tenant_id
```

pertenezca a un tenant en el que exista una membresía activa.

Nunca utilizar una policy del tipo:

```text
auth.role() = 'authenticated'
```

para dar acceso general a datos de tenant.

---

# 51. Storage

Crear bucket:

```text
tenant-assets
```

Uso:

- Logos.
- Imágenes institucionales opcionales.

Ruta sugerida:

```text
{tenant_id}/logo.ext
```

Las policies deben impedir que un tenant escriba dentro del directorio de otro.

---

# 52. Variables de entorno

Frontend:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_BASE_URL=
VITE_ROOT_DOMAIN=
```

Nunca agregar:

```env
SUPABASE_SERVICE_ROLE_KEY
```

al bundle de Vite.

Si una Edge Function necesita service role, debe configurarse como secret del entorno Supabase.

---

# 53. Organización del frontend

Estructura sugerida:

```text
src/
  app/
    router.tsx
    providers.tsx

  components/
    common/
    public/
    admin/
    account/

  features/
    auth/
    tenants/
    professionals/
    schedules/
    appointments/
    patients/
    subscription/

  layouts/
    PublicTenantLayout.tsx
    AdminLayout.tsx
    AccountLayout.tsx

  pages/
    public/
    auth/
    account/
    admin/
    platform/

  lib/
    supabase.ts
    tenantResolver.ts
    auth.ts
    dates.ts

  hooks/
  types/
```

No crear capas abstractas sin necesidad.

---

# 54. Cliente Supabase

Crear:

```text
src/lib/supabase.ts
```

Inicializar con:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

La sesión debe gestionarse con Supabase Auth.

No escribir lógica que dependa de claves administrativas en frontend.

---

# 55. Resolución del tenant

Crear utilidad:

```text
resolveTenant()
```

Debe resolver tenant mediante:

1. Hostname.
2. Subdominio.
3. `/t/:tenantSlug`.

La resolución debe obtener solamente información pública necesaria.

No almacenar como fuente autoritativa un `tenant_id` editable por el usuario.

---

# 56. Contexto de tenant

Puede utilizarse un contexto React:

```text
TenantContext
```

Debe contener:

- id.
- slug.
- nombre.
- branding.
- timezone.

El contexto facilita renderizado.

No reemplaza RLS.

---

# 57. Enrutamiento sugerido

Rutas públicas:

```text
/
/pricing
/signup
/login
/register

/t/:tenantSlug
/t/:tenantSlug/professionals
/t/:tenantSlug/professionals/:professionalId
/t/:tenantSlug/book/:professionalId

/account
/account/appointments

/admin
/admin/professionals
/admin/professionals/:id
/admin/professionals/:id/schedule
/admin/professionals/:id/exceptions
/admin/patients
/admin/patients/:id
/admin/appointments
/admin/appointments/:id
/admin/settings
/admin/subscription

/platform
/platform/tenants
/platform/plans
```

---

# 58. Página principal SaaS

Ruta:

```text
/
```

Debe presentar:

- Nombre del producto.
- Beneficio principal.
- Funcionalidades.
- Planes.
- CTA "Crear consultorio".
- CTA "Iniciar sesión".

No debe confundirse con el sitio público de un tenant.

---

# 59. Página de precios

Ruta:

```text
/pricing
```

Mostrar planes activos desde `plans`.

Cada plan debe indicar:

- Nombre.
- Precio.
- Cantidad máxima de profesionales.
- Características.
- Botón contratar.

---

# 60. Onboarding del tenant

Después de crear tenant:

```text
/admin/onboarding
```

Pasos:

1. Información del consultorio.
2. Branding básico.
3. Crear primer profesional.
4. Configurar horarios.
5. Confirmar URL pública.
6. Finalizar.

Debe poder omitirse y completarse luego.

---

# 61. Reglas de negocio críticas

Antes de crear o reprogramar un turno:

1. Tenant existe.
2. Tenant activo.
3. Suscripción habilitada.
4. Profesional pertenece al tenant.
5. Profesional activo.
6. Paciente pertenece al tenant.
7. Usuario tiene derecho a reservar para ese paciente.
8. Fecha pertenece a un día habilitado.
9. Slot pertenece a un rango válido.
10. Slot no está bloqueado.
11. Slot no está ocupado.
12. Duración coincide.
13. Fecha/hora no está en el pasado.
14. Todas las verificaciones deben repetirse dentro de la transacción de reserva.

---

# 62. Manejo de concurrencia

Escenario obligatorio de prueba:

```text
Usuario A consulta 10:00 disponible
Usuario B consulta 10:00 disponible

A confirma
B confirma casi simultáneamente
```

Resultado esperado:

```text
A obtiene turno
B obtiene error SLOT_UNAVAILABLE
```

Nunca deben existir dos turnos activos en el mismo slot.

---

# 63. Errores de dominio

Las RPC deben utilizar errores controlados.

Ejemplos:

```text
TENANT_NOT_FOUND
TENANT_INACTIVE
SUBSCRIPTION_INACTIVE
PROFESSIONAL_NOT_FOUND
PROFESSIONAL_INACTIVE
PATIENT_NOT_FOUND
INVALID_SLOT
SLOT_UNAVAILABLE
OUTSIDE_WORKING_HOURS
DATE_BLOCKED
UNAUTHORIZED
```

El frontend debe transformar estos códigos en mensajes comprensibles.

No mostrar SQL interno.

---

# 64. Zonas horarias

Cada tenant debe definir una timezone.

Ejemplo:

```text
America/Argentina/Buenos_Aires
```

Las reglas de agenda deben interpretarse en la timezone del tenant.

Usar `timestamptz` para eventos temporales globales.

Para la agenda recurrente semanal pueden mantenerse:

```text
date
time
timezone del tenant
```

Evitar asumir la timezone del navegador como fuente autoritativa.

---

# 65. Índices recomendados

Crear índices para:

```text
tenants.slug
tenant_domains.hostname

tenant_members.user_id
tenant_members.tenant_id

professionals.tenant_id
professionals.active

patients.tenant_id
patients.user_id
patients.dni

professional_schedules.tenant_id
professional_schedules.professional_id
professional_schedules.day_of_week

schedule_exceptions.tenant_id
schedule_exceptions.professional_id
schedule_exceptions.exception_date

appointments.tenant_id
appointments.professional_id
appointments.patient_id
appointments.appointment_date
appointments.status
```

---

# 66. Restricciones recomendadas

Ejemplos:

```text
UNIQUE tenants.slug
UNIQUE tenant_domains.hostname
UNIQUE tenant_members(tenant_id, user_id)
UNIQUE patients(tenant_id, user_id)
```

El constraint de paciente por usuario puede ajustarse si se desea soportar múltiples fichas por usuario.

Aplicar `CHECK` para:

- Estados válidos.
- Roles válidos.
- Duraciones positivas.
- Rangos horarios.
- Colores si se requiere.

---

# 67. Funciones PostgreSQL/RPC recomendadas

Crear como mínimo:

```text
get_public_tenant_by_slug()
get_public_professionals()
get_available_slots()
book_appointment()
cancel_own_appointment()
admin_create_appointment()
admin_reschedule_appointment()
is_tenant_member()
is_tenant_admin()
```

La disponibilidad y reserva deben compartir la misma lógica de validación.

---

# 68. Realtime

Supabase Realtime es opcional.

Puede utilizarse para refrescar:

- Agenda administrativa.
- Disponibilidad visible.

No confiar en Realtime para evitar colisiones.

La integridad debe estar garantizada por PostgreSQL.

---

# 69. Personalización visual

Utilizar variables CSS.

Ejemplo:

```css
--tenant-primary
--tenant-secondary
```

El tenant puede definir:

- Logo.
- Color principal.
- Color secundario.

No permitir CSS arbitrario proporcionado por el tenant.

---

# 70. Diseño

Debe ser:

- Profesional.
- Responsive.
- Mobile-first.
- Simple.
- Claro.
- Reutilizable entre tenants.

Evitar:

- Animaciones complejas.
- Layouts excesivamente personalizados.
- UI pesada.
- Dependencias innecesarias.

---

# 71. Componentes sugeridos

```text
TenantHeader.tsx
TenantBrand.tsx
ProfessionalCard.tsx
ProfessionalList.tsx
MonthlyCalendar.tsx
AvailableSlots.tsx
BookingForm.tsx
LoginForm.tsx
RegisterForm.tsx
PatientProfileForm.tsx

AdminSidebar.tsx
ProfessionalForm.tsx
ScheduleForm.tsx
ScheduleExceptionForm.tsx
PatientTable.tsx
AppointmentTable.tsx
AppointmentForm.tsx
TenantSettingsForm.tsx

StatusBadge.tsx
ConfirmDialog.tsx
LoadingState.tsx
EmptyState.tsx
ErrorState.tsx
```

---

# 72. Estados de interfaz

Todos los módulos deben contemplar:

```text
loading
success
empty
error
unauthorized
```

Ejemplos:

```text
No hay profesionales disponibles.
No hay horarios disponibles para esta fecha.
No tienes turnos próximos.
El horario seleccionado acaba de ser ocupado.
```

---

# 73. Validación frontend

Utilizar validación para mejorar UX.

Pero las reglas críticas deben repetirse en PostgreSQL.

El frontend nunca debe ser la única protección para:

- tenant.
- rol.
- disponibilidad.
- colisiones.
- ownership.
- suscripción.

---

# 74. Seguridad

Requisitos obligatorios:

- RLS en datos sensibles.
- No exponer Service Role Key.
- No confiar en ids proporcionados por cliente sin validación.
- Validar pertenencia de relaciones.
- Validar roles.
- Validar tenant.
- Reservar mediante RPC.
- No exponer pacientes públicamente.
- No exponer datos de turnos ocupados.
- No usar `localStorage` para simular autorización.
- Sanitizar y validar datos de formularios.
- Aplicar rate limiting donde resulte necesario en funciones públicas críticas.

---

# 75. Privacidad pública

La vista pública puede revelar:

- Profesional.
- Especialidad.
- Horarios disponibles.
- Información institucional.

Nunca debe revelar:

- Nombre del paciente de un turno.
- Email.
- Teléfono.
- DNI.
- Motivo de consulta.
- Notas.
- Historial.
- Cantidad detallada de turnos privados si no es necesario.

---

# 76. Auditoría mínima

Recomendado:

Crear campos:

```text
created_by
created_at
updated_at
```

Para operaciones importantes.

Opcional:

```text
audit_log
```

para:

- Creación de turnos.
- Cancelaciones.
- Reprogramaciones.
- Cambios administrativos.

Puede quedar fuera del MVP si aumenta demasiado el alcance.

---

# 77. Datos seed

Crear SQL de seed con:

## Planes

```text
BASIC
PRO
```

## Tenant

```text
Clínica Demo
slug: clinica-demo
```

## Profesionales

```text
Laura Gómez - Odontología General
Martín Pérez - Ortodoncia
Ana López - Endodoncia
```

## Horarios

```text
Laura Gómez:
Lunes 08:00-12:00
Miércoles 14:00-18:00
Viernes 08:00-12:00
Duración 30 minutos
```

---

# 78. Migraciones

Toda la base debe poder reconstruirse mediante archivos SQL versionados.

Estructura sugerida:

```text
supabase/
  migrations/
  seed.sql
  functions/
```

No depender de configuración manual imposible de reproducir.

---

# 79. Testing mínimo

Implementar pruebas para la lógica crítica.

Como mínimo:

1. Generación de slots.
2. Día sin horario.
3. Slot ocupado.
4. Turno cancelado libera slot.
5. Excepción bloquea slot.
6. Reserva fuera de horario.
7. Reserva con profesional inactivo.
8. Dos reservas simultáneas.
9. Paciente no puede leer otro paciente.
10. Tenant A no puede leer tenant B.
11. Admin A no puede modificar tenant B.
12. Usuario anónimo no puede leer appointments privados.

Priorizar pruebas de base de datos/RLS sobre pruebas visuales complejas.

---

# 80. Criterios de aceptación multitenant

Crear:

```text
Tenant A
Tenant B
```

Cada uno con:

- Profesionales.
- Pacientes.
- Horarios.
- Turnos.

Validar:

```text
Admin A no ve Tenant B
Admin B no ve Tenant A
Paciente A no ve pacientes de B
URLs públicas muestran solo datos del tenant resuelto
```

---

# 81. Criterios de aceptación públicos

Sin autenticación:

- Se puede abrir `/t/:tenantSlug`.
- Se muestra branding correcto.
- Se muestran profesionales activos.
- Se puede abrir un profesional.
- Se puede cambiar de mes.
- Se puede seleccionar fecha.
- Se muestran solamente slots disponibles.
- No se muestran pacientes.
- Al solicitar un turno se exige autenticación.

---

# 82. Criterios de aceptación paciente

- Puede registrarse.
- Puede iniciar sesión.
- Puede completar datos.
- Puede seleccionar un slot disponible.
- Puede reservar.
- Puede consultar sus turnos.
- No puede reservar fuera de agenda.
- No puede reservar slot ocupado.
- No puede leer turnos de otro paciente.
- Puede cancelar un turno futuro si está permitido.

---

# 83. Criterios de aceptación administración

- Puede iniciar sesión.
- Solo accede a tenants permitidos.
- Puede crear profesional.
- Puede editar profesional.
- Puede configurar agenda.
- Puede crear excepciones.
- Puede consultar pacientes.
- Puede crear turno administrativo.
- Puede reprogramar.
- Puede cancelar.
- Puede consultar agenda.

---

# 84. Criterios de aceptación SaaS

- Se puede registrar una nueva organización.
- Se genera tenant.
- Se genera slug.
- Se crea admin del tenant.
- Se crea suscripción.
- Se puede acceder a URL pública.
- Otro tenant puede registrarse en la misma plataforma.
- Ambos comparten aplicación pero no datos.
- El estado de suscripción puede suspender acceso administrativo cuando corresponda.

---

# 85. Funcionalidades fuera del MVP

No implementar inicialmente:

- Historia clínica.
- Odontograma.
- Recetas.
- Facturación médica.
- Obras sociales.
- Videollamadas.
- Chat.
- WhatsApp.
- SMS.
- Notificaciones push.
- IA.
- Constructor visual de sitios.
- Múltiples bases físicas por tenant.
- Microservicios.
- Kubernetes.
- Backend separado.
- GraphQL.
- Marketplace.
- Aplicación móvil nativa.
- Sincronización con Google Calendar.
- Pagos automáticos obligatorios.

La arquitectura no debe impedir agregarlos posteriormente.

---

# 86. Estrategia de multitenancy

Para el MVP utilizar:

```text
Shared Database
Shared Schema
tenant_id
RLS
```

No crear:

- Una base de datos independiente por consultorio.
- Un proyecto Supabase independiente por tenant.
- Una tabla duplicada por tenant.

La expresión "bases de datos que no se mezclen" debe resolverse mediante aislamiento lógico estricto y verificable.

La separación debe ser equivalente desde el punto de vista de autorización:

```text
tenant A -> solo filas A
tenant B -> solo filas B
```

---

# 87. Consideración para escalabilidad futura

Si en el futuro existen clientes que requieran aislamiento físico, la arquitectura puede evolucionar hacia:

- Proyecto Supabase dedicado.
- Base PostgreSQL dedicada.
- Infraestructura enterprise.

No implementar esa complejidad en el MVP.

---

# 88. Despliegue

Frontend React/Vite puede desplegarse en:

- Vercel.
- Netlify.
- Cloudflare Pages.
- Hosting estático equivalente.

Supabase aloja:

- PostgreSQL.
- Auth.
- Storage.
- RPC.
- Edge Functions.

Para subdominios se requiere:

```text
*.midominio.com
```

y configuración wildcard en DNS/hosting.

La aplicación debe mantener siempre el fallback:

```text
/t/:tenantSlug
```

---

# 89. Configuración de dominios

Variables:

```env
VITE_ROOT_DOMAIN=midominio.com
```

Ejemplos:

```text
app.midominio.com/t/clinica-demo
clinica-demo.midominio.com
```

La capa de resolución debe producir un tenant lógico único.

---

# 90. Prioridad de desarrollo

## Fase 1

- Crear proyecto Vite + React + TypeScript.
- Configurar Tailwind.
- Configurar Supabase.
- Crear esquema PostgreSQL.
- Crear migraciones.
- Crear tablas `tenants`, `plans`, `subscriptions`, `tenant_members`.
- Configurar Auth.

## Fase 2

- RLS base.
- Resolución de tenant.
- Registro de tenant.
- Onboarding.
- Página pública del tenant.

## Fase 3

- CRUD profesionales.
- Horarios.
- Excepciones.

## Fase 4

- Registro/login pacientes.
- Tabla patients.
- Perfil del paciente.

## Fase 5

- Tabla appointments.
- Función `get_available_slots`.
- Función `book_appointment`.
- Restricciones de concurrencia.

## Fase 6

- Reserva pública autenticada.
- Área de paciente.
- Cancelación.

## Fase 7

- CRUD administrativo de turnos.
- Agenda.
- Reprogramación.

## Fase 8

- Personalización tenant.
- Suscripción.
- Límites de plan básicos.

## Fase 9

- Tests.
- Revisión RLS.
- Revisión multitenant.
- Responsive.
- Seed.
- README.

---

# 91. Entregables

El agente debe generar:

```text
Aplicación React/Vite completa
Código TypeScript
Tailwind CSS
Configuración React Router

Supabase migrations
SQL de tablas
SQL de constraints
SQL de índices
SQL de funciones/RPC
SQL de triggers necesarios
Políticas RLS

Seed SQL

.env.example

README.md

Tests de reglas críticas
```

---

# 92. README

Debe explicar:

- Arquitectura.
- Stack.
- Instalación.
- Variables de entorno.
- Configuración Supabase.
- Ejecución local.
- Aplicación de migraciones.
- Carga de seed.
- Despliegue.
- Configuración del dominio.
- Configuración opcional de wildcard subdomains.
- Modelo multitenant.
- RLS.
- Flujo de reserva.
- Cómo crear un tenant de prueba.

---

# 93. Restricciones de implementación

Priorizar:

- Código simple.
- Pocas dependencias.
- Tipos TypeScript.
- Funciones claras.
- Componentes pequeños.
- Features separadas.
- SQL explícito.
- RLS verificable.
- RPC para operaciones críticas.
- Naming consistente.

Evitar:

- Repository Pattern innecesario.
- CQRS.
- Event sourcing.
- Redux.
- Microservicios.
- API REST propia innecesaria.
- GraphQL.
- Duplicación por tenant.
- Claves administrativas en frontend.
- Autorización basada únicamente en React.

---

# 94. Resultado esperado

Debe obtenerse una plataforma SaaS con este flujo:

```text
PLATAFORMA SaaS
    |
    +-- Tenant A
    |     |
    |     +-- Branding A
    |     +-- Profesionales A
    |     +-- Pacientes A
    |     +-- Turnos A
    |
    +-- Tenant B
          |
          +-- Branding B
          +-- Profesionales B
          +-- Pacientes B
          +-- Turnos B
```

Los datos no deben mezclarse.

Desde la perspectiva pública:

```text
Visitante
   |
   +-- /t/clinica-a
   |      |
   |      +-- Profesionales A
   |      +-- Disponibilidad A
   |
   +-- /t/clinica-b
          |
          +-- Profesionales B
          +-- Disponibilidad B
```

Desde la perspectiva del paciente:

```text
Paciente
   |
   +-- Consulta sin login
   |
   +-- Selecciona slot
   |
   +-- Login / Registro
   |
   +-- Reserva atómica
   |
   +-- Mis turnos
```

Desde la perspectiva administrativa:

```text
Tenant Admin
   |
   +-- Profesionales
   +-- Horarios
   +-- Excepciones
   +-- Pacientes
   +-- Agenda
   +-- Turnos
   +-- Configuración
   +-- Suscripción
```

---

# 95. Prioridad principal

La prioridad principal del desarrollo es garantizar:

1. Separación multitenant correcta.
2. Row Level Security correcta.
3. Resolución correcta del tenant.
4. Disponibilidad correcta.
5. Reserva transaccional y sin dobles turnos.
6. Privacidad de pacientes.
7. CRUD administrativo.
8. Personalización básica.
9. Modelo SaaS extensible.

Ninguna mejora visual debe tener prioridad sobre aislamiento de datos, seguridad y consistencia de agenda.
