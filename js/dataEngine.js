// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Data Engine
//  Simulated IoT telemetry + multi-node anomaly detection
// ─────────────────────────────────────────────────────────────

import { NODES, PIPES, THRESHOLDS, SEGMENT_STATES, ALERT_SEVERITY, buildAdjacency } from './config.js';
import { bus, uid, deepClone } from './utils.js';

/* ── Sensor Data Template ──────────────────────────────────── */
function createSensorData(nodeId) {
  return {
    sensorId: nodeId,
    flowRate: 0.8 + Math.random() * 0.8,      // m³/s
    flowDirection: 'normal',
    waterLevel: 0.25 + Math.random() * 0.2,    // fraction
    velocity: 1.0 + Math.random() * 0.8,       // m/s
    timestamp: Date.now(),
    batteryLevel: 70 + Math.random() * 30,      // %
    connectionStatus: 'online',
    anomalyFlags: [],
  };
}

/* ── Data Engine ───────────────────────────────────────────── */
export class DataEngine {
  constructor() {
    this.sensorData = {};       // nodeId → latest telemetry
    this.segmentStates = {};    // pipeId → state
    this.alerts = [];           // all alerts
    this.workOrders = [];       // maintenance work orders
    this.history = [];          // telemetry snapshots for playback
    this._adjacency = buildAdjacency();
    this._tickInterval = null;
    this._blockageTimer = null;
    this._activeBlockages = new Map();  // pipeId → { startTime, stage }
    this._recoveries = new Map();

    // initialise
    this._init();
  }

  _init() {
    // create sensor data for every sensor node
    for (const [id, node] of Object.entries(NODES)) {
      if (node.type === 'sensor') {
        this.sensorData[id] = createSensorData(id);
      }
    }
    // all segments start normal
    for (const p of PIPES) {
      this.segmentStates[p.id] = SEGMENT_STATES.NORMAL;
    }
  }

  start() {
    // tick every 2 seconds
    this._tickInterval = setInterval(() => this._tick(), 2000);
    // schedule blockage demos periodically
    this._scheduleBlockage();
  }

  stop() {
    clearInterval(this._tickInterval);
    clearTimeout(this._blockageTimer);
  }

  /* ── Main tick ───────────────────────────────────────────── */
  _tick() {
    const snapshot = {};
    for (const [id, data] of Object.entries(this.sensorData)) {
      // Apply noise + drift
      data.flowRate    = this._driftValue(data.flowRate, 0.3, 2.5, 0.08);
      data.waterLevel  = this._driftValue(data.waterLevel, 0.15, 0.55, 0.03);
      data.velocity    = this._driftValue(data.velocity, 0.5, 3.0, 0.1);
      data.batteryLevel = Math.max(5, data.batteryLevel - 0.01);
      data.timestamp   = Date.now();
      data.anomalyFlags = [];

      // Apply blockage effects
      this._applyBlockageEffects(id, data);

      // Single-node threshold checks
      this._checkSingleNode(id, data);

      snapshot[id] = deepClone(data);
    }

    // Multi-node correlation
    this._correlateNodes();

    // Store history snapshot (keep last 300)
    this.history.push({ timestamp: Date.now(), sensors: snapshot, segments: { ...this.segmentStates } });
    if (this.history.length > 300) this.history.shift();

    // Emit events
    bus.emit('telemetry:update', { sensors: this.sensorData, segments: this.segmentStates });
  }

  /* ── Value drift with boundaries ─────────────────────────── */
  _driftValue(current, min, max, magnitude) {
    const noise = (Math.random() - 0.5) * 2 * magnitude;
    const pull = (min + max) / 2;
    const drift = (pull - current) * 0.02; // mean reversion
    return Math.max(min, Math.min(max, current + noise + drift));
  }

  /* ── Apply blockage effects to sensor readings ───────────── */
  _applyBlockageEffects(sensorId, data) {
    for (const [pipeId, blockage] of this._activeBlockages) {
      const pipe = PIPES.find(p => p.id === pipeId);
      if (!pipe) continue;

      const elapsed = (Date.now() - blockage.startTime) / 1000;

      // Sensor on the blocked segment: increase water level, reduce flow
      if (pipe.from === sensorId || pipe.to === sensorId) {
        const severity = Math.min(elapsed / 20, 1); // ramp up over 20s

        if (blockage.stage === 'active') {
          // Upstream of blockage: water backs up
          if (pipe.to === sensorId || pipe.from === sensorId) {
            data.waterLevel = 0.4 + severity * 0.55;
            data.flowRate   = Math.max(0.02, 1.2 * (1 - severity * 0.95));
            data.velocity   = Math.max(0.05, 1.5 * (1 - severity * 0.9));
          }
        } else if (blockage.stage === 'recovering') {
          // Gradually return to normal
          const recoverT = Math.min((Date.now() - blockage.recoverStart) / 8000, 1);
          data.waterLevel = 0.9 - recoverT * 0.55;
          data.flowRate   = 0.1 + recoverT * 1.0;
          data.velocity   = 0.1 + recoverT * 1.2;
        }
      }
    }
  }

  /* ── Single-node threshold checks ────────────────────────── */
  _checkSingleNode(id, data) {
    const th = THRESHOLDS;

    if (data.waterLevel > th.waterLevel.critical.max) {
      data.anomalyFlags.push('water_level_critical');
    } else if (data.waterLevel > th.waterLevel.warning.max) {
      data.anomalyFlags.push('water_level_warning');
    }

    if (data.flowRate < th.flowRate.normal.min) {
      data.anomalyFlags.push('low_flow');
    }
    if (data.flowRate > th.flowRate.warning.max) {
      data.anomalyFlags.push('high_flow');
    }

    if (data.velocity < th.velocity.stagnant.max) {
      data.anomalyFlags.push('stagnant');
    }

    if (data.batteryLevel < th.battery.critical) {
      data.anomalyFlags.push('battery_critical');
    } else if (data.batteryLevel < th.battery.low) {
      data.anomalyFlags.push('battery_low');
    }
  }

  /* ── Multi-node correlation for blockage detection ───────── */
  _correlateNodes() {
    for (const pipe of PIPES) {
      const fromNode = NODES[pipe.from];
      const toNode   = NODES[pipe.to];
      const fromData = this.sensorData[pipe.from];
      const toData   = this.sensorData[pipe.to];

      // Skip if either endpoint isn't a sensor
      if (!fromData && !toData) continue;

      const currentState = this.segmentStates[pipe.id];

      // If already in recovery or maintenance, skip correlation
      if (currentState === SEGMENT_STATES.MAINTENANCE ||
          currentState === SEGMENT_STATES.RECOVERY) continue;

      // Check for abnormal conditions
      let abnormalScore = 0;

      if (fromData) {
        if (fromData.anomalyFlags.includes('water_level_critical')) abnormalScore += 3;
        if (fromData.anomalyFlags.includes('water_level_warning'))  abnormalScore += 1;
        if (fromData.anomalyFlags.includes('low_flow'))             abnormalScore += 2;
        if (fromData.anomalyFlags.includes('stagnant'))             abnormalScore += 3;
      }

      if (toData) {
        if (toData.anomalyFlags.includes('water_level_critical')) abnormalScore += 3;
        if (toData.anomalyFlags.includes('water_level_warning'))  abnormalScore += 1;
        if (toData.anomalyFlags.includes('low_flow'))             abnormalScore += 2;
        if (toData.anomalyFlags.includes('stagnant'))             abnormalScore += 3;
      }

      // Cross-check: high upstream water + low downstream flow = blockage
      if (fromData && toData) {
        if (fromData.waterLevel > 0.7 && toData.flowRate < 0.3) {
          abnormalScore += 4;
        }
      }

      // Determine segment state based on score
      let newState = currentState;
      let confidence = 0;

      if (abnormalScore >= 8) {
        newState = SEGMENT_STATES.CONFIRMED_BLOCKAGE;
        confidence = Math.min(95, 60 + abnormalScore * 4);
      } else if (abnormalScore >= 5) {
        newState = SEGMENT_STATES.PROBABLE_BLOCKAGE;
        confidence = Math.min(85, 40 + abnormalScore * 5);
      } else if (abnormalScore >= 2) {
        newState = SEGMENT_STATES.ABNORMAL;
        confidence = Math.min(60, 20 + abnormalScore * 8);
      } else {
        newState = SEGMENT_STATES.NORMAL;
        confidence = 0;
      }

      // Only escalate, don't de-escalate quickly (hysteresis)
      const stateRank = {
        [SEGMENT_STATES.NORMAL]: 0,
        [SEGMENT_STATES.ABNORMAL]: 1,
        [SEGMENT_STATES.PROBABLE_BLOCKAGE]: 2,
        [SEGMENT_STATES.CONFIRMED_BLOCKAGE]: 3,
      };

      if ((stateRank[newState] || 0) > (stateRank[currentState] || 0)) {
        this.segmentStates[pipe.id] = newState;

        // Generate alert on escalation
        if (newState === SEGMENT_STATES.PROBABLE_BLOCKAGE ||
            newState === SEGMENT_STATES.CONFIRMED_BLOCKAGE) {
          this._generateAlert(pipe, newState, confidence);
        }
      }
    }
  }

  /* ── Alert Generation ────────────────────────────────────── */
  _generateAlert(pipe, state, confidence) {
    const fromNode = NODES[pipe.from];
    const toNode   = NODES[pipe.to];
    const fromData = this.sensorData[pipe.from];
    const toData   = this.sensorData[pipe.to];

    const severity = state === SEGMENT_STATES.CONFIRMED_BLOCKAGE
      ? ALERT_SEVERITY.CRITICAL
      : ALERT_SEVERITY.WARNING;

    const alert = {
      id: uid('ALR'),
      severity,
      pipeId: pipe.id,
      segmentLabel: `${pipe.from} → ${pipe.to}`,
      sensorIds: [pipe.from, pipe.to].filter(id => NODES[id].type === 'sensor'),
      detectionTime: new Date(),
      confidence,
      state,
      flowRate: fromData?.flowRate ?? toData?.flowRate ?? null,
      waterLevel: fromData?.waterLevel ?? toData?.waterLevel ?? null,
      surfaceLocation: fromNode?.surface || toNode?.surface || 'Unknown',
      recommendedAction: state === SEGMENT_STATES.CONFIRMED_BLOCKAGE
        ? `Dispatch maintenance team to nearest access point (${this._nearestManhole(pipe)}). Inspect and clear blockage.`
        : `Monitor closely. Prepare maintenance team for potential dispatch.`,
      resolved: false,
      timestamp: Date.now(),
    };

    this.alerts.unshift(alert);
    if (this.alerts.length > 50) this.alerts.pop();

    bus.emit('alert:new', alert);
  }

  /* ── Find nearest manhole to a pipe ──────────────────────── */
  _nearestManhole(pipe) {
    const candidates = [pipe.from, pipe.to];
    for (const c of candidates) {
      if (NODES[c]?.type === 'manhole') return c;
    }
    // Search adjacent pipes for manholes
    for (const p of PIPES) {
      if (p.from === pipe.from || p.to === pipe.from ||
          p.from === pipe.to   || p.to === pipe.to) {
        if (NODES[p.from]?.type === 'manhole') return p.from;
        if (NODES[p.to]?.type === 'manhole') return p.to;
      }
    }
    return 'nearest access point';
  }

  /* ── Schedule simulated blockage ─────────────────────────── */
  _scheduleBlockage() {
    const delay = 12000 + Math.random() * 18000; // 12–30s
    this._blockageTimer = setTimeout(() => {
      this._triggerBlockage();
      this._scheduleBlockage();
    }, delay);
  }

  _triggerBlockage() {
    // Pick a random pipe that isn't already blocked
    const candidates = PIPES.filter(p =>
      this.segmentStates[p.id] === SEGMENT_STATES.NORMAL &&
      !this._activeBlockages.has(p.id) &&
      p.diameter !== 'outfall'
    );
    if (candidates.length === 0) return;

    const pipe = candidates[Math.floor(Math.random() * candidates.length)];
    const blockage = { startTime: Date.now(), stage: 'active', pipeId: pipe.id };
    this._activeBlockages.set(pipe.id, blockage);

    // Auto-resolve after 25–40 seconds
    const duration = 25000 + Math.random() * 15000;
    setTimeout(() => {
      if (this._activeBlockages.has(pipe.id)) {
        this._startRecovery(pipe.id);
      }
    }, duration);
  }

  _startRecovery(pipeId) {
    const blockage = this._activeBlockages.get(pipeId);
    if (!blockage) return;
    blockage.stage = 'recovering';
    blockage.recoverStart = Date.now();
    this.segmentStates[pipeId] = SEGMENT_STATES.RECOVERY;

    bus.emit('segment:recovery', { pipeId });

    // Complete recovery after 8 seconds
    setTimeout(() => {
      this._activeBlockages.delete(pipeId);
      this.segmentStates[pipeId] = SEGMENT_STATES.NORMAL;

      // Resolve associated alerts
      for (const alert of this.alerts) {
        if (alert.pipeId === pipeId && !alert.resolved) {
          alert.resolved = true;
          alert.resolvedTime = new Date();
        }
      }

      bus.emit('segment:resolved', { pipeId });
    }, 8000);
  }

  /* ── Create Maintenance Work Order ───────────────────────── */
  createWorkOrder(alert) {
    const pipe = PIPES.find(p => p.id === alert.pipeId);
    const accessPoint = this._nearestManhole(pipe);

    const wo = {
      id: uid('WO'),
      alertId: alert.id,
      pipeId: alert.pipeId,
      segmentLabel: alert.segmentLabel,
      priority: alert.severity === ALERT_SEVERITY.CRITICAL ? 'P1' : 'P2',
      team: ['Alpha', 'Bravo', 'Charlie', 'Delta'][Math.floor(Math.random() * 4)] + ' Team',
      accessPoint,
      status: 'assigned',
      createdAt: new Date(),
      eta: new Date(Date.now() + 10 * 60000),
      completedAt: null,
      verifiedAt: null,
    };

    this.workOrders.unshift(wo);
    this.segmentStates[alert.pipeId] = SEGMENT_STATES.MAINTENANCE;

    bus.emit('wo:created', wo);

    // Simulate work order lifecycle
    this._simulateWorkOrder(wo);

    return wo;
  }

  _simulateWorkOrder(wo) {
    // Progress through stages
    setTimeout(() => {
      wo.status = 'in-progress';
      bus.emit('wo:updated', wo);
    }, 5000);

    setTimeout(() => {
      wo.status = 'completed';
      wo.completedAt = new Date();
      bus.emit('wo:updated', wo);

      // Start flow recovery
      this._startRecovery(wo.pipeId);
    }, 12000);

    setTimeout(() => {
      wo.status = 'verified';
      wo.verifiedAt = new Date();
      bus.emit('wo:updated', wo);
    }, 22000);
  }

  /* ── Getters ─────────────────────────────────────────────── */
  getOnlineSensors() {
    return Object.values(this.sensorData).filter(s => s.connectionStatus === 'online').length;
  }

  getTotalSensors() {
    return Object.keys(this.sensorData).length;
  }

  getActiveAlerts() {
    return this.alerts.filter(a => !a.resolved);
  }

  getAvgBattery() {
    const vals = Object.values(this.sensorData).map(s => s.batteryLevel);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  getSystemRisk() {
    const confirmed = Object.values(this.segmentStates)
      .filter(s => s === SEGMENT_STATES.CONFIRMED_BLOCKAGE).length;
    const probable = Object.values(this.segmentStates)
      .filter(s => s === SEGMENT_STATES.PROBABLE_BLOCKAGE).length;
    if (confirmed > 0) return 'critical';
    if (probable > 0)  return 'elevated';
    return 'normal';
  }

  /* ── Playback Support ────────────────────────────────────── */
  applySnapshot(snapshot) {
    // Overwrite current state with a historical snapshot
    for (const [id, data] of Object.entries(snapshot.sensors)) {
      if (this.sensorData[id]) {
        Object.assign(this.sensorData[id], data);
      }
    }
    for (const [id, state] of Object.entries(snapshot.segments)) {
      this.segmentStates[id] = state;
    }
    bus.emit('telemetry:update', { sensors: this.sensorData, segments: this.segmentStates });
  }

  forceSegmentState(pipeId, state) {
    this.segmentStates[pipeId] = state;
    bus.emit('telemetry:update', { sensors: this.sensorData, segments: this.segmentStates });
  }

  forceSensorAnomaly(sensorId, field, value) {
    if (this.sensorData[sensorId]) {
      this.sensorData[sensorId][field] = value;
      this.sensorData[sensorId].timestamp = Date.now();
    }
  }
}
