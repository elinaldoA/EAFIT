import { db } from './supabase';
import { saveRule } from './autoNotifications';

// Comunicação → Sumidos: quem está há N dias sem treinar e sem abrir o app
// (regra no banco, public.dormant_users). Daqui sai o envio manual (push +
// e-mail pelo admin-broadcast) e o liga/desliga da regra automática 'dormant'.

export const DAY_OPTIONS = [7, 14, 30, 60];
export const DORMANT_RULE = 'dormant';

export const DEFAULT_MESSAGE = {
  title: '👋 {nome}, sentimos sua falta',
  body: 'Tem novidade na Nutrição (lembretes do café à ceia) e seu treino está te esperando. Que tal hoje?',
};

export function fromRow(r) {
  return {
    id: r.user_id,
    email: r.email,
    name: r.nome || '',
    lastWorkout: r.last_workout,
    lastSeen: r.last_seen,
    days: Number(r.days_away),
    push: !!r.has_push,
    emailOk: !!r.email_ok,
    paused: !!r.paused,
    lastNotified: r.last_notified,
  };
}

export async function fetchDormant(minDays) {
  const { data, error } = await db.rpc('admin_dormant_candidates', { min_days: minDays });
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Quem entra marcado ao abrir a lista: tem por onde receber e não pediu pausa.
export function defaultSelection(people) {
  return new Set(people.filter(p => !p.paused && (p.push || p.emailOk)).map(p => p.id));
}

export function summarize(people, selected = null) {
  const list = selected ? people.filter(p => selected.has(p.id)) : people;
  return {
    total: list.length,
    push: list.filter(p => p.push).length,
    email: list.filter(p => p.emailOk).length,
    none: list.filter(p => !p.push && !p.emailOk).length,
  };
}

export async function sendToDormant({ ids, title, body, email }) {
  const { data, error } = await db.functions.invoke('admin-broadcast', {
    body: { title, body, targetUserIds: ids, email: email ? 'aviso' : undefined },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchDormantRule() {
  const { data, error } = await db.from('engagement_rules').select('*').eq('kind', DORMANT_RULE).maybeSingle();
  if (error) throw error;
  return data;
}

export function setDormantRuleEnabled(enabled) {
  return saveRule(DORMANT_RULE, { enabled });
}
