// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Maintenance Module
// ─────────────────────────────────────────────────────────────

import { bus, formatTime } from './utils.js';

export class MaintenanceModule {
  constructor(engine) {
    this.engine = engine;

    // Auto-dispatch for confirmed blockages after a delay
    bus.on('alert:new', (alert) => {
      if (alert.severity === 'critical' && !alert._woCreated) {
        // Auto-create work order after 5 seconds for demo
        setTimeout(() => {
          if (!alert._woCreated && !alert.resolved) {
            alert._woCreated = true;
            this.engine.createWorkOrder(alert);
          }
        }, 5000);
      }
    });
  }
}
