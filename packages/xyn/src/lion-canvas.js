// Xyeena Living Lion — Canvas 2D rig, soft-3D look.
//
// Geometry (silhouette, face mask, proportions, palette) is traced from the
// "Xyeena Mascot Concept" sheet. The motion model follows the technique used in
// Louis-CFM/coucou's design prototype (MIT): scripted keyframe tweens for
// gestures, spring-damped targets for everything continuous, eyes projected on a
// sphere-ish head (parallax per layer), squash & stretch, small particle system.
// No Mochi artwork is used; only the *approach* is shared.
//
// Public API is unchanged from the previous LivingLionRig so guardian.js,
// the React bridge and the existing tests keep working.

import { STATES } from './states.js';

export const LION_PALETTE = Object.freeze({
  goldLight: '#FBD9A9', gold: '#F0B473', goldDeep: '#E09A58', goldShade: '#BE7B58',
  innerEar: '#E99A7C', innerEarDeep: '#B65E48', earRim: '#F6DDBA',
  ivory: '#F8F2EF', ivoryShade: '#DCCDCB', ink: '#171217',
  rim: '#CDA7DB', glow: '#4F5FFF', bodyLight: '#EDEAF8', bodyDeep: '#8E86CF',
  shieldGold: '#E3BE84', shieldCream: '#FBF6EA', shieldBlue: '#C9D2EA'
});

export const clamp = (v, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);
const E = {
  out: t => 1 - (1 - t) ** 3,
  inOut: t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: t => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  lin: t => t
};

// ── design space ────────────────────────────────────────────────────────────
// Shapes below live in the concept-sheet hero coordinate system (940×920).
// DS is the square canvas space; OFF centres the hero inside it with headroom
// for crowns, bubbles and sparkles.
const DS = 1000, OFF = 35, AX = 466, GROUND = 852;

// face mask traced from the sheet (48 pts, closed, smooth)
const FACE = [[208,516],[211,548],[221,578],[238,605],[260,627],[287,644],[316,658],[346,668],[375,676],[398,683],[416,689],[435,692],[458,693],[483,693],[504,692],[521,688],[537,681],[560,674],[589,666],[620,656],[649,642],[676,624],[698,601],[714,574],[723,543],[726,511],[723,478],[716,446],[704,416],[687,389],[665,365],[639,346],[610,333],[578,326],[546,324],[514,328],[482,332],[451,332],[420,329],[388,327],[355,329],[324,338],[295,352],[269,371],[248,394],[230,421],[218,451],[210,483]];

const mir = ([x, y, c]) => [2 * AX - x, y, c];
/** top → bottom left-half → full closed outline (clockwise on screen). */
const sym = (top, left, bottom) => [top, ...left.map(mir), bottom, ...[...left].reverse()];

const SHELL = sym([466, 113], [[408,120],[348,140],[299,170],[250,212],[205,262],[160,312],[128,352],[105,392],[87,420],[70,460],[56,500],[45,540],[42,575],[47,602],[64,640],[90,672],[123,700],[165,724],[240,762],[330,806],[410,844]], [466, 852, 1]);
const INNER = sym([466, 338, 1], [[425,298],[385,266],[335,248],[282,262],[228,302],[184,356],[150,425],[136,495],[138,575],[150,645],[190,712],[262,766],[338,810],[410,842]], [466, 849, 1]);
const CREST_L = [[466,338,1],[428,298],[385,258],[350,218],[335,184],[350,158],[388,138],[418,130],[432,170],[446,230],[458,290]];
const CREST_R = [[466,338,1],[458,290],[446,230],[432,170],[418,130],[470,124],[540,138],[582,158],[597,184],[582,218],[547,258],[504,298]];

// ── tiny path toolkit (only methods every Canvas2D mock provides) ───────────
function smooth(ctx, pts, closed = true) {
  const n = pts.length;
  const P = i => pts[(i + n) % n];
  ctx.moveTo(P(0)[0], P(0)[1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = p1[2] ? p1 : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = p2[2] ? p2 : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
const shape = (ctx, pts, closed = true) => { ctx.beginPath(); smooth(ctx, pts, closed); };
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const k = r * 0.5523;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.bezierCurveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.bezierCurveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.bezierCurveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.bezierCurveTo(x, y + r - k, x + r - k, y, x + r, y);
  ctx.closePath();
}
const gradCache = new WeakMap();
function getGradCache(ctx) {
  let cache = gradCache.get(ctx);
  if (!cache) {
    cache = new Map();
    gradCache.set(ctx, cache);
  }
  return cache;
}

const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(.1, r), 0, Math.PI * 2); };
const oval = (ctx, x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, Math.PI * 2); };
const lin = (ctx, x1, y1, x2, y2, stops) => {
  if (!ctx || typeof ctx.createLinearGradient !== 'function') return null;
  const key = `l:${x1},${y1},${x2},${y2}:` + stops.map(s => s[0] + s[1]).join('|');
  const cache = getGradCache(ctx);
  let g = cache.get(key);
  if (!g) {
    g = ctx.createLinearGradient(x1, y1, x2, y2);
    for (const [p, c] of stops) g.addColorStop(p, c);
    if (cache.size > 200) cache.clear();
    cache.set(key, g);
  }
  return g;
};
const rad = (ctx, x, y, r, stops, x0 = x, y0 = y, r0 = 0) => {
  if (!ctx || typeof ctx.createRadialGradient !== 'function') return null;
  const key = `r:${x0},${y0},${r0},${x},${y},${r}:` + stops.map(s => s[0] + s[1]).join('|');
  const cache = getGradCache(ctx);
  let g = cache.get(key);
  if (!g) {
    g = ctx.createRadialGradient(x0, y0, r0, x, y, r);
    for (const [p, c] of stops) g.addColorStop(p, c);
    if (cache.size > 200) cache.clear();
    cache.set(key, g);
  }
  return g;
};
/** flood the current clip with a gradient (tightly bounded to design space). */
function wash(ctx, fill) {
  ctx.beginPath(); ctx.moveTo(-50, -50); ctx.lineTo(1050, -50); ctx.lineTo(1050, 1050); ctx.lineTo(-50, 1050); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function star4(ctx, x, y, r, pinch = .16) {
  ctx.beginPath(); ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * pinch, y - r * pinch, x + r, y);
  ctx.quadraticCurveTo(x + r * pinch, y + r * pinch, x, y + r);
  ctx.quadraticCurveTo(x - r * pinch, y + r * pinch, x - r, y);
  ctx.quadraticCurveTo(x - r * pinch, y - r * pinch, x, y - r);
  ctx.closePath();
}
function heart(ctx, s) {
  ctx.beginPath(); ctx.moveTo(0, s * .38);
  ctx.bezierCurveTo(-s * 1.05, -s * .15, -s * .5, -s * .95, 0, -s * .38);
  ctx.bezierCurveTo(s * .5, -s * .95, s * 1.05, -s * .15, 0, s * .38); ctx.closePath();
}

class Spring {
  constructor(k, zeta = 1, x = 0) { this.k = k; this.c = 2 * Math.sqrt(k) * zeta; this.x = x; this.v = 0; }
  step(dt, target) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
  kick(v) { this.v += v; }
  snap(x) { this.x = x; this.v = 0; }
}

// ── expression language (matches the concept sheet) ─────────────────────────
const BADGE_COLOR = { heart: '#FF5C8A' };
const LOOK = {
  idle:       { eye: 'dot' },
  working:    { eye: 'happy', badge: 'bubble', bob: 1 },
  thinking:   { eye: 'dot', badge: 'thought', look: [.62, -.5], tilt: .035 },
  searching:  { eye: 'dot', badge: 'search', scan: 1 },
  question:   { eye: 'dot', badge: 'question', tilt: .07 },
  approval:   { eye: 'wide', badge: 'alert', bounce: 1 },
  finished:   { eye: 'happy', badge: 'spark', celebrate: 1 },
  error:      { eye: 'flat', badge: 'alert', shake: 1 },
  rate_limit: { eye: 'tired', badge: 'clock', sweat: 1 },
  sleeping:   { eye: 'sleep', zz: 1, slow: 1 },
  dizzy:      { eye: 'spiral', dizzy: 1 },
  greeting:   { eye: 'happy', badge: 'spark', celebrate: 1 },
  upload:     { eye: 'focused', badge: 'upload' },
  yawn:       { eye: 'sleep', slow: 1 },
  surprised:  { eye: 'wide' },
  proud:      { eye: 'happy', badge: 'spark', tilt: -.05, celebrate: 1 },
  wink:       { eye: 'wink', tilt: .05 },
  annoyed:    { eye: 'flat', shake: 1 },
  love:       { eye: 'heart', badge: 'heart', blush: 1, bob: 1 },
  dancing:    { eye: 'happy', badge: 'spark', dance: 1 }
};
LOOK.attention = LOOK.question; // legacy alias

const EYE_X = 106, EYE_Y = 512; // eye offset from axis / eye line (sheet units)

export class LivingLionRig {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{size?:number,state?:string,variant?:string,reducedMotion?:boolean}} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    this.size = options.size || 96;
    this.state = options.state || 'idle';
    this.variant = options.variant || 'standard';
    this.reducedMotion = Boolean(options.reducedMotion);

    // gaze (kept for API/test compatibility): targets are −1…1
    this.targetGazeX = 0; this.targetGazeY = 0;
    this.eyeGazeX = 0; this.eyeGazeY = 0;      // fast follower (eyes)
    this.headYaw = 0; this.headPitch = 0;      // slow follower (head, lags the eyes)

    this.rafId = 0; this.lastTime = 0; this.time = 0; this.active = true;

    this.blinkTimer = 2 + Math.random() * 2;

    // gesture timeline
    this.emoteName = null; this.emoteTime = 0; this.emoteDuration = 0;

    // rig: springs (continuous) + scalar tweens (scripted)
    this.sp = {
      tilt: new Spring(70, .55), oy: new Spring(170, .32), sx: new Spring(260, .3, 1), sy: new Spring(260, .3, 1),
      earL: new Spring(220, .22), earR: new Spring(220, .22)
    };
    this.s = { open: 1, acc: 1, badge: 0, blush: 0, es: 1 };
    this.tw = []; this.lock = {};
    const look = LOOK[this.state] || LOOK.idle;
    this.eyeShape = look.eye; this.eyeSwap = null;
    this.badge = look.badge || null; this.badgeSwap = null; this.s.badge = this.badge ? 1 : 0;
    this.parts = []; this.nextEar = 4 + Math.random() * 4; this.lastAmb = 0; this._lastOy = 0;
    this.fx = { rise: 1, tilt: 0, paw: 0, crest: 0, ring: 0, gateway: 0, document: 0, charge: 0 };

    if (this.canvas) this.resize(this.size);
  }

  // ── public API ────────────────────────────────────────────────────────────
  resize(size) {
    this.size = Math.max(24, Math.min(1200, size));
    if (!this.canvas) return;
    const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
    this.canvas.width = Math.round(this.size * dpr);
    this.canvas.height = Math.round(this.size * dpr);
    if (this.canvas.style) { this.canvas.style.width = `${this.size}px`; this.canvas.style.height = `${this.size}px`; }
    this.render();
  }

  setState(state) {
    const next = state || 'idle';
    const prev = this.state;
    this.state = next;
    if (next === 'sleeping') { this.targetGazeX = 0; this.targetGazeY = 0.4; }
    const look = LOOK[next] || LOOK.idle;
    if (prev !== next) {
      const live = Boolean(this.rafId) && !this.reducedMotion;
      if (!live) { this.eyeShape = look.eye; this.badge = look.badge || null; this.s.badge = look.badge ? 1 : 0; }
      else {
        // expression changes read as a soft blink: close → swap → open
        if (look.eye !== this.eyeShape) { this.eyeSwap = { to: look.eye, at: this.time + .075 }; this.anim('open', [[.05, 75, E.inOut], [1, 160, E.out]]); }
        if ((look.badge || null) !== this.badge) { this.badgeSwap = { to: look.badge || null, at: this.time + .1 }; this.anim('badge', [[0, 90, E.inOut]]); }
        this.reactTo(next);
      }
    }
    this.render();
  }

  setVariant(variant) {
    const v = variant || 'standard';
    if (v !== this.variant) {
      this.variant = v;
      if (this.rafId && !this.reducedMotion) { this.s.acc = 0; this.anim('acc', [[1, 380, E.back]]); this.sp.oy.kick(-120); }
    }
    this.render();
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    if (this.reducedMotion) {
      this.eyeGazeX = this.targetGazeX; this.eyeGazeY = this.targetGazeY; this.headYaw = 0; this.headPitch = 0;
      for (const k in this.sp) this.sp[k].snap(k === 'sx' || k === 'sy' ? 1 : 0);
      this.tw.length = 0; this.lock = {}; this.parts.length = 0;
      const look = LOOK[this.state] || LOOK.idle; this.eyeShape = look.eye; this.badge = look.badge || null;
      this.s.open = 1; this.s.acc = 1; this.s.badge = this.badge ? 1 : 0; this.s.es = 1;
    }
    this.render();
  }

  /** Normalised gaze, −1…1. */
  setGaze(x, y) {
    if (this.state === 'sleeping') { this.targetGazeX = 0; this.targetGazeY = 0.4; return; }
    this.targetGazeX = clamp(x, -1, 1); this.targetGazeY = clamp(y, -1, 1);
  }

  /** Cursor tracking with dead-zone and distance fall-off. */
  setGazeFromClient(clientX, clientY) {
    if (this.state === 'sleeping' || !this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return;
    const rect = this.canvas.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height * 0.45);
    const dist = Math.hypot(dx, dy);
    if (dist < 8) { this.targetGazeX = 0; this.targetGazeY = 0; return; }
    if (dist < 18) {
      const f = (dist - 8) / 10;
      this.targetGazeX = (dx / dist) * 0.15 * f; this.targetGazeY = (dy / dist) * 0.15 * f; return;
    }
    const maxReach = Math.max(160, Math.min(600, rect.width * 3.5));
    const nd = Math.min(1, (dist - 14) / (maxReach - 14)), a = Math.atan2(dy, dx);
    this.targetGazeX = Math.cos(a) * nd; this.targetGazeY = Math.sin(a) * nd;
  }

  /** Drive greeting/upload overlays from guardian.js timelines. */
  setTimeline(frame = {}) { Object.assign(this.fx, frame); if (!this.rafId) this.render(); }

  /** Little squash (poke / tap). */
  squash(strength = 1) { this.sp.sy.kick(-5 * strength); this.sp.sx.kick(5 * strength); }
  /** Quick hop with landing squash. */
  hop(power = 1) { this.sp.oy.kick(-1500 * power); }

  salute(duration = 1.8) {
    this.emoteName = 'salute'; this.emoteTime = 0; this.emoteDuration = duration;
    if (!this.reducedMotion) { this.hop(.8); this.sp.tilt.kick(-.7); this.emit('spark', 5); }
    this.start();
  }

  start() {
    this.active = true;
    if (!this.rafId && typeof requestAnimationFrame === 'function') {
      this.lastTime = performance.now();
      this.lastRenderTime = 0;
      const loop = now => {
        if (!this.active) return;
        const dt = Math.min(.05, (now - this.lastTime) / 1000);
        this.lastTime = now;
        this.update(dt);
        const isDynamic = Boolean(this.emoteName) ||
          Math.abs(this.sp.oy.v) > 20 ||
          Math.abs(this.sp.tilt.v) > 0.05 ||
          Math.abs(this.targetGazeX - this.eyeGazeX) > 0.05 ||
          Math.abs(this.targetGazeY - this.eyeGazeY) > 0.05 ||
          this.tw.length > 0;
        const minGap = isDynamic ? 12 : 32;
        if (now - this.lastRenderTime >= minGap) {
          this.render();
          this.lastRenderTime = now;
        }
        this.rafId = this.reducedMotion && !this.emoteName ? 0 : requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    }
  }

  stop() {
    this.active = false;
    if (this.rafId) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  draw() { this.render(); }

  // ── animation core ─────────────────────────────────────────────────────────
  anim(p, keys) {
    this.tw = this.tw.filter(t => t.p !== p);
    this.tw.push({ p, keys, i: 0, from: this.s[p], t: 0 });
    this.lock[p] = 1;
  }

  emit(type, n = 1) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        type, x: type === 'z' ? 700 : 466 + (Math.random() - .5) * 420, y: type === 'z' ? 240 : 190 + Math.random() * 60,
        vx: (Math.random() - .5) * 60 + (type === 'z' ? 25 : 0), vy: -(70 + Math.random() * 70), age: -i * .09,
        life: 1.2 + Math.random() * .6, rot: Math.random() * 6, sz: 16 + Math.random() * 14
      });
    }
  }

  reactTo(next) {
    const L = LOOK[next] || LOOK.idle;
    if (L.celebrate) { this.hop(1.05); this.emit('spark', 4); }
    else if (L.shake) { this.sp.tilt.kick(2.4); }
    else if (next === 'surprised') { this.hop(.9); this.sp.sy.kick(4); this.anim('es', [[1.2, 90, E.out], [1, 420, E.inOut]]); }
    else if (next === 'question') { this.sp.tilt.kick(.9); }
    else if (next === 'approval') { this.hop(.55); }
    else if (next === 'love') { this.hop(.5); this.emit('heart', 4); }
    else if (next === 'dizzy') { this.sp.tilt.kick(3); }
    else { this.sp.oy.kick(-90); }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const L = LOOK[this.state] || LOOK.idle;

    if (this.emoteName) {
      this.emoteTime += dt;
      if (this.emoteTime >= this.emoteDuration) { this.emoteName = null; this.emoteTime = 0; }
    }

    // natural blink, with the occasional double-blink
    if (!this.reducedMotion) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0 && !this.lock.open) {
        this.anim('open', [[.05, 70, E.inOut], [1, 150, E.out]]);
        this.blinkTimer = Math.random() < .22 ? .32 : 2.6 + Math.random() * 3.4;
      }
    }

    // scalar tweens
    for (const tw of [...this.tw]) {
      const k = tw.keys[tw.i]; tw.t += dt * 1000;
      const p = clamp(tw.t / k[1], 0, 1);
      this.s[tw.p] = tw.from + (k[0] - tw.from) * k[2](p);
      if (p >= 1) {
        tw.from = k[0]; tw.i++; tw.t = 0;
        if (tw.i >= tw.keys.length) { this.tw.splice(this.tw.indexOf(tw), 1); delete this.lock[tw.p]; }
      }
    }
    if (this.eyeSwap && t >= this.eyeSwap.at) { this.eyeShape = this.eyeSwap.to; this.eyeSwap = null; }
    if (this.badgeSwap && t >= this.badgeSwap.at) {
      this.badge = this.badgeSwap.to; this.badgeSwap = null;
      if (this.badge) this.anim('badge', [[1, 330, E.back]]);
    }

    if (this.reducedMotion) {
      this.eyeGazeX = this.targetGazeX; this.eyeGazeY = this.targetGazeY; this.headYaw = 0; this.headPitch = 0;
      return;
    }

    // gaze: eyes are snappy, head lags (independent damping)
    let gx = this.targetGazeX, gy = this.targetGazeY;
    if (L.look) { gx = gx * .35 + L.look[0] * .6; gy = gy * .3 + L.look[1] * .6; }
    if (L.scan) { gx = Math.sin(t * 2.4) * .75; gy = -.05; }
    if (this.state === 'sleeping') { gx = 0; gy = .4; }
    if (L.dizzy) gx = Math.sin(t * 8) * .3;
    const eyeLerp = Math.min(1, dt * 15), headLerp = Math.min(1, dt * 4.8);
    this.eyeGazeX += (gx - this.eyeGazeX) * eyeLerp; this.eyeGazeY += (gy - this.eyeGazeY) * eyeLerp;
    this.headYaw += (gx * .42 - this.headYaw) * headLerp; this.headPitch += (gy * .32 - this.headPitch) * headLerp;

    // ambient pose targets
    const slow = L.slow ? .55 : 1;
    const breath = Math.sin(t * 1.9 * slow);
    let tiltT = (L.tilt || 0) + Math.sin(t * .8) * .006;
    let hopBase = 0;
    if (L.bob) hopBase = -Math.abs(Math.sin(t * 3.1)) * 9;
    if (L.bounce) hopBase = -Math.abs(Math.sin(t * 5.2)) * 14;
    if (L.dance) { tiltT = Math.sin(t * 6.2) * .075; hopBase = -Math.abs(Math.sin(t * 6.2)) * 26; }
    if (L.dizzy) tiltT = Math.sin(t * 4) * .1;
    if (L.celebrate && !L.dance) hopBase = -Math.abs(Math.sin(t * 2.6)) * 6;
    this.sp.tilt.step(dt, tiltT);
    const oy = this.sp.oy.step(dt, hopBase);
    this.sp.sy.step(dt, 1 + breath * .012 + (L.dance ? Math.sin(t * 12.4) * .02 : 0));
    this.sp.sx.step(dt, 1 - breath * .007 - (L.dance ? Math.sin(t * 12.4) * .014 : 0));
    // landing squash
    if (this._lastOy < -6 && oy >= -1 && this.sp.oy.v > 140) { this.sp.sy.kick(-Math.min(6, this.sp.oy.v * .012)); this.sp.sx.kick(Math.min(6, this.sp.oy.v * .01)); }
    this._lastOy = oy;
    if (this.sp.oy.x > 6) { this.sp.oy.x = 6; this.sp.oy.v = Math.min(0, this.sp.oy.v); } // ground contact: never sink

    // ears: occasional flick + follow tilt
    this.nextEar -= dt;
    if (this.nextEar <= 0) { (Math.random() < .5 ? this.sp.earL : this.sp.earR).kick((Math.random() < .5 ? -1 : 1) * 3.4); this.nextEar = 4 + Math.random() * 6; }
    this.sp.earL.step(dt, -this.sp.tilt.x * .5 + (L.dance ? Math.sin(t * 12.4) * .12 : 0));
    this.sp.earR.step(dt, -this.sp.tilt.x * .5 - (L.dance ? Math.sin(t * 12.4) * .12 : 0));

    this.s.blush += ((L.blush ? 1 : 0) - this.s.blush) * Math.min(1, dt * 6);

    // ambient particles
    if (t - this.lastAmb > (L.celebrate ? .55 : 1.1)) {
      this.lastAmb = t;
      if (L.zz) this.emit('z', 1);
      if (L.sweat && Math.random() < .6) this.emit('sweat', 1);
      if (L.celebrate && Math.random() < .5) this.emit('spark', 1);
    }
    for (const p of this.parts) p.age += dt;
    this.parts = this.parts.filter(p => p.age < p.life);
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    const k = Math.min(w, h) / DS;
    ctx.translate((w - DS * k) / 2, (h - DS * k) / 2);
    ctx.scale(k, k);
    ctx.translate(OFF, OFF);
    try { this.paint(ctx); } finally { ctx.restore(); }
  }

  paint(ctx) {
    const red = this.reducedMotion;
    const t = red ? 0 : this.time;
    const fx = this.fx;
    const yaw = clamp(this.headYaw / .42, -1, 1), pitch = clamp(this.headPitch / .32, -1, 1);
    const tilt = red ? 0 : this.sp.tilt.x + (fx.tilt || 0);
    const oy = red ? 0 : this.sp.oy.x, sx = red ? 1 : this.sp.sx.x, sy = red ? 1 : this.sp.sy.x;
    const lift = clamp(-oy / 60, 0, 1);
    const accent = (STATES[this.state] || STATES.idle).color;

    // ground: clean contact shadow anchored to surface (no heavy unclipped halo)
    ctx.save(); ctx.translate(466, 858); ctx.scale(1, .07);
    wash(ctx, rad(ctx, 0, 0, 340 * (1 - lift * .25), [[0, `rgba(8,10,28,${(.48 - lift * .22).toFixed(3)})`], [.6, `rgba(8,10,28,${(.18 - lift * .08).toFixed(3)})`], [1, 'rgba(8,10,28,0)']]));
    ctx.restore();

    // body: squash & stretch about the ground contact point
    ctx.save();
    ctx.translate(AX, GROUND + oy); ctx.scale(sx, sy); ctx.translate(-AX, -GROUND);
    if (fx.rise < 1) ctx.translate(0, (1 - fx.rise) * 90);

    this.drawLowerBody(ctx);

    // everything above the base tilts together (head + mane + shield)
    ctx.save();
    ctx.translate(AX, 790); ctx.rotate(tilt); ctx.translate(-AX, -790);

    const sh = k => [yaw * 30 * k, pitch * 16 * k];
    let [dx, dy] = sh(.25);
    ctx.save(); ctx.translate(dx, dy); this.drawShell(ctx); ctx.restore();
    this.drawEar(ctx, -1, this.sp.earL.x, sh(.1));
    this.drawEar(ctx, 1, this.sp.earR.x, sh(.1));
    [dx, dy] = sh(.5);
    ctx.save(); ctx.translate(dx, dy); this.drawInner(ctx); ctx.restore();
    [dx, dy] = sh(.6);
    ctx.save(); ctx.translate(dx, dy); this.drawCrest(ctx); ctx.restore();
    [dx, dy] = sh(.85);
    ctx.save(); ctx.translate(dx, dy); this.drawFace(ctx); ctx.restore();
    [dx, dy] = sh(1.15);
    ctx.save(); ctx.translate(dx, dy); this.drawEyes(ctx, yaw, t); ctx.restore();

    this.drawShield(ctx, fx.charge);
    this.drawAccessory(ctx, yaw, pitch);
    ctx.restore(); // tilt
    ctx.restore(); // body

    this.drawOverlays(ctx, accent);
    this.drawBadge(ctx, t, accent);
    this.drawParticles(ctx);
  }

  drawLowerBody(ctx) {
    const body = () => {
      ctx.beginPath(); ctx.moveTo(123, 660);
      ctx.bezierCurveTo(120, 735, 140, 792, 200, 828);
      ctx.bezierCurveTo(244, 850, 304, 853, 466, 853);
      ctx.bezierCurveTo(628, 853, 688, 850, 732, 828);
      ctx.bezierCurveTo(792, 792, 812, 735, 809, 660);
      ctx.closePath();
    };
    body(); ctx.fillStyle = lin(ctx, 0, 650, 0, 856, [[0, '#F3F1FB'], [.55, '#DAD7F1'], [1, '#B4B0E4']]); ctx.fill();
    if (typeof ctx.clip === 'function') {
      ctx.save(); body(); ctx.clip();
      wash(ctx, rad(ctx, 150, 790, 280, [[0, 'rgba(120,145,255,.55)'], [1, 'rgba(120,145,255,0)']]));
      wash(ctx, rad(ctx, 740, 760, 240, [[0, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']]));
      wash(ctx, rad(ctx, 466, 900, 360, [[0, 'rgba(66,86,255,.8)'], [.45, 'rgba(66,86,255,.3)'], [1, 'rgba(66,86,255,0)']]));
      ctx.restore();
    }
  }

  drawEar(ctx, side, ang, [dx, dy]) {
    const cx = side < 0 ? 217 : 715, cy = 285, R = 92;
    ctx.save();
    ctx.translate(cx + dx, cy + dy + 60); ctx.rotate(ang * side); ctx.translate(-cx, -cy - 60);
    circle(ctx, cx, cy, R);
    ctx.fillStyle = rad(ctx, cx, cy, R * 1.1, [[0, '#FFF0D2'], [.7, '#F5D7B1'], [1, '#E7BF92']], cx + side * 22, cy - 34, 4); ctx.fill();
    // cup opening, offset toward the face (reads as depth)
    const ix = cx + side * 4, iy = cy + 8;
    oval(ctx, ix, iy, 42, 46);
    ctx.fillStyle = lin(ctx, ix - side * 30, iy - 40, ix + side * 30, iy + 44, [[0, '#B0614A'], [.45, '#DC8B6C'], [1, '#EEA583']]); ctx.fill();
    ctx.restore();
  }

  drawShell(ctx) {
    shape(ctx, SHELL);
    ctx.fillStyle = lin(ctx, 150, 110, 800, 770, [[0, '#FBDAAA'], [.45, '#F3BC7C'], [1, '#E49C58']]); ctx.fill();
    ctx.save(); shape(ctx, SHELL); ctx.clip();
    wash(ctx, rad(ctx, 20, 560, 310, [[0, 'rgba(205,165,235,.9)'], [.55, 'rgba(205,165,235,.32)'], [1, 'rgba(205,165,235,0)']]));
    wash(ctx, rad(ctx, 320, 180, 270, [[0, 'rgba(255,240,218,.65)'], [1, 'rgba(255,240,218,0)']]));
    wash(ctx, rad(ctx, 890, 520, 230, [[0, 'rgba(255,205,140,.5)'], [1, 'rgba(255,205,140,0)']]));
    wash(ctx, rad(ctx, 190, 690, 250, [[0, 'rgba(112,72,120,.32)'], [1, 'rgba(112,72,120,0)']]));
    wash(ctx, lin(ctx, 0, 640, 0, 860, [[0, 'rgba(120,70,70,0)'], [1, 'rgba(120,70,70,.22)']]));
    ctx.restore();
    shape(ctx, SHELL); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,236,206,.55)'; ctx.stroke();
  }

  drawInner(ctx) {
    shape(ctx, INNER);
    ctx.fillStyle = lin(ctx, 130, 300, 810, 300, [[0, '#CC8A62'], [.3, '#E6A468'], [.7, '#F3B26B'], [1, '#FAC079']]); ctx.fill();
    ctx.save(); shape(ctx, INNER); ctx.clip();
    wash(ctx, rad(ctx, 210, 650, 230, [[0, 'rgba(92,58,96,.26)'], [1, 'rgba(92,58,96,0)']]));
    wash(ctx, lin(ctx, 0, 250, 0, 420, [[0, 'rgba(255,225,180,.35)'], [1, 'rgba(255,225,180,0)']]));
    wash(ctx, lin(ctx, 0, 700, 0, 850, [[0, 'rgba(110,60,60,0)'], [1, 'rgba(110,60,60,.28)']]));
    // soft occlusion around the face
    shape(ctx, FACE); ctx.lineJoin = 'round';
    ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(150,84,48,.07)'; ctx.stroke();
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(150,84,48,.10)'; ctx.stroke();
    ctx.restore();
    shape(ctx, INNER); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,214,160,.5)'; ctx.stroke();
  }

  drawCrest(ctx) {
    ctx.save(); shape(ctx, SHELL); ctx.clip();
    shape(ctx, CREST_L); ctx.fillStyle = lin(ctx, 340, 140, 460, 330, [[0, '#F8CD99'], [1, '#F0B37A']]); ctx.fill();
    shape(ctx, CREST_R); ctx.fillStyle = lin(ctx, 430, 130, 560, 300, [[0, '#EFAD6F'], [1, '#E39B5E']]); ctx.fill();
    shape(ctx, CREST_R); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,232,196,.35)'; ctx.stroke();
    ctx.restore();
  }

  drawFace(ctx) {
    shape(ctx, FACE);
    ctx.fillStyle = rad(ctx, 440, 430, 330, [[0, '#FFFFFF'], [.55, '#F8F2EF'], [1, '#DCCDCB']], 420, 400, 10); ctx.fill();
    ctx.save(); shape(ctx, FACE); ctx.clip();
    wash(ctx, lin(ctx, 0, 560, 0, 700, [[0, 'rgba(170,140,165,0)'], [1, 'rgba(160,128,165,.42)']]));
    wash(ctx, rad(ctx, 215, 520, 210, [[0, 'rgba(150,130,165,.28)'], [1, 'rgba(150,130,165,0)']]));
    wash(ctx, rad(ctx, 700, 470, 160, [[0, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]));
    if (this.s.blush > .01) {
      const a = (.34 * this.s.blush).toFixed(3);
      for (const sd of [-1, 1]) { oval(ctx, AX + sd * 170, 585, 52, 28); ctx.fillStyle = rad(ctx, AX + sd * 170, 585, 52, [[0, `rgba(255,120,150,${a})`], [1, 'rgba(255,120,150,0)']]); ctx.fill(); }
    }
    ctx.restore();
    shape(ctx, FACE); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(214,160,112,.55)'; ctx.stroke();
  }

  drawEyes(ctx, yaw, t) {
    if (this.variant === 'visor') return;
    const open = this.reducedMotion ? 1 : this.s.open;
    const gx = this.eyeGazeX * 14, gy = this.eyeGazeY * 10;
    for (const sd of [-1, 1]) {
      const far = sd * yaw > 0 ? 1 : 0; // the eye turned away from the viewer narrows
      const fx = 1 - Math.abs(yaw) * (far ? .16 : .06);
      ctx.save(); ctx.translate(AX + sd * EYE_X + gx, EYE_Y + gy); ctx.scale(fx, 1);
      this.eye(ctx, this.eyeShape, sd, open, t);
      ctx.restore();
    }
  }

  eye(ctx, name, sd, open, t) {
    const w = 27 * this.s.es, h = 36 * this.s.es;
    ctx.fillStyle = LION_PALETTE.ink; ctx.strokeStyle = LION_PALETTE.ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = lw => { ctx.lineWidth = lw; ctx.stroke(); };
    switch (name) {
      case 'wide': oval(ctx, 0, 0, w * 1.12, Math.max(4, h * 1.12 * open)); ctx.fill(); break;
      case 'happy': ctx.beginPath(); ctx.arc(0, 22, 36, Math.PI * 1.13, Math.PI * 1.87); stroke(15); break;
      case 'sleep': ctx.beginPath(); ctx.arc(0, -14, 34, Math.PI * .16, Math.PI * .84); stroke(11); break;
      case 'flat': ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); stroke(14); break;
      case 'tired': ctx.beginPath(); ctx.moveTo(-26, 2); ctx.quadraticCurveTo(0, 16 * open + 4, 26, 2); stroke(13); break;
      case 'focused': ctx.beginPath(); ctx.moveTo(-24, -12); ctx.lineTo(0, 12); ctx.lineTo(24, -12); stroke(11); break;
      case 'wink':
        if (sd < 0) { oval(ctx, 0, 0, w, Math.max(4, h * open)); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(0, 22, 36, Math.PI * 1.13, Math.PI * 1.87); stroke(15); }
        break;
      case 'heart': ctx.save(); ctx.fillStyle = '#FF4D7D'; ctx.translate(0, 6); heart(ctx, 52 + Math.sin(t * 6) * 2); ctx.fill(); ctx.restore(); break;
      case 'spiral':
        ctx.beginPath();
        for (let a = 0, i = 0; a < 4.6 * Math.PI; a += .22, i++) { const r = 3 + a * 3.6, aa = a + t * 9 * sd; const px = Math.cos(aa) * r, py = Math.sin(aa) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        stroke(8); break;
      default: oval(ctx, 0, 0, w, Math.max(4, h * open)); ctx.fill();
    }
  }

  drawShield(ctx, charge = 0) {
    const cx = 469, outer = () => {
      ctx.beginPath(); ctx.moveTo(398, 710);
      ctx.bezierCurveTo(430, 706, 452, 692, cx, 672);
      ctx.bezierCurveTo(488, 692, 510, 706, 540, 710);
      ctx.lineTo(542, 770); ctx.bezierCurveTo(538, 812, 508, 836, cx, 852);
      ctx.bezierCurveTo(430, 836, 402, 812, 398, 770); ctx.closePath();
    };
    if (charge > .01) { circle(ctx, cx, 765, 160); ctx.fillStyle = rad(ctx, cx, 765, 160, [[0, `rgba(120,160,255,${(.55 * charge).toFixed(3)})`], [1, 'rgba(120,160,255,0)']]); ctx.fill(); }
    ctx.save(); ctx.shadowColor = 'rgba(80,40,30,.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    outer(); ctx.fillStyle = lin(ctx, 400, 672, 540, 852, [[0, '#F7E5BF'], [.5, '#E6C48E'], [1, '#C79A60']]); ctx.fill(); ctx.restore();
    ctx.save();
    ctx.translate(cx, 768); ctx.scale(.76, .76); ctx.translate(-cx, -768);
    outer(); ctx.clip();
    wash(ctx, lin(ctx, 400, 0, 540, 0, [[0, '#FBF6EA'], [.5, '#F2E9DB'], [.5, '#DCE3F2'], [1, '#B7C2E3']]));
    wash(ctx, lin(ctx, 0, 672, 0, 852, [[0, 'rgba(255,255,255,.35)'], [1, 'rgba(120,110,160,.22)']]));
    ctx.restore();
    outer(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,244,220,.75)'; ctx.stroke();
    // inner bevel + centre ridge
    ctx.save(); ctx.translate(cx, 768); ctx.scale(.76, .76); ctx.translate(-cx, -768); outer();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(160,120,70,.45)'; ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(cx, 700); ctx.lineTo(cx, 826); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.stroke();
  }

  // ── variants ───────────────────────────────────────────────────────────────
  drawAccessory(ctx, yaw, pitch) {
    const v = this.variant;
    if (!v || v === 'standard') return;
    const a = this.reducedMotion ? 1 : clamp(this.s.acc, 0, 1.3);
    const sh = k => [yaw * 30 * k, pitch * 16 * k];
    const pivot = { crown: [AX, 230], visor: [AX, 505], headset: [AX, 440], shield: [775, 740] }[v] || [AX, 400];
    const [dx, dy] = v === 'crown' ? sh(.6) : v === 'visor' ? sh(1.1) : v === 'headset' ? sh(.35) : [0, 0];
    ctx.save();
    ctx.translate(pivot[0] + dx, pivot[1] + dy); ctx.scale(.55 + a * .45, .55 + a * .45); ctx.translate(-pivot[0], -pivot[1]);
    ctx.globalAlpha = clamp(a, 0, 1);
    if (v === 'crown') this.drawCrown(ctx);
    else if (v === 'visor') { this.drawVisor(ctx); this.drawVisorEyes(ctx); }
    else if (v === 'headset') this.drawHeadset(ctx);
    else if (v === 'shield') this.drawWardShield(ctx);
    ctx.restore();
  }

  drawCrown(ctx) {
    const body = () => {
      ctx.beginPath(); ctx.moveTo(262, 232);
      ctx.lineTo(268, 150); ctx.lineTo(318, 76); ctx.lineTo(380, 150); ctx.lineTo(466, 2); ctx.lineTo(552, 150); ctx.lineTo(614, 76); ctx.lineTo(664, 150); ctx.lineTo(670, 232);
      ctx.bezierCurveTo(600, 252, 332, 252, 262, 232); ctx.closePath();
    };
    ctx.save(); ctx.shadowColor = 'rgba(80,40,20,.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    body(); ctx.fillStyle = lin(ctx, 262, 0, 670, 250, [[0, '#FFE9A8'], [.45, '#F1C46F'], [1, '#C98D3E']]); ctx.fill(); ctx.restore();
    ctx.save(); body(); ctx.clip();
    wash(ctx, lin(ctx, 0, 170, 0, 252, [[0, 'rgba(255,240,190,0)'], [1, 'rgba(170,110,40,.35)']]));
    ctx.beginPath(); ctx.moveTo(262, 196); ctx.bezierCurveTo(332, 218, 600, 218, 670, 196); ctx.lineTo(670, 150); ctx.lineTo(262, 150); ctx.closePath();
    ctx.fillStyle = 'rgba(255,250,215,.28)'; ctx.fill();
    ctx.restore();
    body(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,244,200,.8)'; ctx.stroke();
    for (const [x, y, r] of [[318, 76, 14], [466, 2, 17], [614, 76, 14]]) { circle(ctx, x, y, r); ctx.fillStyle = lin(ctx, x - r, y - r, x + r, y + r, [[0, '#FFF3C4'], [1, '#D9A24C']]); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(466, 158); ctx.lineTo(494, 196); ctx.lineTo(466, 238); ctx.lineTo(438, 196); ctx.closePath();
    ctx.fillStyle = lin(ctx, 438, 158, 494, 238, [[0, '#D8C8FF'], [.5, '#8B6CFF'], [1, '#4E36D0']]); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(466, 158); ctx.lineTo(466, 238); ctx.moveTo(438, 196); ctx.lineTo(494, 196);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.stroke();
  }

  drawHeadset(ctx) {
    const band = () => { ctx.beginPath(); ctx.moveTo(86, 470); ctx.bezierCurveTo(50, 230, 240, 52, 466, 52); ctx.bezierCurveTo(692, 52, 882, 230, 846, 470); };
    ctx.lineCap = 'round';
    band(); ctx.lineWidth = 46; ctx.strokeStyle = 'rgba(70,110,255,.28)'; ctx.stroke();
    band(); ctx.lineWidth = 34; ctx.strokeStyle = '#1B2A66'; ctx.stroke();
    band(); ctx.lineWidth = 8; ctx.strokeStyle = '#5B93FF'; ctx.stroke();
    for (const sd of [-1, 1]) {
      const cx = AX + sd * 392, cy = 470;
      rrect(ctx, cx - 62, cy - 128, 124, 256, 60);
      ctx.fillStyle = lin(ctx, cx - 62, cy - 128, cx + 62, cy + 128, [[0, '#26397F'], [1, '#101A45']]); ctx.fill();
      ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(90,150,255,.35)'; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#6FA8FF'; ctx.stroke();
      rrect(ctx, cx - 34, cy - 92, 68, 184, 34); ctx.fillStyle = 'rgba(10,16,48,.7)'; ctx.fill();
    }
  }

  drawVisor(ctx) {
    rrect(ctx, 164, 405, 604, 200, 100);
    ctx.save(); ctx.shadowColor = 'rgba(40,90,255,.7)'; ctx.shadowBlur = 26;
    ctx.fillStyle = lin(ctx, 0, 405, 0, 605, [[0, '#1A2342'], [.5, '#0B1020'], [1, '#04060F']]); ctx.fill(); ctx.restore();
    ctx.lineWidth = 7; ctx.strokeStyle = '#2F63E8'; ctx.stroke();
    ctx.save(); rrect(ctx, 164, 405, 604, 200, 100); ctx.clip();
    ctx.beginPath(); ctx.moveTo(210, 450); ctx.bezierCurveTo(330, 412, 600, 412, 722, 450);
    ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(170,210,255,.38)'; ctx.stroke();
    ctx.restore();
  }

  drawVisorEyes(ctx) {
    const open = this.reducedMotion ? 1 : this.s.open;
    const gx = this.eyeGazeX * 16, gy = this.eyeGazeY * 8;
    for (const sd of [-1, 1]) {
      const sq = this.eyeShape === 'happy' ? .45 : this.eyeShape === 'sleep' ? .12 : open;
      ctx.save(); ctx.translate(AX + sd * EYE_X + gx, 505 + gy);
      circle(ctx, 0, 0, 62); ctx.fillStyle = rad(ctx, 0, 0, 62, [[0, 'rgba(110,190,255,.55)'], [1, 'rgba(110,190,255,0)']]); ctx.fill();
      oval(ctx, 0, 0, 26, Math.max(3, 36 * sq));
      ctx.fillStyle = rad(ctx, 0, 0, 40, [[0, '#FFFFFF'], [.5, '#9ADBFF'], [1, '#4DA6FF']]); ctx.fill();
      ctx.restore();
    }
  }

  drawWardShield(ctx) {
    const cx = 708, cy = 712;
    ctx.translate(775, 722); ctx.scale(.79, .79); ctx.translate(-cx, -cy);
    const body = () => {
      ctx.beginPath(); ctx.moveTo(cx - 190, cy - 190);
      ctx.bezierCurveTo(cx - 100, cy - 170, cx - 40, cy - 215, cx, cy - 248);
      ctx.bezierCurveTo(cx + 40, cy - 215, cx + 100, cy - 170, cx + 190, cy - 190);
      ctx.lineTo(cx + 186, cy + 40); ctx.bezierCurveTo(cx + 172, cy + 150, cx + 90, cy + 215, cx, cy + 250);
      ctx.bezierCurveTo(cx - 90, cy + 215, cx - 172, cy + 150, cx - 186, cy + 40); ctx.closePath();
    };
    ctx.save(); ctx.shadowColor = 'rgba(70,110,255,.8)'; ctx.shadowBlur = 40;
    body(); ctx.fillStyle = lin(ctx, cx - 190, cy - 250, cx + 190, cy + 250, [[0, 'rgba(180,210,255,.5)'], [.5, 'rgba(90,130,255,.4)'], [1, 'rgba(50,80,230,.6)']]); ctx.fill(); ctx.restore();
    ctx.save(); body(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(cx - 200, cy - 200); ctx.lineTo(cx, cy - 260); ctx.lineTo(cx, cy + 260); ctx.lineTo(cx - 200, cy + 260); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill(); ctx.restore();
    body(); ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(205,228,255,.92)'; ctx.stroke();
    ctx.save(); ctx.translate(cx, cy + 6); ctx.scale(.76, .76); ctx.translate(-cx, -cy - 6); body(); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(205,228,255,.5)'; ctx.stroke(); ctx.restore();
  }

  // ── overlays: greeting ring, upload gateway + document ─────────────────────
  drawOverlays(ctx, accent) {
    const fx = this.fx;
    if (fx.ring > .01 && fx.ring < 1) {
      ctx.save(); ctx.translate(466, 500); ctx.scale(1, .72);
      circle(ctx, 0, 0, 330 + fx.ring * 380); ctx.lineWidth = 5; ctx.strokeStyle = accent; ctx.globalAlpha = (1 - fx.ring) * .8; ctx.stroke(); ctx.restore();
    }
    if (fx.gateway > .01) {
      ctx.save(); ctx.translate(466, 150); ctx.scale(1, .16 + fx.gateway * .1);
      circle(ctx, 0, 0, 250); ctx.fillStyle = rad(ctx, 0, 0, 250, [[0, 'rgba(10,16,40,.9)'], [.8, 'rgba(10,16,40,.6)'], [1, 'rgba(10,16,40,0)']]); ctx.fill();
      ctx.lineWidth = 9; ctx.strokeStyle = accent; ctx.stroke(); ctx.restore();
    }
    if (fx.document > .01) {
      const p = fx.document;
      ctx.save(); ctx.translate(466, 150 - p * 120); ctx.scale(.4 + p * .6, .4 + p * .6); ctx.globalAlpha = Math.min(1, p * 2);
      rrect(ctx, -52, -68, 104, 136, 14); ctx.fillStyle = '#ECF7FF'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = accent; ctx.stroke();
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = '#7092C0';
      for (const yy of [-20, 6, 32]) { ctx.beginPath(); ctx.moveTo(-28, yy); ctx.lineTo(yy === 32 ? 8 : 28, yy); ctx.stroke(); }
      ctx.restore();
    }
  }

  // ── status badges (chat bubble, thought dots, ?, sparkles …) ───────────────
  drawBadge(ctx, t, accent) {
    const kind = this.badge, s = clamp(this.s.badge, 0, 1.25);
    if (!kind || s < .01) return;
    const bob = this.reducedMotion ? 0 : Math.sin(t * 2.4) * 7;
    ctx.save();
    ctx.translate(0, bob); ctx.globalAlpha = Math.min(1, s * 1.4);
    const at = (x, y) => { ctx.translate(x, y); ctx.scale(s, s); };
    if (kind === 'bubble') {
      at(742, 150); ctx.scale(.85, .85);
      const body = () => rrect(ctx, -142, -88, 284, 176, 88);
      ctx.save(); ctx.shadowColor = 'rgba(60,120,255,.75)'; ctx.shadowBlur = 36;
      body(); ctx.fillStyle = lin(ctx, 0, -88, 0, 88, [[0, '#58A4FF'], [1, '#2E6CF3']]); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-86, 70); ctx.lineTo(-120, 126); ctx.lineTo(-30, 84); ctx.closePath(); ctx.fillStyle = '#3C7BF6'; ctx.fill();
      ctx.save(); body(); ctx.clip(); ctx.beginPath(); ctx.moveTo(-150, -90); ctx.lineTo(150, -90); ctx.lineTo(150, -20); ctx.bezierCurveTo(60, -50, -60, -50, -150, -20); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill(); ctx.restore();
      for (let i = 0; i < 3; i++) {
        const ph = this.reducedMotion ? 0 : (((t * 2.2 - i * .24) % 1) + 1) % 1, up = Math.max(0, Math.sin(ph * Math.PI)) * 10;
        circle(ctx, (i - 1) * 56, -up, 17 + up * .25); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      }
    } else if (kind === 'thought') {
      at(748, 118);
      for (let i = 0; i < 3; i++) {
        const ph = this.reducedMotion ? .5 : (((t * 1.5 - i * .22) % 1) + 1) % 1, a = Math.sin(ph * Math.PI);
        const x = (i - 1) * 74, y = -i * 4 - a * 14, r = 21 + a * 6;
        circle(ctx, x, y, r * 2.6); ctx.fillStyle = rad(ctx, x, y, r * 2.6, [[0, 'rgba(166,136,255,.5)'], [1, 'rgba(166,136,255,0)']]); ctx.fill();
        circle(ctx, x, y, r); ctx.fillStyle = lin(ctx, x, y - r, x, y + r, [[0, '#C4AEFF'], [1, '#8E6CFF']]); ctx.fill();
      }
    } else if (kind === 'question') {
      at(724, 150); ctx.scale(.9, .9);
      ctx.rotate(this.reducedMotion ? 0 : Math.sin(t * 2.1) * .07);
      for (const [lw, col] of [[54, 'rgba(80,120,255,.28)'], [32, '#3E69F0'], [22, '#7FA3FF']]) {
        ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col;
        ctx.beginPath(); ctx.arc(0, -34, 52, Math.PI * 1.12, Math.PI * 2.42); ctx.lineTo(0, 22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 74); ctx.lineTo(0, 76); ctx.stroke();
      }
    } else if (kind === 'spark') {
      for (const [x, y, r, ph] of [[684, 140, 56, 0], [796, 186, 32, 1.7]]) {
        ctx.save(); const k = this.reducedMotion ? 1 : .82 + .2 * Math.sin(t * 3.4 + ph);
        ctx.translate(x, y); ctx.scale(s * k, s * k); ctx.rotate(this.reducedMotion ? 0 : Math.sin(t * 1.5 + ph) * .12);
        circle(ctx, 0, 0, r * 1.8); ctx.fillStyle = rad(ctx, 0, 0, r * 1.8, [[0, 'rgba(255,210,120,.55)'], [1, 'rgba(255,210,120,0)']]); ctx.fill();
        star4(ctx, 0, 0, r); ctx.fillStyle = lin(ctx, 0, -r, 0, r, [[0, '#FFF3C2'], [1, '#FFC25A']]); ctx.fill(); ctx.restore();
      }
    } else if (kind === 'heart') {
      at(730, 150); ctx.rotate(this.reducedMotion ? 0 : Math.sin(t * 3) * .1); heart(ctx, 70); ctx.fillStyle = BADGE_COLOR.heart; ctx.fill();
    } else if (kind === 'alert' || kind === 'clock' || kind === 'upload' || kind === 'search') {
      at(730, 150);
      circle(ctx, 0, 0, 74); ctx.fillStyle = accent; ctx.fill(); ctx.lineWidth = 9; ctx.strokeStyle = '#141A33'; ctx.stroke();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 12;
      if (kind === 'alert') { ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, 10); ctx.stroke(); circle(ctx, 0, 36, 8); ctx.fill(); }
      else if (kind === 'clock') { ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(0, 0); ctx.lineTo(28, 18); ctx.stroke(); }
      else if (kind === 'upload') { ctx.beginPath(); ctx.moveTo(0, 36); ctx.lineTo(0, -32); ctx.moveTo(-28, -6); ctx.lineTo(0, -34); ctx.lineTo(28, -6); ctx.stroke(); }
      else { circle(ctx, -6, -6, 26); ctx.stroke(); ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(36, 36); ctx.stroke(); }
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    for (const p of this.parts) {
      if (p.age < 0) continue;
      const k = p.age / p.life, a = k < .2 ? k / .2 : 1 - (k - .2) / .8;
      const x = p.x + p.vx * p.age, y = p.y + p.vy * p.age - 40 * p.age * p.age;
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = clamp(a, 0, 1);
      if (p.type === 'heart') { ctx.rotate(Math.sin(p.age * 6) * .3); heart(ctx, p.sz * 1.4); ctx.fillStyle = '#FF5C8A'; ctx.fill(); }
      else if (p.type === 'spark') { ctx.rotate(p.rot + p.age * 2); star4(ctx, 0, 0, p.sz * 1.1); ctx.fillStyle = '#FFD27A'; ctx.fill(); }
      else if (p.type === 'sweat') { const s = p.sz; ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * .8, s * .2, 0, s * .7); ctx.quadraticCurveTo(-s * .8, s * .2, 0, -s); ctx.fillStyle = '#7CC7FF'; ctx.fill(); }
      else if (p.type === 'z') {
        const s = p.sz * 1.3; ctx.lineWidth = s * .28; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(205,218,245,.95)';
        ctx.beginPath(); ctx.moveTo(-s * .5, -s * .5); ctx.lineTo(s * .5, -s * .5); ctx.lineTo(-s * .5, s * .5); ctx.lineTo(s * .5, s * .5); ctx.stroke();
      }
      ctx.restore();
    }
  }
}
