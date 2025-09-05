import { Q3_Object } from './q3-object.js';
import { Q3_DepNode } from './q3-depnode.js';
import { Q3_TexturePool } from './q3-texturepool.js';
import { AnimationCFG } from './animation-cfg.js';

export class Q3_Player {
  constructor(gl, path, team, texturepool) {
    this.gl = gl;
    this.path = path;  // e.g., `/models/sarge/`
    this.texturepool = texturepool || new Q3_TexturePool(gl);

    // Skin set and per-part variant indices
    this.currentSkinSet = team || 'default'; // 'default','blue','red',...
    this.variant = { head: 0, upper: 0, lower: 0 }; // 0: "", 1: "_1", 2: "_2"

    // Construct initial objects using current variants/skin set
    this.head  = new Q3_Object(gl, path, this._md3Filename('head', this.variant.head),   this._skinFilename('head'),  this.texturepool);
    this.upper = new Q3_Object(gl, path, this._md3Filename('upper', this.variant.upper), this._skinFilename('upper'), this.texturepool);
    this.lower = new Q3_Object(gl, path, this._md3Filename('lower', this.variant.lower), this._skinFilename('lower'), this.texturepool);

    this.weapon = null; // optional weapon instance (Q3_Weapon)
    this.node_system = null;
    this.n_lower = null;
    this.n_upper = null;
    this.n_head = null;
    this.onload = () => {};
    this.loaded = false;

    this.animCFG = null;
    this.torsoAnim = null;
    this.legsAnim  = null;

    this._baseOffsetY = 0;

    // Crossfade states for smooth pose transitions (including inter-anim and variant swaps)
    this.torsoXFade = { active: false, from: 0, to: 0, elapsed: 0, duration: 0.1 };
    this.legsXFade  = { active: false, from: 0, to: 0, elapsed: 0, duration: 0.1 };
  }

  _md3Filename(part, variant) {
    // part: 'head' | 'upper' | 'lower'
    // variant: 0 -> 'head.md3', 1 -> 'head_1.md3', 2 -> 'head_2.md3'
    const suffix = variant > 0 ? `_${variant}` : '';
    return `${part}${suffix}.md3`;
  }
  _skinFilename(part) {
    // part: 'head' | 'upper' | 'lower'
    // e.g., head_blue.skin
    return `${part}_${this.currentSkinSet}.skin`;
  }

  async load() {
    await this.head.load();
    await this.upper.load();
    await this.lower.load();

    this.animCFG = new AnimationCFG(this.path);
    await this.animCFG.load();
    this.torsoAnim = this.animCFG.getDefaultTorso();
    this.legsAnim  = this.animCFG.getDefaultLegs();

    this.makeNodeSystem();
    this._computeAndSetGroundOffset();

    this.loaded = true;
    this.onload();
  }

  makeNodeSystem() {
    this.n_lower = new Q3_DepNode(this.lower); this.n_lower.setParentNode(null, null);
    this.n_upper = new Q3_DepNode(this.upper); this.n_upper.setParentNode(this.n_lower, "tag_torso");
    this.n_head  = new Q3_DepNode(this.head);  this.n_head.setParentNode(this.n_upper, "tag_head");
    this.n_lower.setAsTopLevelNode();
    this.node_system = this.n_head.getTopLevelNode();

    if (this.weapon && this.weapon.node_system) {
      this.weapon.node_system.setParentNode(this.n_upper, "tag_weapon");
    }
  }

  setWeapon(weapon) {
    if (this.weapon && this.weapon.n_weapon) {
      this.weapon.n_weapon.setParentNode(null, null);
    }
    this.weapon = weapon;
    if (this.weapon && this.weapon.n_weapon) {
      this.weapon.n_weapon.setParentNode(this.n_upper, "tag_weapon");
    }
  }

  getAnimationNames() {
    return {
      torso: this.animCFG?.torsoNames || [],
      legs:  this.animCFG?.legsNames  || []
    };
  }
  getSelectedAnims() {
    return {
      torso: this.torsoAnim?.name || '',
      legs:  this.legsAnim?.name  || ''
    };
  }
  setTorsoAnimation(name) { const a = this.animCFG?.getTorso(name); if (a) this.torsoAnim = a; }
  setLegsAnimation(name)  { const a = this.animCFG?.getLegs(name);  if (a) this.legsAnim  = a; }

  _computeAndSetGroundOffset() {
    let minZ = Infinity;
    const idle = this.animCFG?.getLegs('LEGS_IDLE') || this.legsAnim;
    if (idle) {
      const start = idle.firstFrame;
      const end   = idle.firstFrame + Math.max(1, idle.numFrames);
      for (let f = start; f < end; f++) {
        const z = this.lower.getMinZAtFrame(f);
        if (Number.isFinite(z) && z < minZ) minZ = z;
      }
    }
    if (!Number.isFinite(minZ)) minZ = this.lower.getMinZAtFrame(0);
    if (!Number.isFinite(minZ)) minZ = 0;
    this._baseOffsetY = -minZ;
    this.n_lower.setBaseOffsetY(this._baseOffsetY);
  }

  // Quake 3 behavior: loopFrames==0 => clamp to last frame (no wrap)
  static evalAnimFramePair(anim, timeSec) {
    if (!anim) return { a: 0, b: 0, t: 0 };
    const fps = Math.max(1, anim.fps);
    const total = Math.max(1, anim.numFrames);

    const fExact = timeSec * fps;
    const i = Math.floor(fExact);
    const frac = fExact - i;

    const first = anim.firstFrame;
    const lastIndex = total - 1;

    if (anim.loopFrames <= 0) {
      if (i >= lastIndex || total === 1) {
        const f = first + lastIndex;
        return { a: f, b: f, t: 0.0 };
      } else {
        const a = first + i;
        const b = first + (i + 1);
        return { a, b, t: frac };
      }
    }

    const loopFrames = Math.max(1, anim.loopFrames);
    const loopStart = total - loopFrames;

    // Initial span includes the last frame; after it, loop within the subset
    if (i <= lastIndex) {
      const a = first + i;
      const b = (i < lastIndex) ? (first + i + 1) : (first + loopStart);
      return { a, b, t: frac };
    } else {
      // Past the seam, index within the loop subset
      const k = (i - lastIndex - 1) % loopFrames;
      const a = first + loopStart + k;
      const b = first + loopStart + ((k + 1) % loopFrames);
      return { a, b, t: frac };
    }
  }

  // Crossfades (single-pair morph)
  startTorsoCrossfade(fromFrame, toFrame, duration = 0.1) {
    this.torsoXFade.active = true;
    this.torsoXFade.from = Math.max(0, fromFrame|0);
    this.torsoXFade.to = Math.max(0, toFrame|0);
    this.torsoXFade.elapsed = 0;
    this.torsoXFade.duration = Math.max(1e-3, duration);
  }
  startLegsCrossfade(fromFrame, toFrame, duration = 0.1) {
    this.legsXFade.active = true;
    this.legsXFade.from = Math.max(0, fromFrame|0);
    this.legsXFade.to = Math.max(0, toFrame|0);
    this.legsXFade.elapsed = 0;
    this.legsXFade.duration = Math.max(1e-3, duration);
  }
  updateCrossfades(dt) {
    if (this.torsoXFade.active) {
      this.torsoXFade.elapsed += dt;
      if (this.torsoXFade.elapsed >= this.torsoXFade.duration) this.torsoXFade.active = false;
    }
    if (this.legsXFade.active) {
      this.legsXFade.elapsed += dt;
      if (this.legsXFade.elapsed >= this.legsXFade.duration) this.legsXFade.active = false;
    }
  }

  // Draw
  drawModel(program, timeUpperSec, timeLowerSec) {
    if (!this.node_system) return;

    const U = Q3_Player.evalAnimFramePair(this.torsoAnim, timeUpperSec);
    const L = Q3_Player.evalAnimFramePair(this.legsAnim,  timeLowerSec);
    const H = { a: 0, b: 0, t: 0 };

    this.n_lower.setBaseOffsetY(this._baseOffsetY);

    this.n_lower.frame_IDX_cur = this.lower.setCurrentFrameIDX(L.a);
    this.n_upper.frame_IDX_cur = this.upper.setCurrentFrameIDX(U.a);
    this.n_head.frame_IDX_cur  = this.head.setCurrentFrameIDX(H.a);

    this.n_lower.frameA = L.a; this.n_lower.frameB = L.b; this.n_lower.lerp = L.t;
    this.n_upper.frameA = U.a; this.n_upper.frameB = U.b; this.n_upper.lerp = U.t;
    this.n_head.frameA  = H.a; this.n_head.frameB  = H.b; this.n_head.lerp  = H.t;

    if (this.torsoXFade.active) {
      const a = this.torsoXFade.from;
      const b = this.torsoXFade.to;
      const t = Math.min(1, this.torsoXFade.elapsed / this.torsoXFade.duration);
      this.n_upper.frameA = a;
      this.n_upper.frameB = b;
      this.n_upper.lerp = t;
      this.n_upper.frame_IDX_cur = a;
    }
    if (this.legsXFade.active) {
      const a = this.legsXFade.from;
      const b = this.legsXFade.to;
      const t = Math.min(1, this.legsXFade.elapsed / this.legsXFade.duration);
      this.n_lower.frameA = a;
      this.n_lower.frameB = b;
      this.n_lower.lerp = t;
      this.n_lower.frame_IDX_cur = a;
    }

    if (this.weapon && this.weapon.n_weapon && this.weapon.weapon) {
      const wCount = this.weapon.weapon.getNumberOfFrames();
      if (wCount > 0) {
        const a = U.a % wCount;
        const b = U.b % wCount;
        this.weapon.n_weapon.frame_IDX_cur = a;
        this.weapon.n_weapon.frameA = a;
        this.weapon.n_weapon.frameB = b;
        this.weapon.n_weapon.lerp  = U.t;
      } else {
        this.weapon.n_weapon.frame_IDX_cur = 0;
        this.weapon.n_weapon.frameA = 0;
        this.weapon.n_weapon.frameB = 0;
        this.weapon.n_weapon.lerp  = 0;
      }
    }

    this.node_system.updateTransformation(null);
    this.node_system.drawChilds(program);
  }

  // -------- Appearance API (variants and skins) --------
  async setSkinSet(skinSet) {
    this.currentSkinSet = skinSet || 'default';
    // Update skin files for each part without reloading MD3
    await Promise.all([
      this.head.setSkinFilename(this._skinFilename('head')),
      this.upper.setSkinFilename(this._skinFilename('upper')),
      this.lower.setSkinFilename(this._skinFilename('lower')),
    ]);
  }

  async setPartVariant(part, variant) {
    const v = Math.max(0, Math.min(2, variant|0));
    if (!['head','upper','lower'].includes(part)) return;

    const filename = this._md3Filename(part, v);
    const skinfile = this._skinFilename(part);
    const newObj = new Q3_Object(this.gl, this.path, filename, skinfile, this.texturepool);
    await newObj.load();

    // Crossfade from current pose to same frame index on the new mesh (best effort)
    if (part === 'upper') {
      const pose = this.n_upper ? this.n_upper.frameA : 0;
      this.startTorsoCrossfade(pose, pose, 0.08);
    } else if (part === 'lower') {
      const pose = this.n_lower ? this.n_lower.frameA : 0;
      this.startLegsCrossfade(pose, pose, 0.08);
    }

    // Swap object in node
    if (part === 'head') {
      this.head = newObj;
      if (this.n_head) this.n_head.q3_object = newObj;
    } else if (part === 'upper') {
      this.upper = newObj;
      if (this.n_upper) this.n_upper.q3_object = newObj;
    } else {
      this.lower = newObj;
      if (this.n_lower) this.n_lower.q3_object = newObj;
      this._computeAndSetGroundOffset();
    }

    this.variant[part] = v;
  }

  async setAllVariants(v) {
    const target = Math.max(0, Math.min(2, v|0));
    await Promise.all([
      this.setPartVariant('head', target),
      this.setPartVariant('upper', target),
      this.setPartVariant('lower', target),
    ]);
  }
}