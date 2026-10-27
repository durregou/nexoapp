-- Borra las actividades de ejemplo repetidas y deja la de menor id de cada una.
-- Solo toca las que no tienen dueño (owner is null), o sea, las del seed.
-- Las que publicó una persona no se tocan. Es seguro correrlo varias veces.
delete from public.activities a
using public.activities b
where a.owner is null and b.owner is null
  and a.title = b.title and a.date = b.date and a.time = b.time
  and a.id > b.id;

-- Comprobación: debe devolver 50 (si no has publicado nada propio).
select count(*) as total_actividades from public.activities;
