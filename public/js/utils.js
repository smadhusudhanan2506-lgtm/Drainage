// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Utility Functions
// ─────────────────────────────────────────────────────────────

/* ── Simple Pub/Sub Event Bus ──────────────────────────────── */
export class EventBus {
  constructor() { this._listeners = {}; }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(f => f !== fn);
  }

  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(`EventBus [${event}]:`, e); }
    });
  }
}

export const bus = new EventBus();

/* ── Colour Helpers ────────────────────────────────────────── */

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHex({ r, g, b }) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function lerpColor(hex1, hex2, t) {
  const a = hexToRgb(hex1), b = hexToRgb(hex2);
  return rgbToHex({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });
}

export function hexAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── Canvas Drawing Helpers ────────────────────────────────── */

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function setGlow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function clearGlow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

export function drawDiamond(ctx, cx, cy, size) {
  const h = size;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + h, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - h, cy);
  ctx.closePath();
}

export function drawFlowArrow(ctx, x1, y1, x2, y2, t, size, color) {
  const x = x1 + (x2 - x1) * t;
  const y = y1 + (y2 - y1) * t;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.6, -size * 0.5);
  ctx.lineTo(-size * 0.6, size * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* ── Time Helpers ──────────────────────────────────────────── */

export function formatTime(date) {
  if (!date) return '--:--:--';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(date) {
  if (!date) return 'N/A';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
}

/* ── Audio Alert ───────────────────────────────────────────── */
let _audioCtx = null;
export function playAlertChime() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.frequency.setValueAtTime(880, _audioCtx.currentTime);
    osc.frequency.setValueAtTime(660, _audioCtx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, _audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, _audioCtx.currentTime + 0.4);
    osc.start(_audioCtx.currentTime);
    osc.stop(_audioCtx.currentTime + 0.4);
  } catch (e) { /* silent fallback */ }
}

/* ── High-DPI Camera Class ─────────────────────────────────── */
export class Camera {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this._targetX = 0;
    this._targetY = 0;
    this._targetZoom = 1;
    this._animating = false;
  }

  animateTo(wx, wy, zoom = 2, canvasW, canvasH) {
    this._targetX = wx - (canvasW / zoom) / 2;
    this._targetY = wy - (canvasH / zoom) / 2;
    this._targetZoom = zoom;
    this._animating = true;
  }

  reset(canvasW, canvasH) {
    this._targetX = 0;
    this._targetY = 0;
    this._targetZoom = Math.min(canvasW / this.worldW, canvasH / this.worldH);
    this._animating = true;
  }

  update() {
    if (!this._animating) return;
    const lerp = 0.08;
    this.x += (this._targetX - this.x) * lerp;
    this.y += (this._targetY - this.y) * lerp;
    this.zoom += (this._targetZoom - this.zoom) * lerp;
    if (Math.abs(this.x - this._targetX) < 0.5 &&
        Math.abs(this.y - this._targetY) < 0.5 &&
        Math.abs(this.zoom - this._targetZoom) < 0.001) {
      this.x = this._targetX;
      this.y = this._targetY;
      this.zoom = this._targetZoom;
      this._animating = false;
    }
  }

  apply(ctx, dpr = 1) {
    // Sharp high-DPI transform without clipping or blur
    const effectiveZoom = this.zoom * dpr;
    ctx.setTransform(
      effectiveZoom, 0,
      0, effectiveZoom,
      -this.x * effectiveZoom,
      -this.y * effectiveZoom
    );
  }

  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  handleWheel(e, canvasW, canvasH) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = clamp(this.zoom * zoomFactor, 0.35, 6.0);
    const rect = e.target.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = mx / this.zoom + this.x;
    const wy = my / this.zoom + this.y;
    this.zoom = newZoom;
    this.x = wx - mx / this.zoom;
    this.y = wy - my / this.zoom;
    this._targetX = this.x;
    this._targetY = this.y;
    this._targetZoom = this.zoom;
    this._animating = false;
  }
}
