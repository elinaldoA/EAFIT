import { useEffect, useState } from 'react';
import { db } from './supabase';

const REFRESH_MS = 2 * 60 * 1000;

// Pendências por seção do menu (chaves de NAV_GROUPS em Layout/nav.js), com o
// texto que explica o número no title do contador.
export function attentionBySection(counts) {
  if (!counts) return {};
  const parts = {
    acompanhamento: [[counts.feedback, 'feedback(s) novo(s)'], [counts.pain, 'relato(s) de dor forte/lesão em 7 dias']],
    comunicacao: [[counts.overdue, 'notificação(ões) agendada(s) atrasada(s)']],
    sistema: [[counts.errors, 'erro(s) do app em 24h']],
  };
  const out = {};
  for (const [key, list] of Object.entries(parts)) {
    const active = list.filter(([n]) => n > 0);
    if (active.length) {
      out[key] = { total: active.reduce((a, [n]) => a + n, 0), title: active.map(([n, label]) => `${n} ${label}`).join(' · ') };
    }
  }
  return out;
}

export async function fetchAttention() {
  const { data, error } = await db.rpc('admin_attention_counts');
  if (error) throw error;
  const r = data?.[0];
  if (!r) return null;
  return { feedback: Number(r.at_feedback), pain: Number(r.at_pain), errors: Number(r.at_errors), overdue: Number(r.at_overdue) };
}

// Contadores do menu: atualiza a cada 2 minutos e quando a aba volta ao foco.
// É complemento — qualquer falha só deixa o menu sem contador.
export function useAttention() {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      Promise.resolve().then(fetchAttention).then(c => { if (active) setCounts(c); }).catch(() => {});
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return attentionBySection(counts);
}
