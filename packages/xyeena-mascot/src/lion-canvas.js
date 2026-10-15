// Xyeena Living Lion Canvas 2.5D Rig
// Authentic original Xyeena Golden Lion Guardian character system.
// Features:
// - Rounded golden lion silhouette with layered mane and central downward forelock.
// - Large ivory face mask with two simple black oval eyes.
// - Rounded ears with warm pink interior.
// - Symmetric gold/silver shield with pale blue enamel accent.
// - Articulated head tilt/rotation with damped head lag, snappy eye gaze tracking, and dead-zone.
// - Spontaneous blinking, idle breathing, and emotional expressions.
// - Anchored body and ground contact shadow (stationary notch companion; no desktop detachment).
// - Full reduced-motion fallback and low-power idle throttling.

export const LION_PALETTE = Object.freeze({
  goldLight: '#FFE7AB',
  gold: '#ECA957',
  goldDeep: '#BD713E',
  innerEar: '#D99E88',
  innerEarDeep: '#BB7A72',
  ivory: '#FFF7EB',
  ink: '#251F27',
  ice: '#FAFBFF',
  shieldBlue: '#7898C5',
  shieldEnamel: '#DBE8F9'
});

export const clamp = (v, min, max) => Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0;
const blend = (a, b, t) => a + (b - a) * t;

function gradient(ctx, x1, y1, x2, y2, stops) {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const [pos, col] of stops) g.addColorStop(pos, col);
  return g;
}

function oval(ctx, x, y, rx, ry, fill, stroke = null, strokeWidth = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function drawSuperellipse(ctx, cx, cy, rx, ry, exponent = 2.8, steps = 64) {
  const n = Math.max(2, Math.min(6, exponent));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i * Math.PI * 2) / steps;
    const co = Math.cos(a);
    const si = Math.sin(a);
    const x = cx + rx * Math.sign(co) * Math.abs(co) ** (2 / n);
    const y = cy + ry * Math.sign(si) * Math.abs(si) ** (2 / n);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function path(ctx, commands, fill, stroke = null, strokeWidth = 1) {
  ctx.beginPath();
  for (const [op, ...args] of commands) {
    if (op === 'M') ctx.moveTo(args[0], args[1]);
    else if (op === 'L') ctx.lineTo(args[0], args[1]);
    else if (op === 'Q') ctx.quadraticCurveTo(args[0], args[1], args[2], args[3]);
    else if (op === 'C') {
      if (typeof ctx.bezierCurveTo === 'function') ctx.bezierCurveTo(args[0], args[1], args[2], args[3], args[4], args[5]);
      else if (typeof ctx.quadraticCurveTo === 'function') ctx.quadraticCurveTo(args[0], args[1], args[4], args[5]);
    }
    else if (op === 'Z') ctx.closePath();
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

export class LivingLionRig {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {number} [options.size=96]
   * @param {string} [options.state='idle']
   * @param {string} [options.variant='standard']
   * @param {boolean} [options.reducedMotion=false]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    this.size = options.size || 96;
    this.state = options.state || 'idle';
    this.variant = options.variant || 'standard';
    this.reducedMotion = Boolean(options.reducedMotion);

    // Gaze targets (-1 to 1 normalized range)
    this.targetGazeX = 0;
    this.targetGazeY = 0;

    // Current smooth eye gaze (-1 to 1)
    this.eyeGazeX = 0;
    this.eyeGazeY = 0;

    // Current smooth head rotation (-1 to 1) with head lag
    this.headYaw = 0;
    this.headPitch = 0;

    // Animation loop state
    this.rafId = 0;
    this.lastTime = 0;
    this.time = 0;
    this.active = true;

    // Natural blink state
    this.blinkTimer = 2.0 + Math.random() * 2.0;
    this.blinkDuration = 0.16;
    this.blinkProgress = 0;
    this.isBlinking = false;

    // Emote / salute timeline
    this.emoteName = null;
    this.emoteTime = 0;
    this.emoteDuration = 0;

    if (this.canvas) {
      this.resize(this.size);
    }
  }

  resize(size) {
    this.size = Math.max(24, Math.min(1200, size));
    if (!this.canvas) return;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.canvas.width = Math.round(this.size * dpr);
    this.canvas.height = Math.round(this.size * dpr);
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    this.render();
  }

  setState(state) {
    this.state = state || 'idle';
    if (this.state === 'sleeping') {
      this.targetGazeX = 0;
      this.targetGazeY = 0.4;
    }
    this.render();
  }

  setVariant(variant) {
    this.variant = variant || 'standard';
    this.render();
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    if (this.reducedMotion) {
      this.eyeGazeX = this.targetGazeX;
      this.eyeGazeY = this.targetGazeY;
      this.headYaw = 0;
      this.headPitch = 0;
    }
    this.render();
  }

  /**
   * Set normalized gaze direction [-1, 1]
   * @param {number} x
   * @param {number} y
   */
  setGaze(x, y) {
    if (this.state === 'sleeping') {
      this.targetGazeX = 0;
      this.targetGazeY = 0.4;
      return;
    }
    this.targetGazeX = clamp(x, -1, 1);
    this.targetGazeY = clamp(y, -1, 1);
  }

  /**
   * Direct tracking of client cursor coordinates with dead-zone and distance falloff.
   * @param {number} clientX
   * @param {number} clientY
   */
  setGazeFromClient(clientX, clientY) {
    if (this.state === 'sleeping' || !this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return;
    const rect = this.canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height * 0.45; // Head center is slightly above vertical middle

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    // Dead zone: inside 8px of center, snap to 0; between 8-18px ease smoothly
    if (dist < 8) {
      this.targetGazeX = 0;
      this.targetGazeY = 0;
      return;
    }
    if (dist < 18) {
      const factor = (dist - 8) / 10;
      this.targetGazeX = (dx / dist) * 0.15 * factor;
      this.targetGazeY = (dy / dist) * 0.15 * factor;
      return;
    }

    // Scale gaze reach so near motion is nuanced and far motion clamps smoothly at 1.0
    const maxReach = Math.max(160, Math.min(600, rect.width * 3.5));
    const normalizedDist = Math.min(1, (dist - 14) / (maxReach - 14));
    const angle = Math.atan2(dy, dx);

    this.targetGazeX = Math.cos(angle) * normalizedDist;
    this.targetGazeY = Math.sin(angle) * normalizedDist;
  }

  /**
   * Play transient greeting salute emote
   * @param {number} [duration=1.8]
   */
  salute(duration = 1.8) {
    this.emoteName = 'salute';
    this.emoteTime = 0;
    this.emoteDuration = duration;
    this.start();
  }

  start() {
    this.active = true;
    if (!this.rafId && typeof requestAnimationFrame === 'function') {
      this.lastTime = performance.now();
      const loop = (now) => {
        if (!this.active) return;
        const dt = Math.min(0.05, (now - this.lastTime) / 1000);
        this.lastTime = now;
        this.update(dt);
        this.render();

        if (this.reducedMotion && !this.emoteName) {
          // In reduced motion without emote, pause RAF to save CPU
          this.rafId = 0;
        } else {
          this.rafId = requestAnimationFrame(loop);
        }
      };
      this.rafId = requestAnimationFrame(loop);
    }
  }

  stop() {
    this.active = false;
    if (this.rafId) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId);
      clearTimeout(this.rafId);
      this.rafId = 0;
    }
  }

  update(dt) {
    this.time += dt;

    // Handle emotes
    if (this.emoteName) {
      this.emoteTime += dt;
      if (this.emoteTime >= this.emoteDuration) {
        this.emoteName = null;
        this.emoteTime = 0;
      }
    }

    // Natural blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = true;
      this.blinkProgress += dt / this.blinkDuration;
      if (this.blinkProgress >= 1) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.blinkTimer = Math.random() < 0.25 ? 0.35 : 3.2 + Math.random() * 3.5;
      }
    }

    if (this.reducedMotion) {
      this.eyeGazeX = this.targetGazeX;
      this.eyeGazeY = this.targetGazeY;
      this.headYaw = 0;
      this.headPitch = 0;
      return;
    }

    // Eye gaze tracks with fast, responsive spring (snappy eye response)
    const eyeLerp = Math.min(1, dt * 15);
    this.eyeGazeX += (this.targetGazeX - this.eyeGazeX) * eyeLerp;
    this.eyeGazeY += (this.targetGazeY - this.eyeGazeY) * eyeLerp;

    // Head rotation tracks with smooth head lag (independent, more damping)
    const headTargetYaw = this.targetGazeX * 0.42;
    const headTargetPitch = this.targetGazeY * 0.32;
    const headLerp = Math.min(1, dt * 4.8);
    this.headYaw += (headTargetYaw - this.headYaw) * headLerp;
    this.headPitch += (headTargetPitch - this.headPitch) * headLerp;
  }

  draw() {
    this.render();
  }

  render() {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    // Scale coordinate system to canonical 360x320 design space
    const scale = Math.min(w / 360, h / 320);
    ctx.translate((w - 360 * scale) / 2, (h - 320 * scale) / 2);
    ctx.scale(scale, scale);

    const time = this.reducedMotion ? 0 : this.time;
    const state = this.state;
    const isSleeping = state === 'sleeping';
    const isWorking = state === 'working' || state === 'thinking';
    const isAttention = state === 'attention' || state === 'question';
    const isFinished = state === 'finished' || state === 'approval';
    const isError = state === 'error';

    // Idle breathing: subtle, rhythmic vertical heave
    const breathRate = isSleeping ? 1.0 : isAttention ? 2.5 : 1.9;
    const breathing = this.reducedMotion ? 0 : 1.4 * Math.sin(time * breathRate);
    const blinking = isSleeping || (this.isBlinking && !this.reducedMotion);

    // 1. Ambient contact shadow
    oval(ctx, 180, 284, 78, 10, 'rgba(17, 21, 34, 0.25)');

    // 2. Body & Mane anchored to notch with breathing
    ctx.save();
    ctx.translate(0, breathing);

    // Ears behind mane
    for (const [side, ex] of [[-1, 91], [1, 269]]) {
      oval(ctx, ex, 87, 27, 27, '#EDAA61');
      oval(ctx, ex, 87, 17, 17, '#F6D5C1');
    }

    // Main golden mane shell (superellipse)
    let goldGrad;
    try {
      goldGrad = ctx.createRadialGradient(130, 38, 10, 180, 176, 210);
      goldGrad.addColorStop(0, '#FFEAC1');
      goldGrad.addColorStop(0.36, '#F9C779');
      goldGrad.addColorStop(0.75, '#ECAA58');
      goldGrad.addColorStop(1, '#C67B3C');
    } catch {
      goldGrad = '#ECAA58';
    }
    drawSuperellipse(ctx, 180, 176, 133, 112, 2.7, 64);
    ctx.fillStyle = goldGrad;
    ctx.fill();
    ctx.strokeStyle = '#FFD4A1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cheek mane depth shadows
    path(ctx, [
      ['M', 96, 101],
      ['C', 80, 149, 86, 200, 119, 237],
      ['Q', 81, 224, 62, 190],
      ['Q', 49, 141, 91, 108],
      ['Z']
    ], 'rgba(217, 146, 80, 0.43)');

    path(ctx, [
      ['M', 264, 101],
      ['C', 281, 149, 275, 200, 241, 237],
      ['Q', 285, 226, 299, 190],
      ['Q', 315, 147, 264, 101],
      ['Z']
    ], 'rgba(231, 164, 94, 0.62)');

    // Top mane arch
    const topManeGrad = gradient(ctx, 96, 50, 265, 110, [
      [0, '#FFE5AD'],
      [0.49, '#FFC879'],
      [1, '#DC9352']
    ]);
    path(ctx, [
      ['M', 96, 108],
      ['C', 120, 67, 154, 50, 181, 43],
      ['C', 205, 53, 243, 72, 265, 109],
      ['L', 244, 119],
      ['Q', 213, 89, 180, 81],
      ['Q', 147, 89, 116, 120],
      ['Z']
    ], topManeGrad, '#FFE2B1', 1.5);

    // Central mane tuft
    path(ctx, [
      ['M', 159, 59],
      ['L', 180, 28],
      ['L', 202, 58],
      ['L', 181, 91],
      ['Z']
    ], goldGrad);

    // 3. Articulated Head & Face Rig
    ctx.save();
    ctx.translate(180, 164);
    if (!this.reducedMotion) {
      if (typeof ctx.rotate === 'function') ctx.rotate(this.headYaw * 0.055);
      if (typeof ctx.transform === 'function') ctx.transform(1, this.headPitch * 0.022, 0, 1, 0, 0);
    }
    ctx.translate(-180, -164);

    // Face mask: Ivory superellipse
    let faceGrad;
    try {
      faceGrad = ctx.createRadialGradient(145, 130, 15, 180, 164, 110);
      faceGrad.addColorStop(0, '#FFFFFF');
      faceGrad.addColorStop(0.6, '#FFF9F1');
      faceGrad.addColorStop(1, '#DFDFEC');
    } catch {
      faceGrad = '#FFF7EB';
    }
    drawSuperellipse(ctx, 180, 164, 105, 83, 2.8, 64);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Blush cheeks
    oval(ctx, 122, 182, 16, 8, 'rgba(242, 168, 174, 0.22)');
    oval(ctx, 239, 182, 16, 8, 'rgba(242, 168, 174, 0.22)');

    // Eyes with gaze offset
    const ex = this.eyeGazeX * 5.2;
    const ey = this.eyeGazeY * 3.6;

    for (const baseX of [151, 208]) {
      if (blinking) {
        // Fast natural blink arc
        ctx.beginPath();
        ctx.moveTo(baseX - 8 + ex, 163 + ey);
        ctx.quadraticCurveTo(baseX + ex, 168 + ey, baseX + 8 + ex, 163 + ey);
        ctx.strokeStyle = '#18151C';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (isFinished || state === 'dancing' || this.emoteName === 'salute') {
        // Joyous happy eyes
        ctx.beginPath();
        ctx.moveTo(baseX - 9 + ex, 165 + ey);
        ctx.quadraticCurveTo(baseX + ex, 152 + ey, baseX + 9 + ex, 165 + ey);
        ctx.strokeStyle = '#18151C';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (isError) {
        // Alert open eyes with slight concerned brow
        oval(ctx, baseX + ex, 164 + ey, 7.5, 9.5, '#18151C');
        oval(ctx, baseX + ex - 2, 161 + ey, 2.2, 3.0, '#FFFFFF');
        ctx.beginPath();
        const slant = baseX === 151 ? 2.5 : -2.5;
        ctx.moveTo(baseX - 7 + ex, 151 + ey + slant);
        ctx.lineTo(baseX + 7 + ex, 151 + ey - slant);
        ctx.strokeStyle = '#18151C';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        // Canonical glossy black oval eyes
        oval(ctx, baseX + ex, 163 + ey, 8, 10.8, '#18151C');
        oval(ctx, baseX + ex - 2.5, 160 + ey, 2.6, 3.5, '#FFFFFF');
      }
    }

    // Optional Wardrobe / Accessories in head coordinate frame
    if (this.variant === 'crown') {
      const crownGold = gradient(ctx, 131, 24, 231, 56, [
        [0, '#FFF5C8'],
        [0.5, '#F9C779'],
        [1, '#C67B3C']
      ]);
      path(ctx, [
        ['M', 131, 56],
        ['L', 136, 24],
        ['L', 157, 41],
        ['L', 181, 15],
        ['L', 204, 41],
        ['L', 228, 23],
        ['L', 231, 56],
        ['Z']
      ], crownGold, '#FFF0BA', 2);
    } else if (this.variant === 'visor') {
      ctx.save();
      ctx.fillStyle = '#121E31';
      ctx.strokeStyle = '#5DA8FF';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(118, 134, 124, 53, 25);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (this.variant === 'headset') {
      ctx.beginPath();
      ctx.arc(180, 140, 95, Math.PI, 0);
      ctx.strokeStyle = '#203C73';
      ctx.lineWidth = 10;
      ctx.stroke();
      oval(ctx, 84, 150, 12, 28, '#192641', '#79BBFF', 3);
      oval(ctx, 276, 150, 12, 28, '#192641', '#79BBFF', 3);
    }

    ctx.restore(); // end head transform

    // Paws
    oval(ctx, 87, 232, 19, 17, '#FFF6E6', '#F3C682', 3);
    oval(ctx, 274, 230, 18, 17, '#FFF6E6', '#F3C682', 3);

    // 4. Central Symmetrical Ward Shield
    const wardShieldGrad = gradient(ctx, 160, 213, 200, 279, [
      [0, '#FFFDF3'],
      [0.6, '#E3EFFF'],
      [1, '#879AE6']
    ]);
    path(ctx, [
      ['M', 180, 213],
      ['L', 207, 226],
      ['L', 204, 254],
      ['Q', 195, 272, 180, 279],
      ['Q', 165, 273, 155, 254],
      ['L', 153, 226],
      ['Z']
    ], wardShieldGrad, '#FFF1CA', 3);

    path(ctx, [
      ['M', 180, 221],
      ['L', 199, 231],
      ['L', 196, 252],
      ['Q', 190, 265, 180, 270],
      ['Q', 170, 266, 164, 252],
      ['L', 162, 231],
      ['Z']
    ], null, '#BD9B69', 2);

    path(ctx, [
      ['M', 180, 231],
      ['L', 180, 259]
    ], null, '#E2C99A', 2);

    ctx.restore(); // end breathing body transform
    ctx.restore(); // end canonical space transform
  }
}
