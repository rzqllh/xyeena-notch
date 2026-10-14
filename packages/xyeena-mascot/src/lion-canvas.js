// Xyeena Living Lion Canvas 2.5D Rig
// Pure Canvas 2D implementation with articulated head, ears, mane, eyes, brows and body.
// Features smooth gaze tracking, independent head lag, distance dead-zone, bounded eye movement,
// natural blinking, idle breathing, and emotional state expressions.

export class LivingLionRig {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {number} [options.size=96]
   * @param {string} [options.state='idle']
   * @param {boolean} [options.reducedMotion=false]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    this.size = options.size || 96;
    this.state = options.state || 'idle';
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

    // Salute / emote timeline
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
    if (this.ctx) {
      this.ctx.resetTransform?.();
    }
    this.render();
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    if (state === 'sleeping') {
      this.targetGazeX = 0;
      this.targetGazeY = 0.4;
    }
    this.render();
  }

  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    if (this.reducedMotion) {
      this.eyeGazeX = this.targetGazeX;
      this.eyeGazeY = this.targetGazeY;
      this.headYaw = this.targetGazeX * 0.4;
      this.headPitch = this.targetGazeY * 0.3;
    }
    this.render();
  }

  /**
   * Set target gaze vector directly in normalized [-1, 1] range.
   * @param {number} x
   * @param {number} y
   */
  setGaze(x, y) {
    if (this.state === 'sleeping') return;
    this.targetGazeX = Math.max(-1, Math.min(1, x));
    this.targetGazeY = Math.max(-1, Math.min(1, y));
  }

  /**
   * Set gaze from mouse coordinates relative to canvas center.
   * Includes dead-zone handling to prevent jitter when cursor is over the face.
   * @param {number} clientX
   * @param {number} clientY
   */
  setGazeFromClient(clientX, clientY) {
    if (this.state === 'sleeping' || !this.canvas || typeof this.canvas.getBoundingClientRect !== 'function') return;
    const rect = this.canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height * 0.45; // Head center is slightly above middle

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

    // Scale gaze distance gracefully so small movements are nuanced and far movements reach bounds
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
        if (!this.active) {
          this.rafId = 0;
          return;
        }
        const dt = Math.min(0.1, (now - this.lastTime) / 1000);
        this.lastTime = now;
        this.update(dt);
        this.render();

        // If inactive or sleeping, throttle loop to save CPU
        if (this.state === 'sleeping' && Math.abs(this.headYaw) < 0.01 && Math.abs(this.eyeGazeX) < 0.01) {
          this.rafId = setTimeout(() => {
            this.rafId = 0;
            if (this.active) loop(performance.now());
          }, 120);
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
        this.blinkTimer = Math.random() < 0.2 ? 0.35 : 3.0 + Math.random() * 3.0;
      }
    }

    if (this.reducedMotion) {
      this.eyeGazeX = this.targetGazeX;
      this.eyeGazeY = this.targetGazeY;
      this.headYaw = this.targetGazeX * 0.35;
      this.headPitch = this.targetGazeY * 0.25;
      return;
    }

    // Eye gaze tracks with fast smooth spring/lerp (snappy eye response)
    const eyeLerp = Math.min(1, dt * 14);
    this.eyeGazeX += (this.targetGazeX - this.eyeGazeX) * eyeLerp;
    this.eyeGazeY += (this.targetGazeY - this.eyeGazeY) * eyeLerp;

    // Head rotation tracks with smooth head lag (independent, more damping)
    const headTargetYaw = this.targetGazeX * 0.42;
    const headTargetPitch = this.targetGazeY * 0.32;
    const headLerp = Math.min(1, dt * 5.5);
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
    // Scale coordinate system to canonical 200x200 space
    const scale = (this.size * dpr) / 200;
    ctx.scale(scale, scale);

    const time = this.time;
    const state = this.state;
    const isSleeping = state === 'sleeping';
    const isWorking = state === 'working' || state === 'thinking';
    const isAttention = state === 'attention' || state === 'question';
    const isDancing = state === 'dancing' || state === 'playing';
    const isFinished = state === 'finished' || state === 'approval';
    const isError = state === 'error';

    // Idle breathing cycle
    const breathRate = isSleeping ? 0.8 : isAttention ? 2.4 : 1.6;
    const breath = this.reducedMotion ? 0 : Math.sin(time * breathRate);
    const breathY = breath * (isSleeping ? 0.8 : 1.5);

    // Emote influence (salute)
    let saluteRise = 0;
    let saluteWave = 0;
    if (this.emoteName === 'salute') {
      const progress = this.emoteTime / this.emoteDuration;
      saluteRise = Math.sin(progress * Math.PI);
      saluteWave = Math.sin(progress * Math.PI * 6) * saluteRise;
    }

    // Center anchor: base coordinate (100, 100)
    const cx = 100;
    const cy = 100 + breathY * 0.5;

    // 2.5D perspective offsets
    const yaw = this.headYaw;
    const pitch = this.headPitch;
    const headTilt = yaw * 0.12 + (isAttention ? 0.1 : 0) + (isDancing ? Math.sin(time * 5) * 0.12 : 0);

    // 1. Soft Shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, 178, 48 + breath * 2, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 20, 30, 0.22)';
    ctx.fill();
    ctx.restore();

    // 2. Body (Anchored Torso & Chest)
    ctx.save();
    ctx.translate(cx, cy + 42);

    // Back body shape
    ctx.beginPath();
    ctx.ellipse(0, 12, 36, 32 + breathY * 0.8, 0, 0, Math.PI * 2);
    const bodyGrad = ctx.createLinearGradient(0, -18, 0, 44);
    bodyGrad.addColorStop(0, '#f2b24c');
    bodyGrad.addColorStop(0.5, '#e09832');
    bodyGrad.addColorStop(1, '#be741a');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Chest tuft (lighter cream-gold fur patch)
    ctx.beginPath();
    ctx.ellipse(0, 6, 20, 22 + breathY * 0.5, 0, 0, Math.PI * 2);
    const chestGrad = ctx.createLinearGradient(0, -14, 0, 28);
    chestGrad.addColorStop(0, '#fff4dc');
    chestGrad.addColorStop(0.7, '#f7d69a');
    chestGrad.addColorStop(1, '#e3b15f');
    ctx.fillStyle = chestGrad;
    ctx.fill();

    // Resting front paws
    // Left paw
    ctx.beginPath();
    ctx.ellipse(-22, 34, 10, 8, -0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#fce5ba';
    ctx.strokeStyle = '#cb8424';
    ctx.lineWidth = 1.8;
    ctx.fill();
    ctx.stroke();

    // Right paw (or waving if salute)
    if (saluteRise > 0.05) {
      ctx.save();
      ctx.translate(26 + saluteWave * 6, 12 - saluteRise * 26);
      ctx.rotate(-0.4 + saluteWave * 0.3);
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff0d2';
      ctx.strokeStyle = '#cb8424';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.ellipse(22, 34, 10, 8, 0.15, 0, Math.PI * 2);
      ctx.fillStyle = '#fce5ba';
      ctx.strokeStyle = '#cb8424';
      ctx.lineWidth = 1.8;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // 3. Head & Mane Group (Articulated with Head Lag and 2.5D Rotation)
    ctx.save();
    const hx = cx + yaw * 14;
    const hy = cy - 8 + pitch * 10;
    ctx.translate(hx, hy);
    ctx.rotate(headTilt);

    // --- Mane (Back Layer) ---
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = (i % 2 === 0 ? 56 : 48) + Math.sin(time * 2 + i) * 1.2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.95;
      if (i === 0) ctx.moveTo(px, py);
      else {
        const cpAngle = a - (Math.PI / 12);
        const cpR = 58;
        ctx.quadraticCurveTo(Math.cos(cpAngle) * cpR, Math.sin(cpAngle) * cpR, px, py);
      }
    }
    ctx.closePath();
    const maneGrad = ctx.createRadialGradient(-yaw * 10, -pitch * 10, 10, 0, 0, 60);
    maneGrad.addColorStop(0, '#f9c568');
    maneGrad.addColorStop(0.5, '#e59728');
    maneGrad.addColorStop(0.85, '#c76e14');
    maneGrad.addColorStop(1, '#9e4b09');
    ctx.fillStyle = maneGrad;
    ctx.fill();

    // --- Ears ---
    const leftEarYawScale = 1 - yaw * 0.35;
    const rightEarYawScale = 1 + yaw * 0.35;
    const earPerk = isAttention ? -5 : isSleeping ? 4 : isError ? 5 : 0;

    // Left Ear
    ctx.save();
    ctx.translate(-38 + yaw * 5, -34 + earPerk);
    ctx.scale(leftEarYawScale, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 15, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#e89e30';
    ctx.strokeStyle = '#c57416';
    ctx.lineWidth = 1.8;
    ctx.fill();
    ctx.stroke();
    // Inner ear
    ctx.beginPath();
    ctx.ellipse(1, 2, 8, 9, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#f7c8b2';
    ctx.fill();
    ctx.restore();

    // Right Ear
    ctx.save();
    ctx.translate(38 + yaw * 5, -34 + earPerk);
    ctx.scale(rightEarYawScale, 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 15, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#e89e30';
    ctx.strokeStyle = '#c57416';
    ctx.lineWidth = 1.8;
    ctx.fill();
    ctx.stroke();
    // Inner ear
    ctx.beginPath();
    ctx.ellipse(-1, 2, 8, 9, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#f7c8b2';
    ctx.fill();
    ctx.restore();

    // --- Main Head Dome ---
    ctx.beginPath();
    ctx.ellipse(yaw * 4, pitch * 3, 40, 36, 0, 0, Math.PI * 2);
    const headGrad = ctx.createRadialGradient(-10 + yaw * 6, -14 + pitch * 4, 6, 0, 0, 44);
    headGrad.addColorStop(0, '#ffe8ba');
    headGrad.addColorStop(0.45, '#f5be58');
    headGrad.addColorStop(0.85, '#df9226');
    headGrad.addColorStop(1, '#c07212');
    ctx.fillStyle = headGrad;
    ctx.fill();

    // Royal Forehead Crest (Xyeena Lion Signature Diamond Tuft)
    ctx.beginPath();
    ctx.moveTo(yaw * 4, -30 + pitch * 3);
    ctx.lineTo(8 + yaw * 4, -18 + pitch * 3);
    ctx.lineTo(yaw * 4, -8 + pitch * 3);
    ctx.lineTo(-8 + yaw * 4, -18 + pitch * 3);
    ctx.closePath();
    ctx.fillStyle = '#ffe9b8';
    ctx.fill();

    // --- Face Plate (Cream Mask) ---
    const fx = yaw * 10;
    const fy = 4 + pitch * 8;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 29, 23, 0, 0, Math.PI * 2);
    const faceGrad = ctx.createLinearGradient(fx, fy - 20, fx, fy + 22);
    faceGrad.addColorStop(0, '#ffffff');
    faceGrad.addColorStop(0.65, '#fff9f0');
    faceGrad.addColorStop(1, '#faebd4');
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Rosy Cheeks
    ctx.beginPath();
    ctx.ellipse(fx - 20, fy + 7, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(fx + 20, fy + 7, 6, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245, 145, 155, 0.28)';
    ctx.fill();

    // --- Eyebrows ---
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#432612';

    // Left eyebrow
    ctx.beginPath();
    if (isAttention) {
      ctx.moveTo(fx - 21, fy - 14);
      ctx.quadraticCurveTo(fx - 14, fy - 20, fx - 7, fy - 15);
    } else if (isWorking) {
      ctx.moveTo(fx - 21, fy - 13);
      ctx.quadraticCurveTo(fx - 14, fy - 15, fx - 7, fy - 11);
    } else if (isError) {
      ctx.moveTo(fx - 21, fy - 12);
      ctx.quadraticCurveTo(fx - 14, fy - 16, fx - 7, fy - 18);
    } else {
      ctx.moveTo(fx - 21, fy - 14);
      ctx.quadraticCurveTo(fx - 14, fy - 17, fx - 7, fy - 13);
    }
    ctx.stroke();

    // Right eyebrow
    ctx.beginPath();
    if (isAttention) {
      ctx.moveTo(fx + 7, fy - 13);
      ctx.quadraticCurveTo(fx + 14, fy - 15, fx + 21, fy - 13);
    } else if (isWorking) {
      ctx.moveTo(fx + 7, fy - 11);
      ctx.quadraticCurveTo(fx + 14, fy - 15, fx + 21, fy - 13);
    } else if (isError) {
      ctx.moveTo(fx + 7, fy - 18);
      ctx.quadraticCurveTo(fx + 14, fy - 16, fx + 21, fy - 12);
    } else {
      ctx.moveTo(fx + 7, fy - 13);
      ctx.quadraticCurveTo(fx + 14, fy - 17, fx + 21, fy - 14);
    }
    ctx.stroke();

    // --- Eyes (Gaze-Tracking & Anatomically Bounded) ---
    const blinkVal = isSleeping ? 1 : this.isBlinking ? Math.sin(this.blinkProgress * Math.PI) : 0;

    const leftEyeX = fx - 13;
    const rightEyeX = fx + 13;
    const eyeY = fy - 4;
    const eyeW = 9.5;
    const eyeH = 11.5;

    const pupilX = this.eyeGazeX * 4.2;
    const pupilY = this.eyeGazeY * 3.4;

    if (blinkVal >= 0.88 || isSleeping) {
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#2d180b';
      ctx.beginPath();
      ctx.arc(leftEyeX, eyeY + 1, 7, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rightEyeX, eyeY + 1, 7, 0.15, Math.PI - 0.15);
      ctx.stroke();
    } else if (isDancing || isFinished) {
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = '#241308';
      ctx.beginPath();
      ctx.arc(leftEyeX, eyeY + 2, 7.5, Math.PI + 0.2, -0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rightEyeX, eyeY + 2, 7.5, Math.PI + 0.2, -0.2);
      ctx.stroke();
    } else {
      const drawEye = (ex) => {
        ctx.save();
        ctx.beginPath();
        const currentEyeH = Math.max(1.5, eyeH * (1 - blinkVal));
        ctx.ellipse(ex, eyeY, eyeW, currentEyeH, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.clip();

        // Dark Iris / Pupil
        ctx.beginPath();
        ctx.ellipse(ex + pupilX, eyeY + pupilY, 6.2, 7.0, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#22140a';
        ctx.fill();

        // Amber highlight ring
        ctx.beginPath();
        ctx.ellipse(ex + pupilX, eyeY + pupilY + 1.5, 4.2, 4.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#7a4214';
        ctx.fill();

        // Deep core
        ctx.beginPath();
        ctx.ellipse(ex + pupilX, eyeY + pupilY, 3.4, 4.0, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#100803';
        ctx.fill();

        // Specular glints
        ctx.beginPath();
        ctx.arc(ex + pupilX - 2.2, eyeY + pupilY - 2.4, 2.0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ex + pupilX + 2.0, eyeY + pupilY + 2.0, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();

        ctx.restore();

        // Eye socket outline
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeW, currentEyeH, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#7c4819';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      };

      drawEye(leftEyeX);
      drawEye(rightEyeX);
    }

    // --- Muzzle, Cute Nose & Mouth ---
    const mx = fx;
    const my = fy + 10;

    // Small rounded muzzle base
    ctx.beginPath();
    ctx.ellipse(mx - 5.5, my + 1, 7.5, 5.5, -0.15, 0, Math.PI * 2);
    ctx.ellipse(mx + 5.5, my + 1, 7.5, 5.5, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#fff4e4';
    ctx.fill();

    // Dark brown triangular nose
    ctx.beginPath();
    ctx.moveTo(mx, my - 2);
    ctx.lineTo(mx + 4.2, my + 2);
    ctx.quadraticCurveTo(mx, my + 3.8, mx - 4.2, my + 2);
    ctx.closePath();
    ctx.fillStyle = '#341c0e';
    ctx.fill();

    // Nose highlight
    ctx.beginPath();
    ctx.ellipse(mx, my - 0.5, 1.8, 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    // Gentle Smile Line
    ctx.beginPath();
    ctx.strokeStyle = '#4e2810';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.moveTo(mx, my + 3.2);
    ctx.lineTo(mx, my + 5.5);
    ctx.moveTo(mx, my + 5.5);
    ctx.quadraticCurveTo(mx - 4.5, my + 8.5, mx - 7.5, my + 5.8);
    ctx.moveTo(mx, my + 5.5);
    ctx.quadraticCurveTo(mx + 4.5, my + 8.5, mx + 7.5, my + 5.8);
    ctx.stroke();

    ctx.restore(); // Restore head group
    ctx.restore(); // Restore root canvas transform
  }
}
