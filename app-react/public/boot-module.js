// Roda antes da splash: marca <html data-module> com o último módulo usado neste
// aparelho (gravado por lib/sportModule.js), para a splash já abrir com o
// spinner e as cores certas. O app corrige em seguida se a conta for outra.
// Arquivo externo porque a CSP não permite script inline.
try {
  var id = localStorage.getItem('eafit_boot_module');
  if (id && /^[a-z]{3,20}$/.test(id)) document.documentElement.setAttribute('data-module', id);
} catch (e) { /* armazenamento bloqueado */ }
