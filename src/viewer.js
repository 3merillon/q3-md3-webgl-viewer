import { loadShaders } from './shaders.js';
import { Q3_Player } from './q3/q3-player.js';
import { Q3_Weapon } from './q3/q3-weapon.js';
import { Camera } from './camera/camera.js';
import { Ground } from './ground.js';
import { ShadowSystem } from './shadows/shadow-system.js';
import { DwImage } from './util/dwimage.js';
import { CharacterController } from './character-controller.js';
import AudioManager from './audio/AudioManager.js';

export class Viewer {
  constructor(canvas, character, weapon, cameraState = null, sharedAudioManager = null) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { 
      antialias: true, 
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!this.gl) throw new Error('WebGL2 not supported');
    const gl = this.gl;

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CW);

    gl.disable(gl.BLEND);
    gl.depthMask(true);

    this.character = character || 'none';
    this.weapon = weapon || 'none';

    this.timeUpperSec = 0;
    this.timeLowerSec = 0;
    this.lastTime = 0;
    this.playingUpper = true;
    this.playingLower = true;

    this.wallTimeSec = 0;

    this.player = null;
    this.weaponObj = null;
    this.weaponVariant = 0;
    this.animationFrameId = null;

    this.camera = new Camera(canvas);
    if (cameraState) this.camera.setState(cameraState, true);
    this.camera.onChange = () => this.draw();

    this.characterController = null;

    this.shaders = null;
    this.ready = false;
    this.ground = null;
    this.whiteTex = null;

    this.groundTex = null;
    this.groundNrm = null;
    this.flatNormalTex = null;

    this.groundFadeRadius = 200.0;
    this.groundFadeWidth  = 200.0;

    this.shadowSystem = new ShadowSystem(gl, 4096);

    this.audioManager = sharedAudioManager || new AudioManager();
    this.isSharedAudioManager = !!sharedAudioManager;

    this.onReady = null;
    this.onTick = null;

    this._init();
  }

  getCameraState() { return this.camera?.getState(); }
  getCharacterController() { return this.characterController; }
  getControllerState() { return this.characterController?.getState(); }
  applyControllerState(state) { this.characterController?.applyState(state); }
  getShadowSystem() { return this.shadowSystem; }
  getAudioManager() { return this.audioManager; }

  ensureAnimating() {
    if (!this.animationFrameId) {
      this.lastTime = performance.now();
      this.animationFrameId = requestAnimationFrame(() => this._animate());
    }
  }

  async _initializeAudio() {
    if (this.isSharedAudioManager) return;
    try {
      const seed = Date.now() & 0xffff;
      await this.audioManager.initialize(seed, { autostartMusic: false });
    } catch (error) {
      console.warn('Failed to initialize audio:', error);
    }
  }

  _createWhiteTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const data = new Uint8Array([255,255,255,255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1,1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  _createFlatNormalTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const data = new Uint8Array([128,128,255,255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1,1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  async _init() {
    try {
      await this._initializeAudio();

      this.shaders = await loadShaders(this.gl);

      this.ground = new Ground(this.gl, 4000, 50);
      this.whiteTex = this._createWhiteTexture();
      this.flatNormalTex = this._createFlatNormalTexture();
      this.groundTex = new DwImage(this.gl, '/textures/', 'plate.webp');
      this.groundNrm = new DwImage(this.gl, '/textures/', 'plate_n.webp');

      // Only load a player if a real character is selected
      if (this.character && this.character !== 'none') {
        this.player = new Q3_Player(this.gl, `/models/players/${this.character}/`, 'default');
        await this.player.load();

        if (this.weapon && this.weapon !== 'none') {
          this.weaponObj = new Q3_Weapon(this.gl, `/models/weapons/${this.weapon}/`, this.weapon, this.player.texturepool, this.weaponVariant);
          await this.weaponObj.load();
          this.player.setWeapon(this.weaponObj);
        } else {
          this.player.setWeapon(null);
        }

        // Character controller only makes sense when a player exists
        this.characterController = new CharacterController(this.player, this.camera, this.ground, this);
      } else {
        this.player = null;
        this.weaponObj = null;
        this.characterController = null;
      }

      this.ready = true;
      if (typeof this.onReady === 'function') this.onReady();

      this.lastTime = performance.now();
      this._updateRAF();
      this.draw();
      
    } catch (error) {
      console.error('Failed to initialize viewer:', error);
      throw error;
    }
  }

  async setWeapon(weaponName, variant = null) {
    if (!this.ready) return;

    const targetVariant = (variant == null ? this.weaponVariant : Math.max(0, Math.min(2, variant|0)));

    // If there's no player, ignore weapon changes
    if (!this.player) {
      this.weapon = 'none';
      this.weaponVariant = 0;
      return;
    }

    if (!weaponName || weaponName === 'none') {
      this.player.setWeapon(null);
      this.weapon = 'none';
      this.weaponVariant = 0;
      return;
    }

    try {
      const weapon = new Q3_Weapon(this.gl, `/models/weapons/${weaponName}/`, weaponName, this.player.texturepool, targetVariant);
      await weapon.load();
      this.player.setWeapon(weapon);
      this.weapon = weaponName;
      this.weaponVariant = weaponName === 'gauntlet' ? 0 : targetVariant;
    } catch (e) {
      console.warn('Failed to load weapon', weaponName, e);
      this.player.setWeapon(null);
      this.weapon = 'none';
      this.weaponVariant = 0;
    }

    if (this.characterController) {
      const idx = this.characterController.weapons.indexOf(this.weapon || 'none');
      this.characterController.currentWeapon = idx >= 0 ? idx : 0;
      this.characterController._updateAnimationState(true);
    }
    this.ensureAnimating();
  }

  async setWeaponVariant(variant) {
    this.weaponVariant = Math.max(0, Math.min(2, variant|0));
    if (!this.player || !this.player.weapon) return;
    if (this.weapon === 'gauntlet') { this.weaponVariant = 0; return; }
    try {
      await this.player.weapon.setVariant(this.weaponVariant);
      this.ensureAnimating();
      this.draw();
    } catch (e) {
      console.warn('Failed to set weapon variant', this.weaponVariant, e);
    }
  }

  getAnimationNames() { return this.player?.getAnimationNames() || { torso: [], legs: [] }; }
  getSelectedAnims() { return this.player?.getSelectedAnims() || { torso: '', legs: '' }; }

  setTorsoAnimation(name) {
    if (!this.player) return;
    this.player.setTorsoAnimation(name);
    this.timeUpperSec = 0;
    if (!this.playingUpper) this.playingUpper = true;
    this._updateRAF();
    this.draw();
  }

  setLegsAnimation(name) {
    if (!this.player) return;
    this.player.setLegsAnimation(name);
    this.timeLowerSec = 0;
    if (!this.playingLower) this.playingLower = true;
    this._updateRAF();
    this.draw();
  }

  getUpperAnimInfo() { return this.player?.torsoAnim || null; }
  getLowerAnimInfo() { return this.player?.legsAnim || null; }

  getTimeUpperSec() { return this.timeUpperSec; }
  getTimeLowerSec() { return this.timeLowerSec; }
  setTimeUpperSec(sec) { this.timeUpperSec = Math.max(0, sec); this.draw(); }
  setTimeLowerSec(sec) { this.timeLowerSec = Math.max(0, sec); this.draw(); }

  setUpperFrame(frame) {
    const info = this.getUpperAnimInfo();
    if (!info) return;
    const f = Math.max(0, Math.min(frame, Math.max(0, info.numFrames - 1)));
    this.timeUpperSec = f / Math.max(1, info.fps);
    this.draw();
  }
  setLowerFrame(frame) {
    const info = this.getLowerAnimInfo();
    if (!info) return;
    const f = Math.max(0, Math.min(frame, Math.max(0, info.numFrames - 1)));
    this.timeLowerSec = f / Math.max(1, info.fps);
    this.draw();
  }

  isPlayingUpper() { return !!this.playingUpper; }
  isPlayingLower() { return !!this.playingLower; }
  setPlayingUpper(playing) { this.playingUpper = !!playing; this._updateRAF(); this.draw(); }
  setPlayingLower(playing) { this.playingLower = !!playing; this._updateRAF(); this.draw(); }

  _updateRAF() {
    const needOneShotTick = this.characterController && this.characterController.hasActiveOneShot && this.characterController.hasActiveOneShot();
    const shouldRun = this.playingUpper || this.playingLower || needOneShotTick;
    if (shouldRun) {
      if (!this.animationFrameId) {
        this.lastTime = performance.now();
        this.animationFrameId = requestAnimationFrame(() => this._animate());
      }
    } else {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }
  }

  _animate() {
    this.animationFrameId = null;
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.wallTimeSec += dt;

    if (this.playingUpper) this.timeUpperSec += dt;
    if (this.playingLower) this.timeLowerSec += dt;

    if (this.characterController) {
      this.characterController.update(dt);
    }

    if (this.player && this.player.weapon && typeof this.player.weapon.updateFlash === 'function') {
      this.player.weapon.updateFlash(dt);
    }

    if (this.player && this.player.updateCrossfades) {
      this.player.updateCrossfades(dt);
    }

    if (typeof this.onTick === 'function') {
      this.onTick({ upperSec: this.timeUpperSec, lowerSec: this.timeLowerSec });
    }

    this.draw();
    this._updateRAF();
  }

  handleResize() {
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.camera.setSize(this.canvas.width, this.canvas.height);
    this.camera.update();
    this.draw();
  }

  _renderShadowPass() {
    const gl = this.gl;
    if (!this.shadowSystem.getEnabled() || !this.shadowSystem.isSupported()) return;

    this.shadowSystem.beginShadowPass();

    const depthProgram = this.shaders.depth;
    gl.useProgram(depthProgram);

    const uLightVP = gl.getUniformLocation(depthProgram, "UN_MAT4_LIGHT_VP");
    if (uLightVP) gl.uniformMatrix4fv(uLightVP, false, this.shadowSystem.lightViewProjection);

    if (this.ground) this.ground.drawDepth(depthProgram, null);

    if (this.player && this.player.node_system && this.characterController) {
      const U = this.player.constructor.evalAnimFramePair(this.player.torsoAnim, this.timeUpperSec);
      const L = this.player.constructor.evalAnimFramePair(this.player.legsAnim,  this.timeLowerSec);
      
      this.player.n_lower.frameA = L.a; this.player.n_lower.frameB = L.b; this.player.n_lower.lerp = L.t;
      this.player.n_upper.frameA = U.a; this.player.n_upper.frameB = U.b; this.player.n_upper.lerp = U.t;
      this.player.n_head.frameA = 0; this.player.n_head.frameB = 0; this.player.n_head.lerp = 0;

      if (this.player.weapon && this.player.weapon.n_weapon) {
        const wCount = this.player.weapon.weapon.getNumberOfFrames();
        if (wCount > 0) {
          const a = U.a % wCount;
          const b = U.b % wCount;
          this.player.weapon.n_weapon.frameA = a;
          this.player.weapon.n_weapon.frameB = b;
          this.player.weapon.n_weapon.lerp = U.t;
        }
      }

      const characterMatrix = this.characterController.getModelMatrix();
      this.player.n_lower.setCharacterTransform(characterMatrix);

      this.player.node_system.updateTransformation(null);
      this.player.node_system.drawChildsDepth(depthProgram);
    }

    this.shadowSystem.endShadowPass();
  }

  _renderMainPass() {
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.02, 0.02, 0.025, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.camera.update();
    const view = this.camera.getViewMatrix();
    const projection = this.camera.getProjectionMatrix();

    const program = this.shaders.shadow;
    gl.useProgram(program);

    const uProj = gl.getUniformLocation(program, "UN_MAT4_PROJECTION");
    const uView = gl.getUniformLocation(program, "UN_MAT4_MODELVIEW");
    if (uProj) gl.uniformMatrix4fv(uProj, false, projection);
    if (uView) gl.uniformMatrix4fv(uView, false, view);

    const uTime = gl.getUniformLocation(program, "UN_F32_TIME");
    if (uTime) gl.uniform1f(uTime, this.wallTimeSec);

    this.shadowSystem.setShadowUniforms(program, this.camera.eye);
    this.shadowSystem.bindShadowTexture(1);

    const uTex   = gl.getUniformLocation(program, "UN_SAMP_TEXTURE");
    const uNorm  = gl.getUniformLocation(program, "UN_SAMP_NORMAL");
    if (uTex)  gl.uniform1i(uTex, 0);
    if (uNorm) gl.uniform1i(uNorm, 2);

    const uIsGround   = gl.getUniformLocation(program, "UN_BOOL_IS_GROUND");
    const uFadeRadius = gl.getUniformLocation(program, "UN_F32_GROUND_FADE_RADIUS");
    const uFadeWidth  = gl.getUniformLocation(program, "UN_F32_GROUND_FADE_WIDTH");

    const uIsLaser   = gl.getUniformLocation(program, "UN_BOOL_IS_LASER");
    const uIsFlash   = gl.getUniformLocation(program, "UN_BOOL_IS_FLASH");
    const uUVScroll  = gl.getUniformLocation(program, "UN_VEC2_UV_SCROLL");
    const uAddAlpha  = gl.getUniformLocation(program, "UN_F32_ADDITIVE_ALPHA");
    if (uIsLaser)  gl.uniform1i(uIsLaser, 0);
    if (uIsFlash)  gl.uniform1i(uIsFlash, 0);
    if (uUVScroll) gl.uniform2f(uUVScroll, 0.0, 0.0);
    if (uAddAlpha) gl.uniform1f(uAddAlpha, 1.0);

    if (this.ground) {
      if (uIsGround) gl.uniform1i(uIsGround, 1);
      if (uFadeRadius) gl.uniform1f(uFadeRadius, this.groundFadeRadius);
      if (uFadeWidth)  gl.uniform1f(uFadeWidth,  this.groundFadeWidth);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (this.groundTex && this.groundTex.HANDLE_TEX) ? this.groundTex.HANDLE_TEX : this.whiteTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, (this.groundNrm && this.groundNrm.HANDLE_TEX) ? this.groundNrm.HANDLE_TEX : this.flatNormalTex);

      this.ground.draw(program, null);
    }

    if (uIsGround) gl.uniform1i(uIsGround, 0);
    if (this.player && this.characterController) {
      const characterMatrix = this.characterController.getModelMatrix();
      this.player.n_lower.setCharacterTransform(characterMatrix);
      this.player.drawModel(program, this.timeUpperSec, this.timeLowerSec);
    }
  }

  draw() {
    const gl = this.gl;
    if (!gl || !this.ready || !this.shaders) return;
    try {
      this._renderShadowPass();
      this._renderMainPass();
    } catch (error) {
      console.error('Render error:', error);
    }
  }

  async setSkinSet(skinSet) {
    if (!this.player) return;
    await this.player.setSkinSet(skinSet);
    this.draw();
  }
  async setPartVariant(part, variant) {
    if (!this.player) return;
    await this.player.setPartVariant(part, variant);
    this.draw();
  }
  async setAllVariants(variant) {
    if (!this.player) return;
    await this.player.setAllVariants(variant);
    this.draw();
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.camera) this.camera.onChange = null;
    if (this.shadowSystem) this.shadowSystem.destroy();
    if (this.audioManager && !this.isSharedAudioManager) {
      this.audioManager.cleanup();
    }
    if (this.characterController) this.characterController.destroy();
    this.gl = null;
  }
}

export default Viewer;