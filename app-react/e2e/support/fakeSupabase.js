// Supabase falso para os testes no navegador real. Entra na rede do navegador
// (page.route), então o app roda o código de produção sem saber que o servidor
// é de mentira. Entende o suficiente do PostgREST (filtros eq/in/is/not,
// ordenação, limite, upsert, objeto único) e do GoTrue (sessão) para o treino.
//
// `reachable = false` faz toda chamada falhar na rede (como sem sinal) e
// `hang = true` deixa as chamadas penduradas (sinal fraco);
// `writeLatencyMs` deixa só as escrituras lentas (rede ruim).

import { SUPABASE_ORIGIN } from './origin.js';

export { SUPABASE_ORIGIN, SESSION_KEY } from './origin.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range',
};

const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function makeSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp })}.e2e`;
  return { access_token: token, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 60 * 60 * 24 * 365, expires_at: exp, user };
}

function matches(value, spec) {
  const [op, ...rest] = spec.split('.');
  const arg = rest.join('.');
  const str = value === null || value === undefined ? null : String(value);
  switch (op) {
    case 'eq': return str === arg;
    case 'neq': return str !== arg;
    case 'gt': return str !== null && str > arg;
    case 'gte': return str !== null && str >= arg;
    case 'lt': return str !== null && str < arg;
    case 'lte': return str !== null && str <= arg;
    case 'is': return arg === 'null' ? str === null : str === arg;
    case 'in': return arg.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(str);
    case 'not': return !matches(value, arg);
    default: return true;
  }
}

export class FakeSupabase {
  constructor({ user }) {
    this.user = user;
    this.reachable = true;
    this.hang = false;          // sinal fraco: a conexão abre, mas a resposta nunca vem
    this.writeLatencyMs = 0;
    this.tables = {};
    this.seq = 1;
    this.requests = [];   // [{ method, path, ok }]
    this.unhandled = [];  // rotas que o app pediu e o falso não conhece
  }

  id(prefix = 'id') { return `${prefix}-${this.seq++}`; }
  rows(table) { return (this.tables[table] ||= []); }
  seed(table, rows) { this.rows(table).push(...rows); }

  // Plano ativo com todos os dias da semana (o teste não depende do dia em que roda).
  seedPlan({ exercises, days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] }) {
    const today = new Date();
    const end = new Date(today.getTime() + 28 * 86400000);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const plan = { id: 'plan-1', user_id: this.user.id, name: 'Plano E2E', is_active: true, created_at: '2026-01-01T00:00:00Z', start_date: iso(today), end_date: iso(end), duration_weeks: 4, created_by: null };
    this.seed('workout_plans', [plan]);
    days.forEach((dia, i) => {
      const day = { id: `day-${i}`, plan_id: plan.id, dia, foco: 'Peito', order_index: i };
      this.seed('plan_days', [day]);
      exercises.forEach((ex, j) => this.seed('plan_exercises', [{ id: `ex-${i}-${j}`, plan_day_id: day.id, is_post_workout: false, order_index: j, tecnica: '', grupo: null, aquecimento: null, intensidade: null, ...ex }]));
    });
  }

  get workouts() { return this.rows('workouts'); }
  get sets() { return this.rows('exercise_sets'); }
  setOf(exercise, n) { return this.sets.find(s => s.exercise_name === exercise && s.set_number === n); }

  async install(context) {
    await context.route(`${SUPABASE_ORIGIN}/**`, route => this.handle(route));
  }

  async handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (!this.reachable) {
      this.requests.push({ method, path: url.pathname, ok: false });
      return route.abort('connectionfailed');
    }
    // Nunca responde nem falha: quem encerra é o prazo do próprio app (lib/fetchTimeout.js).
    if (this.hang) {
      this.requests.push({ method, path: url.pathname, ok: false });
      return new Promise(() => {});
    }
    const isWrite = url.pathname.startsWith('/rest/v1/') && method !== 'GET';
    if (isWrite && this.writeLatencyMs > 0) await new Promise(r => setTimeout(r, this.writeLatencyMs));
    if (!this.reachable) return route.abort('connectionfailed'); // caiu durante a espera
    this.requests.push({ method, path: url.pathname, ok: true });

    let res;
    if (url.pathname.startsWith('/auth/v1/')) res = this.auth(url, method, req);
    else if (url.pathname.startsWith('/rest/v1/rpc/')) res = this.rpc(url.pathname.split('/').pop());
    else if (url.pathname.startsWith('/rest/v1/')) res = this.rest(url, method, req);
    else if (url.pathname.startsWith('/functions/v1/')) res = { status: 200, body: {} };
    else { this.unhandled.push(`${method} ${url.pathname}`); res = { status: 404, body: { message: 'e2e: rota desconhecida' } }; }

    return route.fulfill({
      status: res.status,
      headers: { ...CORS, 'content-type': 'application/json', ...(res.headers || {}) },
      body: res.body === undefined ? '' : JSON.stringify(res.body),
    });
  }

  auth(url, method, req) {
    if (url.pathname.endsWith('/user')) {
      // updateUser({ data }): grava os dados do perfil, como o GoTrue, e devolve o usuário atualizado.
      const data = method === 'PUT' ? req.postDataJSON?.()?.data : null;
      if (data) this.user = { ...this.user, user_metadata: { ...this.user.user_metadata, ...data } };
      return { status: 200, body: this.user };
    }
    if (url.pathname.endsWith('/token')) return { status: 200, body: makeSession(this.user) };
    if (url.pathname.endsWith('/logout')) return { status: 204 };
    return { status: 200, body: {} };
  }

  rpc(name) {
    const fixed = {
      current_legal_date: '2026-01-01',
      my_account_deactivated: false,
      my_experiments: [],
    };
    if (name in fixed) return { status: 200, body: fixed[name] };
    this.unhandled.push(`rpc ${name}`);
    return { status: 200, body: null };
  }

  rest(url, method, req) {
    const table = url.pathname.replace('/rest/v1/', '');
    const params = url.searchParams;
    const accept = req.headers().accept || '';
    const single = accept.includes('vnd.pgrst.object');
    const prefer = req.headers().prefer || '';
    const rows = this.rows(table);

    const filters = [...params.entries()].filter(([k]) => !['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k));
    const own = filters.filter(([k]) => !k.includes('.'));
    const select = params.get('select') || '*';
    const where = row => own.every(([k, spec]) => matches(row[k], spec));

    const shape = row => {
      const out = { ...row };
      // Embutido `workouts!inner(user_id, workout_date)` das consultas de recorde e histórico.
      if (/workouts!inner/.test(select) && table === 'exercise_sets') {
        const w = this.workouts.find(x => x.id === row.workout_id);
        out.workouts = w ? { user_id: w.user_id, workout_date: w.workout_date } : null;
      }
      return out;
    };
    const joinedOk = row => filters.filter(([k]) => k.startsWith('workouts.')).every(([k, spec]) => {
      const w = this.workouts.find(x => x.id === row.workout_id);
      return !!w && matches(w[k.split('.')[1]], spec);
    });

    const reply = list => {
      const status = method === 'POST' ? 201 : 200;
      if (single) {
        return list.length === 1 ? { status: 200, body: list[0] } : { status: 406, body: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${list.length} rows` } };
      }
      return { status, body: list, headers: { 'content-range': `0-${Math.max(list.length - 1, 0)}/${list.length}` } };
    };
    const wantsBody = prefer.includes('return=representation');

    if (method === 'GET') {
      let list = rows.filter(r => where(r) && joinedOk(r));
      const order = params.get('order');
      if (order) {
        const [col, dir] = order.split(',')[0].split('.');
        list = [...list].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      if (params.get('limit')) list = list.slice(0, Number(params.get('limit')));
      if (!(table in this.tables)) this.unhandled.push(`GET ${table}`);
      return reply(list.map(shape));
    }

    const body = req.postDataJSON?.() ?? null;
    if (method === 'POST') {
      const incoming = [].concat(body);
      const conflict = params.get('on_conflict');
      const saved = [];
      for (const item of incoming) {
        if (conflict && prefer.includes('merge-duplicates')) {
          const cols = conflict.split(',');
          const hit = rows.find(r => cols.every(c => r[c] === item[c]));
          if (hit) { Object.assign(hit, item); saved.push(hit); continue; }
        }
        // Índice único do banco real: um treino por usuário e dia.
        if (table === 'workouts' && rows.some(r => r.user_id === item.user_id && r.workout_date === item.workout_date)) {
          return { status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const row = table === 'workouts'
          ? { id: this.id('w'), completed: false, started_at: null, finished_at: null, duration_seconds: null, rating: null, notes: null, created_at: new Date().toISOString(), ...item }
          : { ...(item.id ? {} : { id: this.id(table) }), ...item };
        rows.push(row);
        saved.push(row);
      }
      return wantsBody ? reply(saved.map(shape)) : { status: 201 };
    }
    if (method === 'PATCH') {
      const hit = rows.filter(where);
      hit.forEach(r => Object.assign(r, body));
      return wantsBody ? reply(hit.map(shape)) : { status: 204 };
    }
    if (method === 'DELETE') {
      this.tables[table] = rows.filter(r => !where(r));
      return { status: 204 };
    }
    return { status: 405, body: {} };
  }
}
