import { WebSocketServer } from 'ws';
import { db } from './db.js';

let wss = null;
const clients = new Set();

// Shared Global Flood Simulation State
export const floodState = {
  active: false,
  stage: 'idle', // 'idle', 'low_flow_warning', 'spreading', 'active_full', 'recovering'
  triggeredBy: null, // 'manual_button', 'esp32_sensor', etc.
  triggerSensorId: null,
  activePipes: {}, // pipeId -> 'danger' (Red) | 'warning' (Orange)
  startTime: null,
  spreadStep: 0,
};

let floodTimers = [];

function clearAllFloodTimers() {
  floodTimers.forEach(t => clearTimeout(t));
  floodTimers = [];
}

export function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`🔌 Client connected via WebSocket. Total clients: ${clients.size}`);

    // Send current flood and system state immediately
    ws.send(JSON.stringify({
      type: 'INIT_STATE',
      floodState,
      timestamp: Date.now()
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        handleClientMessage(ws, data);
      } catch (err) {
        console.error('Error parsing client WS message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`🔌 Client disconnected. Total clients: ${clients.size}`);
    });
  });

  return wss;
}

export function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload, timestamp: Date.now() });
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  }
}

function handleClientMessage(ws, data) {
  if (data.type === 'TOGGLE_FLOOD_SIMULATION') {
    if (floodState.active) {
      deactivateFloodSimulation('manual_button');
    } else {
      activateFloodSimulation('manual_button');
    }
  }
}

// ── Trigger Low Flow Warning (Point turns ORANGE 1st) ───────────
export function setLowFlowWarning(triggeredBy = 'hardware', sensorId = 'S-06') {
  clearAllFloodTimers();

  floodState.active = true;
  floodState.stage = 'low_flow_warning';
  floodState.triggeredBy = triggeredBy;
  floodState.triggerSensorId = sensorId;
  floodState.startTime = Date.now();
  floodState.activePipes = {
    'P12': 'warning' // Point turns ORANGE first
  };
  floodState.spreadStep = 0;

  // Insert warning alert in DB
  const alertId = `WARN-${Date.now()}`;
  try {
    db.alerts.insert({
      id: alertId,
      severity: 'warning',
      pipe_id: 'P12',
      segment_label: '2nd Ave (School ↔ Bus Stand)',
      location: '2nd Avenue Central & School Access Rd',
      message: 'Low water flow detected by hardware sensor. Water flow slowing on segment P12 (Orange).',
      confidence: 85.0
    });
  } catch (e) {
    console.error('DB alert insert error:', e);
  }

  broadcast('FLOOD_STATE_CHANGE', {
    floodState,
    alertId,
    message: 'Low water flow detected: Segment P12 between School Zone and Bus Stand turned Orange (Warning).'
  });
}

// ── Flood Activation: 1st starts with ORANGE only, then turns RED slowly & spreads ──
export function activateFloodSimulation(triggeredBy = 'manual', sensorId = 'S-06') {
  if (floodState.active && floodState.stage === 'active_full') return;

  clearAllFloodTimers();

  floodState.active = true;
  floodState.stage = 'spreading';
  floodState.triggeredBy = triggeredBy;
  floodState.triggerSensorId = sensorId;
  floodState.startTime = Date.now();
  floodState.spreadStep = 0;

  // Insert event into DB
  try {
    db.floodEvents.insert({
      status: 'active',
      triggered_by: triggeredBy,
      sensor_id: sensorId
    });
  } catch (e) {
    console.error('DB insert flood event error:', e);
  }

  // Create Alert in DB
  const alertId = `ALR-${Date.now()}`;
  try {
    db.alerts.insert({
      id: alertId,
      severity: 'critical',
      pipe_id: 'P12',
      segment_label: '2nd Ave (School ↔ Bus Stand)',
      location: '2nd Avenue Central & School Access Rd',
      message: 'Storm-water backup developing between School Zone and Bus Stand. Flow restriction on segment P12.',
      confidence: 96.0
    });
  } catch (e) {
    console.error('DB alert insert error:', e);
  }

  // ── Step 0 (0s - 7s): 1st starts with ORANGE only at the single point P12 ──
  floodState.activePipes = {
    'P12': 'warning' // 1st STARTS WITH ORANGE ONLY
  };

  broadcast('FLOOD_STATE_CHANGE', {
    floodState,
    alertId,
    message: 'Flow restriction started: Drainage segment P12 between School and Bus Stand is ORANGE.'
  });

  // ── Step 1 (after 7.5s): P12 turns RED (complete block), adjacent pipes turn ORANGE ──
  floodTimers.push(setTimeout(() => {
    if (!floodState.active) return;
    floodState.spreadStep = 1;

    floodState.activePipes['P12'] = 'danger'; // Turns RED slowly
    floodState.activePipes['P11'] = 'warning'; // Adjacent turns Orange
    floodState.activePipes['P15'] = 'warning'; // Adjacent turns Orange

    broadcast('FLOOD_STATE_CHANGE', {
      floodState,
      message: 'Core segment P12 escalated to complete blockage (RED). Connected pipes P11 & P15 turned ORANGE.'
    });

    // ── Step 2 (after 16.0s): P11 & P15 escalate to RED, surrounding corridors turn ORANGE ──
    floodTimers.push(setTimeout(() => {
      if (!floodState.active) return;
      floodState.spreadStep = 2;

      floodState.activePipes['P12'] = 'danger';
      floodState.activePipes['P11'] = 'danger'; // Escalate to Red
      floodState.activePipes['P15'] = 'danger'; // Escalate to Red

      floodState.activePipes['P13'] = 'warning'; // Central Blvd turns Orange
      floodState.activePipes['P16'] = 'warning'; // School Zone drain turns Orange
      floodState.activePipes['P19'] = 'warning'; // 3rd Ave corridor turns Orange

      broadcast('FLOOD_STATE_CHANGE', {
        floodState,
        message: 'Flood spreading: Central & East corridors turned ORANGE, core area fully RED.'
      });

      // ── Step 3 (after 26.0s): P13 & P16 escalate to RED, outer perimeter turns ORANGE ──
      floodTimers.push(setTimeout(() => {
        if (!floodState.active) return;
        floodState.spreadStep = 3;

        floodState.activePipes['P13'] = 'danger';
        floodState.activePipes['P16'] = 'danger';
        floodState.activePipes['P19'] = 'danger';

        floodState.activePipes['P07'] = 'warning'; // Outer perimeter Orange
        floodState.activePipes['P08'] = 'warning';
        floodState.activePipes['P20'] = 'warning';
        floodState.activePipes['P21'] = 'warning';

        broadcast('FLOOD_STATE_CHANGE', {
          floodState,
          message: 'Secondary corridors turned RED. Outer perimeter drainage backing up (ORANGE).'
        });

        // ── Step 4 (after 36.0s): Full peak flood hazard ──
        floodTimers.push(setTimeout(() => {
          if (!floodState.active) return;
          floodState.spreadStep = 4;
          floodState.stage = 'active_full';

          broadcast('FLOOD_STATE_CHANGE', {
            floodState,
            message: 'Peak flood hazard reached across central municipal sector.'
          });
        }, 10000));

      }, 10000));

    }, 8500));

  }, 7500));
}

// ── Flood Deactivation: Slow, Gradual Recovery back to Normal Blue ──
export function deactivateFloodSimulation(triggeredBy = 'manual') {
  if (!floodState.active && floodState.stage === 'idle') return;

  clearAllFloodTimers();

  floodState.active = false;
  floodState.stage = 'recovering';

  // Update DB
  try {
    db.floodEvents.resolveActive();
    db.alerts.resolveAll();
  } catch (e) {
    console.error('DB update flood resolve error:', e);
  }

  // ── Recovery Step 1 (Immediate 0s - 8s): All RED areas transition down to ORANGE ──
  for (const pipeId in floodState.activePipes) {
    floodState.activePipes[pipeId] = 'warning'; // ALL RED TURNS ORANGE
  }

  broadcast('FLOOD_STATE_CHANGE', {
    floodState,
    message: 'Drainage pumps active. Red flood zones slowly subsiding into ORANGE.'
  });

  // ── Recovery Step 2 (after 8.0s): Outer perimeter pipes clear back to normal BLUE ──
  floodTimers.push(setTimeout(() => {
    ['P07', 'P08', 'P20', 'P21'].forEach(p => delete floodState.activePipes[p]);

    broadcast('FLOOD_STATE_CHANGE', {
      floodState,
      message: 'Outer perimeter pipes cleared to normal continuous BLUE flow.'
    });

    // ── Recovery Step 3 (after 16.0s): Secondary pipes clear back to normal BLUE ──
    floodTimers.push(setTimeout(() => {
      ['P13', 'P14', 'P16', 'P19', 'P11', 'P15'].forEach(p => delete floodState.activePipes[p]);

      // Only P12 remains in light warning orange
      floodState.activePipes = { 'P12': 'warning' };

      broadcast('FLOOD_STATE_CHANGE', {
        floodState,
        message: 'Secondary corridors cleared to normal BLUE. Core point P12 dissipating in light orange.'
      });

      // ── Recovery Step 4 (after 24.0s): Core point P12 returns to 100% normal BLUE ──
      floodTimers.push(setTimeout(() => {
        floodState.activePipes = {};
        floodState.stage = 'idle';
        floodState.triggeredBy = null;
        floodState.triggerSensorId = null;
        floodState.spreadStep = 0;

        broadcast('FLOOD_STATE_CHANGE', {
          floodState,
          message: 'All drainage network segments fully restored to continuous normal mild BLUE flow.'
        });
      }, 8000));

    }, 8000));

  }, 8000));
}
