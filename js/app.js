(function(){
'use strict';
const CFG = window.NEXO_CONFIG, ACTS = window.NEXO_ACTIVITIES, LOCS = window.NEXO_LOCALIDADES;
/* con Supabase configurado los datos viven en la nube; si no, todo queda en este navegador */
const CLOUD = window.NexoCloud && window.NexoCloud.enabled ? window.NexoCloud : null;

const CAT = {
  aprender:{name:'Aprender', long:'Clase o taller', icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.500C3 5.200 3.200 5 3.500 5H10a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H3.500a.5.5 0 0 1-.5-.5zM21 5.500c0-.3-.2-.5-.5-.5H14a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6.500a.5.5 0 0 0 .5-.5z"/></svg>'},
  social:{name:'Ayuda social', long:'Jornada solidaria', icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8-4.800-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 10c0 6.200-8 11-8 11z"/></svg>'},
  animales:{name:'Animales', long:'Protección animal', icon:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="5.500" cy="11" rx="2" ry="2.600"/><ellipse cx="9.500" cy="6.500" rx="2" ry="2.600"/><ellipse cx="14.500" cy="6.500" rx="2" ry="2.600"/><ellipse cx="18.500" cy="11" rx="2" ry="2.600"/><path d="M12 11c-3 0-5.500 3-5.500 5.500 0 2 1.700 2.800 3.200 2.500 1-.2 1.500-.5 2.300-.5s1.300.3 2.300.5c1.500.3 3.200-.5 3.200-2.500C17.500 14 15 11 12 11z"/></svg>'}
};

const state = {picking:false, cat:'todas', when:'todas', q:'', loc:'', sel:null, user:null, authUser:null, isAdmin:false, pets:[], myPets:[], pendingPets:[], petReports:[], showPets:true, reportKind:'activity', petKind:'todos', petSpecies:'todas', myPubs:[], pending:[], reports:[], hashDone:false, reportId:null, busy:false, nearOn:false, joined:loadJoined()};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---- inscripciones guardadas solo en este navegador ---- */
function loadJoined(){
  if(CLOUD) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem('nexo-joined') || '[]')); } catch(e){ return new Set(); }
}
function saveJoined(){
  if(CLOUD) return;
  try { localStorage.setItem('nexo-joined', JSON.stringify([...state.joined])); } catch(e){}
}

/* ---- utilidades ---- */
const count = a => a.taken + (state.joined.has(a.id) ? 1 : 0);
const left = a => a.total - count(a);
function when(a){
  const d = new Date(a.date + 'T' + a.time);
  const day = d.toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short'}).replace('.','');
  const t = d.toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit',hour12:true});
  return day.charAt(0).toUpperCase() + day.slice(1) + ', ' + t;
}
/* ---- fechas ---- */
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const WHENS = [['todas','Todas las fechas'], ['hoy','Hoy'], ['semana','Esta semana'], ['finde','Fin de semana'], ['mes','Este mes']];
/* ¿La actividad cae en el filtro de fecha? Las que ya pasaron nunca se muestran. */
function inWhen(a, w){
  const now = new Date(), today = iso(now), dow = now.getDay();
  if(a.date < today) return false;
  if(w === 'hoy') return a.date === today;
  if(w === 'semana') return a.date <= iso(addDays(now, dow === 0 ? 0 : 7 - dow)); // hasta el domingo
  if(w === 'finde'){
    const day = new Date(a.date + 'T12:00').getDay();
    return (day === 6 || day === 0) && a.date <= iso(addDays(now, dow === 0 ? 0 : 7 - dow));
  }
  if(w === 'mes') return a.date.slice(0,7) === today.slice(0,7);
  return true;
}
function km(a){
  if(!state.user) return null;
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(a.lat - state.user.lat), dLng = rad(a.lng - state.user.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(state.user.lat)) * Math.cos(rad(a.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
let toastT;
function toast(msg){ const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), Math.max(2600, msg.length * 70)); }

function filtered(){
  const q = state.q.trim().toLowerCase();
  const list = ACTS.filter(a =>
    (state.cat === 'todas' || a.cat === state.cat) &&
    inWhen(a, state.when) &&
    (!state.loc || a.loc === state.loc) &&
    (!q || (a.title + ' ' + a.host + ' ' + a.desc + ' ' + a.loc + ' ' + a.place).toLowerCase().includes(q)));
  if(state.nearOn && state.user) return list.sort((x,y) => km(x) - km(y));
  return list.sort((x,y) => (x.date + x.time).localeCompare(y.date + y.time));
}

/* ---- mapa ---- */
const map = L.map('map', {minZoom:CFG.MIN_ZOOM, maxBounds:CFG.BOUNDS, maxBoundsViscosity:0.8}).setView(CFG.CENTER, CFG.ZOOM);
L.tileLayer(CFG.TILE_URL, {maxZoom:19, attribution:CFG.TILE_ATTRIBUTION}).addTo(map);
const makeCluster = cls => L.markerClusterGroup ? L.markerClusterGroup({
  showCoverageOnHover:false, maxClusterRadius:46,
  zoomToBoundsOnClick:false, spiderfyOnMaxZoom:false,   /* el clic se maneja abajo, en 'clusterclick' */
  iconCreateFunction: c => L.divIcon({className:'', html:'<span class="nx-cluster ' + cls + '">' + c.getChildCount() + '</span>', iconSize:[40,40]})
}) : L.layerGroup();
const layer = makeCluster('').addTo(map);          /* actividades */
const petLayer = makeCluster('petc').addTo(map);   /* mascotas, con su propio grupo y color */
const markers = new Map();
let meMarker = null;

/* Al tocar un grupo: si sus pines están en el mismo punto (varias actividades en un mismo lugar) el
   zoom nunca los separa, así que se abren en abanico; si no, el mapa se acerca a ellos. */
const onClusterClick = e => {
  const c = e.layer, b = c.getBounds();
  if(map.distance(b.getSouthWest(), b.getNorthEast()) < 40) c.spiderfy();
  else c.zoomToBounds({padding:[48, 48]});
};
if(layer.on) layer.on('clusterclick', onClusterClick);
if(petLayer.on) petLayer.on('clusterclick', onClusterClick);

function pinIcon(a, sel){
  return L.divIcon({className:'', html:'<span class="pin ' + a.cat + (sel ? ' sel' : '') + '">' + CAT[a.cat].icon + '</span>', iconSize:[34,34], iconAnchor:[17,17], popupAnchor:[0,-18]});
}
function popupHtml(a){
  return '<div class="pop"><strong>' + esc(a.title) + '</strong><span>' + esc(when(a)) + '</span><br><button type="button" data-open="' + a.id + '">Ver detalles</button></div>';
}
function petIcon(p){
  return L.divIcon({className:'', html:'<span class="pin pet ' + p.kind + '">' + CAT.animales.icon + '</span>', iconSize:[34,34], iconAnchor:[17,17], popupAnchor:[0,-18]});
}
function petPopup(p){
  return '<div class="pop">' + (p.photo ? '<img class="pop-img" src="' + esc(p.photo) + '" alt="">' : '') +
    '<strong>' + esc(petName(p)) + '</strong><span>' + KIND_LABEL[p.kind] + ' · ' + SPECIES[p.species] + ' · ' + fmtDay(p.seen) + '</span><br>' +
    '<button type="button" data-petopen="' + p.id + '">Ver aviso</button></div>';
}
/* Mascotas en el mapa de Explorar: pin cuadrado con huella (rojo = perdido, verde = encontrado). */
function drawPets(){
  petLayer.clearLayers();
  document.querySelectorAll('[data-petmap]').forEach(b => { b.hidden = !CLOUD; b.setAttribute('aria-pressed', String(state.showPets)); });
  const row = document.querySelector('.petrow'); if(row) row.hidden = !CLOUD;
  if(!CLOUD || !state.showPets) return;
  state.pets.forEach(p => {
    if(!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    L.marker([p.lat, p.lng], {icon:petIcon(p), title:KIND_LABEL[p.kind] + ': ' + petName(p), keyboard:true, riseOnHover:true})
      .bindPopup(petPopup(p)).addTo(petLayer);
  });
}
function drawMarkers(list, fit){
  layer.clearLayers(); markers.clear();
  list.forEach(a => {
    const m = L.marker([a.lat, a.lng], {icon:pinIcon(a, state.sel === a.id), title:a.title, keyboard:true, riseOnHover:true});
    m.bindPopup(popupHtml(a));
    m.on('click', () => select(a.id, {fromMap:true}));
    m.addTo(layer);
    markers.set(a.id, m);
  });
  if(fit && list.length){
    const pts = list.map(a => [a.lat, a.lng]);
    if(state.user) pts.push([state.user.lat, state.user.lng]);
    map.fitBounds(pts, {padding:[48,48], maxZoom:14});
  }
}

/* ---- lista ---- */
function card(a){
  const d = km(a), full = left(a) <= 0;
  return '<button type="button" class="act" data-cat="' + a.cat + '" data-id="' + a.id + '"' + (state.sel === a.id ? ' aria-current="true"' : '') + '>' +
    '<span class="edge"></span><span class="body">' +
    '<span class="kind">' + CAT[a.cat].long + '</span>' +
    '<h3>' + esc(a.title) + '</h3>' +
    '<span class="meta">' + esc(when(a)) + ' · ' + esc(a.loc) + (d != null ? ' · a ' + d.toFixed(1).replace('.', ',') + ' km' : '') + '</span>' +
    '<span class="meta">' + (full ? 'Cupos completos' : left(a) + ' cupos libres') + '</span>' +
    (state.joined.has(a.id) ? '<span class="badge">Estás inscrito</span>' : '') +
    '</span></button>';
}
function renderChips(){
  const all = [['todas','Todas'], ['aprender','Aprender'], ['social','Ayuda social'], ['animales','Animales']];
  $('chips').innerHTML = all.map(c => '<button type="button" class="chip" data-cat="' + c[0] + '" aria-pressed="' + (state.cat === c[0]) + '">' + (c[0] !== 'todas' ? '<i></i>' : '') + c[1] + '</button>').join('');
}
function renderWhens(){
  $('whens').innerHTML = WHENS.map(w => '<button type="button" class="chip" data-when="' + w[0] + '" aria-pressed="' + (state.when === w[0]) + '">' + w[1] + '</button>').join('');
}
/* La barra inferior no mide siempre lo mismo (zona segura del iPhone, pestaña de admin, tamaño de letra):
   se mide y se guarda para que el contenido y el panel de filtros queden exactamente encima de ella. */
function syncTabbar(){
  const tb = document.querySelector('.tabbar');
  if(tb && tb.offsetHeight) document.documentElement.style.setProperty('--tabbar-h', tb.offsetHeight + 'px');
}
window.addEventListener('resize', syncTabbar);
window.addEventListener('orientationchange', syncTabbar);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(syncTabbar);
/* ---- panel de filtros sobre el mapa (celular) ---- */
function setSheet(open){
  if(open) syncTabbar();
  document.body.classList.toggle('sheet-open', !!open);
  $('sheetBack').hidden = !open;
  $('filterBtn').setAttribute('aria-expanded', String(!!open));
  if(open) $('sheetDone').focus(); else if(document.activeElement === $('sheetDone')) $('filterBtn').focus();
}
function updateFilterBadge(){
  const n = (state.cat !== 'todas') + (state.when !== 'todas') + (state.loc ? 1 : 0) + (state.q.trim() ? 1 : 0) + (state.nearOn ? 1 : 0) + (CLOUD && !state.showPets ? 1 : 0);
  const b = $('filterN'); b.hidden = !n; b.textContent = n;
}
function render(fit){
  const list = filtered();
  $('count').textContent = list.length + (list.length === 1 ? ' actividad' : ' actividades');
  $('list').innerHTML = list.length ? list.map(card).join('') : '<div class="empty"><strong>Sin resultados</strong>Quita algún filtro, prueba otra fecha o cambia la búsqueda para ver más actividades.</div>';
  drawMarkers(list, fit);
  drawPets();
  updateFilterBadge();
  renderChips();
  renderWhens();
  renderHome();
  renderProfile();
  renderAdmin();
  renderPets();
}

/* ---- selección ---- */
function select(id, opts){
  opts = opts || {};
  state.sel = id;
  markers.forEach((m, mid) => m.setIcon(pinIcon(ACTS.find(x => x.id === mid), mid === id)));
  document.querySelectorAll('.act').forEach(el => {
    if(+el.dataset.id === id){ el.setAttribute('aria-current', 'true'); if(opts.fromMap) el.scrollIntoView({block:'nearest'}); }
    else el.removeAttribute('aria-current');
  });
  const a = ACTS.find(x => x.id === id), m = markers.get(id);
  if(a && !opts.fromMap){
    map.setView([a.lat, a.lng], Math.max(map.getZoom(), 15), {animate:false});
    if(m && layer.zoomToShowLayer) layer.zoomToShowLayer(m, () => m.openPopup());   /* si estaba dentro de un grupo, lo abre */
    else if(m) m.openPopup();
  }
}

/* ---- detalle ---- */
function openDetail(id){
  const a = ACTS.find(x => x.id === id); if(!a) return;
  const j = state.joined.has(id), full = left(a) <= 0 && !j;
  const dlg = $('detail');
  dlg.innerHTML =
    '<div class="d-head" data-cat="' + a.cat + '"><span>' + CAT[a.cat].long + '</span><h2 id="d-title">' + esc(a.title) + '</h2><p>Organiza ' + esc(a.host) + '</p></div>' +
    '<div class="d-body">' +
      '<p>' + esc(a.desc) + '</p>' +
      '<div class="facts"><div><strong>' + esc(when(a)) + '</strong></div>' +
      '<div><strong>' + esc(a.place) + '</strong><br><span>' + esc(a.loc) + ', Bogotá</span></div>' +
      '<div><strong>' + (full ? 'Cupos completos' : left(a) + ' cupos libres') + '</strong><br><span>' + count(a) + ' de ' + a.total + ' inscritos · Gratis</span></div></div>' +
      '<div class="bar" aria-hidden="true"><b style="width:' + Math.min(100, count(a) / a.total * 100) + '%"></b></div>' +
      (safeLink(a.link) ? '<a class="btn ghost block" target="_blank" rel="noopener noreferrer nofollow" href="' + esc(safeLink(a.link)) + '">' + esc(linkLabel(safeLink(a.link), a.host)) + '</a>' : '') +
      '<div class="d-actions">' +
        '<button type="button" class="btn block" data-join="' + id + '"' + (full ? ' disabled' : '') + '>' + (j ? 'Cancelar mi inscripción' : full ? 'Sin cupos' : 'Inscribirme') + '</button>' +
        '<div class="d-share">' +
          '<a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(shareText(a)) + '">WhatsApp</a>' +
          '<button type="button" class="btn ghost" data-ics="' + id + '">Calendario</button>' +
          '<button type="button" class="btn ghost" data-copy="' + id + '">Copiar enlace</button>' +
        '</div>' +
        '<a class="link" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + a.lat + '&mlon=' + a.lng + '#map=17/' + a.lat + '/' + a.lng + '">Ver el lugar en OpenStreetMap</a>' +
        ((a.mine || state.isAdmin) ? '<button type="button" class="btn ghost block" data-del="' + id + '">' + (a.mine ? 'Eliminar mi actividad' : 'Quitar actividad (admin)') + '</button>' : '') +
        '<button type="button" class="btn ghost block" data-close="1">Cerrar</button>' +
        (CLOUD && !a.mine ? '<button type="button" class="reportlink" data-report="' + id + '">Reportar esta actividad</button>' : '') +
      '</div></div>';
  if(dlg.open) return;
  if(typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

/* ---- ubicación del usuario (solo se usa en el navegador, no se envía a ningún servidor) ---- */
function setUser(lat, lng){
  state.user = {lat:lat, lng:lng};
  state.nearOn = true; state.picking = false; setSheet(false);
  map.getContainer().style.cursor = '';
  if(meMarker) meMarker.remove();
  meMarker = L.marker([lat, lng], {icon:L.divIcon({className:'', html:'<span class="me"></span>', iconSize:[16,16], iconAnchor:[8,8]}), interactive:false, keyboard:false}).addTo(map);
  const btn = $('near');
  btn.disabled = false; btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Cerca de mí ✓';
  if(map.distance([lat, lng], CFG.CENTER) > 60000) toast('Parece que estás fuera de Bogotá, las distancias son desde ese punto.');
  render(true);
}
/* si no hay GPS o permiso, la persona marca su ubicación tocando el mapa */
function pickOnMap(msg){
  setSheet(false);
  const btn = $('near');
  btn.disabled = false; btn.textContent = 'Cerca de mí';
  state.picking = true;
  map.getContainer().style.cursor = 'crosshair';
  toast(msg + ' Toca el mapa para marcar dónde estás.');
  document.body.classList.remove('view-list'); document.body.classList.add('view-map');
  setPage('explore', true);
  document.querySelectorAll('.toggle button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === 'map'));
  setTimeout(() => map.invalidateSize(), 50);
}
map.on('click', e => { if(state.picking) setUser(e.latlng.lat, e.latlng.lng); });

function locate(){
  const btn = $('near');
  if(state.picking){ state.picking = false; map.getContainer().style.cursor = ''; return; }
  if(state.nearOn){
    state.nearOn = false; btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Cerca de mí';
    render(true); return;
  }
  if(!navigator.geolocation){ pickOnMap('Tu navegador no permite obtener la ubicación.'); return; }
  btn.disabled = true; btn.textContent = 'Buscando…';
  navigator.geolocation.getCurrentPosition(
    pos => setUser(pos.coords.latitude, pos.coords.longitude),
    err => {
      const msgs = {
        1:'El navegador no tiene permiso para usar tu ubicación.',
        2:'No se pudo determinar tu ubicación.',
        3:'La ubicación tardó demasiado.'
      };
      pickOnMap(msgs[err.code] || 'No pudimos obtener tu ubicación.');
    },
    {timeout:10000, maximumAge:60000});
}

/* ---- eventos ---- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-id],[data-cat],[data-open],[data-join],[data-close],[data-view],[data-when],[data-pub],[data-pubclose],[data-del],[data-page]:not(body),[data-login],[data-loginclose],[data-logout],[data-editname],[data-nameclose],[data-approve],[data-reject],[data-ics],[data-copy],[data-report],[data-reportclose],[data-dismiss],[data-install],[data-lmode],[data-forgot],[data-showpw],[data-passclose],[data-delclose],[data-chpass],[data-delacct],[data-signup],[data-petnew],[data-petkind],[data-petspecies],[data-petopen],[data-ptkind],[data-ptclose],[data-petresolve],[data-petdel],[data-petcopy],[data-petapprove],[data-petreject],[data-petmap],[data-reportpet],[data-petdismiss]');
  if(!t) return;
  if(t.dataset.page){
    if(t.dataset.setcat){ state.cat = t.dataset.setcat; state.when = 'todas'; }
    setPage(t.dataset.page);
  }
  else if(t.dataset.petmap){ state.showPets = !state.showPets; drawPets(); }
  else if(t.dataset.reportpet){ openReport(+t.dataset.reportpet, 'pet'); }
  else if(t.dataset.petdismiss){ dismissPetReports(+t.dataset.petdismiss); }
  else if(t.dataset.petnew){ openPetForm(); }
  else if(t.dataset.petkind){ state.petKind = t.dataset.petkind; renderPets(); }
  else if(t.dataset.petspecies){ state.petSpecies = t.dataset.petspecies; renderPets(); }
  else if(t.dataset.petopen){ openPet(+t.dataset.petopen); }
  else if(t.dataset.ptkind){ setPetKind(t.dataset.ptkind); }
  else if(t.dataset.ptclose){ $('petdlg').close(); }
  else if(t.dataset.petresolve){ resolvePetReport(+t.dataset.petresolve); }
  else if(t.dataset.petdel){ deletePetReport(+t.dataset.petdel); }
  else if(t.dataset.petcopy){ copyPetLink(+t.dataset.petcopy); }
  else if(t.dataset.petapprove){ moderatePet(+t.dataset.petapprove, 'approved'); }
  else if(t.dataset.petreject){ moderatePet(+t.dataset.petreject, 'rejected'); }
  else if(t.dataset.view){
    document.body.classList.remove('view-list', 'view-map'); document.body.classList.add('view-' + t.dataset.view);
    document.querySelectorAll('.toggle button').forEach(b => b.setAttribute('aria-pressed', b === t));
    setSheet(false);
    if(t.dataset.view === 'map') setTimeout(() => map.invalidateSize(), 50);
  }
  else if(t.dataset.pub){ openPublish(); }
  else if(t.dataset.pubclose){ $('publish').close(); }
  else if(t.dataset.del){ removeMine(+t.dataset.del); }
  else if(t.dataset.when){ state.when = t.dataset.when; render(true); }
  else if(t.classList.contains('chip')){ state.cat = t.dataset.cat; render(true); }
  else if(t.dataset.open){ openDetail(+t.dataset.open); }
  else if(t.dataset.join){ toggleJoin(+t.dataset.join); }
  else if(t.dataset.login){ openLogin(); }
  else if(t.dataset.loginclose){ $('login').close(); }
  else if(t.dataset.signup){ openLogin(null, 'up'); }
  else if(t.dataset.lmode){ setLoginMode(t.dataset.lmode); }
  else if(t.dataset.forgot){ setLoginMode('reset'); }
  else if(t.dataset.showpw){ const f = $(t.dataset.showpw); f.type = f.type === 'password' ? 'text' : 'password'; t.textContent = f.type === 'password' ? 'Ver' : 'Ocultar'; }
  else if(t.dataset.passclose){ $('passdlg').close(); }
  else if(t.dataset.delclose){ $('deldlg').close(); }
  else if(t.dataset.chpass){ openNewPass(false); }
  else if(t.dataset.delacct){ openDelete(); }
  else if(t.dataset.ics){ downloadIcs(+t.dataset.ics); }
  else if(t.dataset.copy){ copyLink(+t.dataset.copy); }
  else if(t.dataset.report){ openReport(+t.dataset.report); }
  else if(t.dataset.reportclose){ $('reportdlg').close(); }
  else if(t.dataset.dismiss){ dismissReports(+t.dataset.dismiss); }
  else if(t.dataset.install){ installApp(); }
  else if(t.dataset.approve){ moderate(+t.dataset.approve, 'approved'); }
  else if(t.dataset.reject){ moderate(+t.dataset.reject, 'rejected'); }
  else if(t.dataset.editname){ openNameDlg(); }
  else if(t.dataset.nameclose){ $('namedlg').close(); }
  else if(t.dataset.logout){ CLOUD.signOut().then(() => toast('Cerraste sesión')); }
  else if(t.dataset.close){ $('detail').close(); }
  else if(t.classList.contains('act') && t.dataset.id){
    const id = +t.dataset.id;
    select(id);
    if(t.closest('#home, #profile') || window.matchMedia('(max-width: 899px)').matches){ openDetail(id); }
  }
});
$('filterBtn').addEventListener('click', () => setSheet(true));
$('sheetDone').addEventListener('click', () => setSheet(false));
$('sheetBack').addEventListener('click', () => setSheet(false));
document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.body.classList.contains('sheet-open')) setSheet(false); });
$('q').addEventListener('input', e => { state.q = e.target.value; render(true); });
$('loc').addEventListener('change', e => { state.loc = e.target.value; render(true); });
$('near').addEventListener('click', locate);
$('detail').addEventListener('click', e => { if(e.target === $('detail')) $('detail').close(); });

/* ---- chips deslizables: arrastre con mouse, rueda y degradados en los bordes ---- */
['chips','whens'].forEach(id => (function(){
  const el = $(id);
  let down = false, moved = false, x0 = 0, s0 = 0;
  function edges(){
    el.classList.toggle('fade-l', el.scrollLeft > 4);
    el.classList.toggle('fade-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }
  el.addEventListener('scroll', edges, {passive:true});
  window.addEventListener('resize', edges);
  new MutationObserver(edges).observe(el, {childList:true});
  el.addEventListener('wheel', e => {
    if(el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, {passive:false});
  el.addEventListener('pointerdown', e => {
    if(e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false; x0 = e.clientX; s0 = el.scrollLeft;
  });
  window.addEventListener('pointermove', e => {
    if(!down) return;
    const dx = e.clientX - x0;
    if(!moved && Math.abs(dx) > 5){ moved = true; el.classList.add('dragging'); }
    if(moved) el.scrollLeft = s0 - dx;
  });
  window.addEventListener('pointerup', () => {
    if(!down) return;
    down = false; el.classList.remove('dragging');
  });
  /* tras arrastrar no debe contar como clic en un chip */
  el.addEventListener('click', e => { if(moved){ e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  edges();
})());

/* ---- publicar actividades (se guardan solo en este navegador) ---- */
const MINE_KEY = 'nexo-mine';
const TXT = (v, n) => typeof v === 'string' && v.trim() && v.length <= n;
function loadMine(){
  try {
    const raw = JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(a => a && Number.isFinite(a.id) && CAT[a.cat] && TXT(a.title, 80) && TXT(a.host, 60) &&
      TXT(a.place, 90) && TXT(a.desc, 400) && LOCS.includes(a.loc) && Number.isFinite(a.lat) && Number.isFinite(a.lng) &&
      /^\d{4}-\d{2}-\d{2}$/.test(a.date) && /^\d{2}:\d{2}$/.test(a.time) && a.total >= 1).map(a => Object.assign({}, a, {mine:true, taken:0})) : [];
  } catch(e){ return []; }
}
function saveMine(){
  if(CLOUD) return true;
  try { localStorage.setItem(MINE_KEY, JSON.stringify(ACTS.filter(a => a.mine))); return true; } catch(e){ return false; }
}
let pmap = null, pmark = null, ppoint = null;
function setPoint(latlng){
  ppoint = latlng;
  if(pmark) pmark.setLatLng(latlng); else pmark = L.marker(latlng).addTo(pmap);
  $('pmap-hint').textContent = 'Lugar marcado. Toca otro punto si quieres moverlo.';
}
function openPublish(){
  if(CLOUD && !state.authUser){ openLogin('Inicia sesión para publicar una actividad.'); return; }
  const dlg = $('publish'), f = $('pform');
  f.reset(); ppoint = null;
  if(fullName()) $('f-host').value = fullName();
  $('p-err').hidden = true;
  $('f-date').min = iso(new Date());
  $('pmap-hint').textContent = 'Toca el mapa para marcar el lugar exacto.';
  if(!$('f-loc').options.length){
    LOCS.forEach(l => { const o = document.createElement('option'); o.value = o.textContent = l; $('f-loc').appendChild(o); });
  }
  if(typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  if(!pmap){
    pmap = L.map('pmap', {minZoom:CFG.MIN_ZOOM, maxBounds:CFG.BOUNDS, maxBoundsViscosity:0.8}).setView(CFG.CENTER, 11);
    L.tileLayer(CFG.TILE_URL, {maxZoom:19, attribution:CFG.TILE_ATTRIBUTION}).addTo(pmap);
    pmap.on('click', e => setPoint(e.latlng));
  }
  if(pmark){ pmark.remove(); pmark = null; }
  pmap.setView(CFG.CENTER, 11);
  setTimeout(() => pmap.invalidateSize(), 60);
  $('f-title').focus();
}
function fail(msg, el){ const e = $('p-err'); e.textContent = msg; e.hidden = false; if(el) el.focus(); return false; }
async function submitPublish(ev){
  ev.preventDefault();
  if(state.busy) return false;
  const v = id => $(id).value.trim();
  const title = v('f-title'), host = v('f-host'), place = v('f-place'), desc = v('f-desc');
  const date = v('f-date'), time = v('f-time'), total = parseInt($('f-total').value, 10);
  if(title.length < 3) return fail('El título debe tener al menos 3 caracteres.', $('f-title'));
  if(host.length < 2) return fail('Dinos quién organiza (mínimo 2 caracteres).', $('f-host'));
  if(!date) return fail('Elige la fecha.', $('f-date'));
  if(!time) return fail('Elige la hora.', $('f-time'));
  if(new Date(date + 'T' + time) <= new Date()) return fail('La fecha y hora deben ser futuras.', $('f-date'));
  if(!Number.isFinite(total) || total < 1 || total > 500) return fail('Los cupos deben estar entre 1 y 500.', $('f-total'));
  if(place.length < 2) return fail('Escribe el nombre del lugar (mínimo 2 caracteres).', $('f-place'));
  if(!ppoint) return fail('Toca el mapa para marcar dónde será.', null);
  if(desc.length < 5) return fail('Cuéntanos un poco más de la actividad: la descripción necesita al menos 5 caracteres.', $('f-desc'));
  const [[s0, w0], [n0, e0]] = CFG.BOUNDS;
  if(ppoint.lat < s0 || ppoint.lat > n0 || ppoint.lng < w0 || ppoint.lng > e0) return fail('El lugar debe estar dentro de Bogotá.', null);
  const link = normLink($('f-link').value);
  if(link === null) return fail('Escribe un enlace válido (por ejemplo https://instagram.com/tu_cuenta o @tu_cuenta) o déjalo vacío.', $('f-link'));
  let status = 'approved';
  let id = Math.max(1000, ...ACTS.map(a => a.id)) + 1;
  const a = {id:id, mine:true, cat:$('f-cat').value, title:title, host:host, loc:$('f-loc').value, place:place,
    lat:+ppoint.lat.toFixed(5), lng:+ppoint.lng.toFixed(5), date:date, time:time, total:total, taken:0, desc:desc, link:link};
  if(CLOUD){
    state.busy = true;
    const btn = $('pform').querySelector('[type=submit]'); btn.disabled = true;
    try { const r = await CLOUD.create(a); id = a.id = r.id; status = r.status; }
    catch(e){ return fail(CLOUD.friendly(e), null); }
    finally { state.busy = false; btn.disabled = false; }
    a.status = status; state.myPubs.unshift(a);
    if(status !== 'approved'){
      $('publish').close(); setPage('profile'); render(false);
      toast('Enviada. La revisaremos y aparecerá en Explorar cuando se apruebe.');
      return false;
    }
  }
  ACTS.push(a);
  const saved = saveMine();
  $('publish').close();
  state.cat = 'todas'; state.when = 'todas'; state.loc = ''; state.q = ''; $('q').value = ''; $('loc').value = '';
  setPage('explore', true); render(true); select(id);
  toast(saved ? 'Actividad publicada' : 'Publicada, pero no se pudo guardar en este navegador');
  return false;
}
async function removeMine(id){
  if(state.busy) return;
  const own = ACTS.find(a => a.id === id && a.mine) || state.myPubs.find(a => a.id === id);
  if(!own && !(CLOUD && state.isAdmin)) return;
  if(!window.confirm('¿Eliminar esta actividad? No se puede deshacer.')) return;
  if(CLOUD){
    state.busy = true;
    try { await CLOUD.remove(id); } catch(e){ toast(CLOUD.friendly(e)); return; } finally { state.busy = false; }
  }
  const i = ACTS.findIndex(a => a.id === id);
  if(i >= 0) ACTS.splice(i, 1);
  state.myPubs = state.myPubs.filter(a => a.id !== id);
  state.pending = state.pending.filter(a => a.id !== id);
  state.joined.delete(id); saveJoined(); saveMine();
  if(state.sel === id) state.sel = null;
  $('detail').close(); render(false); toast('Actividad eliminada');
}
$('pform').addEventListener('submit', submitPublish);

/* ---- cuenta y datos en la nube ---- */
const NAME_RE = /^[\p{L}][\p{L}\s'.-]{1,39}$/u;
const fullName = () => state.authUser && state.authUser.first ? (state.authUser.first + ' ' + state.authUser.last).trim() : '';
function readNames(a, b){
  const first = $(a).value.trim().replace(/\s+/g, ' '), last = $(b).value.trim().replace(/\s+/g, ' ');
  return NAME_RE.test(first) && NAME_RE.test(last) ? {first:first, last:last} : null;
}
async function reloadCloud(){
  const uid = state.authUser && state.authUser.id;
  try {
    const joined = uid ? await CLOUD.myRegistrations() : new Set();
    /* Solo las actividades son imprescindibles: si algo secundario falla (por ejemplo, una tabla
       que aún no se creó en la base), la lista se carga igual y ese pedazo queda vacío. */
    const soft = (p, fallback) => Promise.resolve(p).catch(() => fallback);
    const [list, mine, admin] = await Promise.all([
      CLOUD.activities(uid, joined),
      uid ? soft(CLOUD.myActivities(uid), []) : [],
      uid ? soft(CLOUD.isAdmin(uid), false) : false
    ]);
    const [pend, reps] = admin ? await Promise.all([soft(CLOUD.pending(), []), soft(CLOUD.reports(), [])]) : [[], []];
    const [pets, myPets, pendPets, petReps] = await Promise.all([
      soft(CLOUD.pets(uid), []), uid ? soft(CLOUD.myPets(uid), []) : [], admin ? soft(CLOUD.pendingPets(), []) : [],
      admin ? soft(CLOUD.petReports(), []) : []
    ]);
    Object.assign(state, {pets:pets, myPets:myPets, pendingPets:pendPets, petReports:petReps});
    ACTS.splice(0, ACTS.length, ...list);
    Object.assign(state, {joined:joined, myPubs:mine, isAdmin:admin, pending:pend, reports:reps});
  } catch(e){ toast('No pudimos cargar las actividades. ' + CLOUD.friendly(e)); }
  if(!state.isAdmin && document.body.dataset.page === 'admin') setPage('home');
  render(false);
  if(!state.hashDone && ACTS.length){ state.hashDone = true; openFromHash(); }
}
async function toggleJoin(id){
  if(state.busy) return;
  const was = state.joined.has(id);
  if(CLOUD){
    if(!state.authUser){ openLogin('Inicia sesión para inscribirte.'); return; }
    state.busy = true;
    try { if(was) await CLOUD.leave(id); else await CLOUD.join(id); }
    catch(e){ toast(CLOUD.friendly(e)); state.busy = false; await reloadCloud(); if($('detail').open) openDetail(id); return; }
    state.busy = false;
  }
  if(was){ state.joined.delete(id); toast('Cancelaste tu inscripción'); }
  else { state.joined.add(id); toast('Listo, quedaste inscrito'); }
  saveJoined(); render(false); openDetail(id);
}
let loginMode = 'in';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PW_OK = p => p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);
const PW_MSG = 'La contraseña debe tener entre 8 y 72 caracteres, con letras y números.';
function setLoginMode(mode){
  loginMode = mode;
  const up = mode === 'up', re = mode === 'reset';
  $('l-modes').hidden = re;
  document.querySelectorAll('#l-modes [data-lmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lmode === mode)));
  $('l-names').hidden = !up; $('l-termsrow').hidden = !up; $('l-passrow').hidden = re;
  $('l-passhint').hidden = !up; $('l-forgot').hidden = mode !== 'in'; $('l-back').hidden = !re;
  $('l-title').textContent = re ? 'Recupera tu contraseña' : up ? 'Crea tu cuenta' : 'Entra a NexoApp';
  $('l-sub').textContent = re ? 'Escribe tu correo y te enviamos un enlace para crear una nueva contraseña.' : up ? 'Gratis y para la comunidad de Bogotá.' : 'Con tu correo y tu contraseña.';
  $('l-send').textContent = re ? 'Enviarme el enlace' : up ? 'Crear cuenta' : 'Entrar';
  $('l-pass').autocomplete = up ? 'new-password' : 'current-password';
  $('l-err').hidden = true; $('l-ok').hidden = true;
}
function showDialog(id){
  const d = $(id);
  if(typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}
function openLogin(msg, mode){
  if(!CLOUD) return;
  if($('detail').open) $('detail').close();
  if($('petview').open) $('petview').close();
  setLoginMode(mode || 'in');
  $('l-pass').value = ''; $('l-pass').type = 'password';
  if(msg){ const o = $('l-ok'); o.textContent = msg; o.hidden = false; }
  showDialog('login');
  $('l-email').focus();
}
$('lform').addEventListener('submit', async ev => {
  ev.preventDefault();
  if(!CLOUD || state.busy) return;
  const email = $('l-email').value.trim(), pass = $('l-pass').value, err = $('l-err'), ok = $('l-ok');
  err.hidden = true; ok.hidden = true;
  const bad = (m, el) => { err.textContent = m; err.hidden = false; if(el) el.focus(); };
  if(!EMAIL_RE.test(email)) return bad('Escribe un correo válido.', $('l-email'));
  let names = null;
  if(loginMode === 'up'){
    names = readNames('l-first', 'l-last');
    if(!names) return bad('Escribe tu nombre y apellido (solo letras, mínimo 2).', $('l-first'));
    if(!PW_OK(pass)) return bad(PW_MSG, $('l-pass'));
    if(!$('l-terms').checked) return bad('Para continuar debes aceptar los Términos y la Política de privacidad.', $('l-terms'));
  } else if(loginMode === 'in' && !pass) return bad('Escribe tu contraseña.', $('l-pass'));
  state.busy = true; $('l-send').disabled = true;
  try {
    if(loginMode === 'reset'){
      await CLOUD.resetPassword(email);
      ok.textContent = 'Si ese correo tiene una cuenta, te enviamos un enlace para crear una nueva contraseña. Revisa también el spam.'; ok.hidden = false;
    } else if(loginMode === 'up'){
      const r = await CLOUD.signUp(email, pass, names);
      if(!r.signedIn){
        ok.textContent = 'Te enviamos un correo para confirmar tu cuenta. Ábrelo, toca el enlace y luego entra. Si ya tenías una cuenta, usa «Entrar».'; ok.hidden = false;
        $('l-pass').value = '';
      }
    } else {
      await CLOUD.signIn(email, pass);   /* al entrar, el evento de sesión cierra esta ventana */
    }
  } catch(e){ bad(CLOUD.friendly(e)); }
  finally { state.busy = false; $('l-send').disabled = false; }
});

/* ---- cambiar contraseña (también al llegar desde el enlace de «olvidé mi contraseña») ---- */
function openNewPass(recovery){
  if(!CLOUD) return;
  if($('login').open) $('login').close();
  $('np-title').textContent = recovery ? 'Crea tu nueva contraseña' : 'Cambiar contraseña';
  $('np-1').value = ''; $('np-2').value = ''; $('np-err').hidden = true;
  $('np-1').type = 'password';
  showDialog('passdlg');
  $('np-1').focus();
}
$('npform').addEventListener('submit', async ev => {
  ev.preventDefault();
  if(!CLOUD || state.busy) return;
  const a = $('np-1').value, b = $('np-2').value, err = $('np-err');
  const bad = m => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  if(!PW_OK(a)) return bad(PW_MSG);
  if(a !== b) return bad('Las dos contraseñas no coinciden.');
  state.busy = true; $('np-save').disabled = true;
  try { await CLOUD.setPassword(a); $('passdlg').close(); toast('Contraseña actualizada'); }
  catch(e){ bad(CLOUD.friendly(e)); }
  finally { state.busy = false; $('np-save').disabled = false; }
});

/* ---- eliminar mi cuenta ---- */
function openDelete(){
  if(!CLOUD || !state.authUser) return;
  $('x-pass').value = ''; $('x-word').value = ''; $('x-err').hidden = true; $('x-pass').type = 'password';
  showDialog('deldlg');
  $('x-pass').focus();
}
$('dform').addEventListener('submit', async ev => {
  ev.preventDefault();
  if(!CLOUD || !state.authUser || state.busy) return;
  const err = $('x-err'), bad = m => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  if(!$('x-pass').value) return bad('Escribe tu contraseña.');
  if($('x-word').value.trim().toUpperCase() !== 'ELIMINAR') return bad('Escribe la palabra ELIMINAR para confirmar.');
  state.busy = true; $('x-go').disabled = true;
  try {
    await CLOUD.deleteAccount(state.authUser.email, $('x-pass').value);
    $('deldlg').close();
    Object.assign(state, {authUser:null, isAdmin:false, myPubs:[], pending:[], reports:[], joined:new Set()});
    setPage('home');
    state.busy = false;
    await reloadCloud();
    toast('Tu cuenta y tus datos fueron eliminados.');
  } catch(e){ bad(CLOUD.friendly(e)); }
  finally { state.busy = false; $('x-go').disabled = false; }
});

function openNameDlg(){
  if(!CLOUD || !state.authUser) return;
  $('n-err').hidden = true;
  $('n-first').value = state.authUser.first; $('n-last').value = state.authUser.last;
  const d = $('namedlg');
  if(typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  $('n-first').focus();
}
$('nform').addEventListener('submit', async ev => {
  ev.preventDefault();
  if(!CLOUD || state.busy) return;
  const names = readNames('n-first', 'n-last'), err = $('n-err');
  if(!names){ err.textContent = 'Escribe tu nombre y apellido (solo letras, mínimo 2).'; err.hidden = false; return; }
  state.busy = true; $('n-save').disabled = true;
  try {
    await CLOUD.updateName(names);
    state.authUser = Object.assign({}, state.authUser, names);
    $('namedlg').close(); renderHome(); renderProfile(); toast('Nombre guardado');
  } catch(e){ err.textContent = CLOUD.friendly(e); err.hidden = false; }
  finally { state.busy = false; $('n-save').disabled = false; }
});
/* ---- mascotas perdidas y encontradas ---- */
const SPECIES = {perro:'Perro', gato:'Gato', otro:'Otro animal'};
const fmtDay = iso => new Date(iso + 'T12:00').toLocaleDateString('es-CO', {day:'numeric', month:'short'}).replace('.', '');
const petName = p => p.name || (p.kind === 'perdido' ? 'Sin nombre' : 'Sin identificar');
const KIND_LABEL = {perdido:'Perdido', encontrado:'Encontrado'};
const PHONE_RE = /^3\d{9}$/;
const phoneFmt = ph => ph.slice(0, 3) + ' ' + ph.slice(3, 6) + ' ' + ph.slice(6);
const findPet = id => state.pets.find(p => p.id === id) || state.myPets.find(p => p.id === id) || state.pendingPets.find(p => p.id === id);
const petUrl = id => location.href.split('#')[0] + '#p=' + id;
const petShareText = p => (p.kind === 'perdido' ? 'Se perdió ' + (p.name || 'una mascota') + ' (' + SPECIES[p.species].toLowerCase() + ')' : 'Encontraron ' + (p.species === 'gato' ? 'un gato' : p.species === 'perro' ? 'un perro' : 'un animal')) + ' en ' + p.loc + '. Ayúdanos a compartir: ' + petUrl(p.id);

function petCard(p){
  const img = p.photo ? '<img src="' + esc(p.photo) + '" alt="' + esc(SPECIES[p.species] + ': ' + petName(p)) + '" loading="lazy">' : CAT.animales.icon;
  return '<button type="button" class="pet" data-petopen="' + p.id + '"><span class="pet-img">' + img +
    '<span class="pet-tag ' + p.kind + '">' + KIND_LABEL[p.kind] + '</span></span><span class="body"><h3>' + esc(petName(p)) + '</h3>' +
    '<span class="meta">' + SPECIES[p.species] + ' · ' + esc(p.loc) + '</span><span class="meta">' + fmtDay(p.seen) + ' · ' + esc(p.place) + '</span></span></button>';
}
function renderPets(){
  const el = $('pets');
  document.querySelectorAll('[data-page="pets"]').forEach(b => { b.hidden = !CLOUD; });
  if(!CLOUD){ el.innerHTML = ''; return; }
  const list = state.pets.filter(p => (state.petKind === 'todos' || p.kind === state.petKind) && (state.petSpecies === 'todas' || p.species === state.petSpecies));
  const chip = (attr, val, label, cur) => '<button type="button" class="chip" data-' + attr + '="' + val + '" aria-pressed="' + (cur === val) + '">' + label + '</button>';
  el.innerHTML = '<div class="pg"><h1>Mascotas perdidas y encontradas</h1>' +
    '<p class="sub">Ayuda a que vuelvan a casa. Los reportes se revisan antes de publicarse y se retiran a los 60 días.</p>' +
    '<p style="margin-top:14px"><button type="button" class="btn" data-petnew="1">Reportar una mascota</button></p>' +
    '<div class="chips wrap" style="margin-top:14px" role="group" aria-label="Filtrar por tipo de reporte">' +
      chip('petkind', 'todos', 'Todos', state.petKind) + chip('petkind', 'perdido', 'Perdidos', state.petKind) + chip('petkind', 'encontrado', 'Encontrados', state.petKind) + '</div>' +
    '<div class="chips wrap" role="group" aria-label="Filtrar por animal">' +
      chip('petspecies', 'todas', 'Todos los animales', state.petSpecies) + chip('petspecies', 'perro', 'Perros', state.petSpecies) + chip('petspecies', 'gato', 'Gatos', state.petSpecies) + chip('petspecies', 'otro', 'Otros', state.petSpecies) + '</div>' +
    '<p class="sub" style="margin:6px 0 0">' + list.length + (list.length === 1 ? ' reporte' : ' reportes') + '</p>' +
    '<div class="pet-grid">' + (list.length ? list.map(petCard).join('') :
      '<div class="empty" style="grid-column:1/-1"><strong>No hay reportes por ahora</strong>Si perdiste o encontraste una mascota, repórtala para que la comunidad te ayude.</div>') + '</div></div>';
}

/* detalle de un reporte */
function openPet(id){
  const p = findPet(id); if(!p) return false;
  const dlg = $('petview');
  dlg.innerHTML =
    '<div class="pv-head ' + p.kind + '"><span>' + KIND_LABEL[p.kind] + ' · ' + SPECIES[p.species] + '</span><h2 id="pv-title">' + esc(petName(p)) + '</h2><p>' + fmtDay(p.seen) + ' · ' + esc(p.loc) + '</p></div>' +
    (p.photo ? '<img class="pv-photo" src="' + esc(p.photo) + '" alt="' + esc(SPECIES[p.species] + ': ' + petName(p)) + '">' : '') +
    '<div class="d-body"><p>' + esc(p.desc) + '</p>' +
    '<div class="facts"><div><strong>' + esc(p.place) + '</strong><br><span>' + esc(p.loc) + ', Bogotá</span></div></div>' +
    (p.status !== 'approved' ? '<span class="pill pill-' + (STATUS[p.status] || STATUS.pending)[1] + '">' + (STATUS[p.status] || STATUS.pending)[0] + '</span>' : '') +
    '<div id="pv-contact" class="d-actions"><p class="sub">Cargando contacto…</p></div>' +
    '<div class="d-share"><a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(petShareText(p)) + '">Compartir</a>' +
      '<button type="button" class="btn ghost" data-petcopy="' + p.id + '">Copiar enlace</button>' +
      '<a class="btn ghost" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + p.lat + '&mlon=' + p.lng + '#map=17/' + p.lat + '/' + p.lng + '">Ver mapa</a></div>' +
    '<div class="d-actions">' +
      (p.mine && p.status === 'approved' && !p.resolved ? '<button type="button" class="btn block" data-petresolve="' + p.id + '">' + (p.kind === 'perdido' ? '¡Ya apareció!' : 'Ya volvió con su familia') + '</button>' : '') +
      ((p.mine || state.isAdmin) ? '<button type="button" class="btn ghost danger block" data-petdel="' + p.id + '">' + (p.mine ? 'Eliminar mi reporte' : 'Quitar reporte (admin)') + '</button>' : '') +
      '<button type="button" class="btn ghost block" onclick="this.closest(\'dialog\').close()">Cerrar</button>' +
      (CLOUD && !p.mine && p.status === 'approved' ? '<button type="button" class="reportlink" data-reportpet="' + p.id + '">Reportar este aviso</button>' : '') +
    '</div></div>';
  if(!dlg.open) showDialog('petview');
  const box = dlg.querySelector('#pv-contact');
  if(!state.authUser){
    box.innerHTML = '<button type="button" class="btn block" data-login="1">Inicia sesión para ver el contacto</button>';
  } else {
    CLOUD.petContact(id).then(ph => {
      if(!box.isConnected) return;
      if(!ph || !PHONE_RE.test(ph)){ box.innerHTML = '<p class="sub">No hay un contacto disponible.</p>'; return; }
      const msg = 'Hola, te escribo por tu reporte de ' + (p.kind === 'perdido' ? 'la mascota perdida' : 'la mascota encontrada') + ' (' + petName(p) + ') en NexoApp.';
      box.innerHTML = '<a class="btn block" target="_blank" rel="noopener" href="https://wa.me/57' + ph + '?text=' + encodeURIComponent(msg) + '">Escribir por WhatsApp</a>' +
        '<a class="link" href="tel:+57' + ph + '">Llamar al ' + phoneFmt(ph) + '</a>';
    }).catch(() => { if(box.isConnected) box.innerHTML = '<p class="sub">No pudimos cargar el contacto.</p>'; });
  }
  return true;
}
async function copyPetLink(id){
  const url = petUrl(id);
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch(e){}
  toast(ok ? 'Enlace copiado' : url);
}
async function resolvePetReport(id){
  if(!CLOUD || state.busy) return;
  state.busy = true;
  try { await CLOUD.resolvePet(id); } catch(e){ toast(CLOUD.friendly(e)); state.busy = false; return; }
  state.busy = false;
  if($('petview').open) $('petview').close();
  toast('¡Qué buena noticia! Retiramos el reporte.'); await reloadCloud();
}
async function deletePetReport(id){
  if(!CLOUD || state.busy) return;
  const p = findPet(id); if(!p) return;
  if(!(p.mine || state.isAdmin) || !window.confirm('¿Eliminar este reporte? No se puede deshacer.')) return;
  state.busy = true;
  try { await CLOUD.removePet(id, p.photoPath); } catch(e){ toast(CLOUD.friendly(e)); state.busy = false; return; }
  state.busy = false;
  if($('petview').open) $('petview').close();
  toast('Reporte eliminado'); await reloadCloud();
}
async function moderatePet(id, status){
  if(!CLOUD || !state.isAdmin || state.busy) return;
  state.busy = true;
  try { await CLOUD.moderatePet(id, status); } catch(e){ toast(CLOUD.friendly(e)); state.busy = false; return; }
  state.busy = false;
  toast(status === 'approved' ? 'Reporte aprobado y publicado' : 'Reporte rechazado'); await reloadCloud();
}
function adminPetCard(p){
  return '<article class="act" data-cat="animales"><span class="edge"></span><span class="body">' +
    '<span class="kind">' + KIND_LABEL[p.kind] + ' · ' + SPECIES[p.species] + '</span><h3>' + esc(petName(p)) + '</h3>' +
    (p.photo ? '<img class="pv-photo" style="border-radius:12px;max-height:220px" src="' + esc(p.photo) + '" alt="Foto del reporte">' : '<span class="meta">Sin foto</span>') +
    '<span class="meta">' + fmtDay(p.seen) + ' · ' + esc(p.loc) + ' · ' + esc(p.place) + '</span>' +
    '<span class="adm-desc">' + esc(p.desc) + '</span>' +
    '<span class="adm-btns"><button type="button" class="btn" data-petapprove="' + p.id + '">Aprobar</button>' +
    '<button type="button" class="btn ghost" data-petreject="' + p.id + '">Rechazar</button></span></span></article>';
}
function petMineCard(p){
  const st = p.resolved ? ['Resuelto', 'approved'] : (STATUS[p.status] || STATUS.pending);
  return '<article class="act" data-cat="animales"><span class="edge"></span><span class="body">' +
    '<span class="kind">' + KIND_LABEL[p.kind] + ' · ' + SPECIES[p.species] + '</span><h3>' + esc(petName(p)) + '</h3>' +
    '<span class="meta">' + fmtDay(p.seen) + ' · ' + esc(p.loc) + '</span><span class="pill pill-' + st[1] + '">' + st[0] + '</span>' +
    '<span class="adm-btns"><button type="button" class="btn ghost sm" data-petopen="' + p.id + '">Ver</button>' +
    '<button type="button" class="btn ghost sm danger" data-petdel="' + p.id + '">Eliminar</button></span></span></article>';
}
function petsMineHtml(){
  if(!CLOUD) return '';
  return '<div class="sec-title"><h2>Mis reportes de mascotas</h2></div><div class="feed two">' +
    (state.myPets.length ? state.myPets.map(petMineCard).join('') :
      '<div class="empty"><strong>Sin reportes</strong>Si perdiste o encontraste una mascota, repórtala.<br><button type="button" class="btn" data-petnew="1">Reportar una mascota</button></div>') + '</div>';
}

/* formulario para reportar */
let ptmap = null, ptmark = null, ptpoint = null, petBlob = null, petFormKind = 'perdido';
function setPetKind(k){
  petFormKind = k;
  document.querySelectorAll('[data-ptkind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ptkind === k)));
  $('pt-datelabel').textContent = k === 'perdido' ? '¿Cuándo se perdió?' : '¿Cuándo la encontraste?';
  $('pt-placelabel').textContent = k === 'perdido' ? 'Dónde lo viste por última vez' : 'Dónde la encontraste';
  $('pt-namerow').firstChild.textContent = k === 'perdido' ? 'Nombre (si lo sabes)' : 'Nombre (si tiene collar o placa)';
}
async function compressImage(file){
  if(!/^image\//.test(file.type)) throw new Error('Elige un archivo de imagen.');
  if(file.size > 25 * 1024 * 1024) throw new Error('Esa foto es demasiado grande.');
  let bmp;
  try { bmp = await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch(e){
    bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No pudimos leer esa foto.')); i.src = URL.createObjectURL(file); });
  }
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);   /* volver a dibujarla borra los metadatos (incluida la ubicación GPS) */
  for(const q of [0.82, 0.7, 0.55]){
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if(blob && blob.size <= 1.5 * 1024 * 1024) return blob;
  }
  throw new Error('La foto pesa demasiado. Prueba con otra.');
}
function openPetForm(){
  if(!CLOUD) return;
  if(!state.authUser){ openLogin('Inicia sesión para reportar una mascota.'); return; }
  const f = $('ptform'); f.reset(); ptpoint = null; petBlob = null;
  $('pt-err').hidden = true; $('pt-preview').hidden = true; $('pt-hint').textContent = 'Toca el mapa para marcar el lugar.';
  if(!$('pt-loc').options.length) LOCS.forEach(l => { const o = document.createElement('option'); o.value = o.textContent = l; $('pt-loc').appendChild(o); });
  const today = iso(new Date());
  $('pt-date').max = today; $('pt-date').min = iso(addDays(new Date(), -60)); $('pt-date').value = today;
  setPetKind('perdido');
  showDialog('petdlg');
  if(!ptmap){
    ptmap = L.map('ptmap', {minZoom:CFG.MIN_ZOOM, maxBounds:CFG.BOUNDS, maxBoundsViscosity:0.8}).setView(CFG.CENTER, 11);
    L.tileLayer(CFG.TILE_URL, {maxZoom:19, attribution:CFG.TILE_ATTRIBUTION}).addTo(ptmap);
    ptmap.on('click', e => {
      ptpoint = e.latlng;
      if(ptmark) ptmark.setLatLng(e.latlng); else ptmark = L.marker(e.latlng).addTo(ptmap);
      $('pt-hint').textContent = 'Lugar marcado. Toca otro punto si quieres moverlo.';
    });
  }
  if(ptmark){ ptmark.remove(); ptmark = null; }
  ptmap.setView(CFG.CENTER, 11);
  setTimeout(() => ptmap.invalidateSize(), 60);
}
$('pt-photo').addEventListener('change', async () => {
  const file = $('pt-photo').files[0], err = $('pt-err'), prev = $('pt-preview');
  petBlob = null; prev.hidden = true; err.hidden = true;
  if(!file) return;
  try {
    petBlob = await compressImage(file);
    prev.src = URL.createObjectURL(petBlob); prev.hidden = false;
  } catch(e){ err.textContent = e.message; err.hidden = false; $('pt-photo').value = ''; }
});
$('ptform').addEventListener('submit', async ev => {
  ev.preventDefault();
  if(!CLOUD || state.busy) return;
  const err = $('pt-err'), bad = (m, el) => { err.textContent = m; err.hidden = false; if(el) el.focus(); };
  err.hidden = true;
  const name = $('pt-name').value.trim(), desc = $('pt-desc').value.trim(), place = $('pt-place').value.trim(), seen = $('pt-date').value;
  let phone = $('pt-phone').value.replace(/\D/g, '');
  if(phone.length === 12 && phone.startsWith('57')) phone = phone.slice(2);
  if(desc.length < 5) return bad('Describe al animal: color, tamaño, señas (mínimo 5 caracteres).', $('pt-desc'));
  if(!seen) return bad('Elige la fecha.', $('pt-date'));
  if(seen > iso(new Date()) || seen < iso(addDays(new Date(), -60))) return bad('La fecha no puede ser futura ni de hace más de 60 días.', $('pt-date'));
  if(place.length < 2) return bad('Escribe el lugar (mínimo 2 caracteres).', $('pt-place'));
  if(!ptpoint) return bad('Toca el mapa para marcar el lugar.', null);
  const [[s0, w0], [n0, e0]] = CFG.BOUNDS;
  if(ptpoint.lat < s0 || ptpoint.lat > n0 || ptpoint.lng < w0 || ptpoint.lng > e0) return bad('El lugar debe estar dentro de Bogotá.', null);
  if(!PHONE_RE.test(phone)) return bad('Escribe un celular colombiano de 10 dígitos (empieza por 3).', $('pt-phone'));
  state.busy = true; $('pt-send').disabled = true;
  try {
    const r = await CLOUD.createPet({kind:petFormKind, species:$('pt-species').value, name:name, desc:desc, loc:$('pt-loc').value, place:place,
      lat:+ptpoint.lat.toFixed(5), lng:+ptpoint.lng.toFixed(5), seen:seen, phone:phone}, petBlob);
    $('petdlg').close(); state.busy = false;
    await reloadCloud();
    setPage(r.status === 'approved' ? 'pets' : 'profile');
    toast(r.status === 'approved' ? 'Reporte publicado' : 'Enviado. Lo revisaremos y aparecerá en Perdidos cuando se apruebe.');
  } catch(e){ bad(CLOUD.friendly(e)); }
  finally { state.busy = false; $('pt-send').disabled = false; }
});

/* ---- navegación entre Inicio, Explorar y Perfil ---- */
const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>';
function setPage(page, silent){
  setSheet(false);
  document.body.dataset.page = page;
  document.querySelectorAll('.nav, .tab').forEach(b => {
    if(b.dataset.page === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if(page === 'explore'){
    map.invalidateSize();
    setTimeout(() => map.invalidateSize(), 60);
    if(!silent) render(true);
  } else {
    renderHome(); renderProfile(); renderAdmin(); renderPets();
    const pg = $(page); if(pg) pg.scrollTop = 0;
  }
}
const upcoming = () => ACTS.filter(a => inWhen(a, 'todas')).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
const myJoined = () => upcoming().filter(a => state.joined.has(a.id));
function renderHome(){
  const up = upcoming(), feat = up[0], mine = myJoined();
  const quick = Object.keys(CAT).map(k => '<button type="button" class="chip" data-page="explore" data-setcat="' + k + '"><i style="background:var(--' + (k === 'aprender' ? 'learn' : k === 'social' ? 'social' : 'animal') + ')"></i>' + CAT[k].name + '</button>').join('');
  const hero = feat ? '<button type="button" class="hero" data-cat="' + feat.cat + '" data-open="' + feat.id + '">' +
    CAT[feat.cat].icon.replace('<svg', '<svg class="glyph"') +
    '<span class="tag">Lo próximo: ' + CAT[feat.cat].name + '</span><h2>' + esc(feat.title) + '</h2>' +
    '<p class="meta">' + esc(when(feat)) + ' en ' + esc(feat.loc) + '. ' + esc(feat.place) + '.</p><span class="go">Ver detalles</span></button>' :
    '<div class="empty"><strong>No hay actividades próximas</strong>Publica la primera.<br><button type="button" class="btn" data-pub="1">Publicar algo</button></div>';
  const rest = up.slice(1, 7);
  const free = up.reduce((n, a) => n + Math.max(0, left(a)), 0);
  $('home').innerHTML = '<div class="pg"><p class="sub">Hola' + (state.authUser && state.authUser.first ? ', ' + esc(state.authUser.first) : '') + '</p><h1>Qué pasa en Bogotá</h1>' + hero +
    '<div class="sec-title"><h2>Explora por tema</h2></div><div class="quick">' + quick + '</div>' +
    '<div class="pg-cols"><div><div class="sec-title" style="margin-top:0"><h2>Próximas actividades</h2><button type="button" class="link" data-page="explore">Ver todas</button></div>' +
    '<div class="feed two">' + (rest.length ? rest.map(card).join('') : '<div class="empty">No hay más actividades por ahora.</div>') + '</div></div>' +
    '<aside><section class="panel-box"><h3>Tus inscripciones</h3>' +
    (mine.length ? '<div class="mini">' + mine.map(a => '<button type="button" data-open="' + a.id + '"><strong>' + esc(a.title) + '</strong><small>' + esc(when(a)) + '</small></button>').join('') + '</div>' :
      '<p class="sub">Aún no te has inscrito a nada. Toca una actividad para unirte.</p>') + '</section>' +
    '<section class="panel-box" style="margin-top:16px"><h3>Ahora en NexoApp</h3><div class="stats3"><div><strong>' + up.length + '</strong><small>actividades</small></div><div><strong>' + free + '</strong><small>cupos libres</small></div><div><strong>' + LOCS.length + '</strong><small>localidades</small></div></div></section></aside></div></div>';
}
/* ---- enlace a las redes de quien organiza ---- */
/* Acepta @usuario (se toma como Instagram), un enlace con o sin https://, y descarta cualquier otro
   esquema (javascript:, mailto:, etc.). Devuelve '' si está vacío, null si no es válido. */
function normLink(v){
  v = (v || '').trim();
  if(!v) return '';
  if(v.startsWith('/')) return null;
  if(/^@[A-Za-z0-9._]{1,30}$/.test(v)) return 'https://instagram.com/' + v.slice(1);
  if(/^http:\/\//i.test(v)) v = 'https://' + v.slice(7);
  else if(!/^https:\/\//i.test(v)){
    if(/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
    v = 'https://' + v;
  }
  if(!/^https:\/\/[^\s"'<>]{4,190}$/i.test(v)) return null;
  try { if(!new URL(v).hostname.includes('.')) return null; } catch(e){ return null; }
  return v;
}
/* Siempre se revisa al mostrarlo, venga de la base o del navegador. */
const safeLink = u => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,190}$/i.test(u)) ? u : '';
function linkLabel(url, host){
  let h = '';
  try { h = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch(e){}
  const de = host ? ' de ' + host : '';
  if(/(^|\.)instagram\.com$/.test(h)) return 'Ver el Instagram' + de;
  if(/(^|\.)facebook\.com$|(^|\.)fb\.com$|^fb\.me$/.test(h)) return 'Ver el Facebook' + de;
  if(/(^|\.)tiktok\.com$/.test(h)) return 'Ver el TikTok' + de;
  if(/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return 'Ver el canal' + de;
  if(/(^|\.)(x|twitter)\.com$/.test(h)) return 'Ver el perfil en X' + de;
  if(h === 'wa.me' || /(^|\.)whatsapp\.com$/.test(h)) return 'Escribir por WhatsApp';
  return 'Ver redes o página' + de;
}

/* ---- compartir, calendario, enlace directo ---- */
const shareUrl = id => location.href.split('#')[0] + '#a=' + id;
const shareText = a => 'Mira esta actividad en NexoApp: ' + a.title + ' (' + when(a) + ', ' + a.loc + '). ' + shareUrl(a.id);
async function copyLink(id){
  const url = shareUrl(id);
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; }
  catch(e){
    try {
      const ta = document.createElement('textarea'); ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch(e2){}
  }
  toast(ok ? 'Enlace copiado' : url);
}
function openFromHash(){
  const m = /^#([ap])=(\d+)$/.exec(location.hash);
  if(!m) return;
  const id = +m[2];
  history.replaceState(null, '', location.href.split('#')[0]);
  if(m[1] === 'p'){ if(!openPet(id)) toast('Ese reporte ya no está disponible.'); return; }
  if(ACTS.some(a => a.id === id)) openDetail(id); else toast('Esa actividad ya no está disponible.');
}
/* .ics: hora de Bogotá (UTC-5 todo el año), 2 horas de duración y recordatorio 1 hora antes */
const icsText = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = l => { const o = []; while(l.length > 74){ o.push(l.slice(0, 74)); l = ' ' + l.slice(74); } o.push(l); return o.join('\r\n'); };
const icsDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function downloadIcs(id){
  const a = ACTS.find(x => x.id === id); if(!a) return;
  const start = new Date(a.date + 'T' + a.time + ':00-05:00'), end = new Date(start.getTime() + 2 * 3600 * 1000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NexoApp//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:act-' + a.id + '@nexoapp', 'DTSTAMP:' + icsDate(new Date()), 'DTSTART:' + icsDate(start), 'DTEND:' + icsDate(end),
    'SUMMARY:' + icsText(a.title), 'LOCATION:' + icsText(a.place + ', ' + a.loc + ', Bogotá'),
    'DESCRIPTION:' + icsText(a.desc + '\n\nOrganiza: ' + a.host + '\nMás información: ' + shareUrl(a.id)),
    'GEO:' + a.lat + ';' + a.lng, 'URL:' + shareUrl(a.id),
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(a.title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  const blob = new Blob([lines.map(icsFold).join('\r\n') + '\r\n'], {type:'text/calendar;charset=utf-8'});
  const slug = a.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = 'nexoapp-' + slug + '.ics';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  toast('Listo, ábrelo para agregarlo a tu calendario');
}

/* ---- instalar como app (PWA) ---- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  document.querySelectorAll('.side [data-install]').forEach(b => { b.hidden = false; });
  renderProfile();
});
window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  document.querySelectorAll('.side [data-install]').forEach(b => { b.hidden = true; });
  renderProfile(); toast('NexoApp quedó instalada');
});
async function installApp(){
  if(!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null;
  document.querySelectorAll('.side [data-install]').forEach(b => { b.hidden = true; });
  renderProfile();
}

/* ---- reportar una actividad ---- */
function openReport(id, kind){
  kind = kind || 'activity';
  const a = kind === 'pet' ? findPet(id) : ACTS.find(x => x.id === id); if(!a || !CLOUD) return;
  if(!state.authUser){ openLogin(kind === 'pet' ? 'Inicia sesión para reportar un aviso.' : 'Inicia sesión para reportar una actividad.'); return; }
  state.reportId = id; state.reportKind = kind;
  $('r-title').textContent = kind === 'pet' ? 'Reportar aviso de mascota' : 'Reportar actividad';
  $('r-sub').textContent = kind === 'pet' ? KIND_LABEL[a.kind] + ': ' + petName(a) : a.title;
  $('r-reason').value = 'spam'; $('r-details').value = ''; $('r-err').hidden = true;
  if($('detail').open) $('detail').close();
  if($('petview').open) $('petview').close();
  const d = $('reportdlg');
  if(typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  $('r-reason').focus();
}
$('rform').addEventListener('submit', async ev => {
  ev.preventDefault();
  if(!CLOUD || state.busy || !state.reportId) return;
  state.busy = true; $('r-send').disabled = true;
  try {
    if(state.reportKind === 'pet') await CLOUD.reportPet(state.reportId, $('r-reason').value, $('r-details').value.trim());
    else await CLOUD.report(state.reportId, $('r-reason').value, $('r-details').value.trim());
    $('reportdlg').close(); toast('Gracias. Revisaremos tu reporte.');
    reloadCloud();
  } catch(e){ const er = $('r-err'); er.textContent = CLOUD.friendly(e); er.hidden = false; }
  finally { state.busy = false; $('r-send').disabled = false; }
});

/* ---- moderación: panel de administración y estado de mis publicaciones ---- */
const STATUS = {pending:['En revisión', 'pending'], approved:['Publicada', 'approved'], rejected:['No aprobada', 'rejected']};
function pubCard(a){
  const st = STATUS[a.status] || STATUS.pending;
  return '<article class="act" data-cat="' + a.cat + '"><span class="edge"></span><span class="body">' +
    '<span class="kind">' + CAT[a.cat].long + '</span><h3>' + esc(a.title) + '</h3>' +
    '<span class="meta">' + esc(when(a)) + ' · ' + esc(a.loc) + '</span>' +
    '<span class="pill pill-' + st[1] + '">' + st[0] + '</span>' +
    (a.status === 'rejected' ? '<span class="meta">No cumple las reglas de la comunidad. Puedes eliminarla y publicar otra.</span>' : '') +
    '<button type="button" class="btn ghost sm" data-del="' + a.id + '">Eliminar</button></span></article>';
}
function adminCard(a){
  const map = Number.isFinite(a.lat) && Number.isFinite(a.lng) ? '<a class="link" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + a.lat + '&mlon=' + a.lng + '#map=17/' + a.lat + '/' + a.lng + '">Ver ubicación en el mapa</a>' : '';
  return '<article class="act" data-cat="' + a.cat + '"><span class="edge"></span><span class="body">' +
    '<span class="kind">' + CAT[a.cat].long + '</span><h3>' + esc(a.title) + '</h3>' +
    '<span class="meta">' + esc(when(a)) + ' · ' + esc(a.loc) + ' · ' + esc(a.place) + '</span>' +
    '<span class="meta">Organiza: ' + esc(a.host) + ' · ' + a.total + ' cupos</span>' +
    '<span class="adm-desc">' + esc(a.desc) + '</span>' + map +
    (safeLink(a.link) ? '<a class="link" style="overflow-wrap:anywhere" target="_blank" rel="noopener noreferrer nofollow" href="' + esc(safeLink(a.link)) + '">Enlace del organizador: ' + esc(safeLink(a.link)) + '</a>' : '') +
    '<span class="adm-btns"><button type="button" class="btn" data-approve="' + a.id + '">Aprobar</button>' +
    '<button type="button" class="btn ghost" data-reject="' + a.id + '">Rechazar</button></span></span></article>';
}
const REASON = {spam:'Spam o publicidad', inapropiado:'Contenido inapropiado', falso:'Información falsa', peligroso:'Peligrosa o ilegal', otro:'Otro motivo'};
/* actividades con reportes, juntando los reportes de cada una */
function reportedList(){
  const by = {};
  state.reports.forEach(r => { (by[r.activity_id] = by[r.activity_id] || []).push(r); });
  return Object.keys(by).map(id => {
    const a = ACTS.find(x => x.id === +id) || state.pending.find(x => x.id === +id);
    return a ? {a:a, reps:by[id]} : null;
  }).filter(Boolean);
}
function reportCard(item){
  const a = item.a, hidden = a.status === 'pending';
  const items = item.reps.map(r => '<li>' + esc(REASON[r.reason] || r.reason) + (r.details ? ': «' + esc(r.details) + '»' : '') + '</li>').join('');
  return '<article class="act" data-cat="' + a.cat + '"><span class="edge"></span><span class="body">' +
    '<span class="kind">' + CAT[a.cat].long + '</span><h3>' + esc(a.title) + '</h3>' +
    '<span class="meta">' + esc(when(a)) + ' · ' + esc(a.loc) + ' · Organiza: ' + esc(a.host) + '</span>' +
    '<span class="pill pill-' + (hidden ? 'rejected' : 'pending') + '">' + item.reps.length + (item.reps.length === 1 ? ' reporte' : ' reportes') + (hidden ? ' · oculta' : ' · visible') + '</span>' +
    '<ul class="rep-list">' + items + '</ul>' +
    '<span class="adm-btns"><button type="button" class="btn" data-reject="' + a.id + '">Ocultar</button>' +
    '<button type="button" class="btn ghost" data-dismiss="' + a.id + '">' + (hidden ? 'Descartar y volver a publicar' : 'Descartar reportes') + '</button></span></span></article>';
}
function renderAdmin(){
  const reported = state.isAdmin ? reportedList() : [];
  const repIds = new Set(reported.map(x => x.a.id));
  const pend = state.isAdmin ? state.pending.filter(a => !repIds.has(a.id)) : [];
  const repPets = state.isAdmin ? reportedPetList() : [];
  const repPetIds = new Set(repPets.map(x => x.p.id));
  const pendPets = state.isAdmin ? state.pendingPets.filter(p => !repPetIds.has(p.id)) : [];
  const n = pend.length + reported.length + pendPets.length + repPets.length;
  document.querySelectorAll('[data-page="admin"]').forEach(b => {
    b.hidden = !state.isAdmin;
    const c = b.querySelector('.adm-n'); if(c){ c.hidden = !n; c.textContent = n; }
  });
  const el = $('admin');
  if(!state.isAdmin){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="pg"><h1>Panel de administración</h1><p class="sub">' + pend.length + (pend.length === 1 ? ' publicación por revisar' : ' publicaciones por revisar') +
    ' · ' + reported.length + (reported.length === 1 ? ' con reportes' : ' con reportes') + '</p>' +
    (reported.length ? '<h2 class="sec-sub">Reportadas</h2><div class="feed two">' + reported.map(reportCard).join('') + '</div>' : '') +
    '<h2 class="sec-sub">Por revisar</h2><div class="feed two">' +
    (pend.length ? pend.map(adminCard).join('') : '<div class="empty"><strong>Todo al día</strong>No hay publicaciones pendientes.</div>') + '</div>' +
    (repPets.length ? '<h2 class="sec-sub">Avisos de mascotas reportados (' + repPets.length + ')</h2><div class="feed two">' + repPets.map(petReportCard).join('') + '</div>' : '') +
    '<h2 class="sec-sub">Mascotas por revisar (' + pendPets.length + ')</h2><div class="feed two">' +
    (pendPets.length ? pendPets.map(adminPetCard).join('') : '<div class="empty"><strong>Todo al día</strong>No hay reportes de mascotas pendientes.</div>') + '</div></div>';
}
function reportedPetList(){
  const by = {};
  state.petReports.forEach(r => { (by[r.pet_id] = by[r.pet_id] || []).push(r); });
  return Object.keys(by).map(id => {
    const p = state.pets.find(x => x.id === +id) || state.pendingPets.find(x => x.id === +id);
    return p ? {p:p, reps:by[id]} : null;
  }).filter(Boolean);
}
function petReportCard(item){
  const p = item.p, hidden = p.status === 'pending';
  const items = item.reps.map(r => '<li>' + esc(REASON[r.reason] || r.reason) + (r.details ? ': «' + esc(r.details) + '»' : '') + '</li>').join('');
  return '<article class="act" data-cat="animales"><span class="edge"></span><span class="body">' +
    '<span class="kind">' + KIND_LABEL[p.kind] + ' · ' + SPECIES[p.species] + '</span><h3>' + esc(petName(p)) + '</h3>' +
    (p.photo ? '<img class="pv-photo" style="border-radius:12px;max-height:220px" src="' + esc(p.photo) + '" alt="Foto del aviso">' : '<span class="meta">Sin foto</span>') +
    '<span class="meta">' + esc(p.loc) + ' · ' + esc(p.place) + '</span><span class="adm-desc">' + esc(p.desc) + '</span>' +
    '<span class="pill pill-' + (hidden ? 'rejected' : 'pending') + '">' + item.reps.length + (item.reps.length === 1 ? ' reporte' : ' reportes') + (hidden ? ' · oculto' : ' · visible') + '</span>' +
    '<ul class="rep-list">' + items + '</ul>' +
    '<span class="adm-btns"><button type="button" class="btn" data-petreject="' + p.id + '">Ocultar</button>' +
    '<button type="button" class="btn ghost" data-petdismiss="' + p.id + '">' + (hidden ? 'Descartar y volver a publicar' : 'Descartar reportes') + '</button></span></span></article>';
}
async function dismissPetReports(id){
  if(!CLOUD || !state.isAdmin || state.busy) return;
  state.busy = true;
  try {
    await CLOUD.dismissPetReports(id);
    if(state.pendingPets.some(p => p.id === id)) await CLOUD.moderatePet(id, 'approved');
  } catch(e){ toast(CLOUD.friendly(e)); state.busy = false; return; }
  state.busy = false;
  toast('Reportes descartados'); await reloadCloud();
}
async function dismissReports(id){
  if(!CLOUD || !state.isAdmin || state.busy) return;
  state.busy = true;
  try {
    await CLOUD.dismissReports(id);
    if(state.pending.some(a => a.id === id)) await CLOUD.moderate(id, 'approved');
  } catch(e){ toast(CLOUD.friendly(e)); state.busy = false; return; }
  state.busy = false;
  toast('Reportes descartados'); await reloadCloud();
}
async function moderate(id, status){
  if(!CLOUD || !state.isAdmin || state.busy) return;
  state.busy = true;
  try { await CLOUD.moderate(id, status); }
  catch(e){ toast(CLOUD.friendly(e)); state.busy = false; return; }
  state.busy = false;
  toast(status === 'approved' ? 'Aprobada: ya se ve en Explorar' : 'Rechazada');
  await reloadCloud();
}
function accountHtml(){
  if(!CLOUD) return '';
  const u = state.authUser;
  return u ?
    '<div class="acct"><span class="sub">' + esc(u.email) + '</span>' +
      '<button type="button" class="btn' + (u.first ? ' ghost' : '') + '" data-editname="1">' + (u.first ? 'Editar nombre' : 'Agregar mi nombre') + '</button>' +
      '<button type="button" class="btn ghost" data-chpass="1">Cambiar contraseña</button>' +
      '<button type="button" class="btn ghost" data-logout="1">Cerrar sesión</button>' +
      '<button type="button" class="btn ghost danger" data-delacct="1">Eliminar mi cuenta</button></div>' :
    '<div class="acct"><span class="sub">Entra para inscribirte y publicar.</span><button type="button" class="btn" data-login="1">Iniciar sesión</button><button type="button" class="btn ghost" data-signup="1">Crear cuenta</button></div>';
}
function renderProfile(){
  const mine = myJoined(), pub = (CLOUD ? state.myPubs.slice() : ACTS.filter(a => a.mine)).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  $('profile').innerHTML = '<div class="pg"><div class="phead"><span class="avatar">' + ICON_USER + '</span><div><h1>' + (esc(fullName()) || 'Mi perfil') + '</h1><p class="sub">Tu actividad en NexoApp</p></div></div>' + accountHtml() +
    '<div class="stats3" style="margin-top:16px"><div><strong>' + mine.length + '</strong><small>inscripciones</small></div><div><strong>' + pub.length + '</strong><small>publicadas</small></div><div><strong>' + upcoming().length + '</strong><small>por descubrir</small></div></div>' +
    '<div class="pg-cols" style="grid-template-columns:1fr"><div><div class="sec-title"><h2>Tus inscripciones</h2></div><div class="feed two">' +
    (mine.length ? mine.map(card).join('') : '<div class="empty"><strong>Aún no te has inscrito</strong>Explora actividades y únete a la que más te guste.<br><button type="button" class="btn" data-page="explore">Explorar</button></div>') +
    '</div><div class="sec-title"><h2>Lo que has publicado</h2></div><div class="feed two">' +
    (pub.length ? pub.map(CLOUD ? pubCard : card).join('') : '<div class="empty"><strong>Todavía nada</strong>Comparte algo que sabes o una causa que te importa.<br><button type="button" class="btn" data-pub="1">Publicar algo</button></div>') +
    '</div>' + petsMineHtml() + '</div></div>' + (deferredInstall ? '<p><button type="button" class="btn ghost" data-install="1">Instalar NexoApp en tu celular</button></p>' : '') +
    '<p class="pnote">' + (CLOUD ? 'Tus inscripciones y publicaciones se guardan en tu cuenta.' : 'Por ahora tus inscripciones y publicaciones se guardan solo en este navegador.') +
    '<br><a href="terminos.html" target="_blank" rel="noopener">Términos de uso</a> · <a href="privacidad.html" target="_blank" rel="noopener">Política de privacidad</a></p></div>';
}

/* ---- inicio ---- */
LOCS.forEach(l => { const o = document.createElement('option'); o.textContent = l; o.value = l; $('loc').appendChild(o); });
syncTabbar();
if(CLOUD){
  ACTS.length = 0;
  render(false);
  CLOUD.user().then(u => { state.authUser = u; return reloadCloud(); });
  CLOUD.onAuth(u => {
    const changed = (u && u.id) !== (state.authUser && state.authUser.id);
    state.authUser = u;
    if(changed){ if(u && $('login').open) $('login').close(); reloadCloud(); }
    else { renderHome(); renderProfile(); }
  }, () => openNewPass(true));
} else {
  loadMine().forEach(a => ACTS.push(a));
  render(false);
  state.hashDone = true; openFromHash();
}
window.addEventListener('hashchange', openFromHash);
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
