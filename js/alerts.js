// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Alert System
// ─────────────────────────────────────────────────────────────

import { NODES } from './config.js';
import { bus, formatTime, formatDateTime, playAlertChime } from './utils.js';

export class AlertSystem {
  constructor(engine) {
    this.engine = engine;
    this._listEl = document.getElementById('alert-list');
    this._healthEl = document.getElementById('health-list');
    this._maintEl = document.getElementById('maint-list');
    this._audioEnabled = true;

    this._setupTabs();
    this._bindEvents();
    this._renderEmptyState();
  }

  _setupTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const panel = tab.dataset.panel;
        document.querySelectorAll('.sidebar-panel').forEach(p => {
          p.style.display = p.id === panel ? 'flex' : 'none';
        });
      });
    });
  }

  _bindEvents() {
    bus.on('alert:new', (alert) => this._addAlert(alert));
    bus.on('telemetry:update', () => this._updateHealth());
    bus.on('wo:created', (wo) => this._addWorkOrder(wo));
    bus.on('wo:updated', (wo) => this._updateWorkOrder(wo));
    bus.on('segment:resolved', () => this._refreshAlerts());
  }

  _renderEmptyState() {
    if (this._listEl && this.engine.getActiveAlerts().length === 0) {
      this._listEl.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">✅</div>
          <div>No active alerts</div>
          <div style="margin-top:4px;font-size:11px">System operating normally</div>
        </div>
      `;
    }
  }

  _addAlert(alert) {
    if (!this._listEl) return;

    // Remove empty state
    const emptyState = this._listEl.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const card = document.createElement('div');
    card.className = `alert-card ${alert.severity}`;
    card.dataset.alertId = alert.id;
    card.dataset.pipeId = alert.pipeId;

    const sensorNodes = alert.sensorIds.map(id => NODES[id]);

    card.innerHTML = `
      <div class="ac-header">
        <span class="ac-severity ${alert.severity}">${alert.severity.toUpperCase()}</span>
        <span class="ac-time">${formatTime(alert.detectionTime)}</span>
      </div>
      <div class="ac-message">${alert.message || `Probable blockage detected on segment ${alert.segmentLabel}`}</div>
      <div class="ac-details">
        <span>📍 ${alert.surfaceLocation}</span>
        <span class="ac-confidence">🎯 ${alert.confidence}%</span>
      </div>
      <div class="ac-details" style="margin-top:4px">
        <span>💧 ${alert.flowRate?.toFixed(2) ?? '—'} m³/s</span>
        <span>📊 ${alert.waterLevel ? (alert.waterLevel * 100).toFixed(0) + '%' : '—'}</span>
        <span>🔧 ${alert.recommendedAction ? 'Action pending' : '—'}</span>
      </div>
    `;

    // Click to navigate to alert location
    card.addEventListener('click', () => {
      const sensorId = alert.sensorIds[0];
      if (sensorId) {
        bus.emit('map:select', { nodeId: sensorId, source: 'alert' });
        bus.emit('node:detail', { nodeId: sensorId, sensor: this.engine.sensorData[sensorId] });
      }
    });

    // Create maintenance work order button (for critical alerts)
    if (alert.severity === 'critical' && !alert._woCreated) {
      const woBtn = document.createElement('button');
      woBtn.textContent = '🔧 Dispatch Maintenance';
      woBtn.style.cssText = `
        margin-top: 8px; width: 100%; padding: 6px 12px;
        background: rgba(79,168,214,0.15); border: 1px solid rgba(79,168,214,0.3);
        border-radius: 6px; color: #7ec8e3; font-size: 11px; font-weight: 600;
        cursor: pointer; transition: all 0.2s;
      `;
      woBtn.addEventListener('mouseenter', () => { woBtn.style.background = 'rgba(79,168,214,0.25)'; });
      woBtn.addEventListener('mouseleave', () => { woBtn.style.background = 'rgba(79,168,214,0.15)'; });
      woBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        alert._woCreated = true;
        woBtn.remove();
        this.engine.createWorkOrder(alert);
      });
      card.appendChild(woBtn);
    }

    this._listEl.prepend(card);

    // Keep max 20 cards in DOM
    while (this._listEl.children.length > 20) {
      this._listEl.removeChild(this._listEl.lastChild);
    }

    // Audio alert for critical
    if (alert.severity === 'critical' && this._audioEnabled) {
      playAlertChime();
    }
  }

  _refreshAlerts() {
    if (!this._listEl) return;
    // Mark resolved alerts
    const resolvedAlerts = this.engine.alerts.filter(a => a.resolved);
    for (const alert of resolvedAlerts) {
      const card = this._listEl.querySelector(`[data-alert-id="${alert.id}"]`);
      if (card && !card.classList.contains('resolved')) {
        card.classList.add('resolved');
        card.style.opacity = '0.5';
        const badge = card.querySelector('.ac-severity');
        if (badge) {
          badge.textContent = 'RESOLVED';
          badge.className = 'ac-severity info';
        }
      }
    }

    if (this.engine.getActiveAlerts().length === 0) {
      // Don't re-render empty state if there are resolved alerts showing
    }
  }

  /* ── System Health Panel ─────────────────────────────────── */
  _updateHealth() {
    if (!this._healthEl) return;

    const eng = this.engine;
    const online = eng.getOnlineSensors();
    const total = eng.getTotalSensors();
    const batt = eng.getAvgBattery();
    const activeAlerts = eng.getActiveAlerts().length;

    this._healthEl.innerHTML = `
      <div class="health-card">
        <div class="hc-icon green">📡</div>
        <div class="hc-info">
          <div class="hc-label">Online Sensors</div>
          <div class="hc-value" style="color: var(--clr-green)">${online} / ${total}</div>
        </div>
      </div>
      <div class="health-card">
        <div class="hc-icon blue">🔋</div>
        <div class="hc-info">
          <div class="hc-label">Avg Battery Level</div>
          <div class="hc-value" style="color: ${batt > 50 ? 'var(--clr-green)' : 'var(--clr-amber)'}">${Math.round(batt)}%</div>
        </div>
      </div>
      <div class="health-card">
        <div class="hc-icon ${activeAlerts > 0 ? 'red' : 'green'}">🔔</div>
        <div class="hc-info">
          <div class="hc-label">Active Alerts</div>
          <div class="hc-value" style="color: ${activeAlerts > 0 ? 'var(--clr-red)' : 'var(--clr-green)'}">${activeAlerts}</div>
        </div>
      </div>
      <div class="health-card">
        <div class="hc-icon blue">📶</div>
        <div class="hc-info">
          <div class="hc-label">Network Health</div>
          <div class="hc-value" style="color: var(--clr-green)">99.8%</div>
        </div>
      </div>
      <div class="health-card">
        <div class="hc-icon purple">🛠️</div>
        <div class="hc-info">
          <div class="hc-label">Active Work Orders</div>
          <div class="hc-value" style="color: var(--clr-purple)">${eng.workOrders.filter(w => w.status !== 'verified').length}</div>
        </div>
      </div>
      <div class="health-card">
        <div class="hc-icon blue">⏱️</div>
        <div class="hc-info">
          <div class="hc-label">Last Data Received</div>
          <div class="hc-value" style="font-size:13px; color: var(--clr-text)">${formatTime(new Date())}</div>
        </div>
      </div>
    `;
  }

  /* ── Maintenance Work Orders ─────────────────────────────── */
  _addWorkOrder(wo) {
    if (!this._maintEl) return;
    this._renderWorkOrders();
  }

  _updateWorkOrder(wo) {
    this._renderWorkOrders();
  }

  _renderWorkOrders() {
    if (!this._maintEl) return;

    const orders = this.engine.workOrders;

    if (orders.length === 0) {
      this._maintEl.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">🔧</div>
          <div>No work orders</div>
        </div>
      `;
      return;
    }

    this._maintEl.innerHTML = orders.map(wo => `
      <div class="wo-card">
        <div class="wo-header">
          <span class="wo-id">${wo.id}</span>
          <span class="wo-status ${wo.status}">${wo.status.replace('-', ' ').toUpperCase()}</span>
        </div>
        <div class="wo-row">
          <span class="wo-label">Segment</span>
          <span class="wo-value">${wo.segmentLabel}</span>
        </div>
        <div class="wo-row">
          <span class="wo-label">Priority</span>
          <span class="wo-value">${wo.priority}</span>
        </div>
        <div class="wo-row">
          <span class="wo-label">Team</span>
          <span class="wo-value">${wo.team}</span>
        </div>
        <div class="wo-row">
          <span class="wo-label">Access Point</span>
          <span class="wo-value">${wo.accessPoint}</span>
        </div>
        <div class="wo-row">
          <span class="wo-label">Created</span>
          <span class="wo-value">${formatTime(wo.createdAt)}</span>
        </div>
        ${wo.completedAt ? `<div class="wo-row"><span class="wo-label">Completed</span><span class="wo-value">${formatTime(wo.completedAt)}</span></div>` : ''}
        ${wo.verifiedAt ? `<div class="wo-row"><span class="wo-label">Verified</span><span class="wo-value">${formatTime(wo.verifiedAt)}</span></div>` : ''}
      </div>
    `).join('');
  }

  toggleAudio() {
    this._audioEnabled = !this._audioEnabled;
    return this._audioEnabled;
  }
}
