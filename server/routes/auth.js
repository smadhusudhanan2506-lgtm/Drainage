import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { syncUserToSupabase, syncLoginLogToSupabase } from '../supabase.js';

const router = express.Router();
export const JWT_SECRET = 'drainguard_mesh_secure_token_secret_2026';

// Middleware to authenticate JWT
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Session expired or invalid token.' });
    req.user = user;
    next();
  });
}

// Seed default operator account if table is empty
export function seedDefaultUser() {
  try {
    const user = db.users.find(u => u.username === 'operator');
    if (!user) {
      const hash = bcrypt.hashSync('operator123', 10);
      const op = db.users.insert({
        username: 'operator',
        email: 'operator@drainguard.gov',
        password_hash: hash,
        full_name: 'Municipal Control Operator',
        role: 'admin'
      });

      db.loginLogs.insert({
        user_id: op.id,
        username: 'operator',
        email: 'operator@drainguard.gov',
        role: 'admin',
        status: 'INITIAL_SEED',
        ip_address: '127.0.0.1',
        user_agent: 'System Initializer'
      });

      console.log('👤 Default operator created: username="operator", password="operator123"');
    }
  } catch (err) {
    console.error('Seed user error:', err);
  }
}

// Register
router.post('/register', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';

  try {
    const { username, email, password, fullName, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check duplicate
    const existing = db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase() || u.email.toLowerCase() === cleanEmail);
    if (existing) {
      db.loginLogs.insert({
        user_id: null,
        username: cleanUsername,
        email: cleanEmail,
        role: role || 'operator',
        status: 'FAILED_REGISTRATION_DUPLICATE',
        ip_address: clientIp,
        user_agent: userAgent
      });
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = db.users.insert({
      username: cleanUsername,
      email: cleanEmail,
      password_hash: passwordHash,
      full_name: fullName || cleanUsername,
      role: role || 'operator'
    });

    // Log registration in audit log
    const regLog = db.loginLogs.insert({
      user_id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      status: 'REGISTRATION_SUCCESS',
      ip_address: clientIp,
      user_agent: userAgent
    });

    // Cloud sync to Supabase (if configured)
    syncUserToSupabase(newUser).catch(console.error);
    syncLoginLogToSupabase(regLog).catch(console.error);

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account registered and saved in database.',
      token,
      user: { id: newUser.id, username: newUser.username, email: newUser.email, fullName: newUser.full_name, role: newUser.role }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter both username and password.' });
    }

    const cleanUser = username.trim().toLowerCase();
    const user = db.users.find(u => u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser);

    if (!user) {
      // Log failed login attempt
      const failLog = db.loginLogs.insert({
        user_id: null,
        username: cleanUser,
        email: null,
        role: 'unknown',
        status: 'FAILED_USER_NOT_FOUND',
        ip_address: clientIp,
        user_agent: userAgent
      });
      syncLoginLogToSupabase(failLog).catch(console.error);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      // Log failed password attempt
      const failLog = db.loginLogs.insert({
        user_id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: 'FAILED_INVALID_PASSWORD',
        ip_address: clientIp,
        user_agent: userAgent
      });
      syncLoginLogToSupabase(failLog).catch(console.error);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Update last login timestamp in user record
    db.users.updateLastLogin(user.id);

    // Record successful login audit trail in database
    const successLog = db.loginLogs.insert({
      user_id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: 'LOGIN_SUCCESS',
      ip_address: clientIp,
      user_agent: userAgent
    });
    syncLoginLogToSupabase(successLog).catch(console.error);

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful. Session logged to database.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed due to server error.' });
  }
});

// Get current logged-in user profile
router.get('/me', authenticateToken, (req, res) => {
  const user = db.users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser });
});

// Get all registered accounts stored in database
router.get('/users', (req, res) => {
  try {
    const users = db.users.getAll();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve registered users.' });
  }
});

// Get all login and registration activity logs stored in database
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = db.loginLogs.getAll(limit);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve login audit logs.' });
  }
});

export default router;
