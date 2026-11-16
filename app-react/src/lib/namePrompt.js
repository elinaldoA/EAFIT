import { cleanName } from './profileValidation';

// Convite para quem tem conta sem nome dizer como quer ser chamado: o topo de
// todas as telas mostra o nome (lib/utils.js getDisplayName) e, sem ele, o
// e-mail. O cadastro pede o nome desde nov/2026; as contas de antes podem não ter.
const DISMISSED_KEY = 'eafit_name_prompt_dismissed';

// Quem entra com o Google já traz o nome na conta: o primeiro nome dele
// (dá para trocar). Por e-mail, vazio.
export function firstNameFromAccount(md = {}) {
  const raw = md.nome || md.given_name || md.full_name || md.name || '';
  return cleanName(raw).split(' ')[0] || '';
}

// Pura (testável): oferece a quem não tem nome nem apelido, nem na conta nem no
// aparelho (o profile_* local sobe sozinho para a conta, lib/profileSync.js), e
// não dispensou o convite. "Agora não" vale para sempre: o nome continua em
// Perfil → Dados pessoais.
export function shouldOfferName({ metadata = {}, localName = '', dismissed = false }) {
  if (dismissed) return false;
  const has = v => !!cleanName(v);
  return !has(metadata.nome) && !has(metadata.apelido) && !has(localName);
}

const key = userId => `${DISMISSED_KEY}:${userId}`;

export function readNamePromptDismissed(userId) {
  try { return localStorage.getItem(key(userId)) === '1'; } catch { return false; }
}

export function markNamePromptDismissed(userId) {
  try { localStorage.setItem(key(userId), '1'); } catch { /* armazenamento bloqueado: volta na próxima abertura */ }
}

export function readLocalName() {
  try { return localStorage.getItem('profile_nome') || localStorage.getItem('profile_apelido') || ''; } catch { return ''; }
}
