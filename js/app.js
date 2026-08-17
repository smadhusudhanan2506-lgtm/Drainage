// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Application Bootstrap
// ─────────────────────────────────────────────────────────────

import { DataEngine } from './dataEngine.js';
import { UndergroundMap } from './undergroundMap.js';
import { AboveGroundMap } from './aboveGroundMap.js';
import { MapSync } from './mapSync.js';
import { Dashboard } from './dashboard.js';
import { AlertSystem } from './alerts.js';
import { PlaybackController } from './playback.js';
import { MaintenanceModule } from './maintenance.js';

class DrainGuardApp {
  constructor() {
    this.engine = null;
    this.ugMap = null;
    this.agMap = null;
    this.sync = null;
    this.dashboard = null;
    this.alerts = null;
    this.playback = null;
    this.maintenance = null;
    this._raf = null;
  }

  init() {
    // Data Engine
    this.engine = new DataEngine();

    // Maps
    const ugCanvas = document.getElementById('underground-canvas');
    const agCanvas = document.getElementById('aboveground-canvas');

    this.ugMap = new UndergroundMap(ugCanvas);
    this.agMap = new AboveGroundMap(agCanvas);

    // Sync
    this.sync = new MapSync(this.ugMap, this.agMap);

    // Dashboard
    this.dashboard = new Dashboard(this.engine);

    // Alerts
    this.alerts = new AlertSystem(this.engine);

    // Playback
    this.playback = new PlaybackController(this.engine);

    // Maintenance
    this.maintenance = new MaintenanceModule(this.engine);

    // Map control buttons
    this._bindMapControls();

    // Audio toggle
    document.getElementById('audio-toggle')?.addEventListener('click', (e) => {
      const enabled = this.alerts.toggleAudio();
      e.target.textContent = enabled ? '🔔' : '🔕';
    });

    // Playback button in header
    document.getElementById('playback-btn')?.addEventListener('click', () => {
      if (this.playback.isPlaying) {
        this.playback.stop();
      } else {
        this.playback.start();
      }
    });

    // Start engine
    this.engine.start();

    // Start render loop
    this._animate(0);

    console.log('🌊 DrainGuard Mesh initialized');
  }

  _bindMapControls() {
    // Underground map controls
    document.getElementById('ug-zoom-in')?.addEventListener('click', () => this.ugMap.zoomIn());
    document.getElementById('ug-zoom-out')?.addEventListener('click', () => this.ugMap.zoomOut());
    document.getElementById('ug-reset')?.addEventListener('click', () => this.ugMap.resetView());

    // Above-ground map controls
    document.getElementById('ag-zoom-in')?.addEventListener('click', () => this.agMap.zoomIn());
    document.getElementById('ag-zoom-out')?.addEventListener('click', () => this.agMap.zoomOut());
    document.getElementById('ag-reset')?.addEventListener('click', () => this.agMap.resetView());
  }

  _animate(timestamp) {
    this.ugMap.render(timestamp);
    this.agMap.render(timestamp);
    this._raf = requestAnimationFrame((t) => this._animate(t));
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.engine.stop();
    this.dashboard.destroy();
  }
}

// ── Launch ────────────────────────────────────────────────────
const app = new DrainGuardApp();
document.addEventListener('DOMContentLoaded', () => app.init());
