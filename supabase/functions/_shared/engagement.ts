// Lógica pura da Edge Function send-engagement (testável sem rede/banco).

export type EngagementRule = {
  kind: string;
  send_hour: number;
  weekdays: number[] | null;
  per_user_hour?: boolean;
  title: string;
  body: string;
  // Versão em inglês (null = cai no texto em português).
  title_en?: string | null;
  body_en?: string | null;
};

// Hora (0-23) e dia da semana (0=domingo) em Brasília, mais a data YYYY-MM-DD.
// O cron do Postgres roda em UTC, então a conversão é explícita.
export function nowInSaoPaulo(now: Date = new Date()): { date: string; hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  // "24" aparece à meia-noite em alguns runtimes com hour12:false.
  const hour = Number(get('hour')) % 24;
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { date, hour, dow };
}

// A regra dispara agora? Horário exato e, se houver filtro, dia da semana.
// Regras com per_user_hour rodam a cada hora: quem recebe em cada hora é
// decidido no banco (engagement_candidates), pelo horário preferido de cada
// usuário — aqui só vale o filtro de dia da semana.
export function isRuleDue(
  rule: Pick<EngagementRule, 'send_hour' | 'weekdays' | 'per_user_hour'>,
  hour: number,
  dow: number,
): boolean {
  if (!rule.per_user_hour && rule.send_hour !== hour) return false;
  if (!rule.weekdays || rule.weekdays.length === 0) return true;
  return rule.weekdays.includes(dow);
}

// Texto da regra no idioma do usuário; sem versão em inglês, usa o português.
export function pickRuleText(rule: Pick<EngagementRule, 'title' | 'body' | 'title_en' | 'body_en'>, lang: 'pt' | 'en'): { title: string; body: string } {
  if (lang === 'en' && rule.title_en && rule.body_en) return { title: rule.title_en, body: rule.body_en };
  return { title: rule.title, body: rule.body };
}

// Troca {chave} pelo valor. Chave sem valor vira string vazia, e espaços
// duplicados/pontuação solta deixados pela troca são limpos.
export function renderTemplate(template: string, values: Record<string, string | number | null | undefined>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = values[key];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
