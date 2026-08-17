// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Client Data & Telemetry Engine
// ─────────────────────────────────────────────────────────────

import { NODES, PIPES } from './config.js';
import { bus } from './utils.js';

function createInitialSensorData(nodeId) {
  return {
    sensorId: nodeId,
    flowRate: 0.95 + Math.random() * 0.35,     // m³/s (clean normal flow)
    flowDirection: 'normal',
    waterLevel: 0.24 + Math.random() * 0.10,   // normal level (~25-35%)
    velocity: 1.25 + Math.random() * 0.35,      // m/s
    timestamp: Date.now(),
    batteryLevel: 86 + Math.random() * 14,     // %
    connectionStatus: 'online',
    anomalyFlags: [],
  };
}

export class DataEngine {
  constructor() {
    this.sensorData = {};
    this.segmentStates = {};
    this.floodState = { active: false, activePipes: {}, stage: 'idle' };
    this.alerts = [];
    this._tickInterval = null;

    this._init();
    this._bindEvents();
  }

  _init() {
    // All sensors initialized in normal operating state
    for (const [id, node] of Object.entries(NODES)) {
      if (node.type === 'sensor') {
        this.sensorData[id] = createInitialSensorData(id);
      }
    }
    // ALL pipe segments start in normal state (clean mild blue)
    for (const p of PIPES) {
      this.segmentStates[p.id] = 'normal';
    }
  }

  _bindEvents() {
    // Receive real-time state sync from server via WebSocket
    bus.on('flood:sync', (state) => {
      this._applyFloodSync(state);
    });

    // Hardware sensor telemetry from ESP32
    bus.on('hardware:telemetry', (reading) => {
      if (reading.sensor_id && this.sensorData[reading.sensor_id]) {
        Object.assign(this.sensorData[reading.sensor_id], {
          flowRate: reading.flow_rate,
          waterLevel: reading.water_level,
          velocity: reading.velocity,
          batteryLevel: reading.battery_level,
          connectionStatus: 'online',
          timestamp: Date.now()
        });
        bus.emit('telemetry:update', { sensors: this.sensorData, segments: this.segmentStates });
      }
    });
  }

  start() {
    if (this._tickInterval) clearInterval(this._tickInterval);
    this._tickInterval = setInterval(() => this._tick(), 2000);
  }

  stop() {
    if (this._tickInterval) clearInterval(this._tickInterval);
  }

  _tick() {
    // Natural subtle sensor fluctuation
    for (const [id, data] of Object.entries(this.sensorData)) {
      if (!this.floodState.active) {
        data.flowRate = this._drift(data.flowRate, 0.75, 1.4, 0.04);
        data.waterLevel = this._drift(data.waterLevel, 0.20, 0.36, 0.02);
        data.velocity = this._drift(data.velocity, 1.0, 1.6, 0.05);
        data.anomalyFlags = [];
      }
      data.timestamp = Date.now();
    }

    bus.emit('telemetry:update', { sensors: this.sensorData, segments: this.segmentStates });
  }

  _drift(current, min, max, mag) {
    const noise = (Math.random() - 0.5) * 2 * mag;
    return Math.max(min, Math.min(max, current + noise));
  }

  _applyFloodSync(payload) {
    const state = payload.floodState || payload;
    this.floodState = state;

    // Reset all pipe segments to normal first
    for (const p of PIPES) {
      this.segmentStates[p.id] = 'normal';
    }

    // Apply active pipe states from server (danger = Red, warning = Orange)
    if (state.activePipes) {
      for (const [pipeId, pipeColorState] of Object.entries(state.activePipes)) {
        this.segmentStates[pipeId] = pipeColorState; // 'danger' or 'warning'
      }
    }

    // Update sensor telemetry readings according to flood progression
    if (state.active) {
      const p12State = state.activePipes['P12'];
      // Core flood sensor: S-06 (Between School & Bus Terminal)
      if (this.sensorData['S-06']) {
        if (p12State === 'danger') {
          // Full Red Blockage
          this.sensorData['S-06'].flowRate = 0.02;
          this.sensorData['S-06'].waterLevel = 0.96;
          this.sensorData['S-06'].velocity = 0.04;
          this.sensorData['S-06'].anomalyFlags = ['water_level_critical', 'flow_stopped'];
        } else if (p12State === 'warning') {
          // Low Flow / Orange Warning
          this.sensorData['S-06'].flowRate = 0.32;
          this.sensorData['S-06'].waterLevel = 0.62;
          this.sensorData['S-06'].velocity = 0.45;
          this.sensorData['S-06'].anomalyFlags = ['flow_restricted'];
        }
      }

      const p15State = state.activePipes['P15'];
      if (this.sensorData['S-13']) {
        if (p15State === 'danger') {
          this.sensorData['S-13'].flowRate = 0.08;
          this.sensorData['S-13'].waterLevel = 0.90;
          this.sensorData['S-13'].anomalyFlags = ['water_level_critical'];
        } else if (p15State === 'warning') {
          this.sensorData['S-13'].flowRate = 0.38;
          this.sensorData['S-13'].waterLevel = 0.65;
          this.sensorData['S-13'].anomalyFlags = ['water_level_warning'];
        }
      }

      const p13State = state.activePipes['P13'];
      if (this.sensorData['S-07']) {
        if (p13State === 'danger') {
          this.sensorData['S-07'].flowRate = 0.10;
          this.sensorData['S-07'].waterLevel = 0.86;
        } else if (p13State === 'warning') {
          this.sensorData['S-07'].flowRate = 0.42;
          this.sensorData['S-07'].waterLevel = 0.58;
        }
      }
    } else {
      // Recovered
      for (const [id, s] of Object.entries(this.sensorData)) {
        s.anomalyFlags = [];
        if (s.waterLevel > 0.4) s.waterLevel = 0.26;
        if (s.flowRate < 0.6) s.flowRate = 1.15;
        if (s.velocity < 0.8) s.velocity = 1.35;
      }
    }

    bus.emit('telemetry:update', { sensors: this.sensorData, segments: this.segmentStates });
    bus.emit('flood:ui_update', { floodState: this.floodState, message: payload.message });
  }

  getOnlineSensors() {
    return Object.values(this.sensorData).filter(s => s.connectionStatus === 'online').length;
  }

  getTotalSensors() {
    return Object.keys(this.sensorData).length;
  }

  getAvgBattery() {
    const vals = Object.values(this.sensorData).map(s => s.batteryLevel);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  getSystemRisk() {
    if (this.floodState.active) {
      if (this.floodState.stage === 'active_full') return 'critical';
      if (this.floodState.stage === 'spreading') {
        const hasRed = Object.values(this.floodState.activePipes).some(s => s === 'danger');
        return hasRed ? 'critical' : 'elevated';
      }
      return 'elevated';
    }
    if (this.floodState.stage === 'recovering') {
      return 'elevated';
    }
    return 'normal';
  }
}
