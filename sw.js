/* Service worker de NexoApp: permite instalarla y abrirla aunque falle la conexión.
   - Archivos propios: primero la red (así las actualizaciones llegan), y si no hay red, la copia guardada.
   - Librerías y tipografías externas: se sirven de la copia y se actualizan en segundo plano.
   - Datos (Supabase) y mapas (OpenStreetMap): nunca se guardan; siempre van a la red. */
const VERSION = 'nexoapp-v1';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/config.js', 'js/data.js', 'js/cloud.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon-192.png'];
const CDN = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin === location.origin){
    e.respondWith(fetch(req).then(res => {
      if(res.ok){ const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
  } else if(CDN.includes(url.hostname)){
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if(res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
