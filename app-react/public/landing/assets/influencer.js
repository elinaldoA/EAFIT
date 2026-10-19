// Página /i/ dos influenciadores (ver i/index.html). Lê só as funções
// públicas do banco com a chave anon (a mesma de site.js) e monta a tela com
// textContent — nada vindo do banco vira HTML. Roda depois de site.js (defer
// na ordem), que já decidiu o idioma em <html lang>.
(function () {
  'use strict';
  var SUPABASE_URL = 'https://btzdetvoneyhzthsmdrp.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_NJWhkVt39gqzkAcmvmhw_g_9coJjxnb';
  var root = document.getElementById('infRoot');
  if (!root) return;

  var EN = document.documentElement.lang === 'en';
  var L = function (pt, en) { return EN ? en : pt; };
  var LEVELS = { iniciante: L('Iniciante', 'Beginner'), intermediario: L('Intermediário', 'Intermediate'), avancado: L('Avançado', 'Advanced') };
  var DAYS_EN = { 'Segunda': 'Monday', 'Terça': 'Tuesday', 'Quarta': 'Wednesday', 'Quinta': 'Thursday', 'Sexta': 'Friday', 'Sábado': 'Saturday', 'Domingo': 'Sunday' };

  var params = new URLSearchParams(location.search);
  var code = String(params.get('u') || '').trim().toLowerCase();
  var programId = String(params.get('p') || '').trim();
  if (!/^[a-z0-9-]{3,30}$/.test(code)) code = '';
  if (!/^[0-9a-f-]{36}$/i.test(programId)) programId = '';

  function rpc(name, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify(body || {}),
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function accentOf(inf) {
    return /^#[0-9a-fA-F]{6}$/.test(inf && inf.accent || '') ? inf.accent : '';
  }

  function avatar(inf, size) {
    var a = accentOf(inf);
    var node;
    if (typeof inf.avatar === 'string' && inf.avatar.indexOf('data:image/') === 0) {
      node = el('img', 'inf-ava');
      node.src = inf.avatar;
      node.alt = '';
    } else {
      node = el('span', 'inf-ava inf-ava--initial', (inf.name || '?').charAt(0).toUpperCase());
      node.setAttribute('aria-hidden', 'true');
    }
    node.style.width = node.style.height = size + 'px';
    if (a) node.style.borderColor = a;
    return node;
  }

  // Link que abre o app com o convite do programa e o crédito do cadastro.
  function appLink(infCode, id) {
    var q = new URLSearchParams({ ref: infCode, origem: 'pagina' });
    if (id) q.set('programa', id);
    return '/app/?' + q.toString();
  }

  function pageLink(infCode, id) {
    var q = new URLSearchParams({ u: infCode });
    if (id) q.set('p', id);
    return '/i/?' + q.toString();
  }

  function meta(p) {
    var parts = [LEVELS[p.level] || '', L(p.days + ' dias por semana', p.days + ' days a week')];
    if (p.weeks) parts.push(L(p.weeks + ' semanas', p.weeks + ' weeks'));
    return parts.filter(Boolean).join(' · ');
  }

  function setHero(title, lead) {
    document.getElementById('infTitle').textContent = title;
    document.getElementById('infLead').textContent = lead;
  }

  function show(nodes) {
    root.textContent = '';
    nodes.forEach(function (n) { if (n) root.appendChild(n); });
  }

  function message(text, withList) {
    var box = el('div', 'inf-empty');
    box.appendChild(el('p', 'hint', text));
    if (withList) {
      var a = el('a', 'btn btn-ghost btn-sm', L('Ver todos os influenciadores', 'See all influencers'));
      a.href = '/i/';
      box.appendChild(a);
    }
    show([box]);
  }

  function profileHead(inf) {
    var head = el('div', 'inf-head');
    head.appendChild(avatar(inf, 88));
    var who = el('div', 'inf-who');
    who.appendChild(el('h2', 'inf-name', inf.name));
    who.appendChild(el('span', 'inf-meta', '@' + inf.code + ' · ' + L(inf.followers + ' seguidores', inf.followers + ' followers')));
    if (inf.instagram) {
      var ig = el('a', 'inf-ig', 'Instagram @' + inf.instagram);
      ig.href = 'https://instagram.com/' + encodeURIComponent(inf.instagram);
      ig.target = '_blank';
      ig.rel = 'noopener noreferrer';
      who.appendChild(ig);
    }
    head.appendChild(who);
    return head;
  }

  function renderDirectory(list) {
    setHero(L('Treine com quem você segue', 'Train with who you follow'),
      L('Programas de treino montados por influenciadores parceiros do EAFIT. Escolha um e comece grátis no app.',
        'Workout programs built by EAFIT partner influencers. Pick one and start for free in the app.'));
    if (!list.length) return message(L('Em breve: os primeiros influenciadores parceiros chegam aqui.', 'Coming soon: the first partner influencers will be here.'));
    var ul = el('ul', 'inf-grid');
    list.forEach(function (inf) {
      var li = el('li');
      var a = el('a', 'card inf-card');
      a.href = pageLink(inf.code);
      var a2 = accentOf(inf);
      if (a2) a.style.setProperty('--inf-accent', a2);
      a.appendChild(avatar(inf, 56));
      var t = el('div', 'inf-who');
      t.appendChild(el('strong', 'inf-name', inf.name));
      t.appendChild(el('span', 'inf-meta', '@' + inf.code + ' · ' + L(inf.programs + ' programas', inf.programs + ' programs')));
      if (inf.bio) t.appendChild(el('span', 'inf-bio inf-bio--clamp', inf.bio));
      a.appendChild(t);
      li.appendChild(a);
      ul.appendChild(li);
    });
    show([ul]);
  }

  function renderProfile(inf) {
    document.title = inf.name + ' — EAFIT';
    setHero(inf.name, L('Programas de treino de @' + inf.code + ' no EAFIT', 'Workout programs by @' + inf.code + ' on EAFIT'));
    var a = accentOf(inf);
    if (a) root.style.setProperty('--inf-accent', a);
    var nodes = [profileHead(inf)];
    if (inf.bio) nodes.push(el('p', 'inf-bio', inf.bio));
    nodes.push(el('h3', 'inf-section', L('Programas', 'Programs')));
    if (!inf.programs.length) nodes.push(el('p', 'hint', L('Nenhum programa no ar agora.', 'No programs live right now.')));
    var ul = el('ul', 'inf-grid');
    inf.programs.forEach(function (p) {
      var li = el('li');
      var card = el('a', 'card inf-program');
      card.href = pageLink(inf.code, p.id);
      card.appendChild(el('strong', 'inf-name', p.name));
      card.appendChild(el('span', 'inf-meta', meta(p)));
      if (p.description) card.appendChild(el('span', 'inf-bio inf-bio--clamp', p.description));
      li.appendChild(card);
      ul.appendChild(li);
    });
    nodes.push(ul);
    var cta = el('a', 'btn btn-primary inf-cta', L('Abrir o app e seguir', 'Open the app and follow'));
    cta.href = appLink(inf.code);
    nodes.push(cta);
    show(nodes);
  }

  function renderProgram(p) {
    var inf = p.influencer;
    document.title = p.name + ' — ' + inf.name + ' · EAFIT';
    setHero(p.name, L('Programa de ', 'Program by ') + inf.name);
    var a = accentOf(inf);
    if (a) root.style.setProperty('--inf-accent', a);
    var by = el('a', 'inf-by');
    by.href = pageLink(inf.code);
    by.appendChild(avatar(inf, 36));
    by.appendChild(el('span', null, L('por ', 'by ') + inf.name + ' · @' + inf.code));
    var nodes = [by, el('p', 'inf-meta', meta(p) + ' · ' + L(p.exercises + ' exercícios', p.exercises + ' exercises'))];
    if (p.description) nodes.push(el('p', 'inf-bio', p.description));
    var cta = el('a', 'btn btn-primary inf-cta', L('Começar grátis no app', 'Start for free in the app'));
    cta.href = appLink(inf.code, p.id);
    nodes.push(cta);
    (p.plan || []).forEach(function (day) {
      var box = el('div', 'card inf-day');
      box.appendChild(el('h3', 'inf-section', (EN ? DAYS_EN[day.dia] || day.dia : day.dia) + (day.foco ? ' · ' + day.foco : '')));
      var ul = el('ul', 'inf-ex');
      (day.exercicios || []).forEach(function (ex) {
        var li = el('li');
        li.appendChild(el('span', null, (ex.grupo ? '[' + ex.grupo + '] ' : '') + ex.nome));
        li.appendChild(el('span', 'inf-meta', ex.series + ' × ' + ex.reps));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      nodes.push(box);
    });
    show(nodes);
  }

  var fail = function () { message(L('Não foi possível carregar agora. Tente de novo em instantes.', 'Could not load right now. Please try again shortly.')); };

  if (programId) {
    rpc('influencer_program', { p_id: programId }).then(function (p) {
      if (p) renderProgram(p);
      else message(L('Este programa saiu do ar.', 'This program is no longer available.'), true);
    }, fail);
  } else if (code) {
    rpc('influencer_profile', { p_code: code }).then(function (inf) {
      if (inf) renderProfile(inf);
      else message(L('Não encontramos esse influenciador.', "We couldn't find this influencer."), true);
    }, fail);
  } else {
    rpc('influencers_directory').then(function (list) { renderDirectory(list || []); }, fail);
  }
})();
