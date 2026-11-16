// Campo de formulário com erro: marcado como inválido e descrito pela mensagem
// que o FieldError (components/FieldError.jsx) mostra logo abaixo dele.
export const fieldErrorId = id => `${id}Err`;

export function invalidProps(id, message) {
  return message ? { 'aria-invalid': true, 'aria-describedby': fieldErrorId(id) } : {};
}

// Leva a pessoa (e o leitor de tela) ao primeiro campo com problema, na ordem dada.
export function focusFirstError(errors, ids, doc = document) {
  const first = Object.keys(ids).find(field => errors[field]);
  if (first) doc.getElementById(ids[first])?.focus();
}
