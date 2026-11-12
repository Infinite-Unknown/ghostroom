'use strict';
// Director mode (add ?director=1 to the address): a scripted camera and cursor for recording the demo video.
// Keys 1-7 play one section each. 0 or Esc: camera back to the start. C: face-cam bubble.
// Every click it makes is a real click path on the real site, with real back-end calls. Nothing is faked.
(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('director')) return;
  const FAST = q.has('fast');                      // dev only: no waiting, no gliding
  const wait = (ms) => new Promise((r) => setTimeout(r, FAST ? 20 : ms));
  const $$ = (s) => document.querySelector(s);
  const root = document.documentElement, body = document.body;

  const css = document.createElement('style');
  css.textContent = `
    html.directing { overflow: hidden; height: 100%; background: #F2F5F8; }
    html.directing body { transform-origin: 0 0; transition: transform ${FAST ? 0 : 1.15}s cubic-bezier(.45, 0, .2, 1); will-change: transform; }
    html.directing #tip { display: none !important; }
    #dcur { position: absolute; left: 0; top: 0; width: 34px; height: 34px; z-index: 90; pointer-events: none; opacity: 0;
            transition: transform ${FAST ? 0 : .75}s cubic-bezier(.4, 0, .2, 1), opacity .3s; filter: drop-shadow(0 2px 3px rgba(15, 26, 43, .35)); }
    #dcur.on { opacity: 1; }
    #dring { position: absolute; left: 0; top: 0; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; z-index: 89;
             border: 4px solid #6B3CF0; pointer-events: none; opacity: 0; }
    #dring.go { animation: dring .55s ease-out; }
    @keyframes dring { from { opacity: .9; transform: var(--at) scale(.3); } to { opacity: 0; transform: var(--at) scale(1.25); } }
    #dcam { position: fixed; left: 34px; bottom: 34px; width: 230px; height: 230px; border-radius: 50%; object-fit: cover; border: 5px solid #fff;
            background: #111; display: none; transform: scaleX(-1); z-index: 95; }
    #dnote { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); padding: 10px 18px; border-radius: 6px; background: #0F1A2B; color: #fff;
             font: 500 16px InterVariable, Inter, system-ui, sans-serif; z-index: 96; transition: opacity .4s; }
    #dnote.off { opacity: 0; pointer-events: none; }
    .dbar { position: fixed; background: #05080D; z-index: 94; pointer-events: none; }`;
  document.head.appendChild(css);
  root.classList.add('directing');
  body.insertAdjacentHTML('beforeend', `<svg id="dcur" viewBox="0 0 24 24"><path d="M5 2 L5 19 L9.5 15 L12.5 22 L15.5 20.7 L12.6 13.9 L18.5 13.6 Z" fill="#0F1A2B" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><i id="dring"></i>`);
  root.insertAdjacentHTML('beforeend', '<video id="dcam" autoplay muted playsinline></video><div id="dnote" class="off"></div><i class="dbar" id="dbarA"></i><i class="dbar" id="dbarB"></i>');

  // ---- camera: the whole page is moved and scaled; cam = { x, y, k } maps page -> screen ----
  // The video is 16:9. On a screen of another shape the picture is the centred 16:9 frame; the bars outside it are cut in the edit.
  function frame() {
    const W = innerWidth, H = innerHeight, w = Math.min(W, H * 16 / 9), h = w * 9 / 16;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  function bars() {
    const f = frame(), a = $$('#dbarA'), b = $$('#dbarB');
    if (f.y > 0.5) { a.style.cssText = 'left:0;right:0;top:0;height:' + f.y + 'px'; b.style.cssText = 'left:0;right:0;bottom:0;height:' + f.y + 'px'; }
    else { a.style.cssText = 'top:0;bottom:0;left:0;width:' + f.x + 'px'; b.style.cssText = 'top:0;bottom:0;right:0;width:' + f.x + 'px'; }
  }
  const home = () => { const f = frame(); return { x: f.x, y: f.y, k: f.w / innerWidth }; };
  let cam = home();
  const settle = () => wait(1250);
  // where an element is on the page (not on the screen), whatever the camera is doing now
  function pageBox(el) {
    const r = el.getBoundingClientRect();
    return { x: (r.left - cam.x) / cam.k, y: (r.top - cam.y) / cam.k, w: r.width / cam.k, h: r.height / cam.k };
  }
  function apply() { body.style.transform = `translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px) scale(${cam.k.toFixed(4)})`; }
  async function focus(target, o = {}) {
    scrollTo(0, 0);
    if (!target) { cam = home(); apply(); return settle(); }
    const el = typeof target === 'string' ? $$(target) : target;
    let b = pageBox(el);
    if (o.to) {                                    // frame everything from the target down to a second element
      const c = pageBox($$(o.to)), x1 = Math.min(b.x, c.x), y1 = Math.min(b.y, c.y);
      b = { x: x1, y: y1, w: Math.max(b.x + b.w, c.x + c.w) - x1, h: Math.max(b.y + b.h, c.y + c.h) - y1 };
    }
    const pad = o.pad ?? 46, f = frame();
    const k = Math.min(o.max ?? 2.1, f.w / (b.w + pad * 2), f.h / (b.h + pad * 2));
    let x = f.x + f.w / 2 - (b.x + b.w / 2) * k, y = f.y + f.h / 2 - (b.y + b.h * (o.ay ?? .5)) * k + (o.dy ?? 0);
    // do not show past the page edges when the page is big enough to fill the frame
    const pw = body.scrollWidth, ph = body.scrollHeight;
    if (pw * k >= f.w) x = Math.max(f.x + f.w - pw * k, Math.min(f.x, x));
    if (ph * k >= f.h) y = Math.max(f.y + f.h - ph * k, Math.min(f.y, y));
    cam = { x, y, k }; apply();
    return settle();
  }

  // ---- cursor ----
  const cur = $$('#dcur'), ring = $$('#dring');
  let cp = { x: innerWidth * .6, y: innerHeight * .5 };
  function setCur() { cur.style.transform = `translate(${cp.x - 6}px, ${cp.y - 3}px) scale(${1 / cam.k})`; cur.style.transformOrigin = '6px 3px'; }
  async function moveTo(el, ax = .5, ay = .55) {
    const b = pageBox(typeof el === 'string' ? $$(el) : el);
    cp = { x: b.x + b.w * ax, y: b.y + b.h * ay };
    cur.classList.add('on'); setCur();
    await wait(850);
  }
  async function press() {
    ring.style.setProperty('--at', `translate(${cp.x}px, ${cp.y}px)`);
    ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
    await wait(260);
  }
  const hideCur = () => cur.classList.remove('on');

  function note(text, ms = 5000) {
    const n = $$('#dnote'); n.textContent = text; n.classList.remove('off');
    clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('off'), ms);
  }
  const DEMO = 'D-07-08';
  const ghostRoom = () => (roomOf(DEMO) && view(roomOf(DEMO)) === 'ghost' ? DEMO : (S.rooms.find((r) => view(r) === 'ghost') || {}).room);

  // ---- the sections ----
  const SECTIONS = {
    // 1 · Ask Room Scout
    1: async () => {
      await focus(null); await wait(900);
      await focus('.scout', { max: 2 });
      const chip = document.querySelectorAll('.chip')[1];
      await moveTo(chip); await press();
      const asking = ask(chip.textContent);
      await wait(900); hideCur();
      await asking;
      await wait(5200);
      await focus(null);
    },
    // 2 · The campus in 3D
    2: async () => {
      setView('campus');
      await focus('#bldg', { max: 1.75 }); await wait(1400);
      // turn the model once, the way a hand would
      const scene = $$('#scene'), from = rz, t0 = performance.now(), dur = FAST ? 60 : 5200;
      scene.classList.add('dragging');
      await new Promise((done) => {
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          rz = from + 34 * Math.sin(p * Math.PI);      // out and back
          place3D();
          p < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
      rz = from; place3D(); scene.classList.remove('dragging');
      await wait(500);
      const g = ghostRoom() || DEMO, blk = roomOf(g).block;
      const seg = document.querySelector(`.seg[data-view="${blk}"]`);
      await moveTo(seg); await press(); setView(blk);
      await wait(2300);
      await focus('#scene', { max: 2.1 });
      const tile = document.querySelector(`.tiles .win[data-room="${g}"]`);
      if (tile) { await moveTo(tile); await wait(700); await press(); select(g, false); }
      await wait(1800); hideCur();
      await focus('.bench', { max: 1.25 });
    },
    // 3 · The ghost room: timetable against sensors
    3: async () => {
      const g = ghostRoom();
      if (!g) return note('No ghost room right now. Turn on demo mode, or run resetDemo().');
      if (sel !== g) select(g, false);
      await focus('.room-head', { to: '#draw', max: 1.7 }); await wait(3200);
      await focus('.facts', { max: 2.1, dy: -40 }); await wait(4200);
      await focus('#draw', { max: 1.95 }); await wait(5200);
      await focus('.room-head', { to: '#draw', max: 1.7 });
    },
    // 4 · Turn on Eco Mode
    4: async () => {
      const btn = $$('#approve');
      if (btn.disabled) return note('This room is not a ghost, so Eco Mode is off limits. Play section 3 first, or run resetDemo().');
      await focus('#draw', { to: '.actions', max: 1.7 });
      await moveTo(btn); await press();
      const doing = onApprove();
      await wait(1200); hideCur();
      await focus('#draw', { max: 1.95 });
      await doing;
      await wait(4200);
      await focus('.room-head', { to: '#draw', max: 1.7 }); await wait(2200);
    },
    // 5 · Walk in: sensors always win
    5: async () => {
      await focus('#draw', { to: '.actions', max: 1.7 });
      await moveTo('#walk'); await press();
      const doing = onWalk();
      await wait(1200); hideCur();
      await focus('#draw', { max: 1.95 });
      await doing;
      await wait(4200);
      await focus(null); await wait(1500);
    },
    // 6 · Two more truths: in use but not booked, and a dead sensor
    6: async () => {
      const show = async (i) => {
        await focus('#bldg', { max: 1.75 });
        const b = document.querySelectorAll('.ex')[i];
        if (!b || !b.dataset.ex) { note('No room of that kind right now.'); return; }
        await moveTo(b); await press(); select(b.dataset.ex, false);
        await wait(2000); hideCur();
        await focus('.room-head', { to: '#draw', max: 1.7 }); await wait(5200);
      };
      await show(1);
      await show(2);
      await focus(null);
    },
    // 7 · For students: the rooms that are really free
    7: async () => {
      await focus('.lists', { max: 1.6 }); await wait(2500);
      await focus(document.querySelectorAll('.list-panel')[1], { max: 2 }); await wait(4500);
      await focus(null);
    },
  };

  let running = false;
  async function play(n) {
    if (running || !S || !SECTIONS[n]) return;
    running = true;
    try { await SECTIONS[n](); } catch (err) { note('Section stopped: ' + err.message, 8000); } finally { hideCur(); running = false; }
  }

  async function camera() {
    const v = $$('#dcam');
    if (v.srcObject) { v.srcObject.getTracks().forEach((t) => t.stop()); v.srcObject = null; v.style.display = 'none'; return; }
    try { v.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); v.style.display = 'block'; }
    catch (err) { note('Camera not available: ' + err.message); }
  }

  addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (SECTIONS[e.key]) { e.preventDefault(); play(e.key); }
    else if (e.key === '0' || e.key === 'Escape') { if (!running) focus(null); }
    else if (e.key === 'c' || e.key === 'C') camera();
    else if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); }
  });
  addEventListener('resize', () => { bars(); if (!running) { cam = home(); apply(); } });
  bars(); apply();
  window.director = { play, focus };   // for testing from the console
  note('Director mode. Keys 1 to 7 play a section. 0 resets. F full screen. C camera.', 7000);
})();
