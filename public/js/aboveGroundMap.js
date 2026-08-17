// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Above-Ground City Map (Canvas)
// ─────────────────────────────────────────────────────────────

import { NODES, PIPES, ZONES, ROADS, COLORS, WORLD, NODE_SIZES } from './config.js';
import { bus, Camera, setGlow, clearGlow, dist, hexAlpha, clamp, roundRect } from './utils.js';

function generateBuildings() {
  const buildings = [];
  let rng = 42;
  const rand = () => { rng = (rng * 16807 + 0) % 2147483647; return rng / 2147483647; };

  for (const zone of ZONES) {
    if (zone.type === 'lake' || zone.type === 'river') continue;
    const count = zone.type === 'park' ? 3 : zone.type === 'school' ? 4 : Math.floor((zone.w * zone.h) / 2800) + 2;
    const margin = 14;

    for (let i = 0; i < count; i++) {
      const bw = 20 + rand() * 32;
      const bh = 16 + rand() * 26;
      const bx = zone.x + margin + rand() * Math.max(0, zone.w - 2 * margin - bw);
      const by = zone.y + margin + rand() * Math.max(0, zone.h - 2 * margin - bh);
      buildings.push({ x: bx, y: by, w: bw, h: bh, zoneType: zone.type });
    }
  }
  return buildings;
}

function generateTrees() {
  const trees = [];
  let rng = 99;
  const rand = () => { rng = (rng * 16807 + 0) % 2147483647; return rng / 2147483647; };

  for (const zone of ZONES) {
    if (zone.type !== 'park' && zone.type !== 'residential' && zone.type !== 'school') continue;
    const count = zone.type === 'park' ? 14 : zone.type === 'school' ? 8 : 5;
    for (let i = 0; i < count; i++) {
      trees.push({
        x: zone.x + 8 + rand() * (zone.w - 16),
        y: zone.y + 8 + rand() * (zone.h - 16),
        r: 4.5 + rand() * 4,
      });
    }
  }
  return trees;
}

const BUILDINGS = generateBuildings();
const TREES = generateTrees();

export class AboveGroundMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = new Camera(WORLD.width, WORLD.height);
    this.hoveredNode = null;
    this.selectedNode = null;
    this.sensorData = {};
    this.segmentStates = {};
    this.dpr = window.devicePixelRatio || 1;
    this._time = 0;
    this._isDragging = false;
    this._dragStart = { x: 0, y: 0 };

    this._bindEvents();
    this._resize();

    bus.on('telemetry:update', (data) => {
      this.sensorData = data.sensors;
      this.segmentStates = data.segments;
    });

    bus.on('map:select', (data) => {
      if (data.source !== 'aboveground') {
        this.selectedNode = data.nodeId;
        if (data.nodeId) {
          const n = NODES[data.nodeId];
          if (n) this.camera.animateTo(n.x, n.y, 2.2, this._logicalW || this.canvas.width, this._logicalH || this.canvas.height);
        }
      }
    });
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
      bus.emit('map:select', { nodeId: node, source: 'aboveground' });
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
    ctx.fillStyle = COLORS.agBackground;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Apply Camera Transform with DPR for Razor-Sharp Vectors
    this.camera.apply(ctx, dpr);

    // 3. City Layers
    this._drawZones(ctx);
    this._drawRoads(ctx);
    this._drawBuildings(ctx);
    this._drawTrees(ctx);
    this._drawLakeAndRiver(ctx);
    this._drawZoneLabels(ctx);

    // 4. Surface Sensor Indicators (Clean blue by default, expanding red/orange on flood)
    this._drawSurfaceNodes(ctx);

    // 5. Reset transform with DPR for HUD Overlay
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawLegend(ctx, w, h);
    this._drawCompass(ctx, w);
  }

  _drawZones(ctx) {
    for (const zone of ZONES) {
      if (zone.type === 'lake' || zone.type === 'river') continue;

      let fillColor;
      switch (zone.type) {
        case 'park':        fillColor = 'rgba(21, 67, 41, 0.45)'; break;
        case 'school':      fillColor = 'rgba(63, 53, 41, 0.42)'; break;
        case 'residential': fillColor = 'rgba(52, 47, 43, 0.35)'; break;
        case 'commercial':  fillColor = 'rgba(40, 49, 66, 0.38)'; break;
        case 'government':  fillColor = 'rgba(43, 46, 60, 0.42)'; break;
        case 'hospital':    fillColor = 'rgba(61, 40, 40, 0.38)'; break;
        case 'bus_terminal':fillColor = 'rgba(40, 50, 54, 0.38)'; break;
        case 'market':      fillColor = 'rgba(56, 48, 40, 0.38)'; break;
        default:            fillColor = 'rgba(38, 44, 58, 0.3)';
      }

      ctx.save();
      roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 6);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 170, 235, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawRoads(ctx) {
    for (const road of ROADS) {
      ctx.save();
      ctx.strokeStyle = '#2b3545';
      ctx.lineWidth = road.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();

      ctx.strokeStyle = '#3b4859';
      ctx.lineWidth = road.width - 4;
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();

      // Dashed lane divider
      ctx.strokeStyle = 'rgba(220, 230, 245, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    const intersections = [
      { x: 370, y: 110 }, { x: 370, y: 360 }, { x: 370, y: 600 }, { x: 370, y: 820 },
      { x: 710, y: 360 }, { x: 710, y: 600 }, { x: 710, y: 820 },
    ];

    for (const pt of intersections) {
      ctx.save();
      ctx.fillStyle = '#3b4859';
      ctx.fillRect(pt.x - 16, pt.y - 16, 32, 32);
      ctx.restore();
    }
  }

  _drawBuildings(ctx) {
    for (const b of BUILDINGS) {
      let fillColor;
      switch (b.zoneType) {
        case 'school':        fillColor = '#4a3e32'; break;
        case 'residential':   fillColor = '#38322d'; break;
        case 'commercial':    fillColor = '#2d374a'; break;
        case 'government':    fillColor = '#33384a'; break;
        case 'hospital':      fillColor = '#3d2e34'; break;
        case 'bus_terminal':  fillColor = '#2b3638'; break;
        case 'market':        fillColor = '#3a322c'; break;
        case 'park':          fillColor = '#26382b'; break;
        default:              fillColor = '#2c3342';
      }

      ctx.save();
      ctx.fillStyle = fillColor;
      roundRect(ctx, b.x, b.y, b.w, b.h, 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(160, 190, 220, 0.15)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.restore();
    }

    // Hospital Red Cross
    const hospZone = ZONES.find(z => z.id === 'hospital');
    if (hospZone) {
      const cx = hospZone.x + hospZone.w / 2;
      const cy = hospZone.y + hospZone.h / 2 - 10;
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.fillRect(cx - 3, cy - 10, 6, 20);
      ctx.fillRect(cx - 10, cy - 3, 20, 6);
      ctx.restore();
    }

    // School Zone Flag/Sign
    const schoolZone = ZONES.find(z => z.id === 'school-zone');
    if (schoolZone) {
      const cx = schoolZone.x + schoolZone.w / 2;
      const cy = schoolZone.y + 24;
      ctx.save();
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏫', cx, cy);
      ctx.restore();
    }
  }

  _drawTrees(ctx) {
    for (const tree of TREES) {
      ctx.save();
      const sway = Math.sin(this._time * 0.001 + tree.x * 0.1) * 0.6;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.beginPath();
      ctx.ellipse(tree.x + 1, tree.y + tree.r * 0.3, tree.r * 0.8, tree.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(32, ${95 + Math.floor(sway * 10)}, 48, 0.75)`;
      ctx.beginPath();
      ctx.arc(tree.x + sway, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(90, 180, 90, 0.35)';
      ctx.beginPath();
      ctx.arc(tree.x + sway - tree.r * 0.2, tree.y - tree.r * 0.2, tree.r * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  _drawLakeAndRiver(ctx) {
    const lake = ZONES.find(z => z.id === 'lake-view');
    if (lake) {
      ctx.save();
      const wave = Math.sin(this._time * 0.002) * 2;

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
      grad.addColorStop(0, 'rgba(25, 80, 120, 0.85)');
      grad.addColorStop(1, 'rgba(15, 50, 85, 0.7)');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(100, 180, 230, 0.22)';
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

    const river = ZONES.find(z => z.id === 'river');
    if (river) {
      ctx.save();
      const wave = Math.sin(this._time * 0.002) * 3;

      ctx.beginPath();
      ctx.moveTo(river.x, river.y);
      ctx.bezierCurveTo(river.x + 30, river.y + 20 + wave, river.x + 80, river.y + 10, river.x + river.w, river.y + 40);
      ctx.lineTo(river.x + river.w, river.y + river.h);
      ctx.bezierCurveTo(river.x + 80, river.y + river.h - 10, river.x + 30, river.y + river.h - wave, river.x, river.y + 60);
      ctx.closePath();

      const grad = ctx.createLinearGradient(river.x, river.y, river.x + river.w, river.y);
      grad.addColorStop(0, 'rgba(25, 80, 120, 0.7)');
      grad.addColorStop(1, 'rgba(15, 60, 95, 0.5)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
  }

  _drawZoneLabels(ctx) {
    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(215, 230, 245, 0.7)';

    for (const zone of ZONES) {
      const cx = zone.x + zone.w / 2;
      const cy = zone.y + zone.h / 2;
      const lines = zone.label.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * 14);
      });
    }

    // Road street names
    ctx.font = '500 8px Inter, sans-serif';
    ctx.fillStyle = 'rgba(190, 210, 230, 0.4)';
    for (const road of ROADS) {
      const mx = (road.x1 + road.x2) / 2;
      const my = (road.y1 + road.y2) / 2;
      const isVertical = road.x1 === road.x2;

      ctx.save();
      ctx.translate(mx, my);
      if (isVertical) ctx.rotate(-Math.PI / 2);
      ctx.fillText(road.label, 0, -road.width / 2 - 6);
      ctx.restore();
    }
    ctx.restore();
  }

  _drawSurfaceNodes(ctx) {
    for (const [id, node] of Object.entries(NODES)) {
      const isHovered = this.hoveredNode === id;
      const isSelected = this.selectedNode === id;

      // Check node status from connected drainage pipes
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

      // Danger: Expanding flood alert hazard waves
      if (nodeState === 'danger') {
        for (let ring = 0; ring < 3; ring++) {
          const phase = ((this._time * 0.002) + ring * 0.33) % 1;
          const radius = 14 + phase * 38;
          const alpha = Math.max(0, (1 - phase) * 0.4);

          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(COLORS.pipeDanger, alpha);
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = hexAlpha(COLORS.pipeDanger, alpha * 0.1);
          ctx.fill();
          ctx.restore();
        }
      } else if (nodeState === 'warning') {
        // Warning: Expanding subtle orange pulse
        const phase = (this._time * 0.0015) % 1;
        const radius = 12 + phase * 22;
        const alpha = Math.max(0, (1 - phase) * 0.35);

        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(COLORS.pipeWarning, alpha);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      const pulse = 1.0 + Math.sin(this._time * 0.003 + node.x * 0.01) * 0.1;
      const scale = (isHovered || isSelected) ? 1.4 : pulse;

      let fillColor, strokeColor, glowColor;
      if (nodeState === 'danger') {
        fillColor = COLORS.sensorDanger;
        strokeColor = COLORS.pipeDangerGlow;
        glowColor = COLORS.pipeDangerGlow;
      } else if (nodeState === 'warning') {
        fillColor = COLORS.sensorWarning;
        strokeColor = COLORS.pipeWarningGlow;
        glowColor = COLORS.pipeWarningGlow;
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
        ctx.arc(node.x, node.y, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
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
      } else if (node.type === 'outfall') {
        const r = 10 * scale;
        setGlow(ctx, '#22c55e', 12);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20, 83, 45, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

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

      ctx.save();
      ctx.font = '500 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHovered || isSelected ? '#ffffff' : 'rgba(215, 230, 245, 0.75)';
      ctx.fillText(id, node.x, node.y + 14);
      ctx.restore();
    }
  }

  _drawLegend(ctx, w, h) {
    const lx = w - 180, ly = h - 145;
    const lw = 170, lh = 135;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 18, 36, 0.9)';
    ctx.strokeStyle = 'rgba(100, 170, 235, 0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, lx, ly, lw, lh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#7ec8e3';
    ctx.fillText('CITY SURFACE LEGEND', lx + 12, ly + 18);

    const items = [
      { type: 'circle', color: COLORS.sensorNormal, label: 'Surface Sensor (S)' },
      { type: 'rect', color: COLORS.manholeNormal, label: 'Road Manhole (MH)' },
      { type: 'circle', color: COLORS.sensorWarning, label: 'Warning Backup Area' },
      { type: 'circle', color: COLORS.sensorDanger, label: 'Critical Flood Zone' },
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
      y += 22;
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
