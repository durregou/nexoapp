# Conectar NexoApp a Supabase (15 minutos, gratis)

Mientras `SUPABASE_URL` y `SUPABASE_ANON_KEY` estén vacíos en `js/config.js`, la app funciona en **modo local** (datos solo en tu navegador). Al llenarlos pasa a **modo nube**: cuentas, publicaciones e inscripciones compartidas.

## 1. Crear el proyecto
1. Entra a https://supabase.com y crea una cuenta (plan Free).
2. **New project** → ponle un nombre (ej. `nexoapp`), una contraseña de base de datos (guárdala) y la región más cercana (São Paulo).

## 2. Crear las tablas y reglas de seguridad
1. En el menú izquierdo: **SQL Editor → New query**.
2. Pega todo el contenido de `supabase/schema.sql` y pulsa **Run**.
3. Nueva consulta: pega `supabase/seed.sql` y **Run** (carga las 50 actividades de ejemplo; es opcional y se puede correr varias veces sin duplicar).
4. Pega `supabase/moderacion-activar.sql`, cambia `TU_CORREO@ejemplo.com` por tu correo y **Run** (ver «Moderación» abajo).

## 3. Poner las llaves en la app
1. **Project Settings → API**.
2. Copia **Project URL** y la llave **anon / public**.
3. Pégalas en `js/config.js` (`SUPABASE_URL` y `SUPABASE_ANON_KEY`).
   - Usa solo la llave `anon`. **Nunca** la `service_role`: esa da acceso total.

## 4. Permitir el inicio de sesión
1. **Authentication → URL Configuration**.
2. **Site URL**: `http://localhost:8000` (cuando publiques la app, cambia a tu dirección real).
3. **Redirect URLs**: agrega `http://localhost:8000/**` y, al publicar, `https://tu-dominio/**`.
4. **Authentication → Providers → Email** debe estar activado (viene por defecto). El correo con el enlace sale del servicio gratuito de Supabase, que tiene límite de envíos por hora; para producción conecta tu propio SMTP.

## 5. Probar
Abre `http://localhost:8000` (no `file://`). Ve a **Perfil → Iniciar sesión**, escribe tu correo y abre el enlace que te llega.

## Qué protege tus datos
- Todas las reglas están en la base de datos (RLS), no en el navegador: aunque alguien edite el JavaScript, solo puede borrar **sus** actividades y ver **sus** inscripciones.
- El servidor valida la longitud de los textos, las coordenadas (Bogotá), los cupos (1–500), que la fecha sea futura y un máximo de 10 publicaciones por persona por día.
- Los cupos nunca se pasan: el servidor bloquea la inscripción cuando se llenan, aunque dos personas pulsen a la vez.

## Lo que falta antes de abrirlo al público
- Moderación (reportar o ocultar publicaciones indebidas).
- SMTP propio para los correos de acceso.
- Política de privacidad y términos (guardas correos de personas).

## Personalizar el correo de acceso
Supabase envía dos correos distintos, así que hay que cambiar las dos plantillas en **Authentication → Emails** (en algunas versiones, **Email Templates**):

| Plantilla en Supabase | Cuándo se envía | Archivo |
|---|---|---|
| **Confirm sign up** | La primera vez que alguien entra con su correo | `supabase/email-confirmar-registro.html` |
| **Magic Link** | Cuando una persona que ya tiene cuenta vuelve a entrar | `supabase/email-enlace-acceso.html` |

Para cada una: cambia el **Subject** (asunto) y pega el HTML del archivo en **Message body**; guarda.
- Asunto sugerido para *Confirm sign up*: `Te damos la bienvenida a NexoApp`
- Asunto sugerido para *Magic Link*: `Tu enlace para entrar a NexoApp`

El saludo usa el nombre que la persona escribe en el formulario de la app (`{{ .Data.first_name }}`). El botón usa `{{ .ConfirmationURL }}`: no lo borres, es el enlace que inicia la sesión.

**Remitente:** el correo sale como "Supabase Auth" desde una dirección de Supabase y con un límite de pocos envíos por hora. Para que salga como "NexoApp" desde tu propio correo, configura un SMTP propio en **Authentication → SMTP Settings** (por ejemplo Resend, Brevo o Gmail con contraseña de aplicación).

## Moderación: tú apruebas cada publicación
- Cuando alguien publica, la actividad queda **«En revisión»**: solo ella y tú la ven. No aparece en Explorar ni se puede inscribir nadie hasta que la apruebes.
- Los administradores ven una pestaña **Administrar** (con el número de pendientes) donde pueden **Aprobar** o **Rechazar**. Lo que publica un administrador se aprueba solo.
- Quien publicó ve en su Perfil el estado: *En revisión*, *Publicada* o *No aprobada*.
- Un admin también puede quitar cualquier actividad ya publicada desde su detalle («Quitar actividad (admin)»).
- La regla está en la base de datos: nadie puede aprobarse a sí mismo cambiando el JavaScript.

### Actualizar una base que ya tenías (antes de la moderación)
Haz esto en orden, en el SQL Editor:
1. Corre `schema.sql` completo otra vez (es seguro: agrega la columna `status`, la tabla `admins` y las reglas nuevas).
2. Corre `moderacion-activar.sql` **una sola vez**, con tu correo. Deja aprobado lo que ya existía y te hace administrador.
   - Tienes que haber iniciado sesión en la app al menos una vez con ese correo.
   - No lo repitas cuando ya haya publicaciones pendientes: las aprobaría todas sin revisarlas.
3. Opcional: corre `seed-nov-dic.sql` para sumar las 26 actividades de ejemplo de fin de año (no duplica).

### Agregar otro administrador
```sql
insert into public.admins (user_id)
select id from auth.users where email = 'otra.persona@ejemplo.com' on conflict do nothing;
```

## Reportes de la comunidad
- Cualquier persona con sesión iniciada puede **reportar** una actividad desde su detalle (motivo + comentario opcional). Una persona reporta una actividad una sola vez y máximo 20 reportes por día.
- Con **3 reportes de personas distintas** la actividad se oculta sola y vuelve a la cola de revisión.
- En **Administrar → Reportadas** ves cada actividad con sus motivos y eliges **Ocultar** o **Descartar reportes** (si estaba oculta por reportes, la vuelve a publicar). No ves quién reportó.
- Para activarlo en una base que ya tenías: corre `schema.sql` completo otra vez (es seguro).

## Antes de abrir al público: páginas legales
`terminos.html` y `privacidad.html` son un **borrador**. Reemplaza los textos resaltados en amarillo (`[NOMBRE COMPLETO O RAZÓN SOCIAL]`, `[CIUDAD, COLOMBIA]`, `[CORREO DE CONTACTO]`) y pide que una persona abogada los revise. Si cambias el contenido de forma importante, sube `terms_version` en `js/cloud.js` para registrar la nueva aceptación.

## Cuentas con correo y contraseña
La app ya no usa enlaces mágicos: la gente se registra con nombre, apellido, correo y contraseña (mínimo 8 caracteres, con letras y números), y puede recuperar o cambiar su contraseña.

**Ajustes en Supabase** (Authentication → Sign In / Providers → Email):
1. **Email** debe estar activado.
2. **Confirm email**: recomendado activado. Quien se registra recibe un correo y confirma antes de poder entrar.
3. **Minimum password length**: pon 8. Si tu plan lo permite, exige también letras y números.

**Importante, los envíos de correo:** con el servicio de correo gratuito de Supabase hay un tope muy bajo (unos pocos correos por hora en todo el proyecto). Cada registro con confirmación y cada «olvidé mi contraseña» gastan uno. Para un piloto con varias personas necesitas un SMTP propio (Authentication → SMTP Settings). Mientras tanto, para probar puedes desactivar *Confirm email*, sabiendo que así cualquiera puede registrarse con un correo que no es suyo.

**Plantillas de correo** (cuando tengas SMTP propio, en Authentication → Emails):
| Plantilla en Supabase | Archivo |
|---|---|
| Confirm sign up | `email-confirmar-registro.html` |
| Reset Password | `email-recuperar-contrasena.html` |
| Magic Link | ya no se usa |

**Quienes ya tenían cuenta por enlace** no tienen contraseña: pueden crearla con «¿Olvidaste tu contraseña?» en la pantalla de entrada, o con **Perfil → Cambiar contraseña** si todavía tienen la sesión abierta.

## Eliminar la cuenta
En **Perfil → Eliminar mi cuenta** la persona escribe su contraseña y la palabra ELIMINAR. Se borran su cuenta, sus inscripciones, sus reportes y las actividades que publicó (con las inscripciones de otras personas en ellas). Para que funcione, corre `schema.sql` completo otra vez: crea la función `delete_my_account()`.
