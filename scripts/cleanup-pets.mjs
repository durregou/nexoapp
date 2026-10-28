// Limpieza diaria de NexoApp: borra los avisos de mascotas vencidos y sus fotos de Supabase Storage.
//
// Por qué esto no está dentro de la base de datos: borrar un archivo de Storage desde SQL no lo elimina
// de verdad; hay que usar la API de Storage, y para eso hace falta la llave de servicio (service_role).
// Esa llave vive solo como "secret" de GitHub Actions: nunca en el código ni en el navegador.
//
// Qué borra:
//   1. Avisos que vencieron hace más de 7 días (también los «Ya apareció», que vencen el día que se resuelven)
//      y avisos rechazados con más de 30 días. Se borra la foto y la fila (con ella, el celular y los reportes).
//   2. Fotos huérfanas: archivos del bucket que ningún aviso usa y que tienen más de 24 horas
//      (por ejemplo, subidas que fallaron a medias o de cuentas eliminadas).
//
// Uso:  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/cleanup-pets.mjs [--dry-run]

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const DRY = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const BUCKET = 'pet-photos';
const GRACE_DAYS = 7, REJECTED_DAYS = 30, ORPHAN_HOURS = 24, MAX_ORPHANS = 50;

if(!BASE || !KEY){
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY (configúralos como secrets del repositorio).');
  process.exit(1);
}
const HEADERS = {apikey:KEY, Authorization:'Bearer ' + KEY};
const call = (path, opts = {}) => fetch(BASE + path, {...opts, headers:{...HEADERS, ...(opts.headers || {})}});
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);   // fecha de Bogotá (UTC-5)
let errors = 0;
const log = (...a) => console.log(DRY ? '[SIMULACRO]' : '', ...a);

async function deletePhoto(path){
  if(DRY){ log('borraría la foto', path); return true; }
  const r = await call(`/storage/v1/object/${BUCKET}/${enc(path)}`, {method:'DELETE'});
  if(r.ok || r.status === 404) return true;          // 404: ya no existía, da igual
  errors++; console.error('No se pudo borrar la foto', path, r.status, (await r.text()).slice(0, 120));
  return false;
}

// 1) Avisos vencidos
const expiredBefore = addDays(today, -GRACE_DAYS);
const rejectedBefore = new Date(Date.now() - REJECTED_DAYS * 864e5).toISOString();
const q = new URLSearchParams({
  select:'id,photo_path,status,expires_on',
  or:`(expires_on.lt.${expiredBefore},and(status.eq.rejected,created_at.lt.${rejectedBefore}))`,
  limit:'1000'
});
const rs = await call('/rest/v1/pets?' + q);
if(!rs.ok){ console.error('No se pudieron consultar los avisos', rs.status, (await rs.text()).slice(0, 200)); process.exit(1); }
const expired = await rs.json();
log(`avisos para limpiar: ${expired.length} (vencidos antes de ${expiredBefore} o rechazados hace más de ${REJECTED_DAYS} días)`);
let removedRows = 0, removedPhotos = 0;
for(const p of expired){
  if(p.photo_path){
    if(!(await deletePhoto(p.photo_path))) continue;   // si la foto falló, se reintenta mañana (no se pierde el rastro)
    removedPhotos++;
  }
  if(DRY){ log('borraría el aviso', p.id); removedRows++; continue; }
  const d = await call(`/rest/v1/pets?id=eq.${p.id}`, {method:'DELETE', headers:{Prefer:'return=minimal'}});
  if(d.ok) removedRows++; else { errors++; console.error('No se pudo borrar el aviso', p.id, d.status); }
}

// 2) Fotos huérfanas
async function referencedPaths(){
  const set = new Set();
  for(let from = 0; ; from += 1000){
    const r = await call('/rest/v1/pets?select=photo_path&photo_path=not.is.null', {headers:{Range:`${from}-${from + 999}`, 'Range-Unit':'items'}});
    if(!r.ok) throw new Error('consulta de fotos en uso: ' + r.status);
    const rows = await r.json();
    rows.forEach(x => set.add(x.photo_path));
    if(rows.length < 1000) return set;
  }
}
async function listFolder(prefix){
  const out = [];
  for(let offset = 0; ; offset += 1000){
    const r = await call(`/storage/v1/object/list/${BUCKET}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prefix, limit:1000, offset, sortBy:{column:'name', order:'asc'}})
    });
    if(!r.ok) throw new Error('listado de ' + (prefix || 'la raíz') + ': ' + r.status);
    const rows = await r.json();
    out.push(...rows);
    if(rows.length < 1000) return out;
  }
}
let orphans = [];
try {
  const used = await referencedPaths();                 // si esto falla, NO se borra ningún archivo
  const cutoff = Date.now() - ORPHAN_HOURS * 3600e3;
  for(const entry of await listFolder('')){
    if(entry.id) continue;                              // solo carpetas (una por persona)
    for(const f of await listFolder(entry.name)){
      if(!f.id) continue;
      const path = `${entry.name}/${f.name}`;
      const created = Date.parse(f.created_at || f.updated_at || '');
      if(!used.has(path) && Number.isFinite(created) && created < cutoff) orphans.push(path);
    }
  }
} catch(e){
  errors++; console.error('Se omite la revisión de fotos huérfanas:', e.message); orphans = [];
}
let removedOrphans = 0;
if(orphans.length > MAX_ORPHANS){
  errors++; console.error(`Hay ${orphans.length} fotos huérfanas (más de ${MAX_ORPHANS}). No borro nada por seguridad: revísalas a mano.`);
} else {
  log(`fotos huérfanas: ${orphans.length}`);
  for(const path of orphans) if(await deletePhoto(path)) removedOrphans++;
}

console.log(`${DRY ? 'Simulacro terminado' : 'Listo'}: ${removedRows} avisos, ${removedPhotos} fotos de avisos, ${removedOrphans} fotos huérfanas, ${errors} errores.`);
process.exit(errors ? 1 : 0);
