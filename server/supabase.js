import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export let supabase = null;

if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project-ref')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('⚡ Connected to Supabase Cloud Database:', supabaseUrl);
  } catch (err) {
    console.warn('⚠️ Could not initialize Supabase client:', err.message);
  }
} else {
  console.log('ℹ️ Running in local database mode (Set SUPABASE_URL and SUPABASE_KEY in .env to enable Supabase Cloud sync)');
}

// ── Supabase Cloud Sync Helpers ─────────────────────────────

export async function syncUserToSupabase(user) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('users')
      .insert([{
        id: user.id,
        username: user.username,
        email: user.email,
        password_hash: user.password_hash,
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at
      }]);
    if (error) console.error('Supabase user insert error:', error.message);
    return data;
  } catch (e) {
    console.error('Supabase sync error:', e.message);
  }
}

export async function syncLoginLogToSupabase(log) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('login_logs')
      .insert([{
        user_id: log.user_id,
        username: log.username,
        email: log.email,
        role: log.role,
        status: log.status,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        timestamp: log.timestamp
      }]);
    if (error) console.error('Supabase login_log insert error:', error.message);
    return data;
  } catch (e) {
    console.error('Supabase sync error:', e.message);
  }
}

export async function syncTelemetryToSupabase(reading) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('sensor_telemetry')
      .insert([{
        sensor_id: reading.sensor_id,
        flow_rate: reading.flow_rate,
        water_level: reading.water_level,
        velocity: reading.velocity,
        battery_level: reading.battery_level,
        status: reading.status,
        source: reading.source,
        timestamp: reading.timestamp
      }]);
    if (error) console.error('Supabase telemetry insert error:', error.message);
    return data;
  } catch (e) {
    console.error('Supabase sync error:', e.message);
  }
}

export async function syncAlertToSupabase(alert) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('alerts')
      .insert([{
        id: alert.id,
        severity: alert.severity,
        pipe_id: alert.pipe_id,
        segment_label: alert.segment_label,
        location: alert.location,
        message: alert.message,
        confidence: alert.confidence,
        resolved: alert.resolved,
        created_at: alert.created_at
      }]);
    if (error) console.error('Supabase alert insert error:', error.message);
    return data;
  } catch (e) {
    console.error('Supabase sync error:', e.message);
  }
}
