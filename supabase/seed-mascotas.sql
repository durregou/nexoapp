-- NexoApp · 8 reportes de mascotas de ejemplo (ficticios). Ejecútalo DESPUÉS de schema.sql.
-- Quedan aprobados, sin dueño (solo un admin puede quitarlos) y VENCEN el 31 de diciembre de 2026:
-- el último día que se muestran es el 31, y el 1 de enero ya no aparecen.
-- No tienen teléfono a propósito (un número inventado podría ser el de una persona real);
-- en el detalle se muestra «No hay un contacto disponible».
-- Es seguro correrlo más de una vez: no inserta un ejemplo si ya existe.
insert into public.pets (kind, species, name, description, loc, place, lat, lng, seen_on, status, expires_on)
select kind, species, name, description, loc, place, lat, lng, seen_on::date, 'approved', date '2026-12-31'
from (values
  ('perdido', 'perro', 'Max', '(Ejemplo) Labrador color miel de 3 años, collar rojo con placa. Se asustó con la pólvora y salió corriendo. Responde a su nombre.', 'Suba', 'Parque Mazurén, cerca de la entrada por la calle 153', 4.733, -74.061, '2026-10-25'),
  ('perdido', 'gato', 'Luna', '(Ejemplo) Gata blanca con manchas grises y ojos verdes, sin collar. Es muy tímida: no la persigas, llámala suave y deja comida cerca.', 'Chapinero', 'Barrio Quinta Camacho, carrera 11 con calle 70', 4.6585, -74.0605, '2026-10-24'),
  ('encontrado', 'perro', null, '(Ejemplo) Perro mediano negro con pecho blanco y collar azul sin placa. Está sano y comió bien. Lo cuidamos temporalmente en casa.', 'Kennedy', 'Parque Timiza, cerca del lago', 4.615, -74.145, '2026-10-26'),
  ('perdido', 'perro', 'Rocky', '(Ejemplo) Schnauzer gris de 5 años con corte de pelo reciente y una pequeña cicatriz en la oreja derecha. Es sociable con las personas.', 'Usaquén', 'Cedritos, calle 140 con autopista Norte', 4.723, -74.042, '2026-10-23'),
  ('encontrado', 'gato', null, '(Ejemplo) Gato naranja de pelo corto, muy cariñoso, parece de hogar. Apareció en un jardín y no tiene chip visible.', 'Engativá', 'Barrio Villa Luz, cerca del parque', 4.685, -74.11, '2026-10-26'),
  ('perdido', 'otro', 'Pelusa', '(Ejemplo) Conejo blanco con una mancha café en la nariz. Se escapó de un balcón en primer piso. Necesita agua y verduras frescas.', 'La Candelaria', 'Barrio Egipto, calle 10 con carrera 4', 4.597, -74.064, '2026-10-22'),
  ('perdido', 'gato', 'Michi', '(Ejemplo) Gato atigrado gris de 2 años con collar verde y cascabel. Suele salir y volver, pero esta vez lleva tres días fuera.', 'Teusaquillo', 'Barrio La Soledad, carrera 24 con calle 39', 4.629, -74.074, '2026-10-21'),
  ('encontrado', 'perro', 'Canela', '(Ejemplo) Perrita beagle tricolor con una placa que dice «Canela». Es muy dócil y está bien cuidada; su familia seguro la está buscando.', 'Bosa', 'Parque Metropolitano El Recreo', 4.607, -74.19, '2026-10-25')
) as v(kind, species, name, description, loc, place, lat, lng, seen_on)
where not exists (select 1 from public.pets x where x.owner is null and x.description = v.description);

-- Para quitarlos todos cuando quieras:
--   delete from public.pets where owner is null and description like '(Ejemplo)%';
