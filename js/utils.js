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

/* ── Global Bus (singleton) ────────────────────────────────── */
export const bus = new EventBus();

/* ── Colour Helpers ────────────────────────────────────────── */

/** Parse '#rrggbb' → {r,g,b} */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** {r,g,b} → '#rrggbb' */
export function rgbToHex({ r, g, b }) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Linearly interpolate two hex colours. t ∈ [0,1] */
export function lerpColor(hex1, hex2, t) {
  const a = hexToRgb(hex1), b = hexToRgb(hex2);
  return rgbToHex({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });
}

/** Convert hex + alpha to rgba string */
export function hexAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── Canvas Drawing Helpers ────────────────────────────────── */

/** Draw a rounded rectangle */
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

/** Apply glow shadow to context */
export function setGlow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Clear glow */
export function clearGlow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/** Draw a diamond shape centered at (cx, cy) */
export function drawDiamond(ctx, cx, cy, size) {
  const h = size;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + h, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - h, cy);
  ctx.closePath();
}

/** Draw a flow arrow (triangle) along a line at position t ∈ [0,1] */
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

/** Distance between two points */
export function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** Clamp */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* ── Time Helpers ──────────────────────────────────────────── */

export function formatTime(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(date) {
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function timeAgo(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── Unique ID Generator ───────────────────────────────────── */
let _idCounter = 0;
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${(++_idCounter).toString(36)}`;
}

/* ── Audio Alert ───────────────────────────────────────────── */
let _audioCtx = null;
export function playAlertChime() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

/* ── Deep Clone ────────────────────────────────────────────── */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ── Easing ────────────────────────────────────────────────── */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ── Map Camera Class ──────────────────────────────────────── */
export class Camera {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = 0;          // top-left offset in world coords
    this.y = 0;
    this.zoom = 1;
    this._targetX = 0;
    this._targetY = 0;
    this._targetZoom = 1;
    this._animating = false;
  }

  /** Smoothly animate to centre on (wx, wy) at given zoom */
  animateTo(wx, wy, zoom = 2, canvasW, canvasH) {
    this._targetX = wx - (canvasW / zoom) / 2;
    this._targetY = wy - (canvasH / zoom) / 2;
    this._targetZoom = zoom;
    this._animating = true;
  }

  /** Reset to show full world */
  reset(canvasW, canvasH) {
    this._targetX = 0;
    this._targetY = 0;
    this._targetZoom = Math.min(canvasW / this.worldW, canvasH / this.worldH);
    this._animating = true;
  }

  /** Tick each frame */
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

  /** Apply transform to canvas context */
  apply(ctx) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, -this.x * this.zoom, -this.y * this.zoom);
  }

  /** Convert screen coords to world coords */
  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  /** Handle mouse wheel zoom centred on cursor */
  handleWheel(e, canvasW, canvasH) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = clamp(this.zoom * zoomFactor, 0.3, 6);
    // zoom toward cursor
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
