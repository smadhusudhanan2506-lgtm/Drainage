// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Historical Playback Controller
// ─────────────────────────────────────────────────────────────

import { PLAYBACK_SCENARIO, SEGMENT_STATES, ALERT_SEVERITY } from './config.js';
import { bus, formatTime } from './utils.js';

export class PlaybackController {
  constructor(engine) {
    this.engine = engine;
    this.scenario = PLAYBACK_SCENARIO;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTime = 0;      // seconds into playback
    this.speed = 1;
    this.lastEventIndex = -1;
    this._wasLive = true;      // was the engine running before playback?
    this._interval = null;

    this._bar = document.getElementById('playback-bar');
    this._bindUI();
  }

  _bindUI() {
    const playBtn = document.getElementById('pb-play');
    const stopBtn = document.getElementById('pb-stop');
    const speedBtn = document.getElementById('pb-speed');
    const track = document.getElementById('pb-track');

    playBtn?.addEventListener('click', () => {
      if (!this.isPlaying) {
        this.start();
      } else if (this.isPaused) {
        this.resume();
      } else {
        this.pause();
      }
    });

    stopBtn?.addEventListener('click', () => this.stop());

    speedBtn?.addEventListener('click', () => {
      const speeds = [1, 2, 4];
      const idx = (speeds.indexOf(this.speed) + 1) % speeds.length;
      this.speed = speeds[idx];
      speedBtn.textContent = `${this.speed}×`;
    });

    track?.addEventListener('click', (e) => {
      if (!this.isPlaying) return;
      const rect = track.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      this.currentTime = ratio * this.scenario.duration;
      this.lastEventIndex = -1; // re-process events
      this._processEvents();
    });
  }

  start() {
    this.isPlaying = true;
    this.isPaused = false;
    this.currentTime = 0;
    this.lastEventIndex = -1;

    // Stop live engine
    this._wasLive = true;
    this.engine.stop();

    // Reset all segments to normal
    for (const pipeId of Object.keys(this.engine.segmentStates)) {
      this.engine.segmentStates[pipeId] = SEGMENT_STATES.NORMAL;
    }

    // Show playback bar
    if (this._bar) this._bar.classList.add('active');

    // Start tick
    this._interval = setInterval(() => this._tick(), 100);

    this._updateUI();
    bus.emit('playback:start');
  }

  pause() {
    this.isPaused = true;
    this._updateUI();
  }

  resume() {
    this.isPaused = false;
    this._updateUI();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    clearInterval(this._interval);

    // Reset all segments to normal
    for (const pipeId of Object.keys(this.engine.segmentStates)) {
      this.engine.segmentStates[pipeId] = SEGMENT_STATES.NORMAL;
    }

    // Restart live engine
    if (this._wasLive) this.engine.start();

    // Hide playback bar
    if (this._bar) this._bar.classList.remove('active');

    bus.emit('playback:stop');
    bus.emit('telemetry:update', { sensors: this.engine.sensorData, segments: this.engine.segmentStates });
  }

  _tick() {
    if (this.isPaused) return;

    this.currentTime += 0.1 * this.speed;

    if (this.currentTime >= this.scenario.duration) {
      this.stop();
      return;
    }

    this._processEvents();
    this._updateUI();
  }

  _processEvents() {
    for (let i = 0; i < this.scenario.events.length; i++) {
      const event = this.scenario.events[i];
      if (event.t <= this.currentTime && i > this.lastEventIndex) {
        this.lastEventIndex = i;
        this._applyEvent(event);
      }
    }
  }

  _applyEvent(event) {
    const eng = this.engine;
    const logEl = document.getElementById('pb-event-log');

    switch (event.type) {
      case 'anomaly':
        eng.forceSensorAnomaly(event.sensorId, event.field, event.value);
        break;

      case 'segment':
        eng.forceSegmentState(event.pipeId, event.state);
        break;

      case 'alert':
        bus.emit('alert:new', {
          id: `PB-ALR-${Date.now()}`,
          severity: event.severity,
          pipeId: event.segment,
          segmentLabel: event.segment,
          sensorIds: [],
          detectionTime: new Date(),
          confidence: event.confidence,
          state: event.severity === 'critical' ? SEGMENT_STATES.CONFIRMED_BLOCKAGE : SEGMENT_STATES.PROBABLE_BLOCKAGE,
          surfaceLocation: '2nd Avenue (Central Segment)',
          recommendedAction: 'Dispatch maintenance team',
          resolved: false,
          timestamp: Date.now(),
          message: event.message,
        });
        break;

      case 'maintenance':
        // Visual update only
        break;

      case 'status':
        break;
    }

    // Update event log display
    if (logEl) {
      logEl.textContent = event.message;
    }

    // Emit telemetry update
    bus.emit('telemetry:update', { sensors: eng.sensorData, segments: eng.segmentStates });
  }

  _updateUI() {
    const progress = document.getElementById('pb-progress');
    const timeEl = document.getElementById('pb-time');
    const playBtn = document.getElementById('pb-play');

    if (progress) {
      const pct = (this.currentTime / this.scenario.duration) * 100;
      progress.style.width = `${pct}%`;
    }

    if (timeEl) {
      const mins = Math.floor(this.currentTime / 60);
      const secs = Math.floor(this.currentTime % 60);
      const total = this.scenario.duration;
      const tMins = Math.floor(total / 60);
      const tSecs = total % 60;
      timeEl.textContent = `${mins}:${String(secs).padStart(2, '0')} / ${tMins}:${String(tSecs).padStart(2, '0')}`;
    }

    if (playBtn) {
      playBtn.textContent = this.isPaused ? '▶' : '⏸';
    }
  }
}
