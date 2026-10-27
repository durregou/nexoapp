/* Configuración del mapa.
   Para pasar a producción cambia TILE_URL por un proveedor con plan para apps
   (MapTiler, Stadia Maps, etc.) o por teselas propias. El servidor público de
   OpenStreetMap no está pensado para tráfico alto: https://operations.osmfoundation.org/policies/tiles/ */
window.NEXO_CONFIG = {
  TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  CENTER: [4.65, -74.09],
  ZOOM: 12,
  MIN_ZOOM: 10,
  // Límites aproximados de Bogotá y alrededores, para que el mapa no se pierda.
  BOUNDS: [[4.40, -74.35], [4.95, -73.95]],
  // Backend (Supabase). Mientras estén vacíos la app funciona en modo local, guardando en el navegador.
  // La "anon key" es pública por diseño; la seguridad la ponen las reglas RLS de supabase/schema.sql.
  // Nunca pegues aquí la "service_role key".
  SUPABASE_URL: 'https://semgeiysshqhlpicuwfq.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_6oKy2mv1MGGi4LWuhn0omg_bMVIxK56'
};
