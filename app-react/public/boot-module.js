// Roda antes da splash: marca <html data-module> com o módulo da pessoa, para a
// splash já abrir com o spinner e as cores certas. Vale o esporte da conta
// guardado na sessão do Supabase (user_metadata.esporte); sem sessão, o último
// módulo usado neste aparelho (gravado por lib/sportModule.js). O app corrige
// em seguida se o módulo não estiver liberado. Arquivo externo porque a CSP não
// permite script inline.
try {
  var id = null;
  for (var i = 0; i < localStorage.length && !id; i++) {
    var k = localStorage.key(i);
    if (/^sb-.*-auth-token$/.test(k)) {
      var s = JSON.parse(localStorage.getItem(k) || 'null');
      var u = s && (s.user || (s.currentSession && s.currentSession.user));
      id = u && u.user_metadata && u.user_metadata.esporte;
    }
  }
  if (!id) id = localStorage.getItem('eafit_boot_module');
  if (id && id !== 'musculacao' && /^[a-z]{3,20}$/.test(id)) document.documentElement.setAttribute('data-module', id);
} catch (e) { /* armazenamento bloqueado */ }
