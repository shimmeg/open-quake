  'use strict';
  const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const $ = sel => document.querySelector(sel);

  // ---- settings (localStorage + URL params) ----
  const defaults = { mode: '24', theme: 'dark', seconds: false, date: true };
  // Read params from the full href — robust for file:// (where location.search is often empty
  // in an Electron webview). Accepts both ?query and #hash forms.
  function readParams() {
    const out = {};
    try {
      const u = new URL(location.href);
      u.searchParams.forEach((v, k) => { out[k] = v; });
      if (u.hash.length > 1) new URLSearchParams(u.hash.slice(1)).forEach((v, k) => { out[k] = v; });
    } catch (e) {}
    return out;
  }
  function load() {
    let s = { ...defaults };
    try { Object.assign(s, JSON.parse(localStorage.getItem('flipclock') || '{}')); } catch (e) {}
    const p = readParams();
    if ('mode' in p) s.mode = p.mode === '12' ? '12' : '24';
    if ('theme' in p) s.theme = p.theme === 'classic' ? 'classic' : 'dark';
    if ('seconds' in p) s.seconds = p.seconds === '1' || p.seconds === 'true';
    if ('date' in p) s.date = !(p.date === '0' || p.date === 'false');
    return s;
  }
  function save() { try { localStorage.setItem('flipclock', JSON.stringify(settings)); } catch (e) {} }
  let settings = load();

  // ---- sizing: cards scale to viewport and fit portrait/landscape panel windows ----
  function clamp(min, value, max) { return Math.max(min, Math.min(max, value)); }
  function px(value) { return (Math.round(value * 100) / 100) + 'px'; }
  function applySizing() {
    const r = document.documentElement.style;
    const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1920);
    const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 480);
    const chHeightCap = (settings.seconds ? 0.50 : 0.64) * vh;
    const clockGap = clamp(8, 0.022 * vw, 48);
    const groupGap = clamp(4, 0.008 * vw, 16);

    const cardWidthFactor = 0.66;
    const wideHourFactor = 1.04;
    const hourFactor = settings.mode === '12' ? wideHourFactor : cardWidthFactor * 2;
    const minuteFactor = cardWidthFactor * 2;
    const secondFactor = settings.seconds ? cardWidthFactor * 2 : 0;
    const groupGapCount = (settings.mode === '24' ? 1 : 0) + 1 + (settings.seconds ? 1 : 0);
    const sepCount = settings.seconds ? 2 : 1;
    const clockGapCount = settings.seconds ? 4 : 2;
    const widthFactor = hourFactor + minuteFactor + secondFactor;

    let ch = chHeightCap;
    for (let i = 0; i < 2; i++) {
      const dot = clamp(8, ch * 0.026, 18);
      const fixedWidth = groupGapCount * groupGap + sepCount * dot + clockGapCount * clockGap;
      const widthCap = Math.max(32, (vw * 0.92 - fixedWidth) / widthFactor);
      ch = Math.max(32, Math.min(chHeightCap, widthCap));
    }

    const dot = clamp(8, ch * 0.026, 18);
    r.setProperty('--ch', px(ch));
    r.setProperty('--cw', px(ch * cardWidthFactor));
    r.setProperty('--cw2', px(ch * wideHourFactor));    // single hour card (12h), ~20% narrower
    r.setProperty('--fs', px(ch * 0.92));
    r.setProperty('--clock-gap', px(clockGap));
    r.setProperty('--group-gap', px(groupGap));
    r.setProperty('--sep-gap', px(ch * 0.25));
    r.setProperty('--dot', px(dot));
  }

  // ---- build the DOM ----
  const clock = $('#clock');
  let cards = {};                                    // id -> card element
  function card(id) {
    const c = document.createElement('div'); c.className = 'card'; c.dataset.v = '';
    c.innerHTML = '<div class="half top"><span class="d"></span></div>'
                + '<div class="half bottom"><span class="d"></span></div>'
                + '<div class="flap top"><span class="d"></span></div>'
                + '<div class="flap bottom"><span class="d"></span></div>';
    cards[id] = c; return c;
  }
  function group(ids) { const g = document.createElement('div'); g.className = 'group'; ids.forEach(id => g.appendChild(card(id))); return g; }
  function sep() { const s = document.createElement('div'); s.className = 'sep'; s.innerHTML = '<i></i><i></i>'; return s; }

  function build() {
    document.body.classList.toggle('classic', settings.theme === 'classic');
    applySizing();
    cards = {}; clock.innerHTML = '';
    if (settings.mode === '12') {                              // one wide hour card with an AM/PM badge
      const g = document.createElement('div'); g.className = 'group';
      const hc = card('hh'); hc.classList.add('wide');
      const ap = document.createElement('div'); ap.className = 'ampm'; ap.id = 'ampm'; hc.appendChild(ap);
      g.appendChild(hc); clock.appendChild(g);
    } else {                                                    // two hour cards (00-23), no AM/PM
      clock.appendChild(group(['h0', 'h1']));
    }
    clock.appendChild(sep());
    clock.appendChild(group(['m0', 'm1']));
    if (settings.seconds) { clock.appendChild(sep()); clock.appendChild(group(['s0', 's1'])); }
    const corner = document.getElementById('corner');
    corner.style.display = settings.date ? 'block' : 'none';
    corner.innerHTML = settings.date ? '<span class="cdate" id="date"></span><span class="cdow" id="dow"></span>' : '';
    for (const k in cards) cards[k].dataset.v = '';           // force a fresh first paint
    tick(true);
  }

  // ---- the flip ----
  function setCard(id, val) {
    const c = cards[id]; if (!c) return;
    val = String(val);
    if (c.dataset.v === val) return;
    const cur = c.dataset.v;
    c.dataset.v = val;
    const topD = c.querySelector('.half.top .d'), botD = c.querySelector('.half.bottom .d');
    const fTop = c.querySelector('.flap.top'), fBot = c.querySelector('.flap.bottom');
    const fTopD = fTop.querySelector('.d'), fBotD = fBot.querySelector('.d');
    if (cur === '') {                                                              // first paint: no animation
      topD.textContent = val; botD.textContent = val;
      fTopD.textContent = val; fBotD.textContent = val;   // the idle top flap sits over the static top — seed it so it isn't blank
      return;
    }
    fTopD.textContent = cur;        // folding panel shows the old digit (top half)
    fBotD.textContent = val;        // unfolding panel reveals the new digit (bottom half)
    topD.textContent = val;         // static top is already the new digit, hidden behind the fold
    botD.textContent = cur;         // static bottom still old until the unfold covers it
    fTop.classList.remove('go'); fBot.classList.remove('go');
    void c.offsetWidth;             // reflow so the animation restarts
    fTop.classList.add('go'); fBot.classList.add('go');
    fBot.addEventListener('animationend', () => { botD.textContent = val; }, { once: true });
  }

  function tick(force) {
    const now = new Date();
    const h = now.getHours();
    if (settings.mode === '12') {
      const ap = $('#ampm'); if (ap) ap.textContent = h < 12 ? 'AM' : 'PM';
      setCard('hh', String(h % 12 || 12));         // single hour card, 1-12 (no leading zero)
    } else {
      const hh = String(h).padStart(2, '0');
      setCard('h0', hh[0]); setCard('h1', hh[1]);   // two zero-padded hour cards
    }
    const mm = String(now.getMinutes()).padStart(2, '0');
    setCard('m0', mm[0]); setCard('m1', mm[1]);
    if (settings.seconds) { const ss = String(now.getSeconds()).padStart(2, '0'); setCard('s0', ss[0]); setCard('s1', ss[1]); }
    if (settings.date) {
      const d = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
      const de = $('#date'), we = $('#dow');
      if (de) de.textContent = d;
      if (we) we.textContent = DOW[now.getDay()];
    }
  }

  // ---- settings UI ----
  function syncPanel() {
    document.querySelectorAll('[data-set]').forEach(b => b.classList.toggle('on', settings[b.dataset.set] === b.dataset.val));
    document.querySelectorAll('[data-toggle]').forEach(c => c.checked = !!settings[c.dataset.toggle]);
  }
  $('#gear').onclick = () => $('#panel').classList.toggle('open');
  document.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { settings[b.dataset.set] = b.dataset.val; save(); build(); syncPanel(); });
  document.querySelectorAll('[data-toggle]').forEach(c => c.onchange = () => { settings[c.dataset.toggle] = c.checked; save(); build(); syncPanel(); });

  build(); syncPanel();
  window.addEventListener('hashchange', () => { settings = load(); build(); syncPanel(); });  // re-apply when options change
  setInterval(tick, 250);
