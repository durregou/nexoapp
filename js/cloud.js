/* Conexión con Supabase. Si falta la URL o la llave, NexoCloud.enabled es false
   y la app sigue en modo local (todo en el navegador). */
(function(){
  'use strict';
  var C = window.NEXO_CONFIG || {};
  if(!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase)){ window.NexoCloud = {enabled:false}; return; }

  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
  });
  function userOf(u){
    var m = (u && u.user_metadata) || {};
    return u ? {id:u.id, email:u.email, first:m.first_name || '', last:m.last_name || ''} : null;
  }
  function rowToAct(r, userId, taken){
    return {id:r.id, cat:r.cat, title:r.title, host:r.host, loc:r.loc, place:r.place, lat:r.lat, lng:r.lng,
      date:r.date, time:String(r.time).slice(0,5), total:r.total, desc:r.description, status:r.status,
      taken:taken, mine:!!userId && r.owner === userId};
  }
  var BUCKET = 'pet-photos';
  function petRow(r, userId){
    var url = r.photo_path ? sb.storage.from(BUCKET).getPublicUrl(r.photo_path).data.publicUrl : null;
    return {id:r.id, kind:r.kind, species:r.species, name:r.name || '', desc:r.description, loc:r.loc, place:r.place,
      lat:r.lat, lng:r.lng, seen:r.seen_on, photo:url, photoPath:r.photo_path, status:r.status, resolved:r.resolved,
      created:r.created_at, mine:!!userId && r.owner === userId};
  }
  var today = function(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  function fail(error){ var e = new Error(error && error.message || 'Error de conexión'); e.code = error && error.code; throw e; }

  /* Mensajes del servidor (los triggers de schema.sql) o genéricos, en español */
  function friendly(err){
    var m = (err && err.message) || '';
    if(/cupos completos/i.test(m)) return 'Los cupos se acaban de llenar.';
    var chk = /violates check constraint "([a-z_]+)"/i.exec(m);
    if(chk){
      var byName = {
        activities_title_check:'El título debe tener entre 3 y 80 caracteres.',
        activities_host_check:'«Quién organiza» debe tener entre 2 y 60 caracteres.',
        activities_place_check:'El lugar debe tener entre 2 y 90 caracteres.',
        activities_description_check:'La descripción debe tener entre 5 y 400 caracteres.',
        activities_total_check:'Los cupos deben estar entre 1 y 500.',
        activities_lat_check:'El lugar debe estar dentro de Bogotá.',
        activities_lng_check:'El lugar debe estar dentro de Bogotá.',
        activities_loc_check:'Elige una localidad de la lista.',
        reports_details_check:'El comentario puede tener hasta 200 caracteres.'
      };
      return byName[chk[1]] || 'Revisa los datos: alguno es demasiado corto o demasiado largo.';
    }
    if(/pet_contacts_phone_check/i.test(m)) return 'El teléfono debe ser un celular colombiano de 10 dígitos (empieza por 3).';
    if(/violates check constraint "pets_(description|place|name)_check"/i.test(m)) return 'Revisa la descripción (5 a 400 caracteres), el lugar y el nombre.';
    if(/violates check constraint "pets_(lat|lng)_check"/i.test(m)) return 'El lugar debe estar dentro de Bogotá.';
    if(/violates check constraint "pets_photo_path_check"|La foto no es válida/i.test(m)) return 'La foto no es válida. Prueba con otra.';
    if(/exceeded the maximum allowed size|payload too large/i.test(m)) return 'La foto pesa demasiado. Prueba con otra.';
    if(/mime type|not supported/i.test(m)) return 'La foto debe ser una imagen (JPG, PNG o WebP).';
    if(/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if(/email not confirmed/i.test(m)) return 'Aún no confirmas tu correo. Revisa tu bandeja de entrada (y el spam).';
    if(/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
    if(/weak_password|password should|at least \d+ char/i.test(m + (err.code || ''))) return 'La contraseña es muy débil. Usa mínimo 8 caracteres con letras y números.';
    if(/different from the old|same_password/i.test(m + (err.code || ''))) return 'La nueva contraseña debe ser distinta a la anterior.';
    if(/contraseña incorrecta/i.test(m)) return m;
    if(/pet_reports_pet_id_reporter_key/i.test(m)) return 'Ya reportaste este aviso. Gracias.';
    if(/reports_activity_id_reporter_key/i.test(m)) return 'Ya reportaste esta actividad. Gracias.';
    if(/duplicate key|23505/i.test(m + (err.code || ''))) return 'Ya estás inscrito en esta actividad.';
    if(/futuras|límite de|permiso|no está disponible|fecha no puede/i.test(m)) return m;
    if(/row-level security|jwt|not authenticated/i.test(m)) return 'Inicia sesión para continuar.';
    if(/rate limit|security purposes/i.test(m)) return 'Se enviaron demasiados correos o intentos. Espera un momento y vuelve a intentarlo.';
    if(/fetch|network/i.test(m)) return 'No hay conexión. Intenta de nuevo.';
    return 'Algo salió mal. Intenta de nuevo.';
  }

  window.NexoCloud = {
    enabled:true,
    friendly:friendly,

    async user(){
      var r = await sb.auth.getSession();
      return userOf(r.data && r.data.session && r.data.session.user);
    },
    onAuth(cb, onRecovery){
      sb.auth.onAuthStateChange(function(evt, session){
        if(evt === 'PASSWORD_RECOVERY' && onRecovery) onRecovery();
        cb(userOf(session && session.user));
      });
    },
    /* Cuenta con correo y contraseña. Los nombres y la aceptación de los términos viajan como
       metadatos y quedan guardados en la cuenta. */
    async signUp(email, password, names){
      var r = await sb.auth.signUp({email:email, password:password, options:{
        emailRedirectTo:location.origin + location.pathname,
        data:{first_name:names.first, last_name:names.last, full_name:names.first + ' ' + names.last,
          terms_version:'2026-10', terms_accepted_at:new Date().toISOString()}}});
      if(r.error) fail(r.error);
      return {signedIn:!!r.data.session};   // false si Supabase exige confirmar el correo
    },
    async signIn(email, password){
      var r = await sb.auth.signInWithPassword({email:email, password:password});
      if(r.error) fail(r.error);
    },
    async resetPassword(email){
      var r = await sb.auth.resetPasswordForEmail(email, {redirectTo:location.origin + location.pathname});
      if(r.error) fail(r.error);
    },
    async setPassword(password){
      var r = await sb.auth.updateUser({password:password});
      if(r.error) fail(r.error);
    },
    /* Pide la contraseña otra vez antes de borrar, por si alguien deja la sesión abierta. */
    async deleteAccount(email, password){
      var v = await sb.auth.signInWithPassword({email:email, password:password});
      if(v.error) fail({message:'Contraseña incorrecta.'});
      try {   // las fotos viven en Storage, no en la base: hay que borrarlas con la API antes de perder la sesión
        var u = await window.NexoCloud.user();
        var store = sb.storage.from(BUCKET), ls = await store.list(u.id, {limit:1000});
        if(!ls.error && ls.data.length) await store.remove(ls.data.map(function(f){ return u.id + '/' + f.name; }));
      } catch(e){}
      var r = await sb.rpc('delete_my_account');
      if(r.error) fail(r.error);
      try { await sb.auth.signOut({scope:'local'}); } catch(e){}
    },
    async updateName(names){
      var r = await sb.auth.updateUser({data:{first_name:names.first, last_name:names.last, full_name:names.first + ' ' + names.last}});
      if(r.error) fail(r.error);
    },
    async signOut(){ await sb.auth.signOut(); },

    /* Actividades futuras con sus cupos. "taken" excluye mi propia inscripción
       porque la app la suma aparte (count = taken + yo). */
    async activities(userId, joinedIds){
      var a = await sb.from('activities').select('*').eq('status', 'approved').gte('date', today()).order('date').order('time');
      if(a.error) fail(a.error);
      var t = await sb.from('activity_taken').select('*');
      if(t.error) fail(t.error);
      var taken = {}; t.data.forEach(function(x){ taken[x.activity_id] = x.taken; });
      return a.data.map(function(r){
        return rowToAct(r, userId, Math.max(0, (taken[r.id] || 0) - (joinedIds.has(r.id) ? 1 : 0)));
      });
    },
    async myRegistrations(){
      var r = await sb.from('registrations').select('activity_id');
      if(r.error) fail(r.error);
      return new Set(r.data.map(function(x){ return x.activity_id; }));
    },
    async join(id){ var r = await sb.from('registrations').insert({activity_id:id}); if(r.error) fail(r.error); },
    async leave(id){ var r = await sb.from('registrations').delete().eq('activity_id', id); if(r.error) fail(r.error); },
    async create(a){
      var r = await sb.from('activities').insert({cat:a.cat, title:a.title, host:a.host, loc:a.loc, place:a.place,
        lat:a.lat, lng:a.lng, date:a.date, time:a.time, total:a.total, description:a.desc}).select().single();
      if(r.error) fail(r.error);
      return {id:r.data.id, status:r.data.status};
    },
    async remove(id){
      var r = await sb.from('activities').delete().eq('id', id).select();
      if(r.error) fail(r.error);
      if(!r.data.length) fail({message:'No tienes permiso o la actividad ya no existe.'});
    },

    /* ---- moderación ---- */
    /* Todas las actividades que publicó esta persona, con su estado (pendiente, aprobada, rechazada). */
    async myActivities(userId){
      var r = await sb.from('activities').select('*').eq('owner', userId).order('created_at', {ascending:false});
      if(r.error) fail(r.error);
      return r.data.map(function(x){ return rowToAct(x, userId, 0); });
    },
    /* Las reglas RLS solo dejan ver la fila propia en "admins": si vuelve una fila, esta persona es admin. */
    async isAdmin(userId){
      var r = await sb.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
      return !r.error && !!r.data;
    },
    async pending(){
      var r = await sb.from('activities').select('*').eq('status', 'pending').order('created_at');
      if(r.error) fail(r.error);
      return r.data.map(function(x){ return rowToAct(x, null, 0); });
    },
    /* ---- reportes ---- */
    async report(id, reason, details){
      var r = await sb.from('reports').insert({activity_id:id, reason:reason, details:details || null});
      if(r.error) fail(r.error);
    },
    /* Solo los admins pueden leerlos (RLS): para cualquier otra persona vuelve una lista vacía. */
    async reports(){
      var r = await sb.from('reports').select('activity_id, reason, details, created_at').order('created_at');
      if(r.error) fail(r.error);
      return r.data;
    },
    async dismissReports(id){
      var r = await sb.from('reports').delete().eq('activity_id', id);
      if(r.error) fail(r.error);
    },
    /* ---- mascotas perdidas y encontradas ---- */
    /* Reportes aprobados, sin resolver y que aún no vencen (expires_on es el último día que se muestra). */
    async pets(userId){
      var r = await sb.from('pets').select('*').eq('status', 'approved').eq('resolved', false)
        .gte('expires_on', today()).order('created_at', {ascending:false});
      if(r.error) fail(r.error);
      return r.data.map(function(x){ return petRow(x, userId); });
    },
    async myPets(userId){
      var r = await sb.from('pets').select('*').eq('owner', userId).order('created_at', {ascending:false});
      if(r.error) fail(r.error);
      return r.data.map(function(x){ return petRow(x, userId); });
    },
    async pendingPets(){
      var r = await sb.from('pets').select('*').eq('status', 'pending').order('created_at');
      if(r.error) fail(r.error);
      return r.data.map(function(x){ return petRow(x, null); });
    },
    /* El teléfono solo lo entrega la base de datos a quien tiene sesión iniciada. */
    async petContact(id){
      var r = await sb.from('pet_contacts').select('phone').eq('pet_id', id).maybeSingle();
      if(r.error) fail(r.error);
      return r.data ? r.data.phone : null;
    },
    /* Sube la foto (carpeta = id de usuario), crea el reporte y guarda el contacto.
       Si algo falla a medias, deshace lo anterior para no dejar archivos ni filas sueltas. */
    async createPet(p, blob){
      var u = await window.NexoCloud.user();
      if(!u) fail({message:'not authenticated'});
      var store = sb.storage.from(BUCKET), path = null;
      if(blob){
        path = u.id + '/' + crypto.randomUUID() + '.jpg';
        var up = await store.upload(path, blob, {contentType:'image/jpeg', upsert:false});
        if(up.error) fail(up.error);
      }
      var cleanup = async function(){ if(path){ try { await store.remove([path]); } catch(e){} } };
      var ins = await sb.from('pets').insert({kind:p.kind, species:p.species, name:p.name || null, description:p.desc,
        loc:p.loc, place:p.place, lat:p.lat, lng:p.lng, seen_on:p.seen, photo_path:path}).select().single();
      if(ins.error){ await cleanup(); fail(ins.error); }
      var c = await sb.from('pet_contacts').insert({pet_id:ins.data.id, phone:p.phone});
      if(c.error){ await sb.from('pets').delete().eq('id', ins.data.id); await cleanup(); fail(c.error); }
      return {id:ins.data.id, status:ins.data.status};
    },
    /* Reportes de avisos de mascotas (mismo flujo que los de actividades). */
    async reportPet(id, reason, details){
      var r = await sb.from('pet_reports').insert({pet_id:id, reason:reason, details:details || null});
      if(r.error) fail(r.error);
    },
    async petReports(){
      var r = await sb.from('pet_reports').select('pet_id, reason, details, created_at').order('created_at');
      if(r.error) fail(r.error);
      return r.data;
    },
    async dismissPetReports(id){
      var r = await sb.from('pet_reports').delete().eq('pet_id', id);
      if(r.error) fail(r.error);
    },
    async resolvePet(id){ var r = await sb.rpc('resolve_pet', {pet_id:id}); if(r.error) fail(r.error); },
    async removePet(id, photoPath){
      var r = await sb.from('pets').delete().eq('id', id).select();
      if(r.error) fail(r.error);
      if(!r.data.length) fail({message:'No tienes permiso o el reporte ya no existe.'});
      if(photoPath){ try { await sb.storage.from(BUCKET).remove([photoPath]); } catch(e){} }
    },
    async moderatePet(id, status){
      var r = await sb.from('pets').update({status:status}).eq('id', id).select();
      if(r.error) fail(r.error);
      if(!r.data.length) fail({message:'No tienes permiso para moderar.'});
    },

    async moderate(id, status){
      var r = await sb.from('activities').update({status:status}).eq('id', id).select();
      if(r.error) fail(r.error);
      if(!r.data.length) fail({message:'No tienes permiso para moderar.'});
    }
  };
})();
