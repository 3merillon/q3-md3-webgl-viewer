import { mat4 } from 'gl-matrix';

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.aspect = (canvas.width || 1) / (canvas.height || 1);
    this.fov = 45 * Math.PI / 180;
    this.near = 1;
    this.far = 5000;

    // Focus approximately at the character torso center
    this.center = [0, 35, 0]; // y ≈ 35 works well when model is grounded to y=0
    this.up = [0, 1, 0];

    // Orbit angles: theta around Y, phi from +Y down; radius distance
    this.orbitAngles = { theta: 0.0, phi: Math.PI / 3, radius: 300 };
    this.eye = [0, 0, 0];

    this.view = mat4.create();
    this.projection = mat4.create();

    this.onChange = null; // optional callback to request a redraw

    // Optional smoothing for dynamic retargeting
    this._target = this.center.slice();
    this._focusLerp = 0.25; // 0..1 (higher = snappier)

    this._initMouseControls();
    this.update();
  }

  // New: export current camera state for reuse
  getState() {
    return {
      center: this.center.slice(),
      target: this._target.slice(),
      orbitAngles: { theta: this.orbitAngles.theta, phi: this.orbitAngles.phi, radius: this.orbitAngles.radius },
      fov: this.fov,
      near: this.near,
      far: this.far
    };
  }

  // New: restore camera state (optionally snap target)
  setState(state, immediate = true) {
    if (!state) return;
    if (state.center && state.center.length === 3) {
      this.center[0] = state.center[0];
      this.center[1] = state.center[1];
      this.center[2] = state.center[2];
    }
    if (state.target && state.target.length === 3) {
      this._target[0] = state.target[0];
      this._target[1] = state.target[1];
      this._target[2] = state.target[2];
      if (immediate) {
        this.center[0] = this._target[0];
        this.center[1] = this._target[1];
        this.center[2] = this._target[2];
      }
    }
    if (state.orbitAngles) {
      this.orbitAngles.theta = state.orbitAngles.theta ?? this.orbitAngles.theta;
      this.orbitAngles.phi   = state.orbitAngles.phi   ?? this.orbitAngles.phi;
      this.orbitAngles.radius= state.orbitAngles.radius?? this.orbitAngles.radius;
    }
    if (typeof state.fov === 'number') this.fov = state.fov;
    if (typeof state.near === 'number') this.near = state.near;
    if (typeof state.far === 'number') this.far = state.far;
    this.update();
    this._emitChange();
  }

  setSize(width, height) {
    this.aspect = Math.max(1e-6, width / Math.max(1, height));
  }

  // Set absolute focus position (world space), optionally immediate snap.
  setTarget(x, y, z, immediate = false) {
    this._target[0] = x;
    this._target[1] = y;
    this._target[2] = z;
    if (immediate) {
      this.center[0] = x;
      this.center[1] = y;
      this.center[2] = z;
    }
    this.update();
    this._emitChange();
  }

  // Convenience: approximate torso-centered focus for Q3 models
  setFocusTorsoApprox(immediate = false) {
    this.setTarget(0, 35, 0, immediate);
  }

  _emitChange() {
    if (typeof this.onChange === 'function') this.onChange();
  }

  update() {
    // Smoothly approach the target center for nicer camera behavior
    const a = this._focusLerp;
    this.center[0] += (this._target[0] - this.center[0]) * a;
    this.center[1] += (this._target[1] - this.center[1]) * a;
    this.center[2] += (this._target[2] - this.center[2]) * a;

    const { theta, phi, radius } = this.orbitAngles;
    // Spherical to Cartesian (Y-up)
    const x = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.cos(theta);
    this.eye[0] = this.center[0] + x;
    this.eye[1] = this.center[1] + y;
    this.eye[2] = this.center[2] + z;

    mat4.lookAt(this.view, this.eye, this.center, this.up);
    mat4.perspective(this.projection, this.fov, this.aspect, this.near, this.far);
  }

  _initMouseControls() {
    let dragging = false, lastX = 0, lastY = 0;

    const getScale = () => Math.max(0.003, 0.0025 * Math.sqrt(this.orbitAngles.radius / 300));

    this.canvas.addEventListener('mousedown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      const s = getScale();
      this.orbitAngles.theta -= dx * s;
      this.orbitAngles.phi -= dy * s;
      this.orbitAngles.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.orbitAngles.phi));
      this.update();
      this._emitChange();
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const mult = Math.exp(e.deltaY * 0.001);
      this.orbitAngles.radius = Math.max(50, Math.min(2000, this.orbitAngles.radius * mult));
      this.update();
      this._emitChange();
    }, { passive: false });

    // Right-click to pan (move focus)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        const move = (ev) => {
          if (!dragging) return;
          const dx = ev.clientX - lastX;
          const dy = ev.clientY - lastY;
          lastX = ev.clientX; lastY = ev.clientY;
          const panScale = this.orbitAngles.radius * 0.002;
          // Compute right and up vectors from view matrix columns
          const right = [this.view[0], this.view[4], this.view[8]];
          const up = [0, 1, 0];
          this._target[0] -= (right[0] * dx + up[0] * -dy) * panScale;
          this._target[1] -= (right[1] * dx + up[1] * -dy) * panScale;
          this._target[2] -= (right[2] * dx + up[2] * -dy) * panScale;
          this.update();
          this._emitChange();
        };
        const upHandler = () => {
          dragging = false;
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', upHandler);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', upHandler);
      }
    });
  }

  getViewMatrix() { return this.view; }
  getProjectionMatrix() { return this.projection; }
}