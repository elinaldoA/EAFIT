// Script do site (todas as páginas de public/landing), carregado com defer.

// Idioma: ?lang=en|pt (e guarda) > escolha salva (app_lang, a mesma do app) > português.
(function () {
  var lang = 'pt';
  try {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'pt') localStorage.setItem('app_lang', q);
    var saved = localStorage.getItem('app_lang');
    if (saved === 'en' || saved === 'pt') lang = saved;
  } catch { /* sem storage: português */ }
  window.LANDING_LANG = lang;
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
})();

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- barra inferior das telas do celular ----------
  var tpl = document.getElementById('tpl-tabbar');
  document.querySelectorAll('[data-tabbar]').forEach(function (bar) {
    bar.appendChild(tpl.content.cloneNode(true));
    var on = bar.querySelector('[data-key="' + bar.getAttribute('data-tabbar') + '"]');
    if (on) on.classList.add('on');
  });

  // ---------- nav com borda ao rolar ----------
  var nav = document.querySelector('header.nav');
  function onScroll() { nav.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- menu: página atual e painel no celular ----------
  var here = location.pathname.replace(/index\.html$/, '');
  nav.querySelectorAll('.nav-links a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (here === href || (href !== '/' && here.indexOf(href) === 0)) a.setAttribute('aria-current', 'page');
  });
  var navToggle = document.getElementById('nav-toggle');
  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (navToggle) {
    navToggle.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !nav.classList.contains('is-open')) return;
      setMenu(false);
      navToggle.focus();
    });
  }

  // Âncoras da landing de página única que mudaram de página.
  var MOVED = { '#recursos': '/recursos/', '#instalar': '/ajuda/#instalar' };
  if (here === '/' && MOVED[location.hash]) location.replace(MOVED[location.hash]);

  // ---------- carrossel de telas do celular (hero e modo Personal) ----------
  function initCarousel(root, onShow) {
    var DUR = 5000;
    var screens = root.querySelectorAll('.scr');
    var tabs = root.querySelectorAll('.screen-tab');
    var current = 0, timer = null, paused = false, inView = true;

    function show(i) {
      current = i;
      screens.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      tabs.forEach(function (t, k) {
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
        t.tabIndex = k === i ? 0 : -1;
        var p = t.querySelector('.prog');
        p.classList.remove('run');
        void p.offsetWidth; // reinicia a animação da barrinha
        if (k === i && !reduceMotion && !paused) p.classList.add('run');
      });
      if (onShow) onShow(i);
    }
    function schedule() {
      clearTimeout(timer);
      if (reduceMotion || paused || !inView) return;
      timer = setTimeout(function () { show((current + 1) % screens.length); schedule(); }, DUR);
    }
    tabs.forEach(function (tab, i) {
      tab.style.setProperty('--dur', DUR + 'ms');
      tab.addEventListener('click', function () { paused = true; clearTimeout(timer); show(i); });
      tab.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = (current + d + tabs.length) % tabs.length;
        paused = true; clearTimeout(timer); show(n); tabs[n].focus();
      });
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) schedule(); else clearTimeout(timer);
      }).observe(root);
    }
  }
  var heroVisual = document.querySelector('.hero-visual:not([data-carousel])');
  if (heroVisual) initCarousel(heroVisual, function (i) { if (i === 0) startLiveRest(); });
  document.querySelectorAll('[data-carousel]').forEach(function (root) { initCarousel(root); });

  // ---------- descanso contando (celular + vitrine) ----------
  function fmt(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function countdown(total, onTick) {
    var left = total, id = null;
    function tick() { onTick(left, total); left = left <= 0 ? total : left - 1; }
    return {
      start: function () { if (id || reduceMotion) return; tick(); id = setInterval(tick, 1000); },
      stop: function () { clearInterval(id); id = null; },
    };
  }

  var restEl = document.querySelector('[data-rest]');
  var restBar = document.querySelector('[data-rest-bar]');
  var clockEl = document.querySelector('[data-clock]');
  var clockSec = 32 * 60 + 14;
  var liveRest = countdown(90, function (left, total) {
    restEl.textContent = fmt(left);
    restBar.style.transform = 'scaleX(' + (left / total) + ')';
    clockSec++;
    clockEl.textContent = fmt(clockSec);
  });
  // Só a home tem o celular do hero; as outras páginas pulam.
  function startLiveRest() { if (restEl && restBar && clockEl) liveRest.start(); }
  if (!reduceMotion) startLiveRest();

  var ring = document.querySelector('[data-ring]');
  var bigEl = document.querySelector('[data-rest-big]');
  var C = 2 * Math.PI * 54;
  var bigRest = countdown(90, function (left, total) {
    bigEl.textContent = fmt(left);
    ring.style.strokeDashoffset = String(C * (1 - left / total));
  });

  // ---------- vídeo de demonstração (vitrine de /recursos/) ----------
  var video = document.getElementById('demoVideo');
  var playBtn = document.getElementById('demoPlay');
  var slowBtn = document.getElementById('demoSlow');
  var speedTag = document.getElementById('demoSpeed');
  var userPaused = false;
  function syncPlayBtn() {
    var playing = !video.paused;
    playBtn.textContent = playing ? '⏸ Pausar' : '▶ Reproduzir';
  }
  if (video && playBtn && slowBtn) {
    playBtn.addEventListener('click', function () {
      if (video.paused) { userPaused = false; video.play().catch(function () {}); }
      else { userPaused = true; video.pause(); }
    });
    slowBtn.addEventListener('click', function () {
      var slow = video.playbackRate === 1;
      video.playbackRate = slow ? 0.5 : 1;
      slowBtn.setAttribute('aria-pressed', String(slow));
      if (speedTag) speedTag.hidden = !slow;
    });
    video.addEventListener('play', syncPlayBtn);
    video.addEventListener('pause', syncPlayBtn);
    syncPlayBtn();
  }

  // ---------- observadores de visibilidade ----------
  function observeReveal(root) {
    var els = (root || document).querySelectorAll('.reveal:not(.visible)');
    if (!('IntersectionObserver' in window) || reduceMotion) {
      els.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    els.forEach(function (el) { revealIO.observe(el); });
  }
  var revealIO = 'IntersectionObserver' in window && new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      revealIO.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  observeReveal();
  window.__eafitObserveReveal = observeReveal;

  if ('IntersectionObserver' in window) {
    if (ring && bigEl) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) bigRest.start(); else bigRest.stop();
      }, { threshold: 0.3 }).observe(ring.closest('.show-visual'));
    }

    // Vídeo só baixa/toca quando aparece na tela (preload="none").
    if (video) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          if (!userPaused && !reduceMotion) video.play().catch(function () {});
        } else if (!video.paused) {
          video.pause();
        }
      }, { threshold: 0.4 }).observe(video);
    }
  }
})();

// Substitui o conteúdo estático das páginas (fallback pra SEO / JS desligado /
// fetch indisponível) pelo que o admin salvou em public.landing_content
// via app-admin/src/pages/LandingEditor.jsx. Chave anon pública — mesma
// exposta no bundle do app (app-react/.env VITE_SUPABASE_ANON_KEY),
// protegida só pela RLS (select liberado, insert/update exige is_admin()).
(function () {
  var SUPABASE_URL = 'https://btzdetvoneyhzthsmdrp.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_NJWhkVt39gqzkAcmvmhw_g_9coJjxnb';

  // Chaves precisam bater com ICON_OPTIONS em app-admin/src/pages/LandingEditor.jsx.
  var ICONS = {
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
    'wifi-off': '<path d="M1 1l22 22"></path><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>',
    tag: '<path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
    droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
    user: '<circle cx="12" cy="7" r="4"></circle><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
    play: '<circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="16" y1="2" x2="16" y2="6"></line><polyline points="8.5 14.5 10.5 16.5 15.5 12"></polyline>',
    trophy: '<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"></path><path d="M17 5h3v2a3 3 0 0 1-3 3"></path><path d="M7 5H4v2a3 3 0 0 0 3 3"></path>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    pause: '<circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
    globe: '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
    repeat: '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
  };

  function svgIcon(key, size) {
    size = size || 22;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[key] || ICONS.activity) + '</svg>';
  }

  function esc(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function hexToRgb(hex) {
    var clean = hex.replace('#', '');
    if (clean.length === 3) clean = clean.split('').map(function (c) { return c + c; }).join('');
    var num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function applyPrimaryColor(hex) {
    if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return;
    var rgb = hexToRgb(hex);
    var lighten = function (v) { return Math.min(255, Math.round(v + (255 - v) * 0.2)); };
    var hoverHex = '#' + [lighten(rgb.r), lighten(rgb.g), lighten(rgb.b)]
      .map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
    var root = document.documentElement.style;
    root.setProperty('--primary', hex);
    root.setProperty('--primary-h', hoverHex);
    root.setProperty('--primary-glow', 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',.18)');
  }

  function renderHead(section, el) {
    var head = el.querySelector('.section-head');
    if (!head) return;
    var h2 = head.querySelector('h2'); if (h2 && section.title) h2.textContent = section.title;
    var p = head.querySelector('p'); if (p) p.textContent = section.subtitle || '';
  }

  function renderHero(section, el) {
    var badge = el.querySelector('.badge');
    if (badge) badge.innerHTML = '<span class="dot"></span> ' + esc(section.badge);
    var h1 = el.querySelector('h1');
    if (h1) h1.innerHTML = esc(section.titleTop) + '<br />' + esc(section.titleBottom) + ' <span class="grad">' + esc(section.titleHighlight) + '</span>';
    var lead = el.querySelector('.lead');
    if (lead) lead.textContent = section.lead || '';
    var actions = el.querySelectorAll('.hero-actions .btn');
    if (actions[0]) actions[0].textContent = section.ctaPrimaryLabel || actions[0].textContent;
    if (actions[1]) actions[1].textContent = section.ctaSecondaryLabel || actions[1].textContent;
  }

  function renderHighlights(section, el) {
    el.innerHTML = (section.items || []).map(function (item) {
      return '<div class="highlight">' + svgIcon(item.icon, 20) + esc(item.label) + '</div>';
    }).join('');
  }

  function renderCompare(section, el) {
    renderHead(section, el);
    var bad = el.querySelector('.compare-col:not(.good)');
    if (bad) {
      var badTag = bad.querySelector('.compare-tag'); if (badTag) badTag.textContent = section.badLabel || '';
      var badUl = bad.querySelector('ul');
      if (badUl) badUl.innerHTML = (section.badItems || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    }
    var good = el.querySelector('.compare-col.good');
    if (good) {
      var goodTag = good.querySelector('.compare-tag'); if (goodTag) goodTag.textContent = section.goodLabel || '';
      var goodUl = good.querySelector('ul');
      if (goodUl) goodUl.innerHTML = (section.goodItems || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    }
  }

  // data-limit na lista: a página mostra só os N primeiros itens (resumo na
  // home; a lista inteira fica em /recursos/ e /ajuda/).
  function limited(items, list) {
    var n = parseInt(list.getAttribute('data-limit'), 10);
    return n > 0 ? items.slice(0, n) : items;
  }

  function renderFeatures(section, el) {
    renderHead(section, el);
    var grid = el.querySelector('.features');
    if (grid) {
      grid.innerHTML = limited(section.items || [], grid).map(function (item) {
        return '<div class="card reveal"><div class="icon-badge">' + svgIcon(item.icon) + '</div><h3>' + esc(item.title) + '</h3><p>' + esc(item.description) + '</p></div>';
      }).join('');
    }
  }

  function renderSteps(section, el) {
    renderHead(section, el);
    var grid = el.querySelector('.steps');
    if (grid) {
      grid.innerHTML = (section.items || []).map(function (item, i) {
        return '<div class="step reveal"><span class="num">' + (i + 1) + '</span><h3>' + esc(item.title) + '</h3><p>' + esc(item.description) + '</p></div>';
      }).join('');
    }
  }

  function renderFaq(section, el) {
    renderHead(section, el);
    var list = el.querySelector('.faq-list');
    if (list && Array.isArray(section.items)) {
      list.innerHTML = limited(section.items, list).map(function (item) {
        return '<details><summary>' + esc(item.question) + '</summary><p>' + esc(item.answer) + '</p></details>';
      }).join('');
    }
  }

  function renderTestimonials(section, el) {
    renderHead(section, el);
    var grid = el.querySelector('.quotes');
    if (grid && Array.isArray(section.items)) {
      grid.innerHTML = section.items.map(function (item, i) {
        var initial = esc(String(item.name || '?').trim().charAt(0).toUpperCase());
        return '<figure class="quote reveal' + (i % 3 ? ' reveal-d' + (i % 3) : '') + '"><div class="stars" aria-label="5 de 5 estrelas">★★★★★</div>' +
          '<blockquote>“' + esc(item.text) + '”</blockquote>' +
          '<figcaption><span class="avatar" aria-hidden="true">' + initial + '</span><span class="who"><strong>' + esc(item.name) + '</strong><span>' + esc(item.role) + '</span></span></figcaption></figure>';
      }).join('');
    }
  }

  function renderAudience(section, el) {
    renderHead(section, el);
    var grid = el.querySelector('.features');
    if (grid) {
      grid.innerHTML = (section.items || []).map(function (item) {
        return '<div class="card reveal"><div class="icon-badge">' + svgIcon(item.icon) + '</div><h3>' + esc(item.title) + '</h3><p>' + esc(item.description) + '</p></div>';
      }).join('');
    }
  }

  function renderCta(section, el) {
    var band = el.querySelector('.cta-band');
    if (!band) return;
    var h2 = band.querySelector('h2'); if (h2) h2.textContent = section.title || '';
    var p = band.querySelector('p'); if (p) p.textContent = section.subtitle || '';
    var btn = band.querySelector('.btn');
    if (btn && section.ctaLabel) btn.firstChild.textContent = section.ctaLabel + ' ';
  }

  var RENDERERS = {
    hero: renderHero, highlights: renderHighlights, compare: renderCompare,
    showcase: renderHead, features: renderFeatures, steps: renderSteps, faq: renderFaq, cta: renderCta,
    testimonials: renderTestimonials, audience: renderAudience, install: renderHead,
  };

  function applyContent(content) {
    if (!content || !Array.isArray(content.sections)) return;
    if (content.theme && content.theme.primaryColor) applyPrimaryColor(content.theme.primaryColor);
    var main = document.getElementById('top');
    var defaultOrder = Array.prototype.slice.call(main.querySelectorAll(':scope > [data-section]'));
    var order = [];

    content.sections.forEach(function (section) {
      var el = main.querySelector(':scope > [data-section="' + section.id + '"]');
      if (!el) return;
      el.style.display = section.enabled === false ? 'none' : '';
      var renderer = RENDERERS[section.type];
      if (renderer && section.enabled !== false) renderer(section, el);
      order.push(el);
    });

    // Seções que existem no HTML mas não no content (ex.: seção nova
    // antes da migration rodar) ficam logo depois de quem as precedia
    // por padrão, em vez de pular pro topo da página.
    defaultOrder.forEach(function (el, i) {
      if (order.indexOf(el) !== -1) return;
      var prev = i > 0 ? order.indexOf(defaultOrder[i - 1]) : -1;
      order.splice(prev + 1, 0, el);
    });
    // A ordem do admin vale só na home; nas outras páginas a ordem é a do HTML.
    if (main.hasAttribute('data-reorder')) order.forEach(function (el) { main.appendChild(el); });

    if (window.__eafitObserveReveal) window.__eafitObserveReveal(main);
  }

  // ---------- instalar (PWA) + CTA fixo no celular ----------
  (function () {
    var installBtn = document.getElementById('install-btn');
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      if (installBtn) installBtn.hidden = false;
    });
    if (installBtn) installBtn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; installBtn.hidden = true; });
    });
    window.addEventListener('appinstalled', function () { if (installBtn) installBtn.hidden = true; });

    var bar = document.getElementById('sticky-cta');
    var hero = document.querySelector('.hero, .page-hero');
    var cta = document.querySelector('[data-section="cta"]');
    if (!bar || !hero || !('IntersectionObserver' in window)) return;
    var pastHero = false, onCta = false;
    function sync() {
      var on = pastHero && !onCta;
      bar.classList.toggle('show', on);
      bar.setAttribute('aria-hidden', on ? 'false' : 'true');
      var a = bar.querySelector('a'); if (a) a.tabIndex = on ? 0 : -1;
    }
    new IntersectionObserver(function (en) { pastHero = !en[0].isIntersecting; sync(); }).observe(hero);
    if (cta) new IntersectionObserver(function (en) { onCta = en[0].isIntersecting; sync(); }).observe(cta);
  })();

  // ---------- faixa de números reais (RPC landing_stats) ----------
  // Só mostra um total quando ele já é "bonito" (>= mínimo); se nenhum
  // passar, ou a RPC falhar, a faixa continua escondida.
  (function () {
    var band = document.getElementById('landing-stats');
    var grid = document.getElementById('landing-stats-grid');
    if (!band || !grid) return;
    var TILES = [
      { key: 'users', min: 50, label: 'pessoas treinando' },
      { key: 'workouts', min: 100, label: 'treinos concluídos' },
      { key: 'sets', min: 1000, label: 'séries registradas' },
    ];
    function round(n) {
      var step = n >= 10000 ? 1000 : n >= 1000 ? 100 : 10;
      return Math.floor(n / step) * step;
    }
    fetch(SUPABASE_URL + '/rest/v1/rpc/landing_stats', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var tiles = TILES.filter(function (t) { return Number(d[t.key]) >= t.min; });
        if (!tiles.length) return;
        tiles.push({ value: '200', label: 'exercícios com demonstração' });
        grid.innerHTML = tiles.map(function (t) {
          var v = t.value || round(Number(d[t.key])).toLocaleString(window.LANDING_LANG === 'en' ? 'en-US' : 'pt-BR') + '+';
          return '<div class="stat"><b>' + v + '</b><span>' + t.label + '</span></div>';
        }).join('');
        band.hidden = false;
      })
      .catch(function () {});
  })();

  // ---------- eventos anônimos (public.landing_events) ----------
  // Cliques nos CTAs que levam ao app, instalação e seções alcançadas.
  // Sem identificar ninguém; 1 registro por evento+lugar por sessão;
  // falha em silêncio. Lugar = seção do clique (ou nav/sticky).
  function track(event, place) {
    var key = 'eafit_ev_' + event + ':' + place;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* sem armazenamento: conta mesmo assim */ }
    fetch(SUPABASE_URL + '/rest/v1/landing_events', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ event: event, place: place }),
      keepalive: true,
    }).catch(function () {});
  }

  function clickPlace(a) {
    if (a.closest('.nav')) return 'nav';
    if (a.closest('.sticky-cta')) return 'sticky';
    if (a.closest('footer')) return 'rodape';
    var sec = a.closest('[data-section]');
    return (sec && sec.getAttribute('data-section')) || 'outro';
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="/app/"]');
    if (a) track('cta_click', clickPlace(a));
    if (e.target.closest && e.target.closest('#install-btn')) track('install_click', 'install');
  });
  window.addEventListener('appinstalled', function () { track('install_done', 'install'); });

  if ('IntersectionObserver' in window) {
    var reachObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        reachObs.unobserve(en.target);
        track('reach', en.target.getAttribute('data-section'));
      });
    }, { threshold: 0.3 });
    ['personal', 'testimonials', 'install', 'faq', 'cta'].forEach(function (id) {
      var el = document.querySelector('[data-section="' + id + '"]');
      if (el) reachObs.observe(el);
    });
  }

  // ---------- contagem anônima de visitas (public.page_visits) ----------
  // Cópia das regras de app-react/src/lib/pageVisits.js (detectSource) e lib/clientInfo.js —
  // mudou lá, mude aqui. 1 visita por dia por navegador, sem identificar
  // ninguém; falha em silêncio.
  var REFERRER_SOURCES = [
    [/(^|\.)google\./, 'google'], [/(^|\.)bing\.com$/, 'bing'],
    [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'], [/(^|\.)tiktok\.com$/, 'tiktok'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'], [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
    [/(^|\.)linkedin\.com$/, 'linkedin'],
  ];
  function detectSource() {
    var params = new URLSearchParams(window.location.search);
    var tagged = (params.get('origem') || params.get('utm_source') || '').toLowerCase()
      .replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (tagged) return tagged;
    var host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : ''; } catch { host = ''; }
    if (!host) return 'direto';
    if (host === window.location.hostname) return 'landing';
    for (var i = 0; i < REFERRER_SOURCES.length; i++) {
      if (REFERRER_SOURCES[i][0].test(host)) return REFERRER_SOURCES[i][1];
    }
    return 'outro-site';
  }
  function detectOS() {
    var ua = String(navigator.userAgent || '').toLowerCase();
    if (!ua) return 'outro';
    if (ua.indexOf('android') !== -1) return 'android';
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    var mac = ua.indexOf('macintosh') !== -1 || ua.indexOf('mac os x') !== -1 || /^mac/i.test(navigator.platform || '');
    if (mac) return navigator.maxTouchPoints > 1 ? 'ios' : 'mac';
    if (ua.indexOf('windows') !== -1) return 'windows';
    if (ua.indexOf('cros') !== -1) return 'outro';
    if (ua.indexOf('linux') !== -1 || ua.indexOf('x11') !== -1) return 'linux';
    return 'outro';
  }
  function detectBrowser() {
    var ua = String(navigator.userAgent || '').toLowerCase();
    if (!ua) return 'outro';
    if (/edg(e|a|ios)?\//.test(ua)) return 'edge';
    if (ua.indexOf('samsungbrowser') !== -1) return 'samsung';
    if (/opr\/|opera|opt\//.test(ua)) return 'opera';
    if (/firefox|fxios/.test(ua)) return 'firefox';
    if (/chrome|crios|chromium/.test(ua)) return 'chrome';
    if (ua.indexOf('safari') !== -1) return 'safari';
    return 'outro';
  }
  function detectDevice() {
    var ua = String(navigator.userAgent || '').toLowerCase();
    if (!ua) return 'desktop';
    if (ua.indexOf('ipad') !== -1) return 'tablet';
    var mac = ua.indexOf('macintosh') !== -1 || /^mac/i.test(navigator.platform || '');
    if (mac && navigator.maxTouchPoints > 1) return 'tablet';
    if (ua.indexOf('android') !== -1) return ua.indexOf('mobile') !== -1 ? 'celular' : 'tablet';
    if (/iphone|ipod|mobile/.test(ua)) return 'celular';
    return 'desktop';
  }
  (function recordVisit() {
    var key = 'eafit_visit_landing';
    var today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch { /* sem armazenamento: conta mesmo assim */ }
    var source = detectSource();
    function send(row) {
      return fetch(SUPABASE_URL + '/rest/v1/page_visits', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
        keepalive: true,
      });
    }
    // Do mais completo pro mais simples: banco sem as colunas novas
    // (migration ainda não aplicada) recusa a linha e a visita é gravada sem elas.
    var os = detectOS();
    var campaign = (new URLSearchParams(window.location.search).get('utm_campaign') || '').toLowerCase()
      .replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    var visitLang = window.LANDING_LANG === 'en' ? 'en' : 'pt';
    send({ page: 'landing', source: source, os: os, browser: detectBrowser(), device: detectDevice(), lang: visitLang, campaign: campaign })
      .then(function (r) { if (!r.ok) return send({ page: 'landing', source: source, os: os }); return r; })
      .then(function (r) { if (!r.ok) return send({ page: 'landing', source: source }); })
      .catch(function () {});
  })();

  fetch(SUPABASE_URL + '/rest/v1/landing_content?select=content&id=eq.1', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var row = rows && rows[0];
      if (row && row.content) applyContent(row.content);
    })
    .catch(function () { /* mantém o conteúdo estático padrão acima */ });
})();

// Seletor de idioma e tradução do texto da página (dicionário em i18n-en.js).
// Roda sobre o DOM já pronto e de novo a cada mudança — o conteúdo vindo do
// painel admin chega depois e substitui o texto estático. Texto sem entrada
// no dicionário (ex.: algo recém-escrito no admin) fica em português.
document.addEventListener('DOMContentLoaded', function () {
  var lang = window.LANDING_LANG === 'en' ? 'en' : 'pt';
  var btn = document.getElementById('lang-toggle');
  if (btn) {
    btn.textContent = lang === 'en' ? 'PT' : 'EN';
    btn.setAttribute('aria-label', lang === 'en'
      ? 'Language: English. Switch to Portuguese / Idioma: inglês. Mudar para português'
      : 'Idioma: português. Mudar para inglês / Language: Portuguese. Switch to English');
    btn.addEventListener('click', function () {
      try { localStorage.setItem('app_lang', lang === 'en' ? 'pt' : 'en'); } catch { /* sem storage */ }
      var url = new URL(location.href);
      url.searchParams.delete('lang');
      location.href = url.toString();
    });
  }
  var dict = window.LANDING_EN;
  if (lang !== 'en' || !dict) return;

  var pending = false;
  function norm(t) { return t.replace(/\s+/g, ' ').trim(); }

  function translateTextNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        return p === 'SCRIPT' || p === 'STYLE' || p === 'NOSCRIPT' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var key = norm(raw);
      if (!key || !Object.prototype.hasOwnProperty.call(dict.text, key)) continue;
      var lead = raw.match(/^\s*/)[0];
      var trail = raw.match(/\s*$/)[0];
      var next = lead + dict.text[key] + trail;
      if (next !== raw) node.nodeValue = next;
    }
  }

  function translateAttrs(root) {
    root.querySelectorAll('[alt],[aria-label],[title],[placeholder]').forEach(function (el) {
      ['alt', 'aria-label', 'title', 'placeholder'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && Object.prototype.hasOwnProperty.call(dict.attrs, v)) el.setAttribute(a, dict.attrs[v]);
      });
    });
  }

  function translateHead() {
    var t = dict.text[norm(document.title)];
    if (t) document.title = t;
    function set(sel, v) { var el = document.querySelector(sel); if (el && v) el.setAttribute('content', v); }
    // Título e descrição de cada página estão no dicionário como qualquer texto.
    ['meta[name="description"]', 'meta[property="og:title"]', 'meta[name="twitter:title"]',
      'meta[property="og:description"]', 'meta[name="twitter:description"]'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) set(sel, dict.text[norm(el.getAttribute('content') || '')]);
    });
    set('meta[property="og:locale"]', dict.meta.ogLocale);
    set('meta[property="og:image:alt"]', dict.attrs['Logo do EAFIT com o slogan Seu treino, sempre com você']);
  }

  function run() {
    pending = false;
    translateTextNodes(document.body);
    translateAttrs(document.body);
  }
  translateHead();
  run();
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(run);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
});
