import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

import { initDB } from './db.js';
import { setupWebSocket } from './websocket.js';
import authRoutes, { seedDefaultUser } from './routes/auth.js';
import sensorRoutes from './routes/sensors.js';
import floodRoutes from './routes/flood.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Database & Seed
initDB();
seedDefaultUser();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(publicDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/flood', floodRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), app: 'DrainGuard Mesh v2' });
});

// Route fallbacks for SPA navigation
app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(publicDir, 'register.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(publicDir, 'app.html'));
});

// Setup WebSocket on HTTP server
setupWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🌊 DrainGuard Mesh Server Running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`🔌 Hardware Sensor Ingestion: POST http://localhost:${PORT}/api/sensors/data`);
  console.log(`====================================================`);
});
