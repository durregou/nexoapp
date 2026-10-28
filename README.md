# NexoApp

Plataforma gratuita para Bogotá donde las personas comparten conocimiento, se unen a jornadas solidarias y ayudan a proteger animales. Este repositorio contiene el prototipo del mapa de actividades con OpenStreetMap.

**Estado:** prototipo funcional. Con Supabase configurado tiene cuentas, publicaciones, inscripciones y moderación reales; sin él, funciona en modo local (datos solo en el navegador).

## Qué incluye

- Mapa de OpenStreetMap con [Leaflet](https://leafletjs.com/), pines por categoría y agrupación de pines cercanos.
- Filtros por categoría, localidad, fecha (hoy, esta semana, fin de semana, este mes) y texto, y botón **Cerca de mí** (la ubicación nunca sale del navegador).
- En el celular, el mapa tiene un botón «Filtros» (con contador) que abre un panel desde abajo con todos los filtros, sin tener que volver a la lista.
- Navegación Inicio, Explorar, Perfil y Publicar: barra lateral en escritorio y barra inferior en celular.
- Cuentas con correo y contraseña (con confirmación por correo y recuperación de contraseña), con nombre y apellido.
- Eliminar la propia cuenta desde el Perfil (borra la cuenta, las inscripciones y lo publicado).
- Publicar actividades eligiendo el lugar en un mapa. Cada publicación pasa por **revisión de un administrador** antes de mostrarse.
- Panel de administración: aprobar, rechazar, atender reportes y quitar actividades.
- Reportar actividades (con 3 reportes distintos se ocultan solas).
- Compartir por WhatsApp o enlace directo, y agregar al calendario (.ics).
- Mascotas perdidas y encontradas, con foto (se guarda en Supabase Storage), contacto por WhatsApp solo para quien inicia sesión, moderación y botón «Ya apareció».
- Mascotas también en el mapa de Explorar (pin cuadrado: rojo perdido, verde encontrado), con botón para reportar avisos indebidos.
- Limpieza diaria automática de avisos vencidos y sus fotos (GitHub Actions, `scripts/cleanup-pets.mjs`).
- Instalable como app (PWA).
- Términos de uso y política de privacidad (borradores por completar).

## Cómo probarlo

Necesita internet. **No abras `index.html` con doble clic (`file://`)**: OpenStreetMap bloquea las teselas que llegan sin `Referer` y el mapa sale con "Access blocked (403)", y el inicio de sesión tampoco funciona. Usa un servidor local:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## Estructura

```
index.html                 página principal
terminos.html, privacidad.html   páginas legales (borrador)
css/styles.css, legal.css  estilos
js/config.js               mapa (teselas, centro, límites) y llaves públicas de Supabase
js/data.js                 actividades de ejemplo (modo local)
js/cloud.js                conexión con Supabase (cuentas, datos, moderación)
js/app.js                  lógica de la interfaz
sw.js, manifest.webmanifest, icons/   app instalable (PWA)
supabase/                  SQL de la base de datos, plantillas de correo y guía (LEEME.md)
```

La guía para montar la base de datos, el panel de admin y los correos está en [supabase/LEEME.md](supabase/LEEME.md).

## Publicarlo en la web con GitHub Pages (gratis)

1. Sube el repositorio a GitHub (público; el plan gratuito de Pages lo requiere).
2. **Settings → Pages → Build and deployment**: *Deploy from a branch*, rama `main`, carpeta `/ (root)`.
3. Espera 1–2 minutos: la página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
4. En Supabase → **Authentication → URL Configuration**, pon esa dirección como **Site URL** y agrega `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/**` en **Redirect URLs** (conserva también `http://localhost:8000/**` para desarrollar). Sin esto el enlace del correo no vuelve a la página publicada.
5. Cada vez que subas cambios a `main`, Pages se actualiza solo.

La llave `publishable` de `js/config.js` es pública por diseño: la seguridad la ponen las reglas RLS de `supabase/schema.sql`. **Nunca** subas una llave `service_role` o `secret`.

## Sobre el mapa y OpenStreetMap

- El mapa muestra la atribución obligatoria "© OpenStreetMap contributors". No la quites.
- El servidor público de teselas de OpenStreetMap **no está pensado para tráfico alto** de una app en producción ([política de uso](https://operations.osmfoundation.org/policies/tiles/)). Para el piloto está bien; antes de crecer, cambia `TILE_URL` en `js/config.js` por un proveedor con plan para aplicaciones (MapTiler, Stadia Maps) o por teselas propias.
- Para buscar direcciones al publicar una actividad se puede usar Nominatim o Photon, que también tienen límites de uso. Las direcciones de Bogotá (por ejemplo "KR 30 25 90") a veces se resuelven mejor con el geocodificador de IDECA; está pendiente confirmar si ofrecen una API.

## Próximos pasos sugeridos

1. Cambiar el proveedor de mapas antes de abrir al público (ver arriba).
2. Servidor de correo propio (SMTP) y plantillas con la marca (`supabase/email-*.html`).
3. Completar y hacer revisar las páginas legales.
4. Verificación de organizaciones.
5. Sección de animales perdidos con reporte, foto y último lugar visto.
6. Capas oficiales de IDECA (localidades, parques) sobre el mapa, una vez confirmada la licencia.

## Datos de ejemplo

Las actividades, organizaciones y personas del prototipo son ficticias, y las coordenadas son aproximadas. Los lugares mencionados se usan solo como referencia geográfica.

## Licencia

Por definir por el equipo. Mientras no haya una licencia, todos los derechos quedan reservados.
