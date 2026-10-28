-- NexoApp · esquema de base de datos para Supabase
-- Pégalo completo en: Supabase → SQL Editor → New query → Run.
-- Es seguro volver a ejecutarlo (usa "if not exists" / "or replace" donde se puede).

-- ───────── Tablas ─────────
create table if not exists public.activities (
  id          bigint generated always as identity primary key,
  owner       uuid references auth.users(id) on delete set null default auth.uid(),
  cat         text not null check (cat in ('aprender','social','animales')),
  title       text not null check (char_length(title) between 3 and 80),
  host        text not null check (char_length(host) between 2 and 60),
  loc         text not null check (loc in ('Usaquén','Chapinero','Suba','Engativá','Teusaquillo','La Candelaria','Kennedy','Bosa','Ciudad Bolívar')),
  place       text not null check (char_length(place) between 2 and 90),
  lat         double precision not null check (lat between 4.40 and 4.95),
  lng         double precision not null check (lng between -74.35 and -73.95),
  date        date not null,
  time        time not null,
  total       int  not null check (total between 1 and 500),
  base_taken  int  not null default 0 check (base_taken >= 0),   -- solo para datos de ejemplo
  description text not null check (char_length(description) between 5 and 400),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);
-- Para bases creadas antes de la moderación (si la tabla ya existía sin "status"):
alter table public.activities
  add column if not exists status text not null default 'pending' check (status in ('pending','approved','rejected'));
create index if not exists activities_date_idx   on public.activities (date);
create index if not exists activities_owner_idx  on public.activities (owner);
create index if not exists activities_status_idx on public.activities (status);

create table if not exists public.registrations (
  activity_id bigint not null references public.activities(id) on delete cascade,
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);

-- Administradores: solo se agregan desde el SQL Editor (ver moderacion-activar.sql).
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ───────── Cupos públicos (sin exponer quién se inscribió) ─────────
-- La vista se ejecuta con los permisos de su dueño a propósito: solo expone el número.
create or replace view public.activity_taken as
  select a.id as activity_id, a.base_taken + count(r.user_id)::int as taken
  from public.activities a
  left join public.registrations r on r.activity_id = a.id
  group by a.id;
grant select on public.activity_taken to anon, authenticated;

-- ───────── Seguridad por fila (RLS) ─────────
alter table public.activities    enable row level security;
alter table public.registrations enable row level security;
alter table public.admins        enable row level security;

-- Actividades: el público solo ve las aprobadas; cada persona ve además las suyas; el admin ve todas.
drop policy if exists "ver actividades"       on public.activities;
drop policy if exists "publicar"              on public.activities;
drop policy if exists "editar propias"        on public.activities;
drop policy if exists "borrar propias"        on public.activities;
drop policy if exists "moderar"               on public.activities;
drop policy if exists "borrar propias o admin" on public.activities;
create policy "ver actividades" on public.activities for select
  using (status = 'approved' or owner = auth.uid() or public.is_admin());
create policy "publicar" on public.activities for insert to authenticated
  with check (owner = auth.uid());
-- No hay política de edición para el dueño: nadie puede cambiarse su propio "status".
create policy "moderar" on public.activities for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "borrar propias o admin" on public.activities for delete to authenticated
  using (owner = auth.uid() or public.is_admin());

drop policy if exists "ver mis inscripciones"  on public.registrations;
drop policy if exists "inscribirme"            on public.registrations;
drop policy if exists "cancelar mi inscripcion" on public.registrations;
create policy "ver mis inscripciones"   on public.registrations for select to authenticated using (user_id = auth.uid());
create policy "inscribirme"             on public.registrations for insert to authenticated with check (user_id = auth.uid());
create policy "cancelar mi inscripcion" on public.registrations for delete to authenticated using (user_id = auth.uid());

drop policy if exists "ver si soy admin" on public.admins;
create policy "ver si soy admin" on public.admins for select to authenticated using (user_id = auth.uid());

-- ───────── Reglas que el navegador no puede saltarse ─────────
-- Al publicar: queda "pendiente" (si no eres admin), fecha futura (hora de Bogotá) y máximo 10 por día.
create or replace function public.before_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then            -- el SQL Editor (seed) no pasa por aquí
    new.owner      := auth.uid();
    new.base_taken := 0;
    new.status     := case when public.is_admin() then 'approved' else 'pending' end;
    if (new.date + new.time) <= (now() at time zone 'America/Bogota') then
      raise exception 'La fecha y hora deben ser futuras';
    end if;
    if (select count(*) from public.activities
        where owner = new.owner and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Llegaste al límite de 10 publicaciones por día';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists before_publish on public.activities;
create trigger before_publish before insert on public.activities
  for each row execute function public.before_publish();

-- Al inscribirse: solo en actividades aprobadas y sin pasar del cupo
-- (bloquea la fila para que dos personas no tomen el último cupo a la vez).
create or replace function public.check_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare t int; st text; n int;
begin
  select total - base_taken, status into t, st from public.activities where id = new.activity_id for update;
  if t is null then raise exception 'La actividad no existe'; end if;
  if st <> 'approved' then raise exception 'La actividad no está disponible'; end if;
  select count(*) into n from public.registrations where activity_id = new.activity_id;
  if n >= t then raise exception 'Cupos completos'; end if;
  return new;
end $$;
drop trigger if exists check_capacity on public.registrations;
create trigger check_capacity before insert on public.registrations
  for each row execute function public.check_capacity();

-- ───────── Permisos explícitos ─────────
-- Necesarios si al crear el proyecto desmarcaste "Automatically expose new tables";
-- si la dejaste marcada, simplemente no cambian nada. Las filas siguen protegidas por RLS.
grant usage on schema public to anon, authenticated;
grant select on public.activities to anon, authenticated;
grant insert, update, delete on public.activities to authenticated;
grant select, insert, delete on public.registrations to authenticated;
grant select on public.admins to authenticated;

-- ───────── Reportes de la comunidad ─────────
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  activity_id bigint not null references public.activities(id) on delete cascade,
  reporter    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  reason      text   not null check (reason in ('spam','inapropiado','falso','peligroso','otro')),
  details     text   check (details is null or char_length(details) <= 200),
  created_at  timestamptz not null default now(),
  unique (activity_id, reporter)            -- una persona reporta una actividad una sola vez
);
create index if not exists reports_activity_idx on public.reports (activity_id);
alter table public.reports enable row level security;

drop policy if exists "reportar"                 on public.reports;
drop policy if exists "ver reportes (admin)"     on public.reports;
drop policy if exists "descartar reportes (admin)" on public.reports;
create policy "reportar" on public.reports for insert to authenticated with check (reporter = auth.uid());
create policy "ver reportes (admin)" on public.reports for select to authenticated using (public.is_admin());
create policy "descartar reportes (admin)" on public.reports for delete to authenticated using (public.is_admin());
grant insert, select, delete on public.reports to authenticated;

-- Antes de guardar: solo actividades visibles y máximo 20 reportes por persona al día.
create or replace function public.before_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.reporter := auth.uid();
  if not exists (select 1 from public.activities where id = new.activity_id and status = 'approved') then
    raise exception 'La actividad no está disponible';
  end if;
  if (select count(*) from public.reports
      where reporter = new.reporter and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Llegaste al límite de reportes por día';
  end if;
  return new;
end $$;
drop trigger if exists before_report on public.reports;
create trigger before_report before insert on public.reports
  for each row execute function public.before_report();

-- Con 3 reportes de personas distintas, la actividad se oculta sola y vuelve a la cola de revisión.
create or replace function public.after_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where activity_id = new.activity_id) >= 3 then
    update public.activities set status = 'pending' where id = new.activity_id and status = 'approved';
  end if;
  return null;
end $$;
drop trigger if exists after_report on public.reports;
create trigger after_report after insert on public.reports
  for each row execute function public.after_report();

-- ───────── Eliminar mi cuenta ─────────
-- Cada persona puede borrar su propia cuenta desde la app (el navegador no puede borrar usuarios por sí solo).
-- Borra: sus actividades publicadas (y con ellas las inscripciones y reportes de esas actividades),
-- y luego su usuario (lo que arrastra sus inscripciones, sus reportes y, si lo era, su permiso de admin).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'No hay una sesión iniciada'; end if;
  delete from public.activities where owner = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ───────── Mascotas perdidas y encontradas ─────────
create table if not exists public.pets (
  id          bigint generated always as identity primary key,
  owner       uuid default auth.uid() references auth.users(id) on delete cascade,   -- nulo solo en datos de ejemplo
  kind        text not null check (kind in ('perdido','encontrado')),
  species     text not null check (species in ('perro','gato','otro')),
  name        text check (name is null or char_length(name) between 1 and 40),
  description text not null check (char_length(description) between 5 and 400),
  loc         text not null check (loc in ('Usaquén','Chapinero','Suba','Engativá','Teusaquillo','La Candelaria','Kennedy','Bosa','Ciudad Bolívar')),
  place       text not null check (char_length(place) between 2 and 90),
  lat         double precision not null check (lat between 4.40 and 4.95),
  lng         double precision not null check (lng between -74.35 and -73.95),
  seen_on     date not null,
  photo_path  text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  resolved    boolean not null default false,
  expires_on  date not null default ((now() at time zone 'America/Bogota')::date + 60),   -- último día que se muestra
  created_at  timestamptz not null default now()
);
-- Para bases creadas antes de esta versión:
alter table public.pets alter column owner drop not null;
alter table public.pets add column if not exists expires_on date not null default ((now() at time zone 'America/Bogota')::date + 60);
create index if not exists pets_status_idx  on public.pets (status, resolved, created_at desc);
create index if not exists pets_owner_idx   on public.pets (owner);

-- El teléfono va en otra tabla para que solo lo vean personas con sesión iniciada
-- (así los programas que rastrean la página sin cuenta no se lo llevan).
create table if not exists public.pet_contacts (
  pet_id bigint primary key references public.pets(id) on delete cascade,
  phone  text not null check (phone ~ '^3[0-9]{9}$')      -- celular colombiano de 10 dígitos
);

alter table public.pets         enable row level security;
alter table public.pet_contacts enable row level security;

drop policy if exists "ver mascotas"            on public.pets;
drop policy if exists "reportar mascota"        on public.pets;
drop policy if exists "moderar mascotas"        on public.pets;
drop policy if exists "borrar mascota propia o admin" on public.pets;
create policy "ver mascotas" on public.pets for select
  using (status = 'approved' or owner = auth.uid() or public.is_admin());
create policy "reportar mascota" on public.pets for insert to authenticated
  with check (owner = auth.uid());
create policy "moderar mascotas" on public.pets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "borrar mascota propia o admin" on public.pets for delete to authenticated
  using (owner = auth.uid() or public.is_admin());

drop policy if exists "ver contacto"    on public.pet_contacts;
drop policy if exists "guardar contacto" on public.pet_contacts;
create policy "ver contacto" on public.pet_contacts for select to authenticated
  using (exists (select 1 from public.pets p where p.id = pet_id
                 and (p.status = 'approved' or p.owner = auth.uid() or public.is_admin())));
create policy "guardar contacto" on public.pet_contacts for insert to authenticated
  with check (exists (select 1 from public.pets p where p.id = pet_id and p.owner = auth.uid()));

grant select on public.pets to anon, authenticated;
grant insert, update, delete on public.pets to authenticated;
grant select, insert on public.pet_contacts to authenticated;

-- Al reportar: queda pendiente (salvo admin), vence a los 60 días, la fecha no puede ser futura ni de
-- hace más de 60 días, la foto tiene que estar en la carpeta de quien reporta y máximo 5 reportes por día.
create or replace function public.before_pet() returns trigger
language plpgsql security definer set search_path = public as $$
declare hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if auth.uid() is not null then            -- el SQL Editor (datos de ejemplo) no pasa por aquí
    new.owner      := auth.uid();
    new.status     := case when public.is_admin() then 'approved' else 'pending' end;
    new.resolved   := false;
    new.expires_on := hoy + 60;             -- nadie puede alargar su propio vencimiento
    if new.seen_on > hoy or new.seen_on < hoy - 60 then
      raise exception 'La fecha no puede ser futura ni de hace más de 60 días';
    end if;
    if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> new.owner::text then
      raise exception 'La foto no es válida';
    end if;
    if (select count(*) from public.pets where owner = new.owner and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Llegaste al límite de 5 reportes de mascotas por día';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists before_pet on public.pets;
create trigger before_pet before insert on public.pets
  for each row execute function public.before_pet();

-- «Ya apareció»: solo quien lo reportó puede marcarlo como resuelto (nada más puede cambiar).
create or replace function public.resolve_pet(pet_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.pets set resolved = true where id = pet_id and owner = auth.uid();
$$;
revoke all on function public.resolve_pet(bigint) from public, anon;
grant execute on function public.resolve_pet(bigint) to authenticated;

-- ───────── Almacenamiento de fotos (Supabase Storage) ─────────
-- Bucket público para poder mostrar la foto sin sesión. Solo JPEG y máximo 2 MB
-- (la app comprime y convierte cada foto antes de subirla, y de paso le quita la ubicación GPS).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-photos', 'pet-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "fotos mascotas: subir" on storage.objects;
drop policy if exists "fotos mascotas: ver"   on storage.objects;
drop policy if exists "fotos mascotas: borrar" on storage.objects;
-- Cada persona solo puede escribir dentro de su propia carpeta (nombre de carpeta = su id de usuario).
create policy "fotos mascotas: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos mascotas: ver" on storage.objects for select to authenticated
  using (bucket_id = 'pet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "fotos mascotas: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
