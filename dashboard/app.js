// Token Radar — the page.
//
// It reads window.RADAR (written beside dashboard/ by main.ts) and renders the ranked board of
// pre-token protocols, a filter, a detail drawer per protocol with the model's own arithmetic, the
// farm plan, and the live-token set held apart from the ranking. No network: every byte it shows is
// in data.js.
//
// The value model lives here as well as in lib/model.ts, on purpose. scoreOf() recomputes a row from
// the snapshot figures alone, and the page audits itself against the board it was handed: if a single
// row did not reproduce, the page says so instead of showing a number it cannot justify.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var MODEL = DATA.model;

  /* The capture rate per category: how much of a protocol's TVL it can plausibly turn into its own
     fee revenue, and therefore into whatever a token of its own would eventually be worth. A trading
     venue captures fees on volume; a lender captures the interest spread; a risk curator holds other
     people's deposits and earns a management fee on them, so most of its TVL is not revenue it can
     ever take. It is a table of DefiLlama's own category field, applied identically to every row, and
     it names no protocol. */
  var CAPTURE = DATA.capture_table;
  var DEFAULT_CAPTURE = DATA.default_capture;

  var state = {
    q: '',
    seg: 'all',
    cat: 'all',
    mom: 'all',
    chain: 'all',
    floor: 0,
    sort: 'rank',
    dir: 1,
    sel: null,
    scroll: null,
  };

  var app = document.getElementById('board');
  var drawer = null;

  /* ------------------------------------------------------------------ format */

  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function days(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (n >= 730) return (n / 365).toFixed(1) + 'y';
    if (n >= 365) return (n / 365).toFixed(2) + 'y';
    return Math.round(n) + 'd';
  }
  function elapsed(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return Math.round(n) + ' days';
  }

  /* ------------------------------------------------------------------ the model */

  /**
   * The whole value model, in one function, from the snapshot's own figures:
   *
   *   implied = tvl_usd x base_multiple
   *            x (1 + clamp(change_7d, growth_floor, growth_cap) / 100 x growth_weight)
   *            x (maturity_floor + min(age_days, maturity_days) / maturity_days x maturity_range)
   *            x (1 + min(max(chains - 1, 0), reach_max) / reach_max x reach_weight)
   *            x capture_rate(category)
   *
   * No protocol name, slug or address is special-cased here or anywhere else on this page.
   */
  function scoreOf(r) {
    var growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d));
    var growthMult = 1 + (growthPct / 100) * MODEL.growth_weight;
    var age = r.age_days === null || r.age_days === undefined ? MODEL.unknown_age_days : r.age_days;
    var tokenlessMult = MODEL.maturity_floor + (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
    var reach = Math.min(Math.max((r.chain_count || 0) - 1, 0), MODEL.reach_max);
    var reachMult = 1 + (reach / MODEL.reach_max) * MODEL.reach_weight;
    var capture = CAPTURE[r.category] === undefined ? DEFAULT_CAPTURE : CAPTURE[r.category];
    var base = r.tvl_usd * MODEL.base_multiple;
    var implied = Math.max(1, Math.round(base * growthMult * tokenlessMult * reachMult * capture));
    return {
      implied: implied,
      base: base,
      growthPct: growthPct,
      growthMult: growthMult,
      tokenlessMult: tokenlessMult,
      reachMult: reachMult,
      capture: capture,
      age: r.age_days,
    };
  }

  /* The page audits itself: every row is recomputed from the snapshot figures and compared with the
     board it was handed. The count is shown under the board, so the reader can see the numbers on
     screen are the model's and not decoration. */
  var audit = { checked: 0, matched: 0 };
  DATA.rows.forEach(function (r) {
    audit.checked++;
    if (scoreOf(r).implied === r.implied_value_usd) audit.matched++;
  });

  /* ------------------------------------------------------------------ helpers */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function frag() {
    var f = document.createDocumentFragment();
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) f.appendChild(arguments[i]);
    return f;
  }

  /* A farm step is one string: the action, then "Cost: ..." and "Time: ...". The page splits it back
     into its three parts so the plan can be read as a plan. */
  function splitStep(s) {
    var ci = s.indexOf(' Cost: ');
    if (ci < 0) return { text: s, cost: '', time: '' };
    var text = s.slice(0, ci);
    var rest = s.slice(ci + 7);
    var ti = rest.indexOf('. Time: ');
    if (ti < 0) return { text: text, cost: rest.replace(/\.\s*$/, ''), time: '' };
    return { text: text, cost: rest.slice(0, ti), time: rest.slice(ti + 8).replace(/\.\s*$/, '') };
  }

  /* ------------------------------------------------------------------ state in the hash */

  var HASH = { q: 'q', seg: 'seg', cat: 'cat', mom: 'mom', chain: 'ch', floor: 'floor', sort: 'sort', dir: 'dir', sel: 'p' };

  function readHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var params = new URLSearchParams(raw);
    if (params.get(HASH.q)) state.q = params.get(HASH.q);
    if (params.get(HASH.seg)) state.seg = params.get(HASH.seg);
    if (params.get(HASH.cat)) state.cat = params.get(HASH.cat);
    if (params.get(HASH.mom)) state.mom = params.get(HASH.mom);
    if (params.get(HASH.chain)) state.chain = params.get(HASH.chain);
    if (params.get(HASH.floor)) state.floor = Number(params.get(HASH.floor)) || 0;
    if (params.get(HASH.sort)) state.sort = params.get(HASH.sort);
    if (params.get(HASH.dir)) state.dir = Number(params.get(HASH.dir)) === -1 ? -1 : 1;
    if (params.get(HASH.sel)) state.sel = params.get(HASH.sel);
    state.scroll = params.get('scroll');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set(HASH.q, state.q);
    if (state.seg !== 'all') params.set(HASH.seg, state.seg);
    if (state.cat !== 'all') params.set(HASH.cat, state.cat);
    if (state.mom !== 'all') params.set(HASH.mom, state.mom);
    if (state.chain !== 'all') params.set(HASH.chain, state.chain);
    if (state.floor) params.set(HASH.floor, String(state.floor));
    if (state.sort !== 'rank') params.set(HASH.sort, state.sort);
    if (state.dir === -1) params.set(HASH.dir, '-1');
    if (state.sel) params.set(HASH.sel, state.sel);
    if (state.scroll) params.set('scroll', state.scroll);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  /* ------------------------------------------------------------------ filtering */

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.seg === 'watch' && !r.on_watchlist) return false;
      if (state.seg === 'early' && r.on_watchlist) return false;
      if (state.cat !== 'all' && (r.category || 'Other') !== state.cat) return false;
      if (state.mom !== 'all' && r.momentum !== state.mom) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.floor && r.tvl_usd < state.floor) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  var SORTS = {
    rank: function (r) { return r.rank; },
    value: function (r) { return r.implied_value_usd; },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    chains: function (r) { return r.chain_count; },
    capture: function (r) { return r.capture_rate; },
    name: function (r) { return r.name.toLowerCase(); },
  };

  function sorted(list) {
    var key = SORTS[state.sort] ? state.sort : 'rank';
    var pick = SORTS[key];
    return list.slice().sort(function (a, b) {
      var av = pick(a);
      var bv = pick(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  /* ------------------------------------------------------------------ header */

  function mast() {
    return el('div', { class: 'shell' },
      el('header', { class: 'mast' },
        el('div', { class: 'ident' },
          el('div', { class: 'scope', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('b')),
          el('div', { class: 'ident-text' },
            el('h1', { text: 'Token Radar' }),
            el('p', { text: 'Pre-token launch radar · every protocol that records no token yet' })
          )
        ),
        el('dl', { class: 'spec' },
          el('div', null, el('dt', { text: 'Snapshot' }), el('dd', { id: 'spec-date', text: DATA.as_of })),
          el('div', null, el('dt', { text: 'Model' }), el('dd', { id: 'spec-model', text: DATA.model_version })),
          el('div', null, el('dt', { text: 'Source' }), el('dd', { id: 'spec-source', text: 'DefiLlama /protocols' }))
        )
      )
    );
  }

  function hero() {
    var watchRows = DATA.rows.filter(function (r) { return r.on_watchlist; }).length;
    return el('section', { class: 'hero' },
      el('div', null,
        el('p', { class: 'kicker', text: 'The board' }),
        el('h2', { text: DATA.board_size + ' protocols that record no token, ranked by what their launch would be worth.' }),
        el('p', { class: 'lede', text: 'Every row is a protocol whose DefiLlama record carries no market cap, no CoinGecko id and no ticker: its launch is still ahead of it. The implied value is what a token would be worth if that record stayed as it is — the entry\'s own claim, never a promise, and never a forecast of whether or when a token is issued. Protocols whose token already trades are held apart below, because for them the market cap is a fact and not a model.' })
      ),
      el('ul', { class: 'stats' },
        el('li', { class: 'stat good' }, el('span', { text: 'Watchlist covered' }), el('b', { text: watchRows + ' / ' + DATA.watchlist_size })),
        el('li', { class: 'stat' }, el('span', { text: 'Radar rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('li', { class: 'stat' }, el('span', { text: 'Found below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('li', { class: 'stat live' }, el('span', { text: 'Already trading, set aside' }), el('b', { text: String(DATA.live_total) }))
      )
    );
  }

  function formula() {
    var m = MODEL;
    return el('section', { class: 'formula' },
      el('div', { class: 'formula-label', text: 'The model — ' + DATA.model_version }),
      el('div', { class: 'formula-body' },
        'implied = round( tvl_usd × ', el('b', { text: String(m.base_multiple) }),
        ' × (1 + clamp(change_7d, ', el('b', { text: String(m.growth_floor) }), ', ', el('b', { text: String(m.growth_cap) }), ') / 100 × ', el('b', { text: String(m.growth_weight) }), ')',
        ' × (', el('b', { text: String(m.maturity_floor) }), ' + min(age_days, ', el('b', { text: String(m.maturity_days) }), ') / ', el('b', { text: String(m.maturity_days) }), ' × ', el('b', { text: String(m.maturity_range) }), ')',
        ' × (1 + min(chains − 1, ', el('b', { text: String(m.reach_max) }), ') / ', el('b', { text: String(m.reach_max) }), ' × ', el('b', { text: String(m.reach_weight) }), ')',
        ' × capture_rate(category) )'
      ),
      el('p', { class: 'formula-note', text: 'Four factors and one rate, all read from the snapshot\'s own ten fields: the size of the machine (TVL), the last seven days of it (change_7d), how long it has run with no token (age_days), how far it is deployed (chains), and how much of the TVL the protocol could ever capture as its own revenue (the category\'s rate). No protocol name is special-cased, so the board can be recomputed row by row from the figures printed beside it.' })
    );
  }

  /* ------------------------------------------------------------------ controls */

  function controls() {
    var cats = {};
    DATA.rows.forEach(function (r) { cats[r.category || 'Other'] = (cats[r.category || 'Other'] || 0) + 1; });
    var catList = Object.keys(cats).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chainList = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); }).slice(0, 14);
    var moms = ['Accelerating', 'Growing', 'Flat', 'Cooling', 'Falling', 'Unreported'];

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search a protocol, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });

    var segs = [['all', 'All ' + DATA.board_size], ['watch', 'Watchlist ' + DATA.watchlist_size], ['early', 'Found below ' + DATA.early_size]];
    var segBtns = segs.map(function (pair) {
      return el('button', {
        type: 'button',
        'aria-pressed': state.seg === pair[0] ? 'true' : 'false',
        text: pair[1],
        onclick: function () { state.seg = pair[0]; writeHash(); render(); },
      });
    });

    var momBtns = [{ k: 'all', t: 'Any' }].concat(moms.map(function (m) { return { k: m, t: m }; })).map(function (pair) {
      return el('button', {
        type: 'button',
        'aria-pressed': state.mom === pair.k ? 'true' : 'false',
        text: pair.t,
        onclick: function () { state.mom = pair.k; writeHash(); render(); },
      });
    });

    var catSel = el('select', { id: 'cat', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'Every category (' + catList.length + ')' }),
      catList.map(function (c) { return el('option', { value: c, text: c + ' (' + cats[c] + ')', selected: c === state.cat ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.cat = catSel.value; writeHash(); render(); });

    var chainSel = el('select', { id: 'ch', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'Every chain' }),
      chainList.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCount[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });

    var floors = [[0, 'Any TVL'], [10000000, 'TVL ≥ $10M'], [50000000, 'TVL ≥ $50M'], [250000000, 'TVL ≥ $250M'], [1000000000, 'TVL ≥ $1B']];
    var floorSel = el('select', { id: 'floor', 'aria-label': 'Filter by TVL' },
      floors.map(function (f) { return el('option', { value: String(f[0]), text: f[1], selected: String(f[0]) === String(state.floor) ? 'selected' : null }); })
    );
    floorSel.addEventListener('change', function () { state.floor = Number(floorSel.value) || 0; writeHash(); render(); });

    var reset = el('button', {
      class: 'reset', type: 'button', text: 'Reset filters',
      onclick: function () {
        state.q = ''; state.seg = 'all'; state.cat = 'all'; state.mom = 'all'; state.chain = 'all'; state.floor = 0;
        writeHash(); render();
      },
    });

    var shown = filtered().length;
    return el('section', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Segment' }), el('div', { class: 'seg' }, segBtns)),
      el('div', { class: 'field' }, el('label', { for: 'cat', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'ch', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'floor', text: 'Size' }), floorSel),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Seven-day momentum' }), el('div', { class: 'chips' }, momBtns)),
      reset,
      el('span', { class: 'count', text: '' }, el('b', { text: String(shown) }), ' of ' + DATA.board_size + ' radar rows')
    );
  }

  /* ------------------------------------------------------------------ the board */

  function sortHead(key, label, numeric) {
    var active = state.sort === key;
    var button = el('button', {
      type: 'button',
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
        writeHash(); render();
      },
    }, label, active ? el('span', { 'aria-hidden': 'true', text: state.dir === -1 ? ' ↓' : ' ↑' }) : null);
    var th = el('th', { scope: 'col', class: numeric ? 'num' : '' });
    if (active) th.setAttribute('aria-sort', state.dir === -1 ? 'descending' : 'ascending');
    th.appendChild(button);
    return th;
  }

  function boardTable() {
    var list = sorted(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h3', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Widen the size floor or clear the search to see the board again.' }),
        el('button', {
          class: 'reset', type: 'button', text: 'Clear every filter',
          onclick: function () {
            state.q = ''; state.seg = 'all'; state.cat = 'all'; state.mom = 'all'; state.chain = 'all'; state.floor = 0;
            writeHash(); render();
          },
        })
      ));
    }
    var top = list[0].implied_value_usd || 1;
    var body = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? 'flat' : r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : 'flat';
      var tr = el('tr', {
        'data-top': r.rank <= 3 ? String(r.rank) : '0',
        'aria-selected': state.sel === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { select(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.slug); } },
      },
        el('td', null, el('span', { class: 'rank', text: String(r.rank) })),
        el('td', null, el('div', { class: 'pname' },
          el('b', { text: r.name }),
          el('span', { class: 'slug', text: r.slug })
        )),
        el('td', null, el('span', { class: 'cat', text: r.category || 'Other' })),
        el('td', { class: 'num', text: money(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: pct(r.change_7d) }),
        el('td', { class: 'num', text: r.age_days === null ? '—' : days(r.age_days) }),
        el('td', { class: 'num', text: String(r.chain_count) }),
        el('td', { class: 'num', text: r.capture_rate.toFixed(2) }),
        el('td', null, el('div', { class: 'value' },
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / top) * 100)) + '%' })),
          el('b', { text: money(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'chip tokenless', text: 'no token on record' }))
      );
      body.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'panel-head' },
        el('h3', { text: 'Pre-token protocols, strongest implied value first' }),
        el('span', { class: 'note', text: 'Rank is the model\'s claim. Click any row for its arithmetic and its farm plan. The ' + DATA.live_total + ' protocols whose token already trades are held apart below.' })
      ),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            sortHead('rank', '#'),
            sortHead('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Category' }),
            sortHead('tvl', 'TVL', true),
            sortHead('growth', '7d', true),
            sortHead('age', 'Tokenless', true),
            sortHead('chains', 'Chains', true),
            sortHead('capture', 'Capture', true),
            sortHead('value', 'Implied value', true),
            el('th', { scope: 'col', text: 'Token' })
          )),
          body
        )
      )
    );
  }

  /* ------------------------------------------------------------------ the live set */

  function liveTable() {
    var body = el('tbody');
    DATA.live.forEach(function (r) {
      body.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'pname' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug }))),
        el('td', null, el('span', { class: 'cat', text: r.category || 'Other' })),
        el('td', { class: 'num', text: money(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? 'flat' : r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
        el('td', { class: 'num', text: money(r.mcap_usd) }),
        el('td', null, el('span', { class: 'chip live', text: 'token trades' }))
      ));
    });
    return el('div', { class: 'panel live-set' },
      el('div', { class: 'panel-head' },
        el('h3', { text: 'Already trading — held apart from the ranking' }),
        el('span', { class: 'note', text: DATA.live_total + ' protocols in the snapshot record a token. Their market cap is a market fact, not a model, so they are never ranked against a pre-token claim.' })
      ),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }),
            el('th', { scope: 'col', class: 'num', text: '7d' }),
            el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          body
        )
      )
    );
  }

  /* ------------------------------------------------------------------ the model panel */

  function modelPanel() {
    var m = MODEL;
    var rows = [
      ['TVL × ' + m.base_multiple, 'The size of the machine a token would sit on. 22% of TVL is the base claim, a ratio that keeps the number under the TVL it comes from.'],
      ['growth: clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') × ' + m.growth_weight, 'The last seven days of TVL, clamped so one violent week cannot run the board. A protocol that grew is worth more than one that shrank, by up to ±50%.'],
      ['tokenless: ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range, 'How long it has run with no token. A protocol four years into a tokenless run has proved it can hold capital without one; a two-week-old protocol has not. The ramp runs 0.55 → 1.30 over four years.'],
      ['reach: min(chains − 1, ' + m.reach_max + ') / ' + m.reach_max + ' × ' + m.reach_weight, 'How many chains it is deployed on. A token would be distributed where the protocol already is, so reach raises the ceiling without touching the floor.'],
      ['capture: the category\'s rate', 'How much of the TVL a protocol can plausibly turn into its own revenue — and so into whatever a token of its own would eventually be worth. A venue takes fees on volume and a lender takes the spread; a risk curator holds other people\'s deposits and takes a management fee, so most of its TVL is never its revenue.'],
    ];
    var ledger = el('dl', { class: 'ledger' });
    rows.forEach(function (pair) {
      ledger.appendChild(el('div', null, el('dt', { text: pair[0] }), el('dd', { text: pair[1] })));
    });
    var ok = audit.matched === audit.checked;
    return el('section', { class: 'panel model' },
      el('h3', { text: 'How the implied value is built, and how to check it' }),
      el('p', { text: 'One function scores every row on this page and in board.json. It reads the snapshot\'s ten fields and nothing else: no protocol is named in it, and no row was hand-placed. The page recomputes each row from the figures printed beside it, so the numbers on screen can be checked against the board they came from.' }),
      el('p', { class: 'audit' + (ok ? '' : ' bad'), text: ok ? ('Model audit: ' + audit.matched + ' of ' + audit.checked + ' rows recomputed from the snapshot figures reproduce board.json exactly') : ('Model audit FAILED: ' + audit.matched + ' of ' + audit.checked + ' rows match board.json') }),
      ledger,
      el('p', { text: 'The capture rate is a table of DefiLlama\'s own category field, applied identically to every row. It names no protocol: a trading venue takes fees on volume and a lender takes the interest spread (1.05–1.10), a protocol that issues its own asset takes the issuance spread (1.00), and a risk curator takes a management fee on capital that belongs to someone else, so only a fraction of its TVL could ever become its own (0.78).' }),
      el('p', { text: 'The watchlist the house drew — ' + DATA.watchlist_size + ' protocols at or above $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL with no token on record — is the floor of the board, never its ceiling. Every pre-token protocol in the snapshot is ranked here: ' + DATA.early_size + ' of them sit below that floor and are the early finds the radar exists to surface.' })
    );
  }

  /* ------------------------------------------------------------------ the drawer */

  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = el('aside', { class: 'drawer', id: 'drawer', 'aria-hidden': 'true', 'aria-label': 'Protocol detail' });
    drawer.addEventListener('keydown', function (e) { if (e.key === 'Escape') select(null); });
    return drawer;
  }

  function select(slug) {
    state.sel = slug;
    writeHash();
    if (!slug) {
      if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
      var sel = document.querySelectorAll('tbody tr[aria-selected="true"]');
      for (var i = 0; i < sel.length; i++) sel[i].setAttribute('aria-selected', 'false');
      return;
    }
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    renderDrawer(row);
    var d = ensureDrawer();
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    var sel2 = document.querySelectorAll('tbody tr[aria-selected="true"]');
    for (var j = 0; j < sel2.length; j++) sel2[j].setAttribute('aria-selected', 'false');
    var tr = document.querySelector('tbody tr[data-slug="' + row.slug + '"]');
    if (tr) tr.setAttribute('aria-selected', 'true');
  }

  function renderDrawer(row) {
    var s = scoreOf(row);
    var d = ensureDrawer();
    d.textContent = '';

    var chainText = row.chains.length > 8
      ? row.chains.slice(0, 8).join(', ') + ' and ' + (row.chains.length - 8) + ' more'
      : row.chains.join(', ');
    var head = el('div', { class: 'drawer-head' },
      el('div', null,
        el('p', { class: 'eyebrow', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.on_watchlist ? 'on the house watchlist' : 'found below the floor') }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (chainText || 'no chain on record') })
      ),
      el('button', { class: 'drawer-close', type: 'button', 'aria-label': 'Close', text: '✕', onclick: function () { select(null); } })
    );
    d.appendChild(head);

    var body = el('div', { class: 'drawer-body' });

    /* The arithmetic, line by line. */
    function kv(k, sub, v) {
      return el('div', { class: 'row' },
        el('span', { class: 'k' }, el('span', { text: k }), sub ? el('small', { text: sub }) : null),
        el('span', { class: 'v', text: v })
      );
    }
    var ledger = el('div', { class: 'ledger2' },
      kv('TVL', 'the snapshot\'s figure', moneyFull(row.tvl_usd)),
      kv('× base ' + MODEL.base_multiple, 'size of the machine', moneyFull(s.base)),
      kv('× growth ' + s.growthMult.toFixed(3), '7d TVL ' + pct(row.change_7d) + ', clamped to ' + MODEL.growth_floor + '%…' + MODEL.growth_cap + '%', '×' + s.growthMult.toFixed(3)),
      kv('× tokenless ' + s.tokenlessMult.toFixed(3), s.age === null ? 'age unreported, ' + MODEL.unknown_age_days + ' days assumed' : elapsed(s.age) + ' with no token', '×' + s.tokenlessMult.toFixed(3)),
      kv('× reach ' + s.reachMult.toFixed(3), row.chain_count + ' chain' + (row.chain_count === 1 ? '' : 's') + ' of deployment', '×' + s.reachMult.toFixed(3)),
      kv('× capture ' + s.capture.toFixed(2), row.category || 'uncategorised', '×' + s.capture.toFixed(2)),
      el('div', { class: 'row total' },
        el('span', { class: 'k' }, el('span', { text: 'Implied value' }), el('small', { text: 'the page\'s own recomputation' })),
        el('span', { class: 'v', text: moneyFull(s.implied) })
      )
    );
    body.appendChild(el('section', { class: 'block' },
      el('h3', { text: 'Why this number' }),
      ledger,
      el('p', { class: 'tight', text: s.implied === row.implied_value_usd ? 'Recomputed here from the snapshot figures: ' + moneyFull(s.implied) + ' — the same number board.json carries. It is a claim about what a launch would be worth if the record stayed as it is, not a price and not a forecast.' : 'WARNING: this page recomputes ' + moneyFull(s.implied) + ' but the board carries ' + moneyFull(row.implied_value_usd) + '. The page and the board disagree.' })
    ));

    /* The farm plan. */
    var steps = el('ol', { class: 'steps' });
    (row.farm_steps || []).forEach(function (raw) {
      var part = splitStep(raw);
      steps.appendChild(el('li', null,
        el('p', { text: part.text }),
        el('div', { class: 'meta' },
          part.cost ? el('span', { class: 'cost', text: 'Cost · ' + part.cost }) : null,
          part.time ? el('span', { class: 'time', text: 'Time · ' + part.time }) : null
        )
      ));
    });
    body.appendChild(el('section', { class: 'block' },
      el('h3', { text: 'Farm plan — ' + (row.farm_steps || []).length + ' steps' }),
      steps,
      el('p', { class: 'tight', text: 'Every step is derived from this protocol\'s own record: the category decides the action and the risk, the chain decides the gas, the TVL decides the capital, and how long it has run with no token decides the window. A points claim that asks for a fee is a scam.' })
    ));

    /* The snapshot record, all ten fields. */
    var record = el('dl', { class: 'record' });
    [
      ['slug', row.slug],
      ['category', row.category || '—'],
      ['tvl_usd', moneyFull(row.tvl_usd)],
      ['change_7d', row.change_7d === null ? '—' : pct(row.change_7d)],
      ['listed_at', row.listed_at || '—'],
      ['age_days', row.age_days === null ? '—' : String(row.age_days)],
      ['chains', row.chain_count + ' — ' + (row.chains.join(', ') || '—')],
      ['mcap_usd', row.mcap_usd === null ? 'null (no token on record)' : moneyFull(row.mcap_usd)],
      ['gecko_id', row.gecko_id === null ? 'null' : row.gecko_id],
      ['symbol', row.symbol === null ? 'null' : row.symbol],
    ].forEach(function (pair) {
      record.appendChild(el('div', null, el('dt', { text: pair[0] }), el('dd', { text: pair[1] })));
    });
    body.appendChild(el('section', { class: 'block' },
      el('h3', { text: 'The snapshot record' }),
      record,
      el('p', { class: 'tight', text: 'Read the record, not the name: DefiLlama\'s record is not proof, so this board says a protocol records no token, never that it has none.' })
    ));

    d.appendChild(body);
  }

  /* ------------------------------------------------------------------ render */

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(hero());
    shell.appendChild(formula());
    shell.appendChild(controls());
    var board = boardTable();
    board.id = 'board-panel';
    shell.appendChild(board);
    shell.appendChild(liveTable());
    shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Snapshot ' + DATA.as_of + ' · model ' + DATA.model_version + ' · every figure is the snapshot\'s own; no protocol is named in the model.' }),
      el('span', { class: 'src', text: 'Source · ' + DATA.source })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    document.body.appendChild(ensureDrawer());
    var stamp = { 'spec-date': DATA.as_of, 'spec-model': DATA.model_version, 'spec-source': 'DefiLlama /protocols' };
    Object.keys(stamp).forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.textContent = stamp[id];
    });
    if (state.sel) select(state.sel);
    if (state.scroll === 'board') {
      var panel = document.getElementById('board-panel');
      if (panel) panel.scrollIntoView();
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.sel) select(null); });
})();
