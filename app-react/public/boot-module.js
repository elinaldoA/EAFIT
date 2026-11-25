// Roda antes da splash: marca <html> com o módulo da pessoa, para a splash já
// abrir com o spinner e as cores certas. Vale o esporte da conta guardado na
// sessão do Supabase (user_metadata.esporte) para o tema (data-module) e para o
// spinner (data-spinner); sem sessão, o spinner segue o último módulo usado
// neste aparelho (gravado por lib/sportModule.js). O app corrige em seguida se o
// módulo não estiver liberado. Arquivo externo porque a CSP não permite script
// inline.
try {
  var fromSession = null, beta = [], enabled = [];
  for (var i = 0; i < localStorage.length && !fromSession; i++) {
    var k = localStorage.key(i);
    if (/^sb-.*-auth-token$/.test(k)) {
      var s = JSON.parse(localStorage.getItem(k) || 'null');
      var u = s && (s.user || (s.currentSession && s.currentSession.user));
      fromSession = u && u.user_metadata && u.user_metadata.esporte;
      beta = (u && u.app_metadata && u.app_metadata.beta_modules) || [];
    }
  }
  // Módulo ainda não liberado ao público (ex.: Run) só vale se o painel admin o liberou
  // (cache de lib/sportModule.js) ou a conta é do teste fechado; senão a splash é a da Gym.
  var cached = JSON.parse(localStorage.getItem('eafit_modules') || 'null');
  if (cached && Array.isArray(cached.enabled)) enabled = cached.enabled;
  if (!Array.isArray(beta)) beta = [];
  var ok = function (v) {
    return v && v !== 'musculacao' && /^[a-z]{3,20}$/.test(v) && (enabled.indexOf(v) >= 0 || beta.indexOf(v) >= 0);
  };
  var root = document.documentElement;
  if (ok(fromSession)) root.setAttribute('data-module', fromSession);
  var spinner = fromSession || localStorage.getItem('eafit_boot_module');
  if (ok(spinner)) root.setAttribute('data-spinner', spinner);
} catch (e) { /* armazenamento bloqueado */ }
