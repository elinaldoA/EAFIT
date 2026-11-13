// E-mail de ativação, chamado todo dia às 10h (Brasília) pelo pg_cron: quem
// criou a conta há 2 ou 5 dias, tem plano e ainda não finalizou nenhum treino
// recebe um lembrete para dar o primeiro passo (regras em _shared/activation.ts).
// Alcança também quem não ativou as notificações por push, que é a maioria.
// Mesmo padrão de send-weekly-emails: sem usuário logado, Verify JWT
// desativado, age via service role e só aceita o header x-cron-secret. Só
// recebe quem tem e-mail confirmado e não se descadastrou; admin, conta
// suspensa, quem está em modo pausa e quem usa o módulo de corrida ficam de fora.
//
// Com ?dry=1 na URL, só conta quem receberia hoje e não envia nada.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { sendEmailBatch } from '../_shared/email.ts';
import { type BulkEmailItem, bulkEmailItem, loadEmailUsers } from '../_shared/emailRecipients.ts';
import { activationEmail } from '../_shared/emailTexts.ts';
import { inboxFromEmail, type InboxItem, saveInbox } from '../_shared/inbox.ts';
import { langOf } from '../_shared/lang.ts';
import { isRunner } from '../_shared/sport.ts';
import { nowInSaoPaulo } from '../_shared/engagement.ts';
import { type ActivationStep, activationStepFor } from '../_shared/activation.ts';
import { canReceiveBulkEmail, isPaused, MAX_BULK_EMAILS } from '../_shared/weeklyEmails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Entre as contas dadas, as que têm o dado na tabela (workouts finalizados ou plano ativo).
async function idsWith(table: 'workouts' | 'workout_plans', ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    let query = supabase.from(table).select('user_id').in('user_id', ids.slice(i, i + 200));
    query = table === 'workouts' ? query.eq('completed', true) : query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of (data || []) as { user_id: string }[]) found.add(r.user_id);
  }
  return found;
}

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const { date: today } = nowInSaoPaulo();

  const { data: admins, error: adminsErr } = await supabase.from('profiles').select('id').eq('is_admin', true);
  if (adminsErr) return json({ error: adminsErr.message }, 500);
  const adminIds = new Set((admins || []).map((a) => a.id as string));

  const picked = new Map<string, ActivationStep>();
  const users = (await loadEmailUsers(supabase)).filter((u) => {
    if (adminIds.has(u.id) || !canReceiveBulkEmail(u) || isPaused(u.meta, today) || isRunner(u.meta)) return false;
    const step = activationStepFor(nowInSaoPaulo(new Date(u.createdAt)).date, today);
    if (step) picked.set(u.id, step);
    return !!step;
  });
  if (!users.length) return json({ candidates: 0, sent: 0 });

  const ids = users.map((u) => u.id);
  let trained: Set<string>;
  let withPlan: Set<string>;
  try {
    [trained, withPlan] = await Promise.all([idsWith('workouts', ids), idsWith('workout_plans', ids)]);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
  const targets = users.filter((u) => withPlan.has(u.id) && !trained.has(u.id));

  const env = { supabaseUrl: SUPABASE_URL, secret: SERVICE_ROLE_KEY };
  const queue: BulkEmailItem[] = [];
  const inbox: { userId: string; item: InboxItem }[] = [];
  for (const u of targets) {
    const step = picked.get(u.id)!;
    queue.push(await bulkEmailItem(u, (lang, name) => activationEmail(lang, step, name), env, 'ativacao'));
    inbox.push({ userId: u.id, item: inboxFromEmail('activation', activationEmail(langOf(u.meta), step)) });
  }

  const counts = { candidates: users.length, eligible: targets.length };
  if (dry) return json({ dry: true, ...counts });
  if (queue.length > MAX_BULK_EMAILS) {
    console.error(`send-activation-emails: ${queue.length} destinatários, enviando só ${MAX_BULK_EMAILS} (limite diário do Gmail)`);
  }

  const delivered: { userId: string; item: InboxItem }[] = [];
  const sent = await sendEmailBatch(queue.slice(0, MAX_BULK_EMAILS), undefined, (index) => delivered.push(inbox[index]));

  // Quem recebeu o e-mail vê o mesmo aviso no app (melhor esforço).
  const byUser = new Map(delivered.map((r) => [r.userId, r.item]));
  if (byUser.size) await saveInbox(supabase, [...byUser.keys()], (userId) => byUser.get(userId)!);

  return json({ ...counts, sent });
});
