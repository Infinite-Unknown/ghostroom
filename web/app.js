'use strict';
// GhostRoom front end. Everything on screen comes from the Apps Script back end below.
const API = 'https://script.google.com/macros/s/AKfycbwzDVsgknE2HXOndbRJ0wXWR0xJhz1X_zuunbvPzxLwdpEurHgei4geGikPowEpk087UA/exec';

const POLL_MS = 10000;
const STALE_MS = 60000;
const LIST_MAX = 6;
const FALLBACK_TARIFF = 0.365; // RM/kWh, the back end's default tariff_rm_kwh; only used before any waste is logged today

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let S = null;          // last good ?api=state
let sel = null;        // selected room code
let lastGood = 0;      // when S last arrived
let lastPostAt = 0;    // polls that started before this are stale
let inflight = false, again = false;
let busy = false;      // walk-in sequence playing: hold the hero still
const expanded = { ghost: false, free: false };

// ---------------- back end ----------------
async function call(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

// text/plain keeps it a "simple" request: Apps Script does not answer CORS preflights.
const post = (body) => call(API, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(body),
}, 45000);

async function poll() {
  if (inflight) { again = true; return; }
  inflight = true;
  const startedAt = Date.now();
  try {
    const s = await call(`${API}?api=state`, {}, 20000);
    if (!s || !Array.isArray(s.rooms) || !s.rooms.length) throw new Error((s && s.error) || 'no data');
    if (startedAt >= lastPostAt) {
      S = s;
      lastGood = Date.now();
      if (!sel || !roomOf(sel)) sel = initialRoom();
      document.body.classList.remove('boot', 'boot-fail');
      renderAll();
    } else again = true; // a button press changed state while this was in flight
  } catch (e) {
    if (!S) document.body.classList.add('boot-fail');
  } finally {
    inflight = false;
    renderStamp();
    if (again) { again = false; poll(); }
  }
}

// ---------------- state helpers ----------------
const roomOf = (id) => S && S.rooms.find((r) => r.room === id);
const ghostOf = (id) => S && (S.ghost_now || []).find((g) => g.room === id);
const freeOf = (id) => S && (S.free_now || []).find((f) => f.room === id);

// The back end keeps a set-back room's status as GHOST and reports aircon SETBACK.
function view(r) {
  if (r.status === 'SENSOR_OFFLINE') return 'offline';
  if (r.aircon === 'SETBACK') return 'setback';
  if (r.status === 'GHOST') return 'ghost';
  if (r.status === 'IN_USE') return 'inuse';
  return 'free';
}
const WORD = { ghost: 'Ghost', setback: 'Setback', inuse: 'In use', free: 'Free', offline: 'Sensor offline' };

function initialRoom() {
  const q = (new URLSearchParams(location.search).get('room') || '').trim().toUpperCase();
  if (roomOf(q)) return q;
  const g = (S.ghost_now || [])[0];
  if (g && roomOf(g.room)) return g.room;
  return roomOf('D-07-08') ? 'D-07-08' : S.rooms[0].room;
}

function fmtTs(ts) { // "YYYY-MM-DD HH:MM" -> "HH:MM" today, "9 Nov 21:54" otherwise
  const s = String(ts || '');
  if (!s) return '';
  if (S && s.slice(0, 10) === String(S.generated_at).slice(0, 10)) return s.slice(11, 16);
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1] || ''} ${s.slice(11, 16)}`;
}
const f1 = (x) => (Number(x) || 0).toFixed(1);
const rm = (x) => `RM ${(Number(x) || 0).toFixed(2)}`;

// ---------------- render ----------------
function renderAll() {
  renderNumbers();
  renderExamples();
  if (!busy) renderHero();
  renderBuilding();
  renderLists();
  renderFooter();
  renderStamp();
}

function renderStamp() {
  const el = $('stamp');
  if (!S) { el.textContent = document.body.classList.contains('boot-fail') ? 'NO CONNECTION' : 'CONNECTING…'; el.className = 'stamp mono stale'; return; }
  const stale = Date.now() - lastGood > STALE_MS;
  el.textContent = `${stale ? 'STALE' : 'LIVE'} · ${String(S.generated_at).slice(11, 16)}`;
  el.className = `stamp mono ${stale ? 'stale' : 'live'}`;
}

function countTo(el, value, fmt) {
  const from = el._v;
  el._v = value;
  if (from === undefined || from === value || reduceMotion.matches) { el.textContent = fmt(value); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 400), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (value - from) * e);
    if (k < 1 && el._v === value) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderNumbers() {
  const c = S.counters || {}, t = c.today || {};
  const ghosts = S.rooms.filter((r) => view(r) === 'ghost').length;
  // ponytail: the back end sends kwh_recovered but no rm_recovered; use the same tariff it used for rm_wasted
  const tariff = t.kwh_wasted > 0 ? t.rm_wasted / t.kwh_wasted : FALLBACK_TARIFF;
  countTo($('nGhost'), ghosts, (v) => String(Math.round(v)));
  countTo($('nWasted'), Number(t.rm_wasted) || 0, rm);
  countTo($('nRecovered'), (Number(t.kwh_recovered) || 0) * tariff, rm);
  countTo($('nFree'), Number(c.free) || 0, (v) => String(Math.round(v)));
  $('sWasted').textContent = `${f1(t.kwh_wasted)} kWh over ${f1(t.ghost_room_hours)} ghost-hours`;
  $('sFree').textContent = `of ${c.rooms || S.rooms.length} tracked`;
}

const VERDICT = {
  ghost: () => 'Booked, but nobody came. The aircon is cooling an empty room.',
  inuse: (r) => (!r.scheduled_now ? 'In use, but not on the timetable.'
    : r.people > 0 ? 'Class is running.'
    : 'Booked and empty for under 20 minutes. Not a ghost yet.'), // back end's grace period
  free: (r) => {
    const f = freeOf(r.room);
    return f && f.free_until ? `Empty and not booked. Free until ${f.free_until}.` : 'Empty and not booked. Free for the rest of the day.';
  },
  setback: () => 'Aircon set back. It comes back on the moment someone walks in.',
  offline: () => 'We cannot see this room, so we do not touch it.',
};
const WHY_NOT = {
  inuse: 'Only ghost rooms can be set back. This room is not a ghost right now.',
  free: 'Only ghost rooms can be set back. Nothing is booked here and the aircon is off.',
  setback: 'Already set back.',
  offline: 'Sensor offline. We never set back a room we cannot see.',
};

function renderHero() {
  const r = roomOf(sel);
  if (!r) return;
  const v = view(r), g = ghostOf(r.room);
  $('code').textContent = r.room;
  $('meta').textContent = `Block ${r.block} · Floor ${r.floor} · ${r.capacity} seats`;
  $('tt').textContent = r.scheduled_now ? `Booked: ${r.module}, until ${r.class_ends}` : 'Nothing scheduled';
  if (v === 'offline') {
    $('sensors').textContent = `No signal since ${fmtTs(r.last_seen)}. We do not guess.`;
  } else {
    let s = `${plural(r.people, 'person', 'people')} · ${plural(r.wifi_clients, 'Wi-Fi device', 'Wi-Fi devices')}`;
    if ((v === 'ghost' || v === 'setback') && g) s += ` · empty for ${g.minutes_empty} min`;
    $('sensors').textContent = s;
  }
  const word = $('vWord');
  word.textContent = { ghost: 'GHOST', inuse: 'IN USE', free: 'FREE', setback: 'SETBACK', offline: 'SENSOR OFFLINE' }[v];
  word.className = `v-word ${v}`;
  $('vLine').textContent = VERDICT[v](r);
  $('vCost').textContent = v === 'ghost' && g ? `${rm(g.est_rm)} wasted so far · ${plural(g.ghost_count_7d, 'time', 'times')} this week` : '';
  const ap = $('approve');
  if (ap.getAttribute('aria-busy') !== 'true') ap.disabled = v !== 'ghost';
  $('approveWhy').textContent = v === 'ghost' ? '' : WHY_NOT[v];
  drawRoom(r, v, g);
}

// ---------------- the section drawing ----------------
const ROWS = [176, 390, 604];
const SEAT_X = ROWS.flatMap((x0) => [0, 1, 2, 3].map((i) => x0 + i * 46));
const ORDER = [5, 1, 9, 6, 2, 10, 4, 0, 8, 7, 3, 11]; // seat fill order, spread across the rows
const DOOR_X = 106, WALK_Y = 338;
// Streamlines: leave the louvre, sweep left across the room and drop to desk level.
const AIR = [
  'M704 162 C560 150 380 162 230 318',
  'M708 165 C590 166 440 196 330 326',
  'M714 167 C620 182 500 226 430 330',
  'M722 169 C650 200 580 252 530 332',
  'M732 170 C690 222 650 280 630 334',
];

function seatSVG(x, i) {
  return `<g>
    <path class="sv-beyond" d="M${x - 30} 334 H${x - 12} M${x - 27} 334 V400 M${x - 6} 354 H${x + 12} V318 M${x + 4} 354 V400"/>
    <g class="person" data-seat="${i}">
      <path d="M${x} 352 L${x - 3} 310 M${x - 2} 318 L${x - 15} 333 M${x} 352 H${x - 20} L${x - 22} 400"/>
      <circle cx="${x - 5}" cy="300" r="8"/>
    </g>
  </g>`;
}

function buildRoomSVG() {
  $('draw').innerHTML = `
<svg id="room" viewBox="30 10 778 458" role="img" aria-labelledby="roomTitle roomDesc">
  <title id="roomTitle">Section drawing of the selected room</title>
  <desc id="roomDesc"></desc>
  <defs>
    <pattern id="poche" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="sv-hatch" x1="0" y1="0" x2="0" y2="7"/></pattern>
    <pattern id="offh" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="sv-offh" x1="0" y1="0" x2="0" y2="12"/></pattern>
  </defs>

  <rect class="offh" x="60" y="116" width="720" height="284" fill="url(#offh)"/>

  <path class="sv-poche" d="M40 52 H800 V420 H40 Z M60 72 H780 V400 H60 Z M780 196 H800 V330 H780 Z"/>
  <path class="sv-thin" d="M786 196 V330 M794 196 V330"/>
  <line class="sv-thin" x1="60" y1="116" x2="780" y2="116"/>

  <g class="door">
    <rect class="door-gap" x="74" y="246" width="64" height="154"/>
    <rect class="sv-beyond" x="74" y="246" width="64" height="154"/>
    <g class="leaf"><rect x="76" y="248" width="60" height="152"/><line x1="127" y1="318" x2="127" y2="332"/></g>
  </g>

  <g class="cone">
    <path class="cone-fill" d="M300 134 L80 400 H540 Z"/>
    <path class="cone-edge" d="M80 400 L300 134 L540 400"/>
  </g>
  <path id="coneFlash" class="cone-flash" d="M300 134 L80 400 H540 Z"/>

  <g id="seats">${SEAT_X.map(seatSVG).join('')}</g>
  <text id="plusN" class="plus" x="772" y="282"></text>
  <g id="unknown">${[1, 5, 9].map((i) => `<text class="unk" x="${SEAT_X[i] - 5}" y="318">?</text>`).join('')}</g>

  <g id="walker" class="walker" style="transform: translate(${DOOR_X}px, ${WALK_Y}px)">
    <line class="limb a1" x1="-1" y1="-38" x2="-1" y2="-12"/>
    <line class="limb l1" x1="0" y1="0" x2="0" y2="62"/>
    <line x1="0" y1="0" x2="-1" y2="-44"/>
    <line class="limb l2" x1="0" y1="0" x2="0" y2="62"/>
    <line class="limb a2" x1="-1" y1="-38" x2="-1" y2="-12"/>
    <circle cx="-2" cy="-54" r="8"/>
  </g>

  <rect class="ghost-ring" x="68" y="124" width="704" height="268" rx="2"/>

  <g class="air">${AIR.map((d) => `<path d="${d}"/>`).join('')}</g>
  <g class="ac">
    <rect class="sv-body" x="692" y="124" width="86" height="34" rx="4"/>
    <line class="sv-thin" x1="698" y1="136" x2="772" y2="136"/>
    <line class="louvre" x1="706" y1="159" x2="748" y2="159"/>
  </g>

  <g class="relay">
    <path class="wire" d="M664 95 H735 V124"/>
    <line class="sv-thin" x1="640" y1="72" x2="640" y2="82"/>
    <rect class="sv-body" x="616" y="82" width="48" height="26" rx="3"/>
    <circle class="led" cx="630" cy="95" r="4.5"/>
    <g class="lever"><line x1="650" y1="101" x2="650" y2="87"/><circle cx="650" cy="87" r="2.5"/></g>
  </g>

  <g class="pir">
    <rect class="sv-body" x="288" y="116" width="24" height="7"/>
    <path class="sv-body" d="M291 123 A9 9 0 0 0 309 123 Z"/>
    <path class="pir-x" d="M284 107 L316 139 M316 107 L284 139"/>
  </g>

  <g class="callouts">
    <path class="sv-leader" d="M300 40 V116 M652 40 V82"/>
    <circle class="sv-dot" cx="300" cy="116" r="3"/>
    <circle class="sv-dot" cx="652" cy="82" r="3"/>
    <text id="lPir" class="sv-lbl" x="308" y="32" text-anchor="end"></text>
    <text id="lRelay" class="sv-lbl" x="664" y="32" text-anchor="end"></text>
    <text id="lAc" class="sv-lbl" x="682" y="147" text-anchor="end"></text>
    <text id="lSend" class="sv-lbl sv-send" x="74" y="232"></text>
  </g>
  <text id="lTitle" class="sv-title" x="40" y="456"></text>
</svg>`;
}

function setPeople(svg, n) {
  const on = new Set(ORDER.slice(0, n));
  svg.querySelectorAll('.person').forEach((p) => {
    const i = Number(p.dataset.seat);
    p.style.transitionDelay = `${ORDER.indexOf(i) * 35}ms`;
    p.classList.toggle('on', on.has(i));
  });
}

function drawRoom(r, v, g) {
  const svg = $('room');
  const airOn = r.aircon === 'ON';
  svg.classList.toggle('s-air', airOn);
  svg.classList.toggle('s-relay', airOn);
  svg.classList.toggle('s-offline', v === 'offline');
  svg.classList.toggle('s-ghost', v === 'ghost');
  svg.classList.toggle('s-setback', v === 'setback');
  const people = v === 'offline' ? 0 : Number(r.people) || 0;
  setPeople(svg, Math.min(people, 12));
  $('plusN').textContent = people > 12 ? `+${people - 12}` : '';

  let pir = 'PIR · NO MOTION';
  if (v === 'offline') pir = 'PIR · NO SIGNAL';
  else if (people > 0) pir = 'PIR · MOTION NOW';
  else if ((v === 'ghost' || v === 'setback') && g) pir = `PIR · MOTION ${g.minutes_empty} MIN AGO`;
  $('lPir').textContent = pir;
  $('lAc').textContent = `AC · ${r.aircon}`;
  $('lRelay').textContent = `RELAY · ${airOn ? 'CLOSED' : 'OPEN'}`;
  $('lTitle').textContent = `SECTION · ${r.room} · SIMULATED ROOM`;
  $('roomDesc').textContent = `${r.room}: ${WORD[v]}. ${v === 'offline' ? 'No sensor signal' : plural(people, 'person', 'people')}. Aircon ${r.aircon.toLowerCase()}.`;
}

// Walk in: plays only after the back end has confirmed the motion and returned the new state.
// The door is already open (in-flight state, see onWalk).
async function playWalkIn(before, after) {
  if (reduceMotion.matches) return;
  const svg = $('room'), walker = $('walker');
  const seat = ORDER[Math.min(Number(before.people) || 0, 11)];
  const x = SEAT_X[seat];
  walker.classList.add('on', 'walking');
  const walk = walker.animate(
    [{ transform: `translate(${DOOR_X}px, ${WALK_Y}px)` }, { transform: `translate(${x}px, ${WALK_Y}px)` }],
    { duration: 1200, easing: 'cubic-bezier(.45, 0, .55, 1)', fill: 'forwards' });
  await walk.finished;
  walker.classList.remove('walking', 'on');
  const p = svg.querySelector(`.person[data-seat="${seat}"]`);
  p.style.transitionDelay = '0ms';
  p.classList.add('on');
  svg.classList.remove('door-open');
  $('coneFlash').animate([{ opacity: 0 }, { opacity: 0.2 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
  $('lPir').textContent = 'PIR · MOTION NOW';
  await sleep(500);
  if (after.aircon === 'ON' && before.aircon !== 'ON') {
    svg.classList.add('s-relay');
    $('lRelay').textContent = 'RELAY · CLOSED';
    await sleep(300);
    svg.classList.add('s-air');
    $('lAc').textContent = 'AC · ON';
    await sleep(800);
  }
  walk.cancel();
}

// ---------------- the building ----------------
function renderBuilding() {
  const host = $('blocks');
  const key = S.rooms.map((r) => r.room).join(',');
  if (host.dataset.key !== key) {
    host.dataset.key = key;
    const blocks = [...new Set(S.rooms.map((r) => r.block))].sort();
    host.innerHTML = blocks.map((b) => {
      const inBlock = S.rooms.filter((r) => r.block === b);
      const floors = [...new Set(inBlock.map((r) => Number(r.floor)))].sort((a, c) => c - a); // tracked floors only, top first
      const rows = floors.map((f) => `<div class="floor"><span class="fl label">F${f}</span>${inBlock
        .filter((r) => Number(r.floor) === f).sort((a, c) => a.room.localeCompare(c.room))
        .map((r) => `<button class="win" type="button" data-room="${esc(r.room)}"></button>`).join('')}</div>`).join('');
      return `<div class="block"><div class="block-name label">Block ${esc(b)}</div><div class="elev">${rows}</div><div class="ground"></div></div>`;
    }).join('');
  }
  const counts = { inuse: 0, free: 0, ghost: 0, setback: 0, offline: 0 };
  host.querySelectorAll('.win').forEach((w) => {
    const r = roomOf(w.dataset.room);
    if (!r) return;
    const v = view(r);
    counts[v]++;
    w.className = `win ${v}${r.room === sel ? ' sel' : ''}`;
    w.setAttribute('aria-pressed', r.room === sel ? 'true' : 'false');
    w.setAttribute('aria-label', `${r.room}, ${WORD[v].toLowerCase()}, ${r.people == null ? 'no signal' : plural(r.people, 'person', 'people')}`);
  });
  const sw = (v) => `<span><i class="win ${v}" aria-hidden="true"></i>${WORD[v]} <b>${counts[v]}</b></span>`;
  $('legend').innerHTML = ['inuse', 'free', 'ghost', 'setback', 'offline'].map(sw).join('');
}

// ---------------- examples ----------------
// Three kinds of room worth a look, picked from the live state. In demo mode the back end stages one of each.
const EXAMPLES = [
  { text: 'A ghost room', demo: 'D-07-08', is: (r) => view(r) === 'ghost' },
  { text: 'In use, not booked', demo: 'B-05-03', is: (r) => r.status === 'IN_USE' && !r.scheduled_now && r.people > 0 },
  { text: 'A dead sensor', demo: 'B-08-01', is: (r) => view(r) === 'offline' },
];
function exampleRoom(ex) {
  const hits = S.rooms.filter(ex.is);
  const staged = S.scenario === 'demo' && hits.find((r) => r.room === ex.demo);
  return (staged || hits[0] || {}).room || '';
}
function renderExamples() {
  $('exLabel').textContent = S.scenario === 'demo' ? 'Staged examples' : 'Examples right now';
  const list = $('exList'), focused = [...list.children].indexOf(document.activeElement); // keep keyboard focus across the redraw
  setHTML(list, EXAMPLES.map((ex) => {
    const id = exampleRoom(ex);
    return `<button class="ex" type="button" data-ex="${esc(id)}"${id ? '' : ' disabled'} aria-pressed="${id !== '' && id === sel}">${esc(ex.text)} <span class="mono">${id ? esc(id) : 'none right now'}</span></button>`;
  }).join(''));
  if (focused >= 0 && list.children[focused] !== document.activeElement) list.children[focused].focus({ preventScroll: true });
}

function select(id, scroll) {
  if (busy || !roomOf(id)) return;
  if (id !== sel) $('actMsg').textContent = '';
  sel = id;
  renderHero();
  renderBuilding();
  renderExamples();
  if (scroll) {
    const box = $('hero').getBoundingClientRect();
    if (box.top < 0 || box.top > innerHeight * 0.5) $('hero').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }
}

// ---------------- lists + footer ----------------
function setHTML(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }

function renderLists() {
  const ghosts = (S.ghost_now || []).filter((g) => roomOf(g.room) && view(roomOf(g.room)) === 'ghost')
    .sort((a, b) => b.est_rm - a.est_rm);
  const gShow = expanded.ghost ? ghosts : ghosts.slice(0, LIST_MAX);
  setHTML($('ghostList'), ghosts.length ? gShow.map((g) => `<li>
      <span class="r-code">${esc(g.room)}</span>
      <span class="r-mod" title="${esc(g.module)}">${esc(g.module)}</span>
      <span class="r-n r-empty">empty ${g.minutes_empty} min</span>
      <span class="r-n r-rm c-warn">${rm(g.est_rm)}</span>
      <button class="link r-go" type="button" data-review="${esc(g.room)}">Review →</button>
    </li>`).join('') : `<li class="empty">No ghost rooms right now.${worstToday()}</li>`);
  more($('ghostMore'), ghosts.length, 'ghost');

  const free = (S.free_now || []).slice().sort((a, b) => (b.free_until || '99:99').localeCompare(a.free_until || '99:99'));
  const fShow = expanded.free ? free : free.slice(0, LIST_MAX);
  setHTML($('freeList'), free.length ? fShow.map((f) => `<li>
      <span class="r-code">${esc(f.room)}</span>
      <span class="r-n">${f.capacity} seats</span>
      <span class="r-n">${f.free_until ? `free until ${esc(f.free_until)}` : 'free rest of day'}</span>
    </li>`).join('') : '<li class="empty">No free rooms right now.</li>');
  more($('freeMore'), free.length, 'free');
}

// counters.today.top_offenders looks like "B-04-05 (2.3h), D-07-07 (1.7h)".
function worstToday() {
  const items = String((S.counters && S.counters.today && S.counters.today.top_offenders) || '')
    .split(',').map((x) => x.trim().match(/^(\S+)\s*\(([^)]*)\)$/)).filter(Boolean);
  if (!items.length) return '';
  return `<span class="worst">Worst today: ${items.map(([, room, h]) => (roomOf(room)
    ? `<button class="link" type="button" data-review="${esc(room)}">${esc(room)}</button>` : esc(room)) + ` (${esc(h)})`).join(' · ')}</span>`;
}

function more(btn, n, which) {
  btn.hidden = n <= LIST_MAX;
  btn.textContent = expanded[which] ? 'Show fewer' : `Show all ${n}`;
}

function renderFooter() {
  setHTML($('cmds'), (S.commands || []).slice(0, 5)
    .map((c) => `<li>${esc(fmtTs(c.ts))} · ${esc(c.room)} · ${esc(c.action)} · by ${esc(c.by)}</li>`).join(''));
  const gym = S.gym || [];
  $('gym').hidden = !gym.length;
  $('gym').textContent = gym.length ? `Gym: ${gym.map((z) => `${z.zone} ${z.people}/${z.capacity}`).join(' · ')}` : '';
}

// ---------------- buttons ----------------
function working(btn, text) {
  btn._label = btn._label || btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
}
function done(btn) {
  btn.textContent = btn._label;
  btn.removeAttribute('aria-busy');
  btn.disabled = false;
}
function say(text, ok) {
  const m = $('actMsg');
  m.textContent = text;
  m.className = `act-msg${ok ? ' ok' : ''}`;
}
const errLine = (e) => (e && e.name === 'AbortError' ? 'The back end took too long. Try again.'
  : e instanceof TypeError ? 'Cannot reach the back end. Check the connection and try again.'
  : `Not done: ${e.message || e}`);

function applyRoom(row) {
  if (!row || !row.room) return;
  const i = S.rooms.findIndex((r) => r.room === row.room);
  if (i >= 0) S.rooms[i] = row;
}

// While a request is in flight the hero holds still (busy) and the drawing shows what is being sent.
// The real change (person, lever, air, verdict) is drawn only from the ok reply.
async function onApprove() {
  if (busy) return;
  const id = sel, btn = $('approve'), svg = $('room');
  say('');
  busy = true;
  working(btn, 'Approving…');
  $('walk').disabled = true;
  svg.classList.add('s-sending');
  $('lRelay').textContent = 'RELAY · SENDING SETBACK…';
  try {
    const res = await post({ type: 'approve', room: id });
    if (!res || !res.ok) throw new Error((res && res.error) || 'no answer');
    lastPostAt = Date.now();
    applyRoom(res.state);
  } catch (e) {
    say(errLine(e));
  } finally {
    svg.classList.remove('s-sending');
    busy = false;
    done(btn);
    $('walk').disabled = false;
    if (S) renderAll();
    poll();
  }
}

async function onWalk() {
  if (busy) return;
  const id = sel, btn = $('walk'), svg = $('room'), before = { ...roomOf(id) };
  say('');
  busy = true;
  working(btn, 'Walking in…');
  $('approve').disabled = true;
  svg.classList.add('door-open');
  $('lSend').textContent = 'SENSOR · SENDING MOTION…';
  try {
    const res = await post({ type: 'sensor', room: id, motion: true, source: 'web' });
    if (!res || !res.ok) throw new Error((res && res.error) || 'no answer');
    lastPostAt = Date.now();
    applyRoom(res.state);
    $('lSend').textContent = '';
    if (res.state) await playWalkIn(before, res.state);
  } catch (e) {
    say(errLine(e));
  } finally {
    svg.classList.remove('door-open');
    $('lSend').textContent = '';
    busy = false;
    done(btn);
    if (S) renderAll();
    poll();
  }
}

// ---------------- Room Scout ----------------
function scout(open) {
  const d = $('scout');
  d.classList.toggle('open', open);
  d.inert = !open;
  $('scoutOpen').setAttribute('aria-expanded', String(open));
  if (open) setTimeout(() => $('askInput').focus(), 50);
  else $('scoutOpen').focus({ preventScroll: true });
}

function addMsg(cls, text) {
  const li = document.createElement('li');
  li.className = cls;
  li.textContent = text;
  $('msgs').appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
  return li;
}

async function ask(text) {
  text = String(text || '').trim();
  if (!text) return;
  const form = $('askForm');
  addMsg('me', text);
  const a = addMsg('bot thinking', 'thinking…');
  form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
  try {
    const res = await post({ type: 'ask', text });
    a.textContent = (res && (res.answer || res.error)) || 'No answer.';
    if (!res || !res.ok) a.classList.add('err');
  } catch (e) {
    a.textContent = 'Could not reach Room Scout. Check the connection and try again.';
    a.classList.add('err');
  } finally {
    a.classList.remove('thinking');
    a.scrollIntoView({ block: 'nearest' });
    form.querySelectorAll('input, button').forEach((el) => { el.disabled = false; });
    $('askInput').focus();
  }
}

// ---------------- wire up ----------------
function showTip(w) {
  const r = roomOf(w.dataset.room);
  if (!r) return;
  const tip = $('tip'), box = w.getBoundingClientRect();
  tip.textContent = `${r.room} · ${WORD[view(r)]} · ${r.people == null ? 'no signal' : plural(r.people, 'person', 'people')}`;
  tip.style.left = `${box.left + box.width / 2}px`;
  tip.style.top = `${box.top - 8}px`;
  tip.hidden = false;
}

function init() {
  buildRoomSVG();
  const blocks = $('blocks');
  blocks.addEventListener('click', (e) => { const w = e.target.closest('.win'); if (w) select(w.dataset.room, true); });
  blocks.addEventListener('pointerover', (e) => { const w = e.target.closest('.win'); if (w) showTip(w); });
  blocks.addEventListener('pointerout', (e) => { if (e.target.closest('.win')) $('tip').hidden = true; });
  blocks.addEventListener('focusin', (e) => { const w = e.target.closest('.win'); if (w) showTip(w); });
  blocks.addEventListener('focusout', () => { $('tip').hidden = true; });
  addEventListener('scroll', () => { $('tip').hidden = true; }, { passive: true });

  $('ghostList').addEventListener('click', (e) => { const b = e.target.closest('[data-review]'); if (b) select(b.dataset.review, true); });
  $('ghostMore').addEventListener('click', () => { expanded.ghost = !expanded.ghost; renderLists(); });
  $('freeMore').addEventListener('click', () => { expanded.free = !expanded.free; renderLists(); });

  $('exList').addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (b && b.dataset.ex) select(b.dataset.ex, true); });

  $('approve').addEventListener('click', onApprove);
  $('walk').addEventListener('click', onWalk);

  $('scoutOpen').addEventListener('click', () => scout(!$('scout').classList.contains('open')));
  $('scoutClose').addEventListener('click', () => scout(false));
  const scoutOpen = () => $('scout').classList.contains('open');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && scoutOpen()) { e.preventDefault(); scout(false); } }, true);
  document.addEventListener('pointerdown', (e) => {
    if (!scoutOpen() || $('scout').contains(e.target) || $('scoutOpen').contains(e.target)) return;
    scout(false);
    // the click itself moves focus; give it back to the button unless it landed on another control
    setTimeout(() => { if (document.activeElement === document.body) $('scoutOpen').focus({ preventScroll: true }); }, 0);
  });
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => ask(c.textContent)));
  $('askForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('askInput'); const t = i.value; i.value = ''; ask(t); });

  poll();
  setInterval(poll, POLL_MS);
  setInterval(renderStamp, 5000);
}

init();
