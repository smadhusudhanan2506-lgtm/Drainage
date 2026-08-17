// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Underground Drainage Map (Canvas)
// ─────────────────────────────────────────────────────────────

import { NODES, PIPES, PIPE_DIAMETERS, NODE_SIZES, COLORS, WORLD, SEGMENT_STATES } from './config.js';
import { bus, Camera, setGlow, clearGlow, drawFlowArrow, drawDiamond, dist, hexAlpha, lerpColor, clamp } from './utils.js';

/* ── Particle ──────────────────────────────────────────────── */
class Particle {
  constructor(pipeId, fromX, fromY, toX, toY) {
    this.pipeId = pipeId;
    this.fromX = fromX; this.fromY = fromY;
    this.toX = toX;     this.toY = toY;
    this.t = Math.random();          // position along pipe [0,1]
    this.speed = 0.004 + Math.random() * 0.003;
    this.radius = 1.5 + Math.random() * 1.5;
    this.alpha = 0.3 + Math.random() * 0.4;
  }

  update(flowMultiplier) {
    this.t += this.speed * flowMultiplier;
    if (this.t > 1) this.t -= 1;
    if (this.t < 0) this.t += 1;
  }

  getPos() {
    return {
      x: this.fromX + (this.toX - this.fromX) * this.t,
      y: this.fromY + (this.toY - this.fromY) * this.t,
    };
  }
}

/* ── Underground Map ───────────────────────────────────────── */
export class UndergroundMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera(WORLD.width, WORLD.height);
    this.particles = [];
    this.hoveredNode = null;
    this.selectedNode = null;
    this.sensorData = {};
    this.segmentStates = {};
    this._time = 0;
    this._isDragging = false;
    this._dragStart = { x: 0, y: 0 };
    this._showLayers = { pipes: true, sensors: true, arrows: true, labels: true, particles: true };

    this._initParticles();
    this._bindEvents();
    this._resize();

    // Listen for telemetry
    bus.on('telemetry:update', (data) => {
      this.sensorData = data.sensors;
      this.segmentStates = data.segments;
    });

    // Listen for selection from other map
    bus.on('map:select', (data) => {
      if (data.source !== 'underground') {
        this.selectedNode = data.nodeId;
        if (data.nodeId) {
          const n = NODES[data.nodeId];
          if (n) this.camera.animateTo(n.x, n.y, 2.2, this.canvas.width, this.canvas.height);
        }
      }
    });
  }

  /* ── Initialise particles for each pipe ──────────────────── */
  _initParticles() {
    for (const pipe of PIPES) {
      const from = NODES[pipe.from];
      const to   = NODES[pipe.to];
      const len  = dist(from.x, from.y, to.x, to.y);
      const count = Math.max(4, Math.floor(len / 25));
      for (let i = 0; i < count; i++) {
        this.particles.push(new Particle(pipe.id, from.x, from.y, to.x, to.y));
      }
    }
  }

  /* ── Event binding ───────────────────────────────────────── */
  _bindEvents() {
    const c = this.canvas;

    // Resize
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(c.parentElement);

    // Mouse wheel zoom
    c.addEventListener('wheel', (e) => this.camera.handleWheel(e, c.width, c.height), { passive: false });

    // Pan
    c.addEventListener('mousedown', (e) => {
      this._isDragging = true;
      this._dragStart = { x: e.clientX, y: e.clientY };
      this._camStart = { x: this.camera.x, y: this.camera.y };
    });

    window.addEventListener('mousemove', (e) => {
      if (this._isDragging) {
        const dx = (e.clientX - this._dragStart.x) / this.camera.zoom;
        const dy = (e.clientY - this._dragStart.y) / this.camera.zoom;
        this.camera.x = this._camStart.x - dx;
        this.camera.y = this._camStart.y - dy;
        this.camera._targetX = this.camera.x;
        this.camera._targetY = this.camera.y;
        this.camera._animating = false;
      } else {
        this._handleHover(e);
      }
    });

    window.addEventListener('mouseup', () => { this._isDragging = false; });

    // Click
    c.addEventListener('click', (e) => {
      const node = this._hitTest(e);
      this.selectedNode = node;
      bus.emit('map:select', { nodeId: node, source: 'underground' });
      if (node) {
        bus.emit('node:detail', { nodeId: node, sensor: this.sensorData[node] });
      }
    });

    // Touch support
    let lastTouchDist = 0;
    c.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this._isDragging = true;
        this._dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this._camStart = { x: this.camera.x, y: this.camera.y };
      }
      if (e.touches.length === 2) {
        lastTouchDist = dist(e.touches[0].clientX, e.touches[0].clientY, e.touches[1].clientX, e.touches[1].clientY);
      }
    }, { passive: true });

    c.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this._isDragging) {
        const dx = (e.touches[0].clientX - this._dragStart.x) / this.camera.zoom;
        const dy = (e.touches[0].clientY - this._dragStart.y) / this.camera.zoom;
        this.camera.x = this._camStart.x - dx;
        this.camera.y = this._camStart.y - dy;
        this.camera._targetX = this.camera.x;
        this.camera._targetY = this.camera.y;
      }
      if (e.touches.length === 2) {
        const d = dist(e.touches[0].clientX, e.touches[0].clientY, e.touches[1].clientX, e.touches[1].clientY);
        const scale = d / lastTouchDist;
        this.camera.zoom = clamp(this.camera.zoom * scale, 0.3, 6);
        this.camera._targetZoom = this.camera.zoom;
        lastTouchDist = d;
      }
    }, { passive: true });

    c.addEventListener('touchend', () => { this._isDragging = false; });
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = parent.clientWidth * dpr;
    this.canvas.height = parent.clientHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this._logicalW = parent.clientWidth;
    this._logicalH = parent.clientHeight;

    // Fit world into canvas on init
    if (!this._fitted) {
      const scaleX = this._logicalW / WORLD.width;
      const scaleY = this._logicalH / WORLD.height;
      this.camera.zoom = Math.min(scaleX, scaleY) * 0.92;
      this.camera._targetZoom = this.camera.zoom;
      this.camera.x = -(this._logicalW / this.camera.zoom - WORLD.width) / 2;
      this.camera.y = -(this._logicalH / this.camera.zoom - WORLD.height) / 2;
      this.camera._targetX = this.camera.x;
      this.camera._targetY = this.camera.y;
      this._fitted = true;
    }
  }

  _handleHover(e) {
    const node = this._hitTest(e);
    this.hoveredNode = node;
    this.canvas.style.cursor = node ? 'pointer' : 'grab';

    // Emit hover for tooltip
    if (node) {
      const rect = this.canvas.getBoundingClientRect();
      bus.emit('tooltip:show', {
        nodeId: node,
        sensor: this.sensorData[node],
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      bus.emit('tooltip:hide');
    }
  }

  _hitTest(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = this.camera.screenToWorld(mx, my);

    for (const [id, node] of Object.entries(NODES)) {
      const hitR = 18 / this.camera.zoom;
      if (dist(world.x, world.y, node.x, node.y) < hitR) {
        return id;
      }
    }
    return null;
  }

  /* ── Zoom controls ───────────────────────────────────────── */
  zoomIn() {
    this.camera._targetZoom = clamp(this.camera.zoom * 1.3, 0.3, 6);
    this.camera._animating = true;
  }

  zoomOut() {
    this.camera._targetZoom = clamp(this.camera.zoom / 1.3, 0.3, 6);
    this.camera._animating = true;
  }

  resetView() {
    this._fitted = false;
    this._resize();
  }

  /* ── Animation frame ─────────────────────────────────────── */
  render(timestamp) {
    this._time = timestamp;
    this.camera.update();

    const ctx = this.ctx;
    const w = this._logicalW;
    const h = this._logicalH;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.ugBackground;
    ctx.fillRect(0, 0, w, h);

    // Apply camera
    this.camera.apply(ctx);

    // Grid
    this._drawGrid(ctx);

    // Pipes
    if (this._showLayers.pipes) this._drawPipes(ctx);

    // Particles
    if (this._showLayers.particles) this._drawParticles(ctx);

    // Flow arrows
    if (this._showLayers.arrows) this._drawArrows(ctx);

    // Nodes
    if (this._showLayers.sensors) this._drawNodes(ctx);

    // Labels
    if (this._showLayers.labels) this._drawLabels(ctx);

    // Zone labels (underground — show as faded references)
    this._drawZoneLabels(ctx);

    // Reset transform for HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Legend
    this._drawLegend(ctx, w, h);

    // Compass
    this._drawCompass(ctx, w);
  }

  /* ── Grid ────────────────────────────────────────────────── */
  _drawGrid(ctx) {
    ctx.strokeStyle = COLORS.ugGrid;
    ctx.lineWidth = 0.5;
    const step = 50;
    for (let x = 0; x <= WORLD.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
    }
  }

  /* ── Pipes ───────────────────────────────────────────────── */
  _drawPipes(ctx) {
    for (const pipe of PIPES) {
      const from = NODES[pipe.from];
      const to   = NODES[pipe.to];
      const diam = PIPE_DIAMETERS[pipe.diameter];
      const state = this.segmentStates[pipe.id] || SEGMENT_STATES.NORMAL;

      let color = COLORS.pipeNormal;
      let glowColor = COLORS.pipeNormalGlow;
      let glowSize = 4;

      if (state === SEGMENT_STATES.CONFIRMED_BLOCKAGE || state === SEGMENT_STATES.PROBABLE_BLOCKAGE) {
        const pulse = 0.6 + Math.sin(this._time * 0.004) * 0.4;
        color = COLORS.pipeDanger;
        glowColor = COLORS.pipeDangerGlow;
        glowSize = 10 + pulse * 10;
      } else if (state === SEGMENT_STATES.ABNORMAL) {
        color = COLORS.pipeWarning;
        glowColor = COLORS.pipeWarning;
        glowSize = 6;
      } else if (state === SEGMENT_STATES.RECOVERY) {
        const t = (Math.sin(this._time * 0.006) + 1) / 2;
        color = lerpColor(COLORS.pipeDanger, COLORS.pipeNormal, t);
        glowColor = color;
        glowSize = 6;
      } else if (state === SEGMENT_STATES.MAINTENANCE) {
        color = '#a78bfa';
        glowColor = '#a78bfa';
        glowSize = 6;
      }

      // Outer glow
      ctx.save();
      setGlow(ctx, glowColor, glowSize);
      ctx.strokeStyle = color;
      ctx.lineWidth = diam.drawWidth + 4;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();

      // Main pipe
      ctx.save();
      setGlow(ctx, glowColor, glowSize * 0.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = diam.drawWidth;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();

      // Inner lighter line
      ctx.save();
      clearGlow(ctx);
      ctx.strokeStyle = hexAlpha(color, 0.3);
      ctx.lineWidth = Math.max(2, diam.drawWidth * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();

      // Selection highlight
      if (this.selectedNode && (pipe.from === this.selectedNode || pipe.to === this.selectedNode)) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = diam.drawWidth + 6;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /* ── Particles ───────────────────────────────────────────── */
  _drawParticles(ctx) {
    for (const p of this.particles) {
      const state = this.segmentStates[p.pipeId] || SEGMENT_STATES.NORMAL;
      let flowMult = 1.0;
      let color = COLORS.particleNormal;

      if (state === SEGMENT_STATES.CONFIRMED_BLOCKAGE) {
        flowMult = 0.05;
        color = COLORS.particleDanger;
      } else if (state === SEGMENT_STATES.PROBABLE_BLOCKAGE) {
        flowMult = 0.15;
        color = 'rgba(245, 158, 11, 0.7)';
      } else if (state === SEGMENT_STATES.ABNORMAL) {
        flowMult = 0.4;
        color = 'rgba(200, 180, 100, 0.6)';
      } else if (state === SEGMENT_STATES.RECOVERY) {
        const t = (Math.sin(this._time * 0.003) + 1) / 2;
        flowMult = 0.3 + t * 0.7;
        color = COLORS.particleNormal;
      } else if (state === SEGMENT_STATES.MAINTENANCE) {
        flowMult = 0.05;
        color = 'rgba(167, 139, 250, 0.6)';
      }

      p.update(flowMult);
      const pos = p.getPos();

      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = p.alpha * (0.7 + Math.sin(this._time * 0.005 + p.t * 10) * 0.3);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── Flow Arrows ─────────────────────────────────────────── */
  _drawArrows(ctx) {
    for (const pipe of PIPES) {
      const from = NODES[pipe.from];
      const to   = NODES[pipe.to];
      const state = this.segmentStates[pipe.id] || SEGMENT_STATES.NORMAL;

      let arrowColor = hexAlpha(COLORS.pipeNormal, 0.5);
      if (state === SEGMENT_STATES.CONFIRMED_BLOCKAGE || state === SEGMENT_STATES.PROBABLE_BLOCKAGE) {
        arrowColor = hexAlpha(COLORS.pipeDanger, 0.6);
      }

      drawFlowArrow(ctx, from.x, from.y, to.x, to.y, 0.5, 6, arrowColor);
    }
  }

  /* ── Nodes ───────────────────────────────────────────────── */
  _drawNodes(ctx) {
    for (const [id, node] of Object.entries(NODES)) {
      const isHovered = this.hoveredNode === id;
      const isSelected = this.selectedNode === id;
      const data = this.sensorData[id];
      const hasAnomaly = data && data.anomalyFlags.length > 0;

      // Determine state from adjacent pipes
      let nodeState = 'normal';
      for (const pipe of PIPES) {
        if (pipe.from === id || pipe.to === id) {
          const s = this.segmentStates[pipe.id];
          if (s === SEGMENT_STATES.CONFIRMED_BLOCKAGE || s === SEGMENT_STATES.PROBABLE_BLOCKAGE) {
            nodeState = 'danger';
            break;
          } else if (s === SEGMENT_STATES.ABNORMAL) {
            nodeState = 'warning';
          }
        }
      }

      let fillColor, strokeColor, glowColor;
      if (nodeState === 'danger') {
        const pulse = 0.6 + Math.sin(this._time * 0.005) * 0.4;
        fillColor = COLORS.sensorDanger;
        strokeColor = COLORS.pipeDangerGlow;
        glowColor = COLORS.pipeDangerGlow;

        // Danger pulse ring
        ctx.save();
        const ringR = 20 + ((this._time * 0.03) % 30);
        const ringAlpha = Math.max(0, 1 - ringR / 50);
        ctx.beginPath();
        ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(COLORS.pipeDanger, ringAlpha * 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else if (nodeState === 'warning') {
        fillColor = COLORS.sensorWarning;
        strokeColor = '#fbbf24';
        glowColor = COLORS.pipeWarning;
      } else {
        fillColor = node.type === 'sensor' ? COLORS.sensorNormal : COLORS.manholeNormal;
        strokeColor = COLORS.sensorGlow;
        glowColor = COLORS.sensorGlow;
      }

      const pulseFactor = isHovered || isSelected ? 1.3 : 1.0 + Math.sin(this._time * 0.003 + node.x * 0.01) * 0.08;

      ctx.save();

      if (node.type === 'sensor') {
        const r = NODE_SIZES.sensor.radius * pulseFactor;
        setGlow(ctx, glowColor, isSelected ? 15 : 8);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = NODE_SIZES.sensor.outline;
        ctx.stroke();

        // Inner dot
        clearGlow(ctx);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
      } else if (node.type === 'manhole') {
        const s = NODE_SIZES.manhole.size * pulseFactor;
        setGlow(ctx, glowColor, isSelected ? 15 : 6);
        ctx.fillStyle = fillColor;
        ctx.fillRect(node.x - s / 2, node.y - s / 2, s, s);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = NODE_SIZES.manhole.outline;
        ctx.strokeRect(node.x - s / 2, node.y - s / 2, s, s);
      } else if (node.type === 'junction') {
        const s = NODE_SIZES.junction.size * pulseFactor;
        setGlow(ctx, glowColor, isSelected ? 15 : 6);
        drawDiamond(ctx, node.x, node.y, s * 0.6);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = NODE_SIZES.junction.outline;
        ctx.stroke();
      } else if (node.type === 'outfall') {
        const s = NODE_SIZES.outfall.size * pulseFactor;
        setGlow(ctx, '#22c55e', 10);
        ctx.beginPath();
        ctx.arc(node.x, node.y, s * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#1a4d2e';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Arrow pointing right
        clearGlow(ctx);
        ctx.beginPath();
        ctx.moveTo(node.x + s * 0.6, node.y);
        ctx.lineTo(node.x + s * 0.3, node.y - 5);
        ctx.lineTo(node.x + s * 0.3, node.y + 5);
        ctx.closePath();
        ctx.fillStyle = '#22c55e';
        ctx.fill();
      }

      // Selection ring
      if (isSelected) {
        clearGlow(ctx);
        const r = 22;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -this._time * 0.02;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  }

  /* ── Node Labels ─────────────────────────────────────────── */
  _drawLabels(ctx) {
    ctx.save();
    ctx.font = '500 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const [id, node] of Object.entries(NODES)) {
      ctx.fillStyle = this.hoveredNode === id || this.selectedNode === id
        ? '#ffffff' : hexAlpha('#e2e8f0', 0.7);
      ctx.fillText(id, node.x, node.y + 16);
    }
    ctx.restore();
  }

  /* ── Zone Labels ─────────────────────────────────────────── */
  _drawZoneLabels(ctx) {
    const zones = [
      { text: 'NORTH RESIDENTIAL AREA', x: 150, y: 50 },
      { text: 'CITY PARK', x: 470, y: 50 },
      { text: 'NORTH RESIDENTIAL AREA', x: 790, y: 50 },
      { text: 'COMMERCIAL\nZONE', x: 150, y: 230 },
      { text: 'GOVERNMENT\nOFFICE COMPLEX', x: 460, y: 230 },
      { text: 'HOSPITAL\nZONE', x: 830, y: 230 },
      { text: 'WEST RESIDENTIAL\nAREA', x: 150, y: 480 },
      { text: 'BUS TERMINAL', x: 460, y: 480 },
      { text: 'EAST RESIDENTIAL\nAREA', x: 830, y: 480 },
      { text: 'MARKET AREA', x: 460, y: 710 },
      { text: 'LAKE VIEW', x: 100, y: 760 },
    ];

    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(126, 200, 227, 0.15)';

    for (const z of zones) {
      const lines = z.text.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, z.x, z.y + i * 14);
      });
    }
    ctx.restore();
  }

  /* ── Legend ──────────────────────────────────────────────── */
  _drawLegend(ctx, w, h) {
    const lx = w - 175, ly = h - 180;
    const lw = 165, lh = 170;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 16, 36, 0.88)';
    ctx.strokeStyle = 'rgba(100, 160, 220, 0.2)';
    ctx.lineWidth = 1;

    // Rounded rect
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#7ec8e3';
    ctx.fillText('LEGEND', lx + 12, ly + 18);

    const items = [
      { type: 'circle', color: COLORS.sensorNormal, label: 'IoT Sensor Node' },
      { type: 'rect', color: COLORS.manholeNormal, label: 'Manhole / Access Pt' },
      { type: 'diamond', color: COLORS.junctionNormal, label: 'Pipeline Junction' },
      { type: 'line', color: COLORS.pipeNormal, label: 'Normal Flow' },
      { type: 'line', color: COLORS.pipeDanger, label: 'Blockage / Danger' },
      { type: 'line', color: COLORS.pipeWarning, label: 'Warning' },
      { type: 'line', color: '#a78bfa', label: 'Maintenance' },
    ];

    let y = ly + 36;
    ctx.font = '400 10px Inter, sans-serif';
    for (const item of items) {
      const ix = lx + 18, iy = y;
      if (item.type === 'circle') {
        ctx.beginPath();
        ctx.arc(ix, iy, 4, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
      } else if (item.type === 'rect') {
        ctx.fillStyle = item.color;
        ctx.fillRect(ix - 4, iy - 4, 8, 8);
      } else if (item.type === 'diamond') {
        drawDiamond(ctx, ix, iy, 5);
        ctx.fillStyle = item.color;
        ctx.fill();
      } else if (item.type === 'line') {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ix - 8, iy);
        ctx.lineTo(ix + 8, iy);
        ctx.stroke();
      }

      ctx.fillStyle = '#c8d6e5';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, ix + 16, iy);
      y += 18;
    }

    ctx.restore();
  }

  /* ── Compass ─────────────────────────────────────────────── */
  _drawCompass(ctx, w) {
    const cx = w - 36, cy = 50, r = 20;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 16, 36, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 160, 220, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // N arrow
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + 2);
    ctx.lineTo(cx - 5, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // S arrow
    ctx.beginPath();
    ctx.moveTo(cx, cy + r - 2);
    ctx.lineTo(cx - 5, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.closePath();
    ctx.fillStyle = '#94a3b8';
    ctx.fill();

    ctx.font = '700 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('N', cx, cy - r - 6);

    ctx.restore();
  }
}
