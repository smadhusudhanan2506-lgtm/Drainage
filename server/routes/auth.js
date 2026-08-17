import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';

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
      db.users.insert({
        username: 'operator',
        email: 'operator@drainguard.gov',
        password_hash: hash,
        full_name: 'Municipal Control Operator',
        role: 'admin'
      });
      console.log('👤 Default operator created: username="operator", password="operator123"');
    }
  } catch (err) {
    console.error('Seed user error:', err);
  }
}

// Register
router.post('/register', async (req, res) => {
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

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully.',
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
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter both username and password.' });
    }

    const cleanUser = username.trim().toLowerCase();
    const user = db.users.find(u => u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful.',
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

export default router;
