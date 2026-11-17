// Falha de dado "complementar" (um cartão a mais na tela, uma contagem do menu)
// não deve derrubar a página — mas também não pode sumir sem rastro, como
// acontecia com `.catch(() => {})`. Registra no console com o nome da origem
// (aparece no relatório de quem reclama que "o cartão não carrega") e devolve
// o valor reserva.
//   fetchX().then(setX).catch(softFail('Perfil: preferências'))
export function softFail(label, fallback) {
  return err => {
    console.warn(`[painel] falha ao carregar "${label}":`, err?.message || err);
    return fallback;
  };
}
