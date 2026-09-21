# Agendia

SaaS multitenant de turnos para consultorios y profesionales. Incluye sitio público por organización, reservas autenticadas, área del paciente, panel administrativo, operadores y panel de plataforma.

## Arranque con tu Supabase

Requisitos: Node.js 22.12+ (recomendado Node 24) y npm. Docker solo es necesario para ejecutar Supabase completo en local.

```sh
npm install
```

Conservá tu `.env` existente. Para una instalación nueva, copiá `.env.example` a `.env` y completá:

```dotenv
VITE_APP_BASE_URL=https://agendiaturnos.vercel.app
VITE_ROOT_DOMAIN=
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

Se admite `VITE_SUPABASE_ANON_KEY` como alternativa heredada. Si ambas están configuradas, se usa la clave publicable. Solo las variables `VITE_` llegan al navegador. `DATABASE_URL` no es necesario para ejecutar la aplicación ni se utiliza en las pruebas aisladas. No publiques `.env` ni uses una clave `service_role` como variable de Vite.

### 1. Aplicar las migraciones, en este orden

En **Supabase → SQL Editor**, ejecutá el contenido completo de cada archivo y esperá a que termine correctamente antes del siguiente:

| Orden | Archivo                                                                                                      | Contenido                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [`20260914000100_initial.sql`](supabase/migrations/20260914000100_initial.sql)                               | Modelo original, tablas, índices, funciones iniciales, RLS, Storage y planes BASIC/PRO.                                            |
| 2     | [`20260914000200_security_and_api.sql`](supabase/migrations/20260914000200_security_and_api.sql)             | RLS definitivo, roles, reservas con exclusión de rangos, altas, límites, consultas públicas y de pacientes, miembros y plataforma. |
| 3     | [`20260914000300_final_validation.sql`](supabase/migrations/20260914000300_final_validation.sql)             | Validaciones adicionales, cancelación con orden consistente de bloqueos y edición de notas mediante RPC.                           |
| 4     | [`20260914000400_fix_guard_tenant_write.sql`](supabase/migrations/20260914000400_fix_guard_tenant_write.sql) | Corrige el trigger compartido de instalaciones anteriores: resuelve `id`/`tenant_id` sin acceder a columnas inexistentes.          |

**Aplicá las cuatro antes de usar la app.** Cada archivo contiene su propia transacción. Están destinados a un proyecto nuevo y deben ejecutarse una sola vez. Si una ejecución falla antes de `COMMIT`, revisá el error y volvé a ejecutar ese archivo completo. No ejecutes archivos posteriores sobre una migración incompleta.

Si aparece `record "new" has no field "tenant_id"` al poblar la base, ejecutá **solo la migración 004** sobre tu instalación existente y luego repetí el seed completo. No hace falta volver a aplicar 001–003. La corrección reemplaza la función del trigger sin borrar datos y puede ejecutarse más de una vez.

`db.sql` se conserva como referencia original entregada con la especificación: **no lo ejecutes además de las migraciones ni lo vuelvas a aplicar después**, porque restauraría políticas anteriores. `db.puml` refleja los ajustes del modelo final. El PNG original no se ha regenerado.

La aplicación no ejecuta migraciones automáticamente. No se ha aplicado ninguna migración al proyecto remoto.

### 2. Configurar Supabase Auth

En **Authentication → URL Configuration**:

- Site URL: `https://agendiaturnos.vercel.app`.
- Redirect URLs:
  - `https://agendiaturnos.vercel.app/auth/callback`
  - `https://agendiaturnos.vercel.app/auth/callback?next=**` (conserva la ruta de reserva).
  - `https://agendiaturnos.vercel.app/reset-password`
- Para desarrollar contra este mismo proyecto, agregá también `http://localhost:5173/**` y `http://127.0.0.1:5173/**`; mantené Site URL en producción.
- Estos ajustes se realizan en el dashboard del proyecto remoto. `supabase/config.toml` configura exclusivamente Supabase local.

En **Authentication → Providers → Email**, habilitá email y contraseña. Con confirmación de email habilitada, el usuario debe abrir el enlace antes de crear el consultorio o reservar. Configurá SMTP para entregar correos de confirmación y recuperación en producción. La app no envía emails por un servicio propio.

### 3. Ejecutar

```sh
npm run dev
```

Abrí **http://localhost:5173**. Para el primer consultorio:

1. Elegí **Crear consultorio** y registrá una cuenta.
2. Confirmá el email si corresponde.
3. Completá los datos del consultorio y elegí un plan.
4. Agregá un profesional y configurá sus horarios desde **Profesionales → Horarios**.
5. Abrí `/t/TU_SLUG` en una sesión diferente para probar una reserva como paciente.

### Datos de demostración opcionales

Después de las cuatro migraciones podés ejecutar [`supabase/seed.sql`](supabase/seed.sql). Crea `Clínica Demo`, tres profesionales y los horarios solicitados. La prueba vence a los 14 días. El seed es repetible y no renueva una prueba ya creada.

El seed **no crea usuarios ni contraseñas**. Si necesitás administrar Clínica Demo, registrá una cuenta en la aplicación y vinculala desde SQL Editor reemplazando el email:

```sql
insert into public.tenant_members (tenant_id, user_id, role)
select t.id, u.id, 'TENANT_ADMIN'
from public.tenants t
join auth.users u on lower(u.email) = lower('TU_EMAIL_REGISTRADO')
where t.slug = 'clinica-demo'
on conflict (tenant_id, user_id) do update
set role = excluded.role, active = true;
```

Ese SQL es para el alta inicial realizada por el propietario del proyecto; la gestión cotidiana del equipo se hace desde **Equipo**, con límites y protección del último administrador.

### Dos clínicas con credenciales listas para probar

Para crear **Clínica del Sur** y **Centro Médico Belgrano**, cada una con cuatro profesionales, horarios y una cuenta administradora, ejecutá [`supabase/seed_demo_clinics.sql`](supabase/seed_demo_clinics.sql) después de las cuatro migraciones. Las credenciales iniciales y URLs están en [Accesos de demostración](docs/demo-access.md). Es opcional y se ejecuta manualmente; no forma parte del seed automático.

## Funcionalidades y rutas

| Área                      | Rutas principales                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SaaS                      | `/`, `/pricing`, `/signup`                                                                                                                         |
| Autenticación             | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`                                                                     |
| Consultorio público       | `/t/:tenantSlug`, `/t/:tenantSlug/professionals`, `/t/:tenantSlug/professionals/:professionalId`                                                   |
| Reserva                   | `/t/:tenantSlug/book/:professionalId?date=AAAA-MM-DD&time=HH:MM:SS`                                                                                |
| Paciente                  | `/account`, `/account/appointments`                                                                                                                |
| Selección de organización | `/admin`                                                                                                                                           |
| Administración            | `/admin/:tenantSlug`, y sufijos `/professionals`, `/patients`, `/appointments`, `/agenda`, `/settings`, `/members`, `/subscription`, `/onboarding` |
| Plataforma                | `/platform`, `/platform/tenants`, `/platform/plans` (vista combinada)                                                                              |

Los formularios de edición utilizan `/:id`; horarios y excepciones están en `/professionals/:id/schedule` y `/professionals/:id/exceptions`. Las rutas administrativas incluyen el slug para evitar ambigüedad entre membresías. El selector solo muestra organizaciones autorizadas.

### Permisos

- **Visitante:** información institucional y profesionales públicos, calendario y horarios libres. Nunca datos de pacientes o turnos ocupados.
- **Paciente:** sus perfiles por organización y sus turnos mediante proyecciones RPC sin notas internas. Puede reservar para sí mismo y cancelar turnos futuros pendientes/confirmados.
- **Operador:** agenda, pacientes y turnos del tenant. No modifica profesionales, horarios, branding, miembros o suscripciones.
- **Administrador:** gestión del tenant, incluyendo equipo, profesionales, horarios y branding.
- **Plataforma:** consulta organizaciones y planes, y modifica plan/estado de suscripción mediante RPC verificadas. No recibe acceso general a información de pacientes.

Para designar al primer administrador de plataforma, el propietario del proyecto ejecuta una sola vez en SQL Editor:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = lower('TU_EMAIL_REGISTRADO')
on conflict do nothing;
```

No existe una interfaz pública para autoasignarse ese rol.

## Arquitectura y reglas

React, Vite, TypeScript, React Router, Tailwind CSS, Supabase JS, TanStack Query, React Hook Form y Zod. Un único frontend y un único proyecto Supabase, sin backend REST propio.

- `src/app`: proveedores de autenticación, caché y rutas.
- `src/pages`: páginas públicas, pacientes, administración y plataforma.
- `src/components`: formularios, estados y confirmaciones accesibles.
- `src/lib`: cliente Supabase, errores de dominio, fechas y resolución de tenant.
- `src/types`: contratos usados por la interfaz.
- `supabase/migrations`: fuente de verdad versionada de la base.

### Aislamiento y reservas

Cada entidad de negocio tiene `tenant_id`; las relaciones usan claves foráneas compuestas. RLS es la autorización real. El contexto React facilita la presentación y no otorga permisos.

`get_available_slots` calcula los horarios a partir de agenda semanal, excepciones y turnos existentes. `CLOSED` cierra el día; `CUSTOM_HOURS` reemplaza los rangos habituales; `BLOCKED` quita intervalos. No se almacenan slots permanentes. La duración del horario especial es explícita en la UI, con fallback SQL de 30 minutos.

`book_appointment`, `admin_create_appointment` y `admin_reschedule_appointment` comparten una operación transaccional. Un bloqueo por tenant coordina reservas, modificaciones de agenda y límites del plan. Una exclusión GiST impide turnos con intervalos superpuestos incluso si sus horas de inicio difieren. `CANCELLED` libera disponibilidad; los otros estados la bloquean. Si una reprogramación falla, se conserva el turno anterior íntegro.

La interfaz interpreta fechas según la zona del tenant, no según la del navegador. La zona inicial es `America/Argentina/Buenos_Aires`. Las horas inexistentes durante un cambio de horario de verano no se ofrecen. El final exacto de medianoche se representa como `24:00` en PostgreSQL. La generación pública está acotada a 730 días futuros, con duración de 1 a 1440 minutos y sin rangos que crucen medianoche; una jornada nocturna debe dividirse entre dos fechas. Los cambios de agenda no cancelan automáticamente reservas previas: el administrador debe revisarlas en su agenda.

Las reservas se confirman automáticamente. Los turnos finalizados no se reprograman ni cambian de estado. Un cancelado se recupera únicamente mediante reprogramación validada. Motivo y notas se editan mediante una RPC autorizada; las notas nunca se devuelven por las consultas del paciente.

### Suscripciones y equipo

El alta crea tenant, administrador y prueba de 14 días en una misma transacción. Solo `ACTIVE` y `TRIALING` vigente permiten operar. Una suscripción inactiva conserva el acceso administrativo a su estado. El paciente puede consultar su historial y cancelar un turno futuro incluso durante una suspensión.

Los límites se verifican en PostgreSQL y cuentan profesionales y administradores activos. Los operadores no consumen cupos de administrador. Para cambiar a un plan menor deben desactivarse antes los registros que exceden sus límites. Los precios nulos se muestran como **Consultar**; no hay pagos automáticos.

Se agregan miembros por email ya registrado. El usuario no se crea desde el panel ni se envían invitaciones. El último administrador activo no puede ser degradado ni desactivado mediante las RPC. Los perfiles que colisionan por DNI no se vinculan automáticamente a otra cuenta: requieren revisión del consultorio para no ceder historiales por coincidencia de un dato.

Las operaciones de alta/reserva autenticadas tienen un límite de 120 solicitudes exitosas por usuario y hora, y un máximo de cinco organizaciones administradas en el alta. Auth utiliza los límites de Supabase. Las consultas anónimas son acotadas; para tráfico público abusivo se deben configurar las protecciones del proveedor/CDN.

### Storage

Bucket público `tenant-assets`, solo para imágenes institucionales. El administrador activo puede cargar PNG, JPEG o WebP de hasta 2 MB dentro de `{tenant_id}/`. Las políticas impiden escribir en otro tenant. Los nombres de archivo se generan para evitar reemplazos accidentales; al guardar un nuevo logo se retira el anterior.

## Pruebas

```sh
npm run lint
npm run build
npm test
npm run test:db
npx playwright install chromium
npm run test:e2e
```

- **Unitarias:** fechas, calendarios, resolución de tenant, retornos seguros y mensajes de error.
- **Base de datos:** PostgreSQL real efímero mediante `embedded-postgres`. Aplica las cuatro migraciones desde cero, ejercita roles SQL/RLS, slots, excepciones, colisiones concurrentes, límites, aislamiento, Storage y altas. No lee `.env`, no usa `DATABASE_URL` y elimina exclusivamente su propio directorio temporal. `tests/embedded-bootstrap.sql` reproduce las interfaces mínimas de Auth y Storage; no reemplaza una prueba integral del servicio Supabase.
- **Navegador:** Playwright ejecuta los recorridos de usuario con respuestas HTTP controladas de Supabase en un origen local fijo. No envía solicitudes a tu proyecto remoto. Comprueba navegación, formularios, permisos de interfaz, login con retorno, reservas, errores y cancelaciones. Guarda capturas de escritorio y móvil en `test-results/`.

### Integración completa con Supabase local

Con Docker funcionando:

```sh
npm run db:start
npm run db:reset
npm run test:e2e:live
```

La última suite utiliza Supabase Auth, PostgREST y PostgreSQL reales, sin simular respuestas. Resuelve exclusivamente las credenciales de `supabase status`, rechaza hosts remotos y abre su frontend de pruebas en el puerto 5175. La configuración local desactiva la confirmación de email para automatizar el recorrido; habilitala en producción según tus necesidades. Esta suite crea datos identificados con `live-`; `db:reset` reconstruye **solo el entorno local** cuando quieras limpiarlos.

En este entorno se ejecutaron las pruebas aisladas y de navegador; **no se ejecutó la integración completa de Supabase**, porque Docker no está disponible. La CI incluye un trabajo separado para ejecutarla con Docker. Tampoco se han comprobado el envío real de email o el DNS del dominio de producción.

## Supabase local y tipos

`supabase/config.toml` contiene configuración reproducible para PostgreSQL 17, Auth, Storage y puertos locales. Después de `npm run db:start`, copiá la URL y clave pública locales a tu entorno de desarrollo si querés usarlo en lugar del remoto. No hace falta modificar `.env` para las suites automatizadas.

```sh
npm run db:types
```

Ese comando opcional genera `src/types/database.generated.ts` desde Supabase local. Los contratos de las pantallas están en `src/types/models.ts`.

## Despliegue y dominios

```sh
npm run build
npm run preview
```

Publicá `dist/` en un hosting estático. Configurá las variables públicas antes del build y reconstruí al modificarlas. `vercel.json` incluye fallback SPA; `public/_redirects` hace lo mismo en Netlify/Cloudflare Pages. En otros hostings configurá las rutas no estáticas para servir `index.html`.

Deploy actual: **https://agendiaturnos.vercel.app/**. En Vercel → Settings → Environment Variables (Production), configurá:

```dotenv
VITE_APP_BASE_URL=https://agendiaturnos.vercel.app
VITE_ROOT_DOMAIN=
VITE_SUPABASE_URL=https://egzgkwwnxpvhztycpvbs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clave pública del proyecto>
```

Después publicá estos cambios y hacé un nuevo deploy: las variables de Vite se incorporan al compilar; modificar el `.env` local no actualiza Vercel. No agregues `DATABASE_URL` ni claves administrativas al frontend.

Configurá también Supabase Auth como indica la sección anterior. Si personalizaste las plantillas de correo, eliminá enlaces fijos a localhost y conservá el enlace de verificación `{{ .ConfirmationURL }}`. Solicitá un correo nuevo después del cambio: los ya enviados conservan su URL.

La confirmación y recuperación vuelven al origen del navegador, incluso si una variable antigua apunta a localhost. Esto conserva la sesión y la intención de reserva en el mismo dominio. Para previews o dominios propios, autorizá sus callbacks y recuperación en Supabase antes de usarlos. La forma `/t/:tenantSlug` siempre está disponible; dejá `VITE_ROOT_DOMAIN` vacío para este deploy (no uses `vercel.app` como dominio raíz).

Referencias: [URLs de retorno de Supabase](https://supabase.com/docs/guides/auth/redirect-urls) y [variables de entorno de Vite](https://vite.dev/guide/env-and-mode).

Para subdominios:

1. Configurá `VITE_ROOT_DOMAIN=midominio.com`.
2. Configurá DNS wildcard y certificados HTTPS en el hosting.
3. `clinica-demo.midominio.com` resuelve `clinica-demo`; `app` y `www` se reservan para el SaaS.
4. Los hostnames especiales se registran en `tenant_domains` y solo se resuelven si `verified=true`, una vez comprobado el dominio fuera de la aplicación.

La configuración de DNS, certificación de dominios y publicación no se realiza automáticamente. La sesión de Auth pertenece al origen del navegador; entrar desde otro subdominio puede requerir iniciar sesión de nuevo.

## Referencias

La implementación sigue `especificaciones.md` y el modelo inicial. Documentación de los servicios: [migraciones de Supabase](https://supabase.com/docs/guides/local-development/database-migrations), [desarrollo local](https://supabase.com/docs/guides/local-development/cli-workflows), [Tailwind con Vite](https://tailwindcss.com/docs/installation/using-vite) y [React Router](https://reactrouter.com/api/declarative-routers/BrowserRouter).
