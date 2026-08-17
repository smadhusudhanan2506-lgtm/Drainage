// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Underground Drainage Map (Canvas)
// ─────────────────────────────────────────────────────────────

import { NODES, PIPES, PIPE_DIAMETERS, NODE_SIZES, COLORS, WORLD } from './config.js';
import { bus, Camera, setGlow, clearGlow, drawFlowArrow, drawDiamond, dist, hexAlpha, clamp, roundRect } from './utils.js';

class Particle {
  constructor(pipeId, fromX, fromY, toX, toY) {
    this.pipeId = pipeId;
    this.fromX = fromX; this.fromY = fromY;
    this.toX = toX;     this.toY = toY;
    this.t = Math.random();
    this.speed = 0.0035 + Math.random() * 0.003;
    this.radius = 1.6 + Math.random() * 1.4;
    this.alpha = 0.45 + Math.random() * 0.4;
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
    this.dpr = window.devicePixelRatio || 1;
    this._time = 0;
    this._isDragging = false;
    this._dragStart = { x: 0, y: 0 };
    this._showLayers = { pipes: true, sensors: true, arrows: true, labels: true, particles: true };

    this._initParticles();
    this._bindEvents();
    this._resize();

    bus.on('telemetry:update', (data) => {
      this.sensorData = data.sensors;
      this.segmentStates = data.segments;
    });

    bus.on('map:select', (data) => {
      if (data.source !== 'underground') {
        this.selectedNode = data.nodeId;
        if (data.nodeId) {
          const n = NODES[data.nodeId];
          if (n) this.camera.animateTo(n.x, n.y, 2.2, this._logicalW || this.canvas.width, this._logicalH || this.canvas.height);
        }
      }
    });
  }

  _initParticles() {
    this.particles = [];
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

  _bindEvents() {
    const c = this.canvas;

    const ro = new ResizeObserver(() => this._resize());
    if (c.parentElement) ro.observe(c.parentElement);

    c.addEventListener('wheel', (e) => this.camera.handleWheel(e, this._logicalW || c.width, this._logicalH || c.height), { passive: false });

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
      } else if (document.body.contains(c)) {
        this._handleHover(e);
      }
    });

    window.addEventListener('mouseup', () => { this._isDragging = false; });

    c.addEventListener('click', (e) => {
      const node = this._hitTest(e);
      this.selectedNode = node;
      bus.emit('map:select', { nodeId: node, source: 'underground' });
      if (node) {
        bus.emit('node:detail', { nodeId: node, sensor: this.sensorData[node] });
      }
    });
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth || 800;
    const h = parent.clientHeight || 600;

    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this._logicalW = w;
    this._logicalH = h;

    if (!this._fitted && w > 50 && h > 50) {
      const scaleX = w / WORLD.width;
      const scaleY = h / WORLD.height;
      this.camera.zoom = Math.min(scaleX, scaleY) * 0.94;
      this.camera._targetZoom = this.camera.zoom;
      this.camera.x = -(w / this.camera.zoom - WORLD.width) / 2;
      this.camera.y = -(h / this.camera.zoom - WORLD.height) / 2;
      this.camera._targetX = this.camera.x;
      this.camera._targetY = this.camera.y;
      this._fitted = true;
    }
  }

  _handleHover(e) {
    const node = this._hitTest(e);
    this.hoveredNode = node;
    this.canvas.style.cursor = node ? 'pointer' : 'grab';

    if (node) {
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
      const hitR = 20 / this.camera.zoom;
      if (dist(world.x, world.y, node.x, node.y) < hitR) {
        return id;
      }
    }
    return null;
  }

  zoomIn() {
    this.camera._targetZoom = clamp(this.camera.zoom * 1.3, 0.35, 6);
    this.camera._animating = true;
  }

  zoomOut() {
    this.camera._targetZoom = clamp(this.camera.zoom / 1.3, 0.35, 6);
    this.camera._animating = true;
  }

  resetView() {
    this._fitted = false;
    this._resize();
  }

  render(timestamp) {
    this._time = timestamp;
    this.camera.update();

    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    const w = this._logicalW || (this.canvas.width / dpr);
    const h = this._logicalH || (this.canvas.height / dpr);

    // 1. Crystal Clear Background (Clearing all physical pixels to eliminate ghosting)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.ugBackground;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Apply Camera Transform with DPR for Razor-Sharp Vectors
    this.camera.apply(ctx, dpr);

    // 3. Render High-Res Grid
    this._drawGrid(ctx);

    // 4. Render Pipes
    if (this._showLayers.pipes) this._drawPipes(ctx);

    // 5. Render Fluid Water Particles
    if (this._showLayers.particles) this._drawParticles(ctx);

    // 6. Flow Direction Arrows
    if (this._showLayers.arrows) this._drawArrows(ctx);

    // 7. IoT Nodes & Manholes
    if (this._showLayers.sensors) this._drawNodes(ctx);

    // 8. Labels
    if (this._showLayers.labels) this._drawLabels(ctx);

    // 9. Background Zone Watermarks
    this._drawZoneWatermarks(ctx);

    // 10. Reset transform with DPR for HUD Overlay
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawLegend(ctx, w, h);
    this._drawCompass(ctx, w);
  }

  _drawGrid(ctx) {
    ctx.strokeStyle = COLORS.ugGrid;
    ctx.lineWidth = 0.6;
    const step = 50;
    for (let x = 0; x <= WORLD.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
    }
  }

  _drawPipes(ctx) {
    for (const pipe of PIPES) {
      const from = NODES[pipe.from];
      const to   = NODES[pipe.to];
      const diam = PIPE_DIAMETERS[pipe.diameter];
      const state = this.segmentStates[pipe.id] || 'normal';

      let color = COLORS.pipeNormal;
      let glowColor = COLORS.pipeNormalGlow;
      let glowSize = 4;

      if (state === 'danger') {
        const pulse = 0.6 + Math.sin(this._time * 0.005) * 0.4;
        color = COLORS.pipeDanger;
        glowColor = COLORS.pipeDangerGlow;
        glowSize = 12 + pulse * 10;
      } else if (state === 'warning') {
        const pulse = 0.7 + Math.sin(this._time * 0.004) * 0.3;
        color = COLORS.pipeWarning;
        glowColor = COLORS.pipeWarningGlow;
        glowSize = 8 + pulse * 6;
      }

      // Outer glow
      ctx.save();
      setGlow(ctx, glowColor, glowSize);
      ctx.strokeStyle = color;
      ctx.lineWidth = diam.drawWidth + 4;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();

      // Main pipe body
      ctx.save();
      setGlow(ctx, glowColor, glowSize * 0.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = diam.drawWidth;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();

      // Inner stream highlight
      ctx.save();
      clearGlow(ctx);
      ctx.strokeStyle = hexAlpha('#ffffff', 0.4);
      ctx.lineWidth = Math.max(2, diam.drawWidth * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();

      // Selected pipe highlight
      if (this.selectedNode && (pipe.from === this.selectedNode || pipe.to === this.selectedNode)) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = diam.drawWidth + 6;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      const state = this.segmentStates[p.pipeId] || 'normal';
      let flowMult = 1.0;
      let color = COLORS.particleNormal;

      if (state === 'danger') {
        flowMult = 0.02; // flow blocked / stagnant
        color = COLORS.particleDanger;
      } else if (state === 'warning') {
        flowMult = 0.35; // flow slowed down
        color = COLORS.particleWarning;
      }

      p.update(flowMult);
      const pos = p.getPos();

      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = p.alpha * (0.75 + Math.sin(this._time * 0.005 + p.t * 8) * 0.25);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawArrows(ctx) {
    for (const pipe of PIPES) {
      const from = NODES[pipe.from];
      const to   = NODES[pipe.to];
      const state = this.segmentStates[pipe.id] || 'normal';

      let arrowColor = hexAlpha(COLORS.pipeNormal, 0.55);
      if (state === 'danger') {
        arrowColor = hexAlpha(COLORS.pipeDanger, 0.7);
      } else if (state === 'warning') {
        arrowColor = hexAlpha(COLORS.pipeWarning, 0.7);
      }

      drawFlowArrow(ctx, from.x, from.y, to.x, to.y, 0.5, 6, arrowColor);
    }
  }

  _drawNodes(ctx) {
    for (const [id, node] of Object.entries(NODES)) {
      const isHovered = this.hoveredNode === id;
      const isSelected = this.selectedNode === id;

      // Determine state from adjacent pipes
      let nodeState = 'normal';
      for (const pipe of PIPES) {
        if (pipe.from === id || pipe.to === id) {
          const s = this.segmentStates[pipe.id];
          if (s === 'danger') {
            nodeState = 'danger';
            break;
          } else if (s === 'warning' && nodeState !== 'danger') {
            nodeState = 'warning';
          }
        }
      }

      let fillColor, strokeColor, glowColor;
      if (nodeState === 'danger') {
        fillColor = COLORS.sensorDanger;
        strokeColor = COLORS.pipeDangerGlow;
        glowColor = COLORS.pipeDangerGlow;

        // Pulsing Danger Rings
        ctx.save();
        const ringR = 18 + ((this._time * 0.03) % 28);
        const ringAlpha = Math.max(0, 1 - ringR / 46);
        ctx.beginPath();
        ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(COLORS.pipeDanger, ringAlpha * 0.45);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else if (nodeState === 'warning') {
        fillColor = COLORS.sensorWarning;
        strokeColor = COLORS.pipeWarningGlow;
        glowColor = COLORS.pipeWarningGlow;
      } else {
        fillColor = node.type === 'sensor' ? COLORS.sensorNormal : COLORS.manholeNormal;
        strokeColor = COLORS.sensorGlow;
        glowColor = COLORS.sensorGlow;
      }

      const pulse = isHovered || isSelected ? 1.3 : 1.0 + Math.sin(this._time * 0.003 + node.x * 0.01) * 0.08;

      ctx.save();

      if (node.type === 'sensor') {
        const r = NODE_SIZES.sensor.radius * pulse;
        setGlow(ctx, glowColor, isSelected ? 16 : 8);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = NODE_SIZES.sensor.outline;
        ctx.stroke();

        clearGlow(ctx);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
      } else if (node.type === 'manhole') {
        const s = NODE_SIZES.manhole.size * pulse;
        setGlow(ctx, glowColor, isSelected ? 16 : 6);
        ctx.fillStyle = fillColor;
        ctx.fillRect(node.x - s / 2, node.y - s / 2, s, s);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = NODE_SIZES.manhole.outline;
        ctx.strokeRect(node.x - s / 2, node.y - s / 2, s, s);
      } else if (node.type === 'junction') {
        const s = NODE_SIZES.junction.size * pulse;
        setGlow(ctx, glowColor, isSelected ? 16 : 6);
        drawDiamond(ctx, node.x, node.y, s * 0.6);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = NODE_SIZES.junction.outline;
        ctx.stroke();
      } else if (node.type === 'outfall') {
        const s = NODE_SIZES.outfall.size * pulse;
        setGlow(ctx, '#22c55e', 12);
        ctx.beginPath();
        ctx.arc(node.x, node.y, s * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#14532d';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      if (isSelected) {
        clearGlow(ctx);
        ctx.beginPath();
        ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
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

  _drawLabels(ctx) {
    ctx.save();
    ctx.font = '500 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const [id, node] of Object.entries(NODES)) {
      ctx.fillStyle = this.hoveredNode === id || this.selectedNode === id
        ? '#ffffff' : hexAlpha('#e2e8f0', 0.75);
      ctx.fillText(id, node.x, node.y + 16);
    }
    ctx.restore();
  }

  _drawZoneWatermarks(ctx) {
    const zones = [
      { text: 'NORTH RESIDENTIAL AREA', x: 150, y: 50 },
      { text: 'CITY PARK', x: 470, y: 50 },
      { text: 'NORTH RESIDENTIAL AREA', x: 790, y: 50 },
      { text: 'COMMERCIAL\nZONE', x: 150, y: 230 },
      { text: 'GOVERNMENT\nOFFICE COMPLEX', x: 460, y: 230 },
      { text: 'HOSPITAL\nZONE', x: 830, y: 230 },
      { text: 'WEST RESIDENTIAL\nAREA', x: 150, y: 480 },
      { text: 'BUS TERMINAL', x: 460, y: 480 },
      { text: 'SCHOOL ZONE\n(🏫 ACCESS)', x: 830, y: 480 },
      { text: 'MARKET AREA', x: 460, y: 710 },
      { text: 'LAKE VIEW', x: 100, y: 760 },
    ];

    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(126, 200, 227, 0.16)';

    for (const z of zones) {
      const lines = z.text.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, z.x, z.y + i * 14);
      });
    }
    ctx.restore();
  }

  _drawLegend(ctx, w, h) {
    const lx = w - 180, ly = h - 185;
    const lw = 170, lh = 175;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 18, 36, 0.9)';
    ctx.strokeStyle = 'rgba(100, 170, 235, 0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, lx, ly, lw, lh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#7ec8e3';
    ctx.fillText('DRAINAGE LEGEND', lx + 12, ly + 18);

    const items = [
      { type: 'circle', color: COLORS.sensorNormal, label: 'IoT Sensor Node' },
      { type: 'rect', color: COLORS.manholeNormal, label: 'Manhole / Access Pt' },
      { type: 'diamond', color: COLORS.junctionNormal, label: 'Pipeline Junction' },
      { type: 'line', color: COLORS.pipeNormal, label: 'Normal Flow (Blue)' },
      { type: 'line', color: COLORS.pipeWarning, label: 'Backup Flow (Orange)' },
      { type: 'line', color: COLORS.pipeDanger, label: 'Blockage / Flood (Red)' },
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
      y += 20;
    }

    ctx.restore();
  }

  _drawCompass(ctx, w) {
    const cx = w - 36, cy = 48, r = 18;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 18, 36, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 170, 235, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - r + 2);
    ctx.lineTo(cx - 5, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();

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
    ctx.fillText('N', cx, cy - r - 5);

    ctx.restore();
  }
}
