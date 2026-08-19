import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFilePath = path.join(__dirname, '..', 'drainage_db.json');

// Default initial state
const defaultData = {
  users: [],
  login_logs: [],
  sensor_telemetry: [],
  flood_events: [],
  alerts: [],
  work_orders: []
};

let data = { ...defaultData };

// Load or create database file
function loadDB() {
  try {
    if (fs.existsSync(dbFilePath)) {
      const raw = fs.readFileSync(dbFilePath, 'utf8');
      data = JSON.parse(raw);
      // Ensure all tables exist
      for (const key of Object.keys(defaultData)) {
        if (!data[key]) data[key] = [];
      }
    } else {
      saveDB();
    }
  } catch (err) {
    console.error('Error loading DB file, resetting to clean state:', err);
    data = { ...defaultData };
    saveDB();
  }
}

// Atomic save to file
function saveDB() {
  try {
    const tmpPath = `${dbFilePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, dbFilePath);
  } catch (err) {
    console.error('Error saving DB file:', err);
  }
}

export function initDB() {
  loadDB();
  console.log('📦 File-based Database ready at:', dbFilePath);
}

// Query helper object matching easy database API
export const db = {
  users: {
    find(predicate) {
      return data.users.find(predicate);
    },
    findById(id) {
      return data.users.find(u => u.id === id);
    },
    insert(user) {
      const id = data.users.length ? Math.max(...data.users.map(u => u.id)) + 1 : 1;
      const newUser = {
        id,
        ...user,
        created_at: new Date().toISOString(),
        last_login_at: null
      };
      data.users.push(newUser);
      saveDB();
      return newUser;
    },
    updateLastLogin(id) {
      const u = data.users.find(user => user.id === id);
      if (u) {
        u.last_login_at = new Date().toISOString();
        saveDB();
      }
      return u;
    },
    getAll() {
      // Returns safe user list (without password hashes)
      return data.users.map(({ password_hash, ...u }) => u);
    }
  },

  loginLogs: {
    insert(log) {
      const id = data.login_logs.length ? data.login_logs[data.login_logs.length - 1].id + 1 : 1;
      const record = {
        id,
        ...log,
        timestamp: new Date().toISOString()
      };
      data.login_logs.unshift(record);
      // Keep last 500 login audit records
      if (data.login_logs.length > 500) {
        data.login_logs.pop();
      }
      saveDB();
      return record;
    },
    getAll(limit = 100) {
      return data.login_logs.slice(0, limit);
    }
  },

  sensorTelemetry: {
    insert(reading) {
      const id = data.sensor_telemetry.length ? data.sensor_telemetry[data.sensor_telemetry.length - 1].id + 1 : 1;
      const record = { id, ...reading, timestamp: new Date().toISOString() };
      data.sensor_telemetry.push(record);
      if (data.sensor_telemetry.length > 1000) {
        data.sensor_telemetry.shift();
      }
      saveDB();
      return record;
    },
    getLatest() {
      const latestMap = new Map();
      for (const item of data.sensor_telemetry) {
        latestMap.set(item.sensor_id, item);
      }
      return Array.from(latestMap.values());
    },
    getHistory(limit = 100) {
      return [...data.sensor_telemetry].reverse().slice(0, limit);
    }
  },

  floodEvents: {
    insert(event) {
      const id = data.flood_events.length ? data.flood_events[data.flood_events.length - 1].id + 1 : 1;
      const record = { id, ...event, started_at: new Date().toISOString(), ended_at: null };
      data.flood_events.push(record);
      saveDB();
      return record;
    },
    resolveActive() {
      let resolvedCount = 0;
      for (const ev of data.flood_events) {
        if (ev.status === 'active') {
          ev.status = 'resolved';
          ev.ended_at = new Date().toISOString();
          resolvedCount++;
        }
      }
      if (resolvedCount) saveDB();
    },
    getHistory(limit = 50) {
      return [...data.flood_events].reverse().slice(0, limit);
    }
  },

  alerts: {
    insert(alert) {
      const record = { ...alert, resolved: 0, created_at: new Date().toISOString(), resolved_at: null };
      data.alerts.unshift(record);
      if (data.alerts.length > 100) data.alerts.pop();
      saveDB();
      return record;
    },
    resolveAll() {
      for (const al of data.alerts) {
        if (!al.resolved) {
          al.resolved = 1;
          al.resolved_at = new Date().toISOString();
        }
      }
      saveDB();
    },
    getAll(limit = 50) {
      return data.alerts.slice(0, limit);
    }
  },

  workOrders: {
    insert(wo) {
      const record = { ...wo, created_at: new Date().toISOString(), completed_at: null, verified_at: null };
      data.work_orders.unshift(record);
      saveDB();
      return record;
    },
    update(id, updates) {
      const item = data.work_orders.find(w => w.id === id);
      if (item) {
        Object.assign(item, updates);
        saveDB();
      }
      return item;
    },
    getAll(limit = 50) {
      return data.work_orders.slice(0, limit);
    }
  }
};

export default db;
