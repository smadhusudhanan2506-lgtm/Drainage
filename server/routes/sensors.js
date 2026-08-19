import express from 'express';
import { db } from '../db.js';
import { broadcast, floodState, setLowFlowWarning, activateFloodSimulation, deactivateFloodSimulation } from '../websocket.js';
import { syncTelemetryToSupabase } from '../supabase.js';

const router = express.Router();

// ESP32 / Hardware / Prototype Telemetry Ingestion Endpoint
router.post('/data', (req, res) => {
  try {
    const {
      sensor_id,
      flow_rate,
      water_level,
      velocity,
      battery_level,
      status,
      source
    } = req.body;

    if (!sensor_id) {
      return res.status(400).json({ error: 'sensor_id is required.' });
    }

    const flowRate = typeof flow_rate === 'number' ? flow_rate : 1.0;
    const waterLevel = typeof water_level === 'number' ? water_level : 0.3;
    const vel = typeof velocity === 'number' ? velocity : 1.2;
    const battery = typeof battery_level === 'number' ? battery_level : 90;

    let computedStatus = status;
    if (!computedStatus) {
      if (flowRate <= 0.10 && waterLevel >= 0.85) {
        computedStatus = 'blocked';
      } else if (flowRate < 0.50 || waterLevel > 0.55) {
        computedStatus = 'low_flow';
      } else {
        computedStatus = 'normal';
      }
    }

    // Save telemetry record to DB
    const reading = db.sensorTelemetry.insert({
      sensor_id,
      flow_rate: flowRate,
      water_level: waterLevel,
      velocity: vel,
      battery_level: battery,
      status: computedStatus,
      source: source || 'esp32_hardware'
    });

    // Cloud sync to Supabase (if configured)
    syncTelemetryToSupabase(reading).catch(console.error);

    // Broadcast live telemetry to all connected apps
    broadcast('SENSOR_TELEMETRY', reading);

    // ── Hardware Automation Logic ──────────────────────────────
    // 1. If Low Water Flow sensed -> 1st turn the point to ORANGE
    if (computedStatus === 'low_flow' || computedStatus === 'warning') {
      if (!floodState.active || floodState.stage === 'idle') {
        console.log(`⚠️ Hardware sensor [${sensor_id}] detected low water flow! Turning point to ORANGE.`);
        setLowFlowWarning('esp32_hardware', sensor_id);
      }
    }
    // 2. If Complete Blockage sensed -> Turn RED & slowly spread
    else if (computedStatus === 'blocked') {
      if (!floodState.active || floodState.stage === 'low_flow_warning') {
        console.log(`🚨 Hardware sensor [${sensor_id}] detected complete blockage! Activating slow red & orange flood spread.`);
        activateFloodSimulation('esp32_hardware', sensor_id);
      }
    }
    // 3. If Normal Flow restored -> Slowly restore all areas to mild BLUE
    else if (computedStatus === 'normal' && flowRate >= 0.55 && waterLevel <= 0.50) {
      if (floodState.active && (floodState.triggeredBy === 'esp32_hardware' || floodState.stage === 'low_flow_warning')) {
        console.log(`✅ Hardware sensor [${sensor_id}] normal flow restored. Initiating slow recovery back to normal blue.`);
        deactivateFloodSimulation('esp32_hardware');
      }
    }

    res.status(200).json({
      success: true,
      message: 'Telemetry received and processed successfully.',
      data: reading,
      floodSimulationActive: floodState.active,
      stage: floodState.stage
    });
  } catch (err) {
    console.error('Error handling sensor data:', err);
    res.status(500).json({ error: 'Failed to process sensor telemetry.' });
  }
});

// Get latest readings for all sensors
router.get('/latest', (req, res) => {
  try {
    const rows = db.sensorTelemetry.getLatest();
    res.json({ readings: rows });
  } catch (err) {
    console.error('Error fetching sensor latest:', err);
    res.status(500).json({ error: 'Failed to retrieve sensor data.' });
  }
});

// Get telemetry history
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const rows = db.sensorTelemetry.getHistory(limit);
    res.json({ history: rows });
  } catch (err) {
    console.error('Error fetching sensor history:', err);
    res.status(500).json({ error: 'Failed to retrieve sensor history.' });
  }
});

export default router;
