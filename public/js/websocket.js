// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — WebSocket Client for Real-Time Sync
// ─────────────────────────────────────────────────────────────

import { bus } from './utils.js';

let socket = null;
let reconnectTimer = null;

export function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3000';
  const wsUrl = `${protocol}//${host}/ws`;

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('📡 Connected to DrainGuard Mesh WebSocket Hub');
      bus.emit('ws:status', { connected: true });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    socket.onclose = () => {
      console.warn('⚠️ WebSocket disconnected. Retrying in 3s...');
      bus.emit('ws:status', { connected: false });
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          initWebSocket();
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  } catch (e) {
    console.error('Failed to create WebSocket:', e);
  }
}

function handleServerMessage(data) {
  switch (data.type) {
    case 'INIT_STATE':
    case 'FLOOD_STATE_CHANGE':
      bus.emit('flood:sync', data.payload || data.floodState || data);
      break;

    case 'SENSOR_TELEMETRY':
      bus.emit('hardware:telemetry', data.payload || data);
      break;

    case 'WORK_ORDER_CREATED':
      bus.emit('wo:sync', data.payload || data);
      break;

    default:
      bus.emit('ws:message', data);
      break;
  }
}

export function sendFloodToggle() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'TOGGLE_FLOOD_SIMULATION' }));
  } else {
    // Fallback to HTTP POST if WS temporarily unavailable
    fetch('/api/flood/simulate', { method: 'POST' }).catch(console.error);
  }
}
