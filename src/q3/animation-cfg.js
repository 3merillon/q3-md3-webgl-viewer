// src/q3/animation-cfg.js
// Quake 3 animation.cfg parser with correct per-part firstFrame remapping.
//
// animation.cfg is a combined list:
//   [BOTH_* ...][TORSO_* ...][LEGS_* ...]
// upper.md3 frames: BOTH_* + TORSO_*
// lower.md3 frames: BOTH_* + LEGS_*
// So LEGS_* firstFrame must be rebased by subtracting the total TORSO_* numFrames.
const ORDER = [
  // BOTH
  'BOTH_DEATH1', 'BOTH_DEAD1', 'BOTH_DEATH2', 'BOTH_DEAD2', 'BOTH_DEATH3', 'BOTH_DEAD3',
  // TORSO
  'TORSO_GESTURE',
  'TORSO_ATTACK', 'TORSO_ATTACK2',
  'TORSO_DROP', 'TORSO_RAISE',
  'TORSO_STAND', 'TORSO_STAND2',
  // LEGS
  'LEGS_WALKCR', 'LEGS_WALK', 'LEGS_RUN', 'LEGS_BACK', 'LEGS_SWIM',
  'LEGS_JUMP', 'LEGS_LAND', 'LEGS_JUMPB', 'LEGS_LANDB',
  'LEGS_IDLE', 'LEGS_IDLECR', 'LEGS_TURN',
];

function isDirective(word) {
  if (!word) return true;
  const w = word.toLowerCase();
  return (w === 'sex' || w === 'headoffset' || w === 'footsteps' || w.startsWith('//'));
}

function kindFor(name) {
  if (name.startsWith('TORSO_')) return 'TORSO';
  if (name.startsWith('LEGS_')) return 'LEGS';
  return 'BOTH';
}

export class AnimationCFG {
  constructor(path) {
    this.path = path;
    this.torso = new Map(); // upper.md3
    this.legs  = new Map(); // lower.md3
    this.torsoNames = [];
    this.legsNames = [];
  }

  async load() {
    const url = this.path + 'animation.cfg';
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`animation.cfg not found at ${url}; using fallback`);
      this._fallback();
      return;
    }
    const text = await res.text();
    this._parse(text);
  }

  _parse(text) {
    const lines = text.split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
    const raw = [];
    for (const line of lines) {
      const firstWord = line.split(/\s+/, 1)[0];
      if (isDirective(firstWord)) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;
      const firstFrame = parseInt(parts[0], 10);
      const numFrames  = parseInt(parts[1], 10);
      const loopFrames = parseInt(parts[2], 10);
      const fps        = parseInt(parts[3], 10);
      if ([firstFrame, numFrames, loopFrames, fps].some(n => Number.isNaN(n))) continue;
      raw.push({ firstFrame, numFrames, loopFrames, fps });
      if (raw.length >= ORDER.length) break;
    }

    if (raw.length === 0) {
      console.warn('animation.cfg contained no usable entries; using fallback');
      this._fallback();
      return;
    }

    const count = Math.min(raw.length, ORDER.length);
    const named = [];
    for (let i = 0; i < count; i++) {
      named.push({ name: ORDER[i], ...raw[i] });
    }

    // Sum total torso frames
    const torsoTotal = named
      .filter(e => e.name.startsWith('TORSO_'))
      .reduce((acc, e) => acc + Math.max(0, e.numFrames), 0);

    // Map per-part
    for (const e of named) {
      const info = { name: e.name, numFrames: e.numFrames, loopFrames: e.loopFrames, fps: e.fps };
      const kind = kindFor(e.name);

      if (kind === 'BOTH' || kind === 'TORSO') {
        this.torso.set(e.name, { ...info, firstFrame: e.firstFrame });
      }
      if (kind === 'BOTH') {
        this.legs.set(e.name, { ...info, firstFrame: e.firstFrame });
      } else if (kind === 'LEGS') {
        const ff = Math.max(0, e.firstFrame - torsoTotal);
        this.legs.set(e.name, { ...info, firstFrame: ff });
      }
    }

    this.torsoNames = ORDER.filter(n => this.torso.has(n));
    this.legsNames  = ORDER.filter(n => this.legs.has(n));

    if (!this.torso.has('TORSO_STAND')) {
      const alt = this.torsoNames.find(n => n.startsWith('TORSO_')) || this.torsoNames.find(n => n.startsWith('BOTH_')) || this.torsoNames[0];
      if (alt) this.torso.set('TORSO_STAND', this.torso.get(alt));
    }
    if (!this.legs.has('LEGS_IDLE')) {
      const alt = this.legsNames.find(n => n.startsWith('LEGS_')) || this.legsNames.find(n => n.startsWith('BOTH_')) || this.legsNames[0];
      if (alt) this.legs.set('LEGS_IDLE', this.legs.get(alt));
    }
  }

  _fallback() {
    const torsoStand = { name: 'TORSO_STAND', firstFrame: 0, numFrames: 1, loopFrames: 0, fps: 1 };
    const legsIdle   = { name: 'LEGS_IDLE',  firstFrame: 0, numFrames: 1, loopFrames: 0, fps: 1 };
    this.torso.set(torsoStand.name, torsoStand);
    this.legs.set(legsIdle.name, legsIdle);
    this.torsoNames = [torsoStand.name];
    this.legsNames  = [legsIdle.name];
  }

  getTorso(name) { return this.torso.get(name) || null; }
  getLegs(name)  { return this.legs.get(name)  || null; }
  getDefaultTorso() { return this.getTorso('TORSO_STAND') || (this.torsoNames[0] ? this.torso.get(this.torsoNames[0]) : null); }
  getDefaultLegs()  { return this.getLegs('LEGS_IDLE')   || (this.legsNames[0]  ? this.legs.get(this.legsNames[0])  : null); }
}