// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Dashboard UI
// ─────────────────────────────────────────────────────────────

import { NODES, SEGMENT_STATES } from './config.js';
import { bus, formatTime, formatDateTime } from './utils.js';

export class Dashboard {
  constructor(engine) {
    this.engine = engine;
    this._els = {};
    this._tooltipEl = null;
    this._detailEl = null;
    this._clockInterval = null;

    this._cacheElements();
    this._setupTooltip();
    this._setupDetail();
    this._startClock();
    this._bindEvents();
  }

  _cacheElements() {
    this._els = {
      clock:        document.getElementById('header-clock'),
      riskBadge:    document.getElementById('risk-badge'),
      onlineSensors: document.getElementById('stat-online'),
      onlineSub:    document.getElementById('stat-online-sub'),
      activeAlerts: document.getElementById('stat-alerts'),
      avgBattery:   document.getElementById('stat-battery'),
      networkUp:    document.getElementById('stat-network'),
      totalPipes:   document.getElementById('stat-pipes'),
      alertCount:   document.getElementById('alert-count'),
    };
  }

  _startClock() {
    const update = () => {
      if (this._els.clock) {
        this._els.clock.textContent = formatTime(new Date());
      }
    };
    update();
    this._clockInterval = setInterval(update, 1000);
  }

  _bindEvents() {
    bus.on('telemetry:update', () => this._updateStats());
  }

  _updateStats() {
    const eng = this.engine;

    // Online sensors
    const online = eng.getOnlineSensors();
    const total = eng.getTotalSensors();
    if (this._els.onlineSensors) {
      this._els.onlineSensors.textContent = `${online}/${total}`;
      this._els.onlineSensors.className = 'sc-value ' + (online === total ? 'green' : 'amber');
    }
    if (this._els.onlineSub) {
      this._els.onlineSub.textContent = online === total ? 'All sensors online' : `${total - online} offline`;
    }

    // Active alerts
    const alerts = eng.getActiveAlerts();
    if (this._els.activeAlerts) {
      this._els.activeAlerts.textContent = alerts.length;
      this._els.activeAlerts.className = 'sc-value ' + (alerts.length === 0 ? 'green' : alerts.length > 2 ? 'red' : 'amber');
    }

    // Alert count badge
    if (this._els.alertCount) {
      this._els.alertCount.textContent = alerts.length;
      this._els.alertCount.className = 'alert-count' + (alerts.length === 0 ? ' zero' : '');
    }

    // Battery
    const batt = eng.getAvgBattery();
    if (this._els.avgBattery) {
      this._els.avgBattery.textContent = `${Math.round(batt)}%`;
      this._els.avgBattery.className = 'sc-value ' + (batt > 50 ? 'green' : batt > 25 ? 'amber' : 'red');
    }

    // Network uptime (simulated)
    if (this._els.networkUp) {
      this._els.networkUp.textContent = '99.8%';
      this._els.networkUp.className = 'sc-value green';
    }

    // Total pipe segments monitored
    if (this._els.totalPipes) {
      const blockedCount = Object.values(eng.segmentStates)
        .filter(s => s === SEGMENT_STATES.CONFIRMED_BLOCKAGE || s === SEGMENT_STATES.PROBABLE_BLOCKAGE).length;
      this._els.totalPipes.textContent = blockedCount > 0 ? `${blockedCount} ⚠` : '29 OK';
      this._els.totalPipes.className = 'sc-value ' + (blockedCount > 0 ? 'red' : 'blue');
    }

    // Risk badge
    const risk = eng.getSystemRisk();
    if (this._els.riskBadge) {
      this._els.riskBadge.textContent = risk.toUpperCase();
      this._els.riskBadge.className = `risk-badge ${risk}`;
    }
  }

  /* ── Tooltip ─────────────────────────────────────────────── */
  _setupTooltip() {
    this._tooltipEl = document.getElementById('map-tooltip');

    bus.on('tooltip:show', (data) => {
      if (!this._tooltipEl) return;
      const node = NODES[data.nodeId];
      const sensor = data.sensor;

      let html = `<div class="tt-title">${data.nodeId} — ${node?.type?.toUpperCase()}</div>`;

      if (node?.surface) {
        html += `<div class="tt-row"><span class="tt-label">Location</span><span class="tt-value">${node.surface}</span></div>`;
      }

      if (sensor) {
        const wlClass = sensor.waterLevel > 0.8 ? 'danger' : sensor.waterLevel > 0.6 ? 'warning' : '';
        const frClass = sensor.flowRate < 0.2 ? 'danger' : sensor.flowRate < 0.5 ? 'warning' : '';

        html += `
          <div class="tt-row"><span class="tt-label">Flow Rate</span><span class="tt-value ${frClass}">${sensor.flowRate.toFixed(2)} m³/s</span></div>
          <div class="tt-row"><span class="tt-label">Water Level</span><span class="tt-value ${wlClass}">${(sensor.waterLevel * 100).toFixed(0)}%</span></div>
          <div class="tt-row"><span class="tt-label">Velocity</span><span class="tt-value">${sensor.velocity.toFixed(2)} m/s</span></div>
          <div class="tt-row"><span class="tt-label">Battery</span><span class="tt-value">${Math.round(sensor.batteryLevel)}%</span></div>
          <div class="tt-row"><span class="tt-label">Status</span><span class="tt-value">${sensor.connectionStatus}</span></div>
        `;

        if (sensor.anomalyFlags.length > 0) {
          html += `<div class="tt-row"><span class="tt-label">Flags</span><span class="tt-value danger">${sensor.anomalyFlags.join(', ')}</span></div>`;
        }
      }

      this._tooltipEl.innerHTML = html;
      this._tooltipEl.classList.add('visible');
      this._tooltipEl.style.left = (data.x + 16) + 'px';
      this._tooltipEl.style.top = (data.y - 10) + 'px';

      // Keep on screen
      const rect = this._tooltipEl.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this._tooltipEl.style.left = (data.x - rect.width - 16) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        this._tooltipEl.style.top = (data.y - rect.height - 10) + 'px';
      }
    });

    bus.on('tooltip:hide', () => {
      if (this._tooltipEl) this._tooltipEl.classList.remove('visible');
    });
  }

  /* ── Node Detail Panel ───────────────────────────────────── */
  _setupDetail() {
    this._detailEl = document.getElementById('node-detail');

    bus.on('node:detail', (data) => {
      if (!this._detailEl) return;
      const node = NODES[data.nodeId];
      const sensor = data.sensor || this.engine.sensorData[data.nodeId];

      let html = `
        <div class="nd-header">
          <div class="nd-title">${data.nodeId} — ${node?.type?.toUpperCase()}</div>
          <button class="nd-close" id="nd-close-btn">✕</button>
        </div>
        <div class="nd-grid">
          <div class="nd-item"><div class="nd-label">Type</div><div class="nd-value">${node?.type}</div></div>
          <div class="nd-item"><div class="nd-label">Surface Location</div><div class="nd-value">${node?.surface || 'N/A'}</div></div>
      `;

      if (sensor) {
        html += `
          <div class="nd-item"><div class="nd-label">Flow Rate</div><div class="nd-value">${sensor.flowRate.toFixed(3)} m³/s</div></div>
          <div class="nd-item"><div class="nd-label">Water Level</div><div class="nd-value">${(sensor.waterLevel * 100).toFixed(1)}%</div></div>
          <div class="nd-item"><div class="nd-label">Velocity</div><div class="nd-value">${sensor.velocity.toFixed(2)} m/s</div></div>
          <div class="nd-item"><div class="nd-label">Flow Dir</div><div class="nd-value">${sensor.flowDirection}</div></div>
          <div class="nd-item"><div class="nd-label">Battery</div><div class="nd-value">${Math.round(sensor.batteryLevel)}%</div></div>
          <div class="nd-item"><div class="nd-label">Connection</div><div class="nd-value"><span class="status-dot online"></span>${sensor.connectionStatus}</div></div>
          <div class="nd-item"><div class="nd-label">Last Update</div><div class="nd-value">${formatTime(new Date(sensor.timestamp))}</div></div>
          <div class="nd-item"><div class="nd-label">Anomalies</div><div class="nd-value">${sensor.anomalyFlags.length ? sensor.anomalyFlags.join(', ') : 'None'}</div></div>
        `;
      }

      html += `</div>`;
      this._detailEl.innerHTML = html;
      this._detailEl.classList.add('visible');

      // Close button
      document.getElementById('nd-close-btn')?.addEventListener('click', () => {
        this._detailEl.classList.remove('visible');
        bus.emit('node:detail:close');
      });
    });

    bus.on('node:detail:close', () => {
      if (this._detailEl) this._detailEl.classList.remove('visible');
    });
  }

  destroy() {
    clearInterval(this._clockInterval);
  }
}
