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

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    // Scale coordinate system to canonical 320x320 design space
    const scale = (Math.min(w, h)) / 320;
    ctx.translate((w - 320 * scale) / 2, (h - 320 * scale) / 2);
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

    // 1. Ground contact ambient glow (soft blue-tinged shadow)
    ctx.save();
    if (typeof ctx.filter !== 'undefined') ctx.filter = 'blur(10px)';
    oval(ctx, 160, 287, 108, 14, 'rgba(64, 97, 180, 0.22)');
    ctx.restore();

    // 2. Body & Mane anchored to notch
    ctx.save();
    ctx.translate(0, breathing);

    // Radial gold silhouette gradient
    let goldGrad;
    try {
      goldGrad = ctx.createRadialGradient(112, 80, 8, 164, 190, 171);
      goldGrad.addColorStop(0, '#FFF0C3');
      goldGrad.addColorStop(0.44, '#F3C17B');
      goldGrad.addColorStop(0.8, '#D58E4F');
      goldGrad.addColorStop(1, '#AE6846');
    } catch {
      goldGrad = '#ECA957';
    }

    // Main rounded lion silhouette
    oval(ctx, 160, 186, 127, 109, goldGrad);

    // Left and right mane cheeks
    const leftCheekGrad = gradient(ctx, 38, 111, 112, 256, [
      [0, '#FFEBC0'],
      [0.6, '#DEA05F'],
      [1, '#AA6547']
    ]);
    oval(ctx, 70, 190, 51, 86, leftCheekGrad);

    const rightCheekGrad = gradient(ctx, 275, 101, 208, 263, [
      [0, '#FFF0CA'],
      [0.6, '#E7A961'],
      [1, '#AD6747']
    ]);
    oval(ctx, 250, 190, 51, 86, rightCheekGrad);

    // Rounded ears behind forelock (with warm pink interior)
    for (const side of [-1, 1]) {
      const earX = 160 + side * 73;
      const earGrad = gradient(ctx, earX - 22, 76, earX + 20, 151, [
        [0, '#FFF4D2'],
        [1, '#D9975B']
      ]);
      oval(ctx, earX, 111, 41, 43, earGrad);
      oval(ctx, earX, 114, 25, 27, LION_PALETTE.innerEar);
      oval(ctx, earX, 121, 18, 18, LION_PALETTE.innerEarDeep);
    }

    // 3. Articulated Head & Face Rig (Rotates/tilts subtly with head lag)
    ctx.save();
    ctx.translate(160, 176);
    if (!this.reducedMotion) {
      if (typeof ctx.rotate === 'function') ctx.rotate(this.headYaw * 0.065);
      if (typeof ctx.transform === 'function') ctx.transform(1, this.headPitch * 0.026, 0, 1, 0, 0);
    }
    ctx.translate(-160, -176);

    // Curved side mane plates framing the face
    const leftSideGold = gradient(ctx, 34, 96, 122, 257, [
      [0, '#FFE1A1'],
      [0.7, '#DEA05B'],
      [1, '#AD6948']
    ]);
    path(ctx, [
      ['M', 89, 83],
      ['C', 30, 111, 35, 232, 63, 253],
      ['Q', 87, 261, 115, 238],
      ['L', 115, 122],
      ['Z']
    ], leftSideGold);

    const rightSideGold = gradient(ctx, 282, 96, 198, 257, [
      [0, '#FFE1A1'],
      [0.7, '#DEA05B'],
      [1, '#AD6948']
    ]);
    path(ctx, [
      ['M', 231, 83],
      ['C', 290, 111, 285, 232, 257, 253],
      ['Q', 233, 261, 205, 238],
      ['L', 205, 122],
      ['Z']
    ], rightSideGold);

    // Large Ivory Face Mask
    let ivoryMask;
    try {
      ivoryMask = ctx.createRadialGradient(125, 148, 14, 167, 199, 151);
      ivoryMask.addColorStop(0, '#FFFFFF');
      ivoryMask.addColorStop(0.56, '#FFF9EF');
      ivoryMask.addColorStop(0.86, '#F5E7D6');
      ivoryMask.addColorStop(1, '#E7D3BE');
    } catch {
      ivoryMask = LION_PALETTE.ivory;
    }
    oval(ctx, 160, 189, 91, 78, ivoryMask);

    // Distinctive Central Downward Forelock with curved mane plates
    const forelockGrad = gradient(ctx, 162, 52, 156, 135, [
      [0, '#FFE9AF'],
      [0.62, '#F3BE76'],
      [1, '#CE8A4F']
    ]);
    path(ctx, [
      ['M', 72, 124],
      ['Q', 90, 75, 134, 72],
      ['Q', 144, 51, 160, 55],
      ['Q', 175, 53, 187, 72],
      ['Q', 233, 76, 248, 124],
      ['Q', 215, 103, 187, 103],
      ['L', 160, 120],
      ['L', 133, 103],
      ['Q', 104, 103, 72, 124],
      ['Z']
    ], forelockGrad);

    const forelockHighlight = gradient(ctx, 155, 53, 165, 121, [
      [0, 'rgba(255, 252, 226, 0.82)'],
      [1, 'rgba(211, 138, 78, 0.28)']
    ]);
    path(ctx, [
      ['M', 119, 75],
      ['Q', 143, 78, 160, 117],
      ['Q', 176, 79, 201, 75],
      ['Q', 180, 63, 160, 55],
      ['Q', 139, 61, 119, 75],
      ['Z']
    ], forelockHighlight);

    // Two simple black oval eyes with smooth gaze tracking
    const ex = this.eyeGazeX * 5.8;
    const ey = this.eyeGazeY * 4.0;

    for (const baseX of [122, 198]) {
      if (blinking) {
        // Closed / resting eyelid
        ctx.beginPath();
        ctx.moveTo(baseX - 10, 189 + ey);
        ctx.quadraticCurveTo(baseX, 194 + ey, baseX + 10, 189 + ey);
        ctx.strokeStyle = '#32252C';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (isFinished || state === 'dancing') {
        // Joyous inverted arc
        ctx.beginPath();
        ctx.moveTo(baseX - 11 + ex, 193 + ey);
        ctx.quadraticCurveTo(baseX + ex, 178 + ey, baseX + 11 + ex, 193 + ey);
        ctx.strokeStyle = '#252129';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (isError) {
        // Slanted determined brow / eye
        ctx.beginPath();
        const slant = (baseX === 122 ? 3 : -3);
        ctx.moveTo(baseX - 9 + ex, 186 + ey - slant);
        ctx.lineTo(baseX + 9 + ex, 192 + ey + slant);
        ctx.strokeStyle = '#252129';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        // Clean authentic oval eye
        oval(ctx, baseX + ex, 189 + ey, 9.4, 13.2, LION_PALETTE.ink);
        // Specular glint
        oval(ctx, baseX + ex - 2.8, 186 + ey, 2.8, 3.8, 'rgba(255, 255, 255, 0.88)');
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
      ctx.roundRect(102, 168, 116, 42, 20);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (this.variant === 'headset') {
      ctx.beginPath();
      ctx.arc(160, 152, 92, Math.PI, 0);
      ctx.strokeStyle = '#203C73';
      ctx.lineWidth = 10;
      ctx.stroke();
      oval(ctx, 68, 160, 12, 28, '#192641', '#79BBFF', 3);
      oval(ctx, 252, 160, 12, 28, '#192641', '#79BBFF', 3);
    }

    ctx.restore(); // end head transform

    // 4. Central Symmetric Shield (Metallic gold/silver border with pale blue enamel)
    const shieldGoldGrad = gradient(ctx, 131, 246, 188, 309, [
      [0, '#FFF4CE'],
      [0.4, '#DFA559'],
      [0.8, '#BF7C42'],
      [1, '#FBE0A4']
    ]);
    path(ctx, [
      ['M', 160, 240],
      ['L', 188, 254],
      ['L', 186, 281],
      ['Q', 179, 298, 160, 308],
      ['Q', 141, 298, 134, 281],
      ['L', 132, 254],
      ['Z']
    ], shieldGoldGrad);

    // Inner pale blue / silver enamel inlay
    const shieldBlueGrad = gradient(ctx, 144, 251, 181, 299, [
      [0, '#FAFBFF'],
      [0.5, '#DBE8F9'],
      [1, '#7898C5']
    ]);
    path(ctx, [
      ['M', 160, 249],
      ['L', 180, 259],
      ['L', 177, 282],
      ['Q', 173, 291, 160, 297],
      ['Q', 147, 291, 143, 282],
      ['L', 140, 259],
      ['Z']
    ], shieldBlueGrad);

    // Pale blue central highlight crest
    const shieldHighlight = gradient(ctx, 159, 255, 176, 295, [
      [0, 'rgba(255, 255, 255, 0.88)'],
      [1, 'rgba(100, 148, 220, 0.15)']
    ]);
    path(ctx, [
      ['M', 160, 254],
      ['L', 175, 263],
      ['L', 173, 282],
      ['Q', 169, 290, 160, 295],
      ['Z']
    ], shieldHighlight);

    ctx.restore(); // end breathing body transform
    ctx.restore(); // end canonical space transform
  }
}
