-- NexoApp · activar la moderación (se corre UNA sola vez, DESPUÉS de schema.sql).

-- 1) Todo lo que ya existía queda aprobado (antes de esto no había revisión).
--    No lo vuelvas a correr cuando ya haya publicaciones nuevas por revisar:
--    las aprobaría todas sin mirarlas.
update public.activities set status = 'approved' where status = 'pending';

-- 2) Conviértete en administrador. Cambia el correo por el que usas para entrar a NexoApp
--    (tienes que haber iniciado sesión en la app al menos una vez).
insert into public.admins (user_id)
select id from auth.users where email = 'TU_CORREO@ejemplo.com'
on conflict do nothing;

-- Comprobación: debe devolver una fila con tu correo.
select u.email from public.admins a join auth.users u on u.id = a.user_id;
