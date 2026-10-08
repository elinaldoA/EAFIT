// Mensagens de resultado do envio de comunicado (pages/Broadcast.jsx), a
// partir da resposta da função admin-broadcast.

// Trecho acrescentado quando o envio também foi por e-mail.
export function emailResult(data) {
  return data?.emailTargetCount == null ? '' : ` E-mail: ${data.emailSent} de ${data.emailTargetCount}.`;
}

// Resultado do "Enviar só para mim": diz separadamente o que houve com o push
// e com o e-mail, porque o admin costuma não ter push ativo (conta de admin
// não entra no app) e testar só o e-mail.
export function testResult(data) {
  const emailAsked = data?.emailTargetCount != null;
  if (data.targetCount === 0 && !emailAsked) {
    return 'Erro: você não tem push ativo em nenhum aparelho. Ative os lembretes no app (Perfil → Notificações) logado com esta conta, ou marque "Enviar também por e-mail" para testar por e-mail.';
  }
  if (emailAsked && !data.emailSent) {
    return data.emailTargetCount === 0
      ? 'Erro: o e-mail não foi enviado porque esta conta não pode receber comunicados (e-mail não confirmado ou e-mails de novidades desligados).'
      : 'Erro: o e-mail foi aceito para envio, mas o Gmail recusou. Veja o log da função admin-broadcast.';
  }
  return `Teste enviado: ${data.sent} de ${data.targetCount} dispositivo(s).${emailResult(data)}`;
}
