# Acceso a las dos clínicas de demostración

Ejecutá **todo** `supabase/seed_demo_clinics.sql` en **Supabase → SQL Editor**, después de las migraciones 001, 002, 003 y 004. No hace falta ejecutar el seed anterior de Clínica Demo.

El script crea dos cuentas Supabase Auth con email confirmado e identidad de email/contraseña. Las contraseñas se almacenan con bcrypt. No se envían correos: los emails son direcciones ficticias de demostración.

## Credenciales iniciales

Iniciar sesión: **https://agendiaturnos.vercel.app/login**

| Clínica                | Email                        | Contraseña               |
| ---------------------- | ---------------------------- | ------------------------ |
| Clínica del Sur        | `admin.sur@example.com`      | `Sur!fuKqqxuCRCzsaeAj9a` |
| Centro Médico Belgrano | `admin.belgrano@example.com` | `Bel!cCTUe-AVcvHqs9eB4Z` |

Ambas cuentas tienen rol `TENANT_ADMIN` exclusivamente en su clínica. Estas credenciales son para los datos de demostración; no crean un administrador de plataforma.

## Paneles y páginas públicas

| Clínica                | Panel                                                              | Página pública                                                 |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Clínica del Sur        | https://agendiaturnos.vercel.app/admin/clinica-del-sur-demo        | https://agendiaturnos.vercel.app/t/clinica-del-sur-demo        |
| Centro Médico Belgrano | https://agendiaturnos.vercel.app/admin/centro-medico-belgrano-demo | https://agendiaturnos.vercel.app/t/centro-medico-belgrano-demo |

## Datos incluidos

- **Clínica del Sur:** Laura Gómez (Odontología General), Martín Pérez (Clínica Médica), Sofía Fernández (Pediatría), Lucas Romero (Kinesiología).
- **Centro Médico Belgrano:** Ana López (Dermatología), Diego Sánchez (Cardiología), Valentina Ruiz (Nutrición), Gabriel Acosta (Traumatología).
- Cada profesional atiende de lunes a viernes, de **08:00 a 12:00** y de **14:00 a 18:00**, en `America/Argentina/Buenos_Aires`.
- Turnos de 20, 30 o 40 minutos según especialidad; los ocho profesionales quedan activos.
- Plan BASIC con suscripción ACTIVE en ambas clínicas, sin vencimiento de prueba. No implica cobros.
- Identidad visual y datos institucionales ficticios distintos para cada clínica.

## Reejecución

El script es transaccional y usa identificadores estables. Se puede volver a ejecutar sin duplicar cuentas, clínicas, membresías, profesionales u horarios. Conserva las contraseñas y registros existentes; si luego cambiás una contraseña, la tabla anterior deja de representar esa cuenta y el seed no la restablece. Tampoco reactiva suscripciones o miembros desactivados.

Si un email o slug pertenece a otro registro, la carga se interrumpe con un error y se revierte por completo. No se reemplazan cuentas preexistentes.

## Verificación

La prueba `npm run test:demo-seed` aplica las migraciones y este seed en PostgreSQL 17 aislado. Verifica las ocho fichas, los 80 rangos de horarios, los hashes de contraseña, las identidades de email, el aislamiento RLS y la reejecución. No se conecta al proyecto remoto.

Supabase administra el esquema de Auth. La inserción incluye cadenas vacías en los campos de tokens para evitar el [error documentado de valores nulos al iniciar sesión](https://supabase.com/docs/guides/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44). La prueba SQL no sustituye una comprobación de login contra el servicio Supabase Auth desplegado.
