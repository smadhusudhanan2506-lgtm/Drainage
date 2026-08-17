import express from 'express';
import { db } from '../db.js';
import { floodState, activateFloodSimulation, deactivateFloodSimulation, broadcast } from '../websocket.js';

const router = express.Router();

// Get current flood simulation state
router.get('/status', (req, res) => {
  res.json({
    floodState,
    timestamp: Date.now()
  });
});

// Trigger Flood Simulation ON
router.post('/simulate', (req, res) => {
  const { sensorId, triggeredBy } = req.body;
  activateFloodSimulation(triggeredBy || 'manual_ui', sensorId || 'S-06');
  res.json({
    success: true,
    message: 'Flood simulation activated. Broadcasting to all connected users.',
    floodState
  });
});

// Trigger Flood Simulation OFF (Gradual recovery)
router.post('/stop', (req, res) => {
  deactivateFloodSimulation('manual_ui');
  res.json({
    success: true,
    message: 'Flood simulation stopped. Recovery sequence initiated.',
    floodState
  });
});

// Get Alerts from DB
router.get('/alerts', (req, res) => {
  try {
    const alerts = db.alerts.getAll(50);
    res.json({ alerts });
  } catch (err) {
    console.error('Error fetching alerts:', err);
    res.status(500).json({ error: 'Failed to fetch alerts.' });
  }
});

// Get Flood Events History from DB
router.get('/history', (req, res) => {
  try {
    const events = db.floodEvents.getHistory(50);
    res.json({ events });
  } catch (err) {
    console.error('Error fetching flood history:', err);
    res.status(500).json({ error: 'Failed to fetch flood history.' });
  }
});

// Get Work Orders
router.get('/workorders', (req, res) => {
  try {
    const orders = db.workOrders.getAll(50);
    res.json({ orders });
  } catch (err) {
    console.error('Error fetching work orders:', err);
    res.status(500).json({ error: 'Failed to fetch work orders.' });
  }
});

// Create Work Order
router.post('/workorders', (req, res) => {
  try {
    const { alertId, pipeId, team, priority, accessPoint } = req.body;
    const woId = `WO-${Date.now()}`;
    const createdOrder = db.workOrders.insert({
      id: woId,
      alert_id: alertId || 'MANUAL',
      pipe_id: pipeId || 'P11-P12-P15',
      team: team || 'Emergency Response Team Alpha',
      priority: priority || 'P1',
      access_point: accessPoint || 'MH-05 (2nd Ave & East Blvd)',
      status: 'assigned'
    });

    broadcast('WORK_ORDER_CREATED', createdOrder);

    res.status(201).json({ success: true, workOrder: createdOrder });
  } catch (err) {
    console.error('Error creating work order:', err);
    res.status(500).json({ error: 'Failed to create work order.' });
  }
});

export default router;
