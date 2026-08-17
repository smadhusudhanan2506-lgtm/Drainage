// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Above-Ground City Map (Canvas)
// ─────────────────────────────────────────────────────────────

import { NODES, PIPES, ZONES, ROADS, COLORS, WORLD, SEGMENT_STATES, NODE_SIZES } from './config.js';
import { bus, Camera, setGlow, clearGlow, dist, hexAlpha, lerpColor, clamp, roundRect } from './utils.js';

/* ── Building data (procedurally placed inside zones) ──────── */
function generateBuildings() {
  const buildings = [];
  const seed = 42;
  let rng = seed;
  const rand = () => { rng = (rng * 16807 + 0) % 2147483647; return rng / 2147483647; };

  for (const zone of ZONES) {
    if (zone.type === 'lake' || zone.type === 'river') continue;
    const count = zone.type === 'park' ? 3 : Math.floor((zone.w * zone.h) / 2800) + 2;
    const margin = 12;

    for (let i = 0; i < count; i++) {
      const bw = 18 + rand() * 30;
      const bh = 14 + rand() * 25;
      const bx = zone.x + margin + rand() * Math.max(0, zone.w - 2 * margin - bw);
      const by = zone.y + margin + rand() * Math.max(0, zone.h - 2 * margin - bh);
      buildings.push({ x: bx, y: by, w: bw, h: bh, zoneType: zone.type });
    }
  }
  return buildings;
}

/* ── Tree data (parks / residential) ───────────────────────── */
function generateTrees() {
  const trees = [];
  let rng = 99;
  const rand = () => { rng = (rng * 16807 + 0) % 2147483647; return rng / 2147483647; };

  for (const zone of ZONES) {
    if (zone.type !== 'park' && zone.type !== 'residential') continue;
    const count = zone.type === 'park' ? 12 : 5;
    for (let i = 0; i < count; i++) {
      trees.push({
        x: zone.x + 8 + rand() * (zone.w - 16),
        y: zone.y + 8 + rand() * (zone.h - 16),
        r: 4 + rand() * 4,
      });
    }
  }
  return trees;
}

const BUILDINGS = generateBuildings();
const TREES = generateTrees();

/* ── Above Ground Map ──────────────────────────────────────── */
export class AboveGroundMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera(WORLD.width, WORLD.height);
    this.hoveredNode = null;
    this.selectedNode = null;
    this.sensorData = {};
    this.segmentStates = {};
    this._time = 0;
    this._isDragging = false;
    this._dragStart = { x: 0, y: 0 };

    this._bindEvents();
    this._resize();

    // Listen for telemetry
    bus.on('telemetry:update', (data) => {
      this.sensorData = data.sensors;
      this.segmentStates = data.segments;
    });

    // Listen for selection from other map
    bus.on('map:select', (data) => {
      if (data.source !== 'aboveground') {
        this.selectedNode = data.nodeId;
        if (data.nodeId) {
          const n = NODES[data.nodeId];
          if (n) this.camera.animateTo(n.x, n.y, 2.2, this.canvas.width, this.canvas.height);
        }
      }
    });
  }

  /* ── Events ──────────────────────────────────────────────── */
  _bindEvents() {
    const c = this.canvas;

    const ro = new ResizeObserver(() => this._resize());
    ro.observe(c.parentElement);

    c.addEventListener('wheel', (e) => this.camera.handleWheel(e, c.width, c.height), { passive: false });

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

    c.addEventListener('click', (e) => {
      const node = this._hitTest(e);
      this.selectedNode = node;
      bus.emit('map:select', { nodeId: node, source: 'aboveground' });
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
      const hitR = 18 / this.camera.zoom;
      if (dist(world.x, world.y, node.x, node.y) < hitR) {
        return id;
      }
    }
    return null;
  }

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

  /* ── Render ──────────────────────────────────────────────── */
  render(timestamp) {
    this._time = timestamp;
    this.camera.update();

    const ctx = this.ctx;
    const w = this._logicalW;
    const h = this._logicalH;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.agBackground;
    ctx.fillRect(0, 0, w, h);

    // Apply camera
    this.camera.apply(ctx);

    // City elements
    this._drawZones(ctx);
    this._drawRoads(ctx);
    this._drawBuildings(ctx);
    this._drawTrees(ctx);
    this._drawLakeAndRiver(ctx);
    this._drawZoneLabels(ctx);

    // Surface indicators
    this._drawSurfaceNodes(ctx);

    // Reset for HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this._drawLegend(ctx, w, h);
    this._drawCompass(ctx, w);
  }

  /* ── Zones ───────────────────────────────────────────────── */
  _drawZones(ctx) {
    for (const zone of ZONES) {
      if (zone.type === 'lake' || zone.type === 'river') continue;

      let fillColor;
      switch (zone.type) {
        case 'park':       fillColor = 'rgba(26, 77, 46, 0.4)'; break;
        case 'residential': fillColor = 'rgba(61, 53, 40, 0.3)'; break;
        case 'commercial': fillColor = 'rgba(45, 53, 72, 0.3)'; break;
        case 'government': fillColor = 'rgba(45, 48, 64, 0.35)'; break;
        case 'hospital':   fillColor = 'rgba(61, 40, 40, 0.3)'; break;
        case 'bus_terminal': fillColor = 'rgba(45, 53, 53, 0.3)'; break;
        case 'market':     fillColor = 'rgba(61, 50, 40, 0.3)'; break;
        default:           fillColor = 'rgba(40, 40, 50, 0.25)';
      }

      ctx.save();
      roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 6);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 160, 220, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ── Roads ───────────────────────────────────────────────── */
  _drawRoads(ctx) {
    for (const road of ROADS) {
      // Road base
      ctx.save();
      ctx.strokeStyle = '#3d4a5c';
      ctx.lineWidth = road.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();

      // Road surface
      ctx.strokeStyle = '#4a5970';
      ctx.lineWidth = road.width - 4;
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();

      // Center line (dashed)
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    }

    // Road intersection fills
    const intersections = [
      { x: 370, y: 110 }, { x: 370, y: 360 }, { x: 370, y: 600 }, { x: 370, y: 820 },
      { x: 710, y: 360 }, { x: 710, y: 600 }, { x: 710, y: 820 },
    ];

    for (const pt of intersections) {
      ctx.save();
      ctx.fillStyle = '#4a5970';
      ctx.fillRect(pt.x - 16, pt.y - 16, 32, 32);
      ctx.restore();
    }
  }

  /* ── Buildings ───────────────────────────────────────────── */
  _drawBuildings(ctx) {
    for (const b of BUILDINGS) {
      let fillColor;
      switch (b.zoneType) {
        case 'residential':   fillColor = '#3a3530'; break;
        case 'commercial':    fillColor = '#2f3648'; break;
        case 'government':    fillColor = '#343848'; break;
        case 'hospital':      fillColor = '#3d3035'; break;
        case 'bus_terminal':  fillColor = '#2d3838'; break;
        case 'market':        fillColor = '#3d3530'; break;
        case 'park':          fillColor = '#2d4030'; break;
        default:              fillColor = '#2d3040';
      }

      ctx.save();
      ctx.fillStyle = fillColor;
      roundRect(ctx, b.x, b.y, b.w, b.h, 2);
      ctx.fill();

      // Building edge highlight
      ctx.strokeStyle = 'rgba(160, 180, 200, 0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }

    // Special building: Hospital cross
    const hospZone = ZONES.find(z => z.id === 'hospital');
    if (hospZone) {
      const cx = hospZone.x + hospZone.w / 2;
      const cy = hospZone.y + hospZone.h / 2 - 10;
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.fillRect(cx - 3, cy - 10, 6, 20);
      ctx.fillRect(cx - 10, cy - 3, 20, 6);
      ctx.restore();
    }
  }

  /* ── Trees ───────────────────────────────────────────────── */
  _drawTrees(ctx) {
    for (const tree of TREES) {
      ctx.save();
      const sway = Math.sin(this._time * 0.001 + tree.x * 0.1) * 0.5;

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.ellipse(tree.x + 1, tree.y + tree.r * 0.3, tree.r * 0.8, tree.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Canopy
      ctx.fillStyle = `rgba(40, ${90 + Math.floor(sway * 10)}, 50, 0.7)`;
      ctx.beginPath();
      ctx.arc(tree.x + sway, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = 'rgba(80, 160, 80, 0.3)';
      ctx.beginPath();
      ctx.arc(tree.x + sway - tree.r * 0.2, tree.y - tree.r * 0.2, tree.r * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /* ── Lake & River ────────────────────────────────────────── */
  _drawLakeAndRiver(ctx) {
    // Lake
    const lake = ZONES.find(z => z.id === 'lake-view');
    if (lake) {
      ctx.save();
      const wave = Math.sin(this._time * 0.002) * 2;

      // Lake shape (organic blob)
      ctx.beginPath();
      ctx.moveTo(lake.x + 20, lake.y + 30);
      ctx.bezierCurveTo(lake.x - 5, lake.y + 50, lake.x + 10, lake.y + lake.h - 20, lake.x + 40, lake.y + lake.h - 10);
      ctx.bezierCurveTo(lake.x + 80, lake.y + lake.h + 5, lake.x + lake.w - 20, lake.y + lake.h - 30, lake.x + lake.w - 10, lake.y + lake.h / 2 + wave);
      ctx.bezierCurveTo(lake.x + lake.w + 5, lake.y + 50, lake.x + lake.w - 30, lake.y + 20, lake.x + 80, lake.y + 15);
      ctx.bezierCurveTo(lake.x + 40, lake.y + 10, lake.x + 30, lake.y + 20, lake.x + 20, lake.y + 30);
      ctx.closePath();

      const grad = ctx.createRadialGradient(
        lake.x + lake.w / 2, lake.y + lake.h / 2, 10,
        lake.x + lake.w / 2, lake.y + lake.h / 2, lake.w * 0.6
      );
      grad.addColorStop(0, 'rgba(30, 90, 130, 0.8)');
      grad.addColorStop(1, 'rgba(20, 60, 100, 0.6)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Wave lines
      ctx.strokeStyle = 'rgba(100, 180, 220, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const wy = lake.y + 50 + i * 30 + Math.sin(this._time * 0.003 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(lake.x + 20, wy);
        ctx.quadraticCurveTo(lake.x + lake.w / 2, wy + 5, lake.x + lake.w - 20, wy);
        ctx.stroke();
      }

      ctx.restore();
    }

    // River outfall
    const river = ZONES.find(z => z.id === 'river');
    if (river) {
      ctx.save();
      const wave = Math.sin(this._time * 0.002) * 3;

      // River flow path
      ctx.beginPath();
      ctx.moveTo(river.x, river.y);
      ctx.bezierCurveTo(river.x + 30, river.y + 20 + wave, river.x + 80, river.y + 10, river.x + river.w, river.y + 40);
      ctx.lineTo(river.x + river.w, river.y + river.h);
      ctx.bezierCurveTo(river.x + 80, river.y + river.h - 10, river.x + 30, river.y + river.h - wave, river.x, river.y + 60);
      ctx.closePath();

      const grad = ctx.createLinearGradient(river.x, river.y, river.x + river.w, river.y);
      grad.addColorStop(0, 'rgba(30, 90, 130, 0.6)');
      grad.addColorStop(1, 'rgba(20, 70, 110, 0.4)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.restore();
    }
  }

  /* ── Zone Labels ─────────────────────────────────────────── */
  _drawZoneLabels(ctx) {
    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(200, 215, 230, 0.6)';

    for (const zone of ZONES) {
      const cx = zone.x + zone.w / 2;
      const cy = zone.y + zone.h / 2;
      const lines = zone.label.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * 14);
      });
    }

    // Road labels
    ctx.font = '500 8px Inter, sans-serif';
    ctx.fillStyle = 'rgba(180, 195, 210, 0.35)';
    for (const road of ROADS) {
      const mx = (road.x1 + road.x2) / 2;
      const my = (road.y1 + road.y2) / 2;
      const isVertical = road.x1 === road.x2;

      ctx.save();
      ctx.translate(mx, my);
      if (isVertical) ctx.rotate(-Math.PI / 2);
      ctx.fillText(road.label, 0, isVertical ? -road.width / 2 - 6 : -road.width / 2 - 6);
      ctx.restore();
    }

    ctx.restore();
  }

  /* ── Surface Sensor Nodes ────────────────────────────────── */
  _drawSurfaceNodes(ctx) {
    for (const [id, node] of Object.entries(NODES)) {
      const isHovered = this.hoveredNode === id;
      const isSelected = this.selectedNode === id;
      const data = this.sensorData[id];

      // Determine node state
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

      // Danger: expanding alert radius rings
      if (nodeState === 'danger') {
        for (let ring = 0; ring < 3; ring++) {
          const phase = ((this._time * 0.002) + ring * 0.33) % 1;
          const radius = 15 + phase * 40;
          const alpha = Math.max(0, (1 - phase) * 0.35);

          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(COLORS.pipeDanger, alpha);
          ctx.lineWidth = 2;
          ctx.stroke();

          // Fill with very subtle red
          ctx.fillStyle = hexAlpha(COLORS.pipeDanger, alpha * 0.08);
          ctx.fill();
          ctx.restore();
        }
      }

      // Normal: subtle pulse
      const pulse = 1.0 + Math.sin(this._time * 0.003 + node.x * 0.01) * 0.1;
      const scale = (isHovered || isSelected) ? 1.4 : pulse;

      let fillColor, strokeColor, glowColor;
      if (nodeState === 'danger') {
        fillColor = COLORS.sensorDanger;
        strokeColor = COLORS.pipeDangerGlow;
        glowColor = COLORS.pipeDangerGlow;
      } else if (nodeState === 'warning') {
        fillColor = COLORS.sensorWarning;
        strokeColor = '#fbbf24';
        glowColor = COLORS.pipeWarning;
      } else {
        fillColor = COLORS.sensorNormal;
        strokeColor = COLORS.sensorGlow;
        glowColor = COLORS.sensorGlow;
      }

      ctx.save();

      if (node.type === 'sensor') {
        const r = 8 * scale;
        setGlow(ctx, glowColor, isSelected ? 16 : 8);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        clearGlow(ctx);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
      } else if (node.type === 'manhole') {
        const s = 14 * scale;
        setGlow(ctx, glowColor, isSelected ? 16 : 6);
        ctx.fillStyle = fillColor;
        ctx.fillRect(node.x - s / 2, node.y - s / 2, s, s);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(node.x - s / 2, node.y - s / 2, s, s);
      } else if (node.type === 'junction') {
        const s = 12 * scale;
        setGlow(ctx, glowColor, isSelected ? 16 : 6);
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.fillRect(node.x - s / 2, node.y - s / 2, s, s);
        ctx.strokeRect(node.x - s / 2, node.y - s / 2, s, s);

        // Cross pattern for junction
        clearGlow(ctx);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(node.x - s / 3, node.y);
        ctx.lineTo(node.x + s / 3, node.y);
        ctx.moveTo(node.x, node.y - s / 3);
        ctx.lineTo(node.x, node.y + s / 3);
        ctx.stroke();
      } else if (node.type === 'outfall') {
        const r = 10 * scale;
        setGlow(ctx, '#22c55e', 12);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(26, 77, 46, 0.8)';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Selection ring
      if (isSelected) {
        clearGlow(ctx);
        ctx.beginPath();
        ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -this._time * 0.02;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // Label
      ctx.save();
      ctx.font = '500 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHovered || isSelected ? '#ffffff' : 'rgba(200, 215, 230, 0.65)';
      ctx.fillText(id, node.x, node.y + 14);
      ctx.restore();
    }
  }

  /* ── Legend ──────────────────────────────────────────────── */
  _drawLegend(ctx, w, h) {
    const lx = w - 175, ly = h - 130;
    const lw = 165, lh = 120;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 16, 36, 0.88)';
    ctx.strokeStyle = 'rgba(100, 160, 220, 0.2)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#7ec8e3';
    ctx.fillText('LEGEND', lx + 12, ly + 18);

    const items = [
      { type: 'circle', color: COLORS.sensorNormal, label: 'IoT Sensor (S)' },
      { type: 'rect', color: COLORS.manholeNormal, label: 'Manhole (MH)' },
      { type: 'rect', color: COLORS.junctionNormal, label: 'Junction (J)' },
      { type: 'circle', color: COLORS.sensorDanger, label: 'Alert / Blockage' },
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
      } else {
        ctx.fillStyle = item.color;
        ctx.fillRect(ix - 4, iy - 4, 8, 8);
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
    ctx.fillText('N', cx, cy - r - 6);

    ctx.restore();
  }
}
