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
    if(/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if(/email not confirmed/i.test(m)) return 'Aún no confirmas tu correo. Revisa tu bandeja de entrada (y el spam).';
    if(/already registered|already been registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
    if(/weak_password|password should|at least \d+ char/i.test(m + (err.code || ''))) return 'La contraseña es muy débil. Usa mínimo 8 caracteres con letras y números.';
    if(/different from the old|same_password/i.test(m + (err.code || ''))) return 'La nueva contraseña debe ser distinta a la anterior.';
    if(/contraseña incorrecta/i.test(m)) return m;
    if(/reports_activity_id_reporter_key/i.test(m)) return 'Ya reportaste esta actividad. Gracias.';
    if(/duplicate key|23505/i.test(m + (err.code || ''))) return 'Ya estás inscrito en esta actividad.';
    if(/futuras|límite de|permiso|no está disponible/i.test(m)) return m;
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
    async moderate(id, status){
      var r = await sb.from('activities').update({status:status}).eq('id', id).select();
      if(r.error) fail(r.error);
      if(!r.data.length) fail({message:'No tienes permiso para moderar.'});
    }
  };
})();
