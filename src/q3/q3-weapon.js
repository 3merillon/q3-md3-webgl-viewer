import { Q3_Object } from './q3-object.js';
import { Q3_DepNode } from './q3-depnode.js';
import { Q3_TexturePool } from './q3-texturepool.js';

export class Q3_Weapon {
  constructor(gl, path, name, texturepool, variant = 0) {
    this.gl = gl;
    this.path = path;       // e.g. /models/shotgun/
    this.name = name;       // e.g. 'shotgun'
    this.texturepool = texturepool || new Q3_TexturePool(gl);

    this.variant = Math.max(0, Math.min(2, variant|0));
    this.weapon = new Q3_Object(gl, path, this._md3Filename(this.name, this.variant), `${name}.skin`, this.texturepool);

    this.node_system = null;
    this.n_weapon = null;
    this.onload = () => {};
    this.loaded = false;

    // NEW: Muzzle flash support
    this.flash = null;              // Q3_Object (flash model)
    this.n_flash = null;            // dep node attached to tag_flash
    this.flashActive = false;
    this.flashTime = 0;
    this.flashDuration = 0.08;      // ~80 ms typical in Q3 feel
    this._flashLoaded = false;
  }

  _md3Filename(base, variant) {
    // gauntlet has only one model
    if (base === 'gauntlet') return `${base}.md3`;
    const suffix = variant > 0 ? `_${variant}` : '';
    return `${base}${suffix}.md3`;
  }

  // NEW: filenames for the flash model
  _flashMd3Filename() { return `${this.name}_flash.md3`; }
  _flashSkinFilename() { return `${this.name}_flash.skin`; }

  async load() {
    await this.weapon.load();
    await this._ensureFlashLoaded(); // lazy-load flash alongside weapon
    this.makeNodeSystem();
    this.loaded = true;
    this.onload();
  }

  async _ensureFlashLoaded() {
    if (this._flashLoaded) return;
    try {
      // Some weapons may not have a flash model, guard load
      const flashObj = new Q3_Object(
        this.gl,
        this.path,
        this._flashMd3Filename(),
        this._flashSkinFilename(),
        this.texturepool
      );
      await flashObj.load();
      // Make sure additive alpha starts at 0 (invisible until triggered)
      flashObj.additiveAlpha = 0.0;
      this.flash = flashObj;
      this._flashLoaded = true;
    } catch (e) {
      // If missing, silently ignore (e.g., certain mods)
      this._flashLoaded = true;
      this.flash = null;
      // console.warn('No flash model for weapon', this.name, e);
    }
  }

  makeNodeSystem() {
    this.n_weapon = new Q3_DepNode(this.weapon);
    this.n_weapon.setParentNode(null, null);
    this.n_weapon.setAsTopLevelNode();
    this.node_system = this.n_weapon.getTopLevelNode();

    // Attach flash (if loaded) to weapon's tag_flash
    if (this.flash) {
      this.n_flash = new Q3_DepNode(this.flash);
      this.n_flash.setParentNode(this.n_weapon, "tag_flash");
      // Do NOT call setAsTopLevelNode on children
    }
  }

  get frameCount() {
    return this.weapon?.getNumberOfFrames() || 0;
  }

  // Swap MD3 model variant at runtime (keeps same skin)
  async setVariant(variant) {
    const v = Math.max(0, Math.min(2, variant|0));
    if (this.name === 'gauntlet') {
      this.variant = 0;
      return;
    }
    if (v === this.variant) return;

    const newObj = new Q3_Object(
      this.gl,
      this.path,
      this._md3Filename(this.name, v),
      `${this.name}.skin`,
      this.texturepool
    );
    await newObj.load();

    // Replace object in node while keeping hierarchy
    if (this.n_weapon) {
      this.n_weapon.q3_object = newObj;
    }
    this.weapon = newObj;
    this.variant = v;

    // Ensure flash is present and attached
    await this._ensureFlashLoaded();
    if (this.flash && !this.n_flash && this.n_weapon) {
      this.n_flash = new Q3_DepNode(this.flash);
      this.n_flash.setParentNode(this.n_weapon, "tag_flash");
    }
  }

  // NEW: trigger + update API for muzzle flash
  triggerFlash(durationMs = null) {
    if (!this.flash) return;
    this.flashActive = true;
    this.flashTime = 0;
    if (typeof durationMs === 'number' && durationMs > 0) {
      this.flashDuration = durationMs / 1000.0;
    }
    // Start fully visible
    this.flash.additiveAlpha = 1.0;
  }

  updateFlash(dt) {
    if (!this.flash || !this.flashActive) return;
    this.flashTime += dt;
    const t = this.flashTime / Math.max(1e-3, this.flashDuration);
    if (t >= 1.0) {
      this.flashActive = false;
      this.flash.additiveAlpha = 0.0;
    } else {
      // Smooth ease-out (square) like classic muzzle flashes
      const a = Math.max(0, 1.0 - t);
      this.flash.additiveAlpha = a * a;
    }
  }
}