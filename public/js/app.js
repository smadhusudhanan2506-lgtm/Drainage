// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh v2 — Main Application Controller
// ─────────────────────────────────────────────────────────────

import { requireAuth, getCurrentUser, logout } from './auth.js';
import { initWebSocket, sendFloodToggle } from './websocket.js';
import { DataEngine } from './dataEngine.js';
import { UndergroundMap } from './undergroundMap.js';
import { AboveGroundMap } from './aboveGroundMap.js';
import { NODES } from './config.js';
import { bus, formatTime, playAlertChime } from './utils.js';

class DrainGuardApp {
  constructor() {
    this.engine = null;
    this.ugFullMap = null;
    this.agFullMap = null;
    this.ugDashMap = null;
    this.agDashMap = null;
    this.audioEnabled = true;
    this.currentUser = null;
    this._raf = null;
  }

  init() {
    // 1. Guard Authentication
    if (!requireAuth()) return;
    this.currentUser = getCurrentUser();
    this._renderUserInfo();

    // 2. Initialize Data Engine & WebSocket Hub
    this.engine = new DataEngine();
    initWebSocket();

    // 3. Initialize Interactive Canvas Maps
    this._initMaps();

    // 4. Setup UI Handlers
    this._bindNavigation();
    this._bindFloodSimulationToggle();
    this._bindHardwareConsole();
    this._bindAlertsAndMaintenance();
    this._startClock();

    // 5. Start Simulation Data Stream & Render Loop
    this.engine.start();
    this._animate(0);

    console.log('🌊 DrainGuard Mesh v2 initialized for operator:', this.currentUser?.username);
  }

  _renderUserInfo() {
    if (!this.currentUser) return;
    const nameEl = document.getElementById('display-user-name');
    const roleEl = document.getElementById('display-user-role');
    const avatarEl = document.getElementById('user-avatar-initial');

    if (nameEl) nameEl.textContent = this.currentUser.fullName || this.currentUser.username;
    if (roleEl) roleEl.textContent = this.currentUser.role || 'Municipal Operator';
    if (avatarEl) {
      const initial = (this.currentUser.fullName || this.currentUser.username || 'OP').charAt(0).toUpperCase();
      avatarEl.textContent = initial;
    }

    document.getElementById('logout-btn')?.addEventListener('click', () => logout());
  }

  _initMaps() {
    // Dedicated Full Maps
    const ugFullCanvas = document.getElementById('underground-full-canvas');
    const agFullCanvas = document.getElementById('aboveground-full-canvas');
    if (ugFullCanvas) this.ugFullMap = new UndergroundMap(ugFullCanvas);
    if (agFullCanvas) this.agFullMap = new AboveGroundMap(agFullCanvas);

    // Dashboard Preview Maps
    const ugDashCanvas = document.getElementById('dash-ug-canvas');
    const agDashCanvas = document.getElementById('dash-ag-canvas');
    if (ugDashCanvas) this.ugDashMap = new UndergroundMap(ugDashCanvas);
    if (agDashCanvas) this.agDashMap = new AboveGroundMap(agDashCanvas);

    // Map control buttons
    document.getElementById('ug-full-zoom-in')?.addEventListener('click', () => this.ugFullMap?.zoomIn());
    document.getElementById('ug-full-zoom-out')?.addEventListener('click', () => this.ugFullMap?.zoomOut());
    document.getElementById('ug-full-reset')?.addEventListener('click', () => this.ugFullMap?.resetView());

    document.getElementById('ag-full-zoom-in')?.addEventListener('click', () => this.agFullMap?.zoomIn());
    document.getElementById('ag-full-zoom-out')?.addEventListener('click', () => this.agFullMap?.zoomOut());
    document.getElementById('ag-full-reset')?.addEventListener('click', () => this.agFullMap?.resetView());

    // Setup node tooltip & detail panel
    this._setupInspector();
  }

  _bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.app-view');
    const breadcrumbTitle = document.getElementById('bc-title');

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetViewId = item.dataset.view;
        if (!targetViewId) return;

        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        views.forEach(v => v.classList.remove('active'));
        const activeView = document.getElementById(targetViewId);
        if (activeView) activeView.classList.add('active');

        // Update breadcrumbs
        const label = item.querySelector('.nav-label')?.textContent || 'Overview';
        if (breadcrumbTitle) breadcrumbTitle.textContent = label;

        // Trigger map resizes if map views opened
        if (targetViewId === 'view-underground') this.ugFullMap?.resetView();
        if (targetViewId === 'view-city') this.agFullMap?.resetView();
        if (targetViewId === 'view-dashboard') {
          this.ugDashMap?.resetView();
          this.agDashMap?.resetView();
        }
      });
    });

    // Expand buttons on dashboard cards
    document.querySelectorAll('.btn-expand-view').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const navBtn = document.querySelector(`.nav-item[data-view="${targetId}"]`);
        if (navBtn) navBtn.click();
      });
    });

    // Sidebar collapse toggle
    const sidebar = document.getElementById('app-sidebar');
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      sidebar?.classList.toggle('collapsed');
      setTimeout(() => {
        this.ugFullMap?.resetView();
        this.agFullMap?.resetView();
        this.ugDashMap?.resetView();
        this.agDashMap?.resetView();
      }, 300);
    });

    // Mobile menu toggle
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      sidebar?.classList.toggle('mobile-open');
    });
  }

  // ── ⭐ PROMINENT SIMULATE FLOOD TOGGLE (TOP-RIGHT) ───────────
  _bindFloodSimulationToggle() {
    const floodBox = document.querySelector('.flood-sim-box');
    const floodBtn = document.getElementById('flood-toggle-btn');
    const floodBtnText = document.getElementById('flood-btn-text');
    const banner = document.getElementById('flood-active-banner');
    const bannerDesc = document.getElementById('flood-banner-desc');
    const bannerStopBtn = document.getElementById('banner-stop-flood-btn');
    const riskBadge = document.getElementById('system-risk-badge');
    const riskText = document.getElementById('risk-text');

    const handleToggle = () => {
      sendFloodToggle();
    };

    floodBtn?.addEventListener('click', handleToggle);
    bannerStopBtn?.addEventListener('click', handleToggle);

    // Audio Alert Toggle
    const audioBtn = document.getElementById('audio-toggle');
    audioBtn?.addEventListener('click', () => {
      this.audioEnabled = !this.audioEnabled;
      audioBtn.textContent = this.audioEnabled ? '🔔' : '🔕';
    });

    // Listen for real-time flood state updates synced via WebSocket
    bus.on('flood:ui_update', ({ floodState, message }) => {
      const isActive = floodState.active || floodState.stage === 'spreading' || floodState.stage === 'active_full';
      const isRecovering = floodState.stage === 'recovering';

      // Update Switch Button Visuals
      if (floodBox) floodBox.classList.toggle('active', isActive);
      if (floodBtnText) floodBtnText.textContent = isActive ? 'ON' : 'OFF';

      // Update Dashboard Banner
      if (banner) {
        if (isActive) {
          banner.style.display = 'flex';
          if (bannerDesc) {
            bannerDesc.textContent = message || 'Critical drainage blockage in progress between School Zone and Bus Terminal. Water backing up.';
          }
        } else if (isRecovering) {
          banner.style.display = 'flex';
          if (bannerDesc) {
            bannerDesc.textContent = 'Drainage recovery sequence in progress. Water clearing from orange to normal blue fluid stream.';
          }
        } else {
          banner.style.display = 'none';
        }
      }

      // Update Global Risk Badge
      if (riskBadge && riskText) {
        const hasRed = Object.values(floodState.activePipes || {}).some(s => s === 'danger');
        if (isActive) {
          if (hasRed) {
            riskBadge.className = 'risk-badge critical';
            riskText.textContent = 'CRITICAL FLOOD ALERT';
            if (this.audioEnabled) playAlertChime();
          } else {
            riskBadge.className = 'risk-badge elevated';
            riskText.textContent = 'WARNING: WATER BACKUP';
          }
        } else if (isRecovering) {
          riskBadge.className = 'risk-badge elevated';
          riskText.textContent = 'DRAINAGE RECOVERING';
        } else {
          riskBadge.className = 'risk-badge normal';
          riskText.textContent = 'SYSTEM NORMAL';
        }
      }

      this._updateAlertBadge();
    });

    // Telemetry updates
    bus.on('telemetry:update', () => {
      this._updateDashboardMetrics();
      this._renderTelemetryTable();
    });
  }

  _updateDashboardMetrics() {
    const online = this.engine.getOnlineSensors();
    const total = this.engine.getTotalSensors();
    const batt = this.engine.getAvgBattery();
    const isFlood = this.engine.floodState.active;

    const sensorVal = document.getElementById('dash-sensors-val');
    if (sensorVal) sensorVal.textContent = `${online} / ${total}`;

    const alertsVal = document.getElementById('dash-alerts-val');
    const alertsSub = document.getElementById('dash-alerts-sub');
    if (alertsVal) {
      alertsVal.textContent = isFlood ? '1 CRITICAL' : '0';
      alertsVal.className = 'mc-value ' + (isFlood ? 'red' : 'green');
    }
    if (alertsSub) {
      alertsSub.textContent = isFlood ? 'School ↔ Bus Terminal Blockage' : 'Drainage nominal';
    }

    const battVal = document.getElementById('dash-battery-val');
    if (battVal) battVal.textContent = `${Math.round(batt)}%`;
  }

  _updateAlertBadge() {
    const badge = document.getElementById('nav-alert-badge');
    const isFlood = this.engine.floodState.active;
    if (badge) {
      badge.style.display = isFlood ? 'inline-block' : 'none';
      badge.textContent = isFlood ? '1' : '0';
    }
  }

  _setupInspector() {
    const tooltipEl = document.getElementById('map-tooltip');
    const detailEl = document.getElementById('node-detail');

    bus.on('tooltip:show', (data) => {
      if (!tooltipEl) return;
      const node = NODES[data.nodeId];
      const sensor = data.sensor;

      let html = `<div class="tt-title">${data.nodeId} — ${node?.type?.toUpperCase()}</div>`;
      if (node?.surface) {
        html += `<div class="tt-row"><span class="tt-label">Location</span><span class="tt-value">${node.surface}</span></div>`;
      }

      if (sensor) {
        const isDanger = sensor.anomalyFlags.length > 0;
        html += `
          <div class="tt-row"><span class="tt-label">Flow Rate</span><span class="tt-value ${isDanger ? 'danger' : ''}">${sensor.flowRate.toFixed(2)} m³/s</span></div>
          <div class="tt-row"><span class="tt-label">Water Level</span><span class="tt-value ${isDanger ? 'danger' : ''}">${(sensor.waterLevel * 100).toFixed(0)}%</span></div>
          <div class="tt-row"><span class="tt-label">Velocity</span><span class="tt-value">${sensor.velocity.toFixed(2)} m/s</span></div>
          <div class="tt-row"><span class="tt-label">Battery</span><span class="tt-value">${Math.round(sensor.batteryLevel)}%</span></div>
        `;
      }

      tooltipEl.innerHTML = html;
      tooltipEl.classList.add('visible');
      tooltipEl.style.left = (data.x + 16) + 'px';
      tooltipEl.style.top = (data.y - 10) + 'px';
    });

    bus.on('tooltip:hide', () => {
      if (tooltipEl) tooltipEl.classList.remove('visible');
    });

    bus.on('node:detail', (data) => {
      if (!detailEl) return;
      const node = NODES[data.nodeId];
      const sensor = data.sensor || this.engine.sensorData[data.nodeId];

      let html = `
        <div class="nd-header">
          <div class="nd-title">📍 ${data.nodeId} (${node?.type?.toUpperCase()})</div>
          <button class="nd-close" id="nd-close-btn">✕</button>
        </div>
        <div class="nd-grid">
          <div class="nd-item"><div class="nd-label">Surface Road</div><div class="nd-value">${node?.surface || 'N/A'}</div></div>
          <div class="nd-item"><div class="nd-label">Node Type</div><div class="nd-value">${node?.type}</div></div>
      `;

      if (sensor) {
        html += `
          <div class="nd-item"><div class="nd-label">Flow Rate</div><div class="nd-value">${sensor.flowRate.toFixed(3)} m³/s</div></div>
          <div class="nd-item"><div class="nd-label">Water Level</div><div class="nd-value">${(sensor.waterLevel * 100).toFixed(1)}%</div></div>
          <div class="nd-item"><div class="nd-label">Velocity</div><div class="nd-value">${sensor.velocity.toFixed(2)} m/s</div></div>
          <div class="nd-item"><div class="nd-label">Battery</div><div class="nd-value">${Math.round(sensor.batteryLevel)}%</div></div>
        `;
      }

      html += `</div>`;
      detailEl.innerHTML = html;
      detailEl.classList.add('visible');

      document.getElementById('nd-close-btn')?.addEventListener('click', () => {
        detailEl.classList.remove('visible');
      });
    });
  }

  // ── Hardware Console & ESP32 Telemetry Matrix ───────────────
  _bindHardwareConsole() {
    const hwForm = document.getElementById('hw-sim-form');
    const logBox = document.getElementById('hw-response-log');

    const hwStatusSelect = document.getElementById('hw-sim-status');
    const flowInput = document.getElementById('hw-sim-flow');
    const waterInput = document.getElementById('hw-sim-water');

    hwStatusSelect?.addEventListener('change', () => {
      const val = hwStatusSelect.value;
      if (val === 'low_flow') {
        if (flowInput) flowInput.value = '0.35';
        if (waterInput) waterInput.value = '0.62';
      } else if (val === 'blocked') {
        if (flowInput) flowInput.value = '0.02';
        if (waterInput) waterInput.value = '0.96';
      } else if (val === 'normal') {
        if (flowInput) flowInput.value = '1.20';
        if (waterInput) waterInput.value = '0.25';
      }
    });

    hwForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sensorId = document.getElementById('hw-sim-sensor').value;
      const status = document.getElementById('hw-sim-status').value;
      const flowRate = parseFloat(document.getElementById('hw-sim-flow').value);
      const waterLevel = parseFloat(document.getElementById('hw-sim-water').value);

      const sendBtn = document.getElementById('hw-send-btn');
      if (sendBtn) sendBtn.disabled = true;

      try {
        const res = await fetch('/api/sensors/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sensor_id: sensorId,
            status,
            flow_rate: flowRate,
            water_level: waterLevel,
            source: 'hardware_simulator'
          })
        });
        const data = await res.json();
        if (logBox) {
          logBox.style.display = 'block';
          logBox.textContent = `[HTTP 200 OK] Hardware Telemetry Ingested:\n` + JSON.stringify(data, null, 2);
        }
      } catch (err) {
        if (logBox) {
          logBox.style.display = 'block';
          logBox.textContent = `[Error]: ` + err.message;
        }
      } finally {
        if (sendBtn) sendBtn.disabled = false;
      }
    });
  }

  _renderTelemetryTable() {
    const tbody = document.getElementById('telemetry-table-body');
    if (!tbody) return;

    const rows = Object.entries(this.engine.sensorData).map(([id, s]) => {
      const node = NODES[id];
      const isDanger = s.anomalyFlags.length > 0;
      return `
        <tr>
          <td><strong style="color:var(--clr-text-accent)">${id}</strong></td>
          <td style="color:var(--clr-text-dim);font-family:var(--font-sans)">${node?.surface || 'N/A'}</td>
          <td style="color:${isDanger ? 'var(--clr-red)' : 'var(--clr-text)'}">${s.flowRate.toFixed(2)} m³/s</td>
          <td style="color:${isDanger ? 'var(--clr-red)' : 'var(--clr-text)'}">${(s.waterLevel * 100).toFixed(0)}%</td>
          <td>${s.velocity.toFixed(2)} m/s</td>
          <td>${Math.round(s.batteryLevel)}%</td>
          <td><span class="status-dot ${isDanger ? 'offline' : 'online'}"></span> ${isDanger ? 'BLOCKED' : 'NORMAL'}</td>
          <td style="color:var(--clr-text-dim)">${formatTime(new Date(s.timestamp))}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows;
  }

  _bindAlertsAndMaintenance() {
    document.getElementById('refresh-alerts-btn')?.addEventListener('click', () => {
      this._loadAlertsFeed();
    });

    document.getElementById('create-manual-wo-btn')?.addEventListener('click', async () => {
      try {
        await fetch('/api/flood/workorders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeId: 'P11-P12-P15',
            team: 'Municipal Emergency Team Alpha',
            accessPoint: 'MH-05 (2nd Ave & School Rd)',
            priority: 'P1'
          })
        });
        this._loadWorkOrders();
      } catch (e) { console.error(e); }
    });

    // Auto-load alerts & work orders initially
    this._loadAlertsFeed();
    this._loadWorkOrders();
  }

  async _loadAlertsFeed() {
    const feed = document.getElementById('alerts-full-feed');
    if (!feed) return;

    try {
      const res = await fetch('/api/flood/alerts');
      const data = await res.json();
      if (data.alerts && data.alerts.length > 0) {
        feed.innerHTML = data.alerts.map(a => `
          <div class="alert-card ${a.severity} ${a.resolved ? 'resolved' : ''}">
            <div class="ac-header">
              <span class="ac-severity ${a.severity}">${a.resolved ? 'RESOLVED' : a.severity.toUpperCase()}</span>
              <span class="ac-time">${formatTime(a.created_at)}</span>
            </div>
            <div class="ac-message">${a.message}</div>
            <div class="ac-details">
              <span>📍 Location: <strong>${a.location}</strong></span>
              <span>🎯 Confidence: <strong>${a.confidence}%</strong></span>
              <span>💧 Segment: <strong>${a.segment_label}</strong></span>
            </div>
          </div>
        `).join('');
      } else {
        feed.innerHTML = `
          <div class="empty-state">
            <div class="es-icon">✅</div>
            <div class="es-title">All Systems Operating Normally</div>
            <div class="es-desc">No drainage anomalies or water backups detected across the network.</div>
          </div>
        `;
      }
    } catch (e) { /* ignore */ }
  }

  async _loadWorkOrders() {
    const grid = document.getElementById('work-orders-grid');
    if (!grid) return;

    try {
      const res = await fetch('/api/flood/workorders');
      const data = await res.json();
      if (data.orders && data.orders.length > 0) {
        grid.innerHTML = data.orders.map(wo => `
          <div class="wo-card">
            <div class="wo-header">
              <span class="wo-id">${wo.id}</span>
              <span class="wo-status ${wo.status}">${wo.status.toUpperCase()}</span>
            </div>
            <div class="wo-row"><span class="wo-label">Target Segment:</span><span class="wo-value">${wo.pipe_id}</span></div>
            <div class="wo-row"><span class="wo-label">Assigned Team:</span><span class="wo-value">${wo.team}</span></div>
            <div class="wo-row"><span class="wo-label">Access Point:</span><span class="wo-value">${wo.access_point}</span></div>
            <div class="wo-row"><span class="wo-label">Priority:</span><span class="wo-value" style="color:var(--clr-red)">${wo.priority}</span></div>
            <div class="wo-row"><span class="wo-label">Created At:</span><span class="wo-value">${formatTime(wo.created_at)}</span></div>
          </div>
        `).join('');
      }
    } catch (e) { /* ignore */ }
  }

  _startClock() {
    const clockEl = document.getElementById('live-clock');
    setInterval(() => {
      if (clockEl) clockEl.textContent = formatTime(new Date());
    }, 1000);
  }

  _animate(timestamp) {
    // Render whichever maps are visible
    this.ugFullMap?.render(timestamp);
    this.agFullMap?.render(timestamp);
    this.ugDashMap?.render(timestamp);
    this.agDashMap?.render(timestamp);

    this._raf = requestAnimationFrame((t) => this._animate(t));
  }
}

// Launch App when DOM loaded
const app = new DrainGuardApp();
document.addEventListener('DOMContentLoaded', () => app.init());
