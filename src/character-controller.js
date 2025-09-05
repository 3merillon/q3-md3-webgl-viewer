import { vec3, mat4 } from 'gl-matrix';

export class CharacterController {
  constructor(player, camera, ground, viewer) {
    this.player = player;
    this.camera = camera;
    this.ground = ground;
    this.viewer = viewer;
    
    // Character rotation (yaw around Z for Q3)
    this.facing = 0; // radians
    this.targetFacing = 0;
    this.facingSpeed = 12.0;
    
    // Movement parameters
    this.walkSpeed = 150;
    this.runSpeed = 300;
    this.crouchSpeed = 75;
    
    // Current movement state
    this.worldMoveDirection = vec3.create();
    this.currentSpeed = 0;
    
    // Input state
    this.keys = {
      w: false, a: false, s: false, d: false,
      shift: false, space: false, c: false,
      mouse1: false, mouse2: false
    };
    
    // Animation state
    this.isRunning = false;
    this.isCrouching = false; // toggle
    this.isAttacking = false;
    this.isJumping = false;
    this.attackCooldown = 0;

    // One-shot controllers
    this.upperAction = null; // { name, duration, elapsed }
    this.lowerAction = null; // { name, duration, elapsed }
    this.lowerChainNext = null; // queued lower one-shot (e.g., LEGS_LAND after LEGS_JUMP)

    // Cache current clips to avoid needless resets
    this.currentTorsoName = '';
    this.currentLegsName = '';

    // Weapon system (will be overridden by main.js with real list)
    this.weapons = ['none'];
    this.currentWeapon = 0; // index into this.weapons
    this.weaponObjects = new Map();
    
    // Ground texture offset for movement simulation
    this.groundOffset = vec3.fromValues(0, 0, 0);
    
    // Camera control state
    this.cameraControlActive = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    
    // Input focus management
    this.inputEnabled = true;
    
    this._setupInputHandlers();
    this._setupFocusManagement();
  }
  
  // ---------- Input wiring ----------
  _setupInputHandlers() {
    this._boundKeyDown = (e) => this._handleKeyDown(e);
    this._boundKeyUp = (e) => this._handleKeyUp(e);
    this._boundMouseDown = (e) => this._handleMouseDown(e);
    this._boundMouseUp = (e) => this._handleMouseUp(e);
    this._boundMouseMove = (e) => this._handleMouseMove(e);
    this._boundContextMenu = (e) => e.preventDefault();
    this._boundFocus = (e) => this._handleFocus(e);
    this._boundBlur = (e) => this._handleBlur(e);
    
    // Use capture to intercept early
    window.addEventListener('keydown', this._boundKeyDown, true);
    window.addEventListener('keyup', this._boundKeyUp, true);
    window.addEventListener('mousedown', this._boundMouseDown, true);
    window.addEventListener('mouseup', this._boundMouseUp, true);
    window.addEventListener('mousemove', this._boundMouseMove, true);
    window.addEventListener('contextmenu', this._boundContextMenu, true);
    
    window.addEventListener('focus', this._boundFocus);
    window.addEventListener('blur', this._boundBlur);
  }
  
  _setupFocusManagement() {
    const canvas = this.viewer.canvas;
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    
    canvas.addEventListener('mousedown', () => {
      canvas.focus();
      this.inputEnabled = true;
    });
    
    canvas.addEventListener('focus', () => {
      this.inputEnabled = true;
    });
    
    canvas.addEventListener('blur', () => {
      const active = document.activeElement;
      if (active && ['INPUT','SELECT','TEXTAREA','BUTTON'].includes(active.tagName)) {
        this.inputEnabled = false;
      }
    });
    
    setTimeout(() => canvas.focus(), 100);
  }
  
  _handleFocus() { this.inputEnabled = true; }
  _handleBlur() {
    // Clear input on blur
    this.keys = { w:false,a:false,s:false,d:false,shift:false,space:false,c:false,mouse1:false,mouse2:false };
    this.isRunning = false;
    // Immediate recompute to settle legs
    this._updateMovementState();
    this._updateAnimationState(true);
  }
  
  _isGameInput(event) {
    return [
      'KeyW','KeyA','KeyS','KeyD',
      'ShiftLeft','ShiftRight',
      'Space',
      'KeyC',
      'Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'
    ].includes(event.code);
  }
  
  _handleKeyDown(event) {
    if (!this.inputEnabled || !this._isGameInput(event)) return;
    event.preventDefault(); event.stopPropagation();
    
    switch(event.code) {
      case 'KeyW': this.keys.w = true; break;
      case 'KeyA': this.keys.a = true; break;
      case 'KeyS': this.keys.s = true; break;
      case 'KeyD': this.keys.d = true; break;
      case 'ShiftLeft': case 'ShiftRight':
        this.keys.shift = true; this.isRunning = true; break;
      case 'Space':
        this.keys.space = true;
        this._tryJump();
        break;
      case 'KeyC':
        if (!this.keys.c) { // toggle on first press
          this.keys.c = true;
          this.isCrouching = !this.isCrouching;
        }
        break;
      default: {
        if (event.code.startsWith('Digit')) {
          const n = parseInt(event.code.slice(5), 10);
          if (!Number.isNaN(n)) this._selectWeaponIndex(n);
        }
      }
    }
    // Recompute immediately to react this frame
    this._updateMovementState();
    this._updateAnimationState(true);
  }
  
  _handleKeyUp(event) {
    if (!this.inputEnabled || !this._isGameInput(event)) return;
    event.preventDefault(); event.stopPropagation();
    
    switch(event.code) {
      case 'KeyW': this.keys.w = false; break;
      case 'KeyA': this.keys.a = false; break;
      case 'KeyS': this.keys.s = false; break;
      case 'KeyD': this.keys.d = false; break;
      case 'ShiftLeft': case 'ShiftRight':
        this.keys.shift = false; this.isRunning = false; break;
      case 'Space': this.keys.space = false; break;
      case 'KeyC': this.keys.c = false; break;
    }
    // Recompute immediately to react this frame
    this._updateMovementState();
    this._updateAnimationState(true);
  }
  
  _handleMouseDown(event) {
    // Ignore clicks on the menu to prevent attack/race
    if (event.target && event.target.closest && event.target.closest('#menu')) return;
    if (!this.inputEnabled) return;
    
    const canvas = this.viewer.canvas;
    const path = event.composedPath ? event.composedPath() : [];
    if (!(path.includes(canvas) || event.target === canvas)) return;
    
    event.preventDefault(); event.stopPropagation();
    
    if (event.button === 0) {
      this.keys.mouse1 = true;
      if (!this.upperAction) this._tryAttack();
    } else if (event.button === 2) {
      this.keys.mouse2 = true;
      this._startCameraControl(event);
    }
  }
  
  _handleMouseUp(event) {
    if (!this.inputEnabled) return;
    if (event.target && event.target.closest && event.target.closest('#menu')) return;
    event.preventDefault(); event.stopPropagation();
    
    if (event.button === 0) {
      this.keys.mouse1 = false;
    } else if (event.button === 2) {
      this.keys.mouse2 = false;
      this._endCameraControl();
    }
  }
  
  _handleMouseMove(event) {
    if (this.cameraControlActive && this.inputEnabled) {
      event.preventDefault(); event.stopPropagation();
      this._updateCameraFromMouse(event);
    }
  }

  // ---------- Weapons ----------
  _selectWeaponIndex(index) {
    if (!Array.isArray(this.weapons) || this.weapons.length === 0) return;
    const name = this.weapons[index] || 'none';
    if (!name) return;
    if (this.getCurrentWeaponName() === name) {
      this.currentWeapon = 0;
      this.player.setWeapon(null);
    } else {
      this.currentWeapon = Math.max(0, Math.min(this.weapons.length - 1, index));
      this._equipWeapon(this.weapons[this.currentWeapon]);
    }
    this._updateAnimationState(true);
  }
  
  async _equipWeapon(weaponName) {
    if (weaponName === 'none') {
      this.player.setWeapon(null);
      return;
    }
    if (!this.weaponObjects.has(weaponName)) {
      try {
        const { Q3_Weapon } = await import('./q3/q3-weapon.js');
        const weapon = new Q3_Weapon(
          this.player.gl, 
          `/models/weapons/${weaponName}/`, 
          weaponName, 
          this.player.texturepool
        );
        await weapon.load();
        this.weaponObjects.set(weaponName, weapon);
        this.player.setWeapon(weapon);
      } catch (e) {
        console.warn('Failed to load weapon', weaponName, e);
        this.currentWeapon = 0;
      }
    } else {
      this.player.setWeapon(this.weaponObjects.get(weaponName));
    }
  }
  
  // ---------- Helpers for crossfade ----------
  _currentPoseFrame(part) {
    if (part === 'upper') {
      const info = this.player.torsoAnim;
      const t = this.viewer.getTimeUpperSec();
      const { a, b, t: frac } = this.player.constructor.evalAnimFramePair(info, t);
      return (frac < 0.5 ? a : b);
    } else {
      const info = this.player.legsAnim;
      const t = this.viewer.getTimeLowerSec();
      const { a, b, t: frac } = this.player.constructor.evalAnimFramePair(info, t);
      return (frac < 0.5 ? a : b);
    }
  }
  
  _firstFrameOf(part, name) {
    if (!this.player || !this.player.animCFG) return 0;
    const anim = part === 'upper' ? this.player.animCFG.getTorso(name) : this.player.animCFG.getLegs(name);
    return anim ? anim.firstFrame : 0;
  }

  _lastFrameOf(part, name) {
    if (!this.player || !this.player.animCFG) return 0;
    const anim = part === 'upper' ? this.player.animCFG.getTorso(name) : this.player.animCFG.getLegs(name);
    if (!anim) return 0;
    return anim.firstFrame + Math.max(1, anim.numFrames) - 1;
  }
  
  // ---------- One-shot helpers ----------
  _animInfo(part, name) {
    if (!this.player || !this.player.animCFG) return null;
    return part === 'upper' ? this.player.animCFG.getTorso(name) : this.player.animCFG.getLegs(name);
  }
  
  _startUpperOneShot(name) {
    const info = this._animInfo('upper', name);
    if (!info) return;
    if (this.upperAction) return;

    const from = this._currentPoseFrame('upper');
    const to = info.firstFrame;
    this.player.startTorsoCrossfade(from, to, 0.10);
    
    const duration = Math.max(0.001, info.numFrames / Math.max(1, info.fps));
    this._setTorso(name); 
    this.viewer.setPlayingUpper(false);
    this.viewer.timeUpperSec = 0;
    this.upperAction = { name, duration, elapsed: 0 };
    this.viewer.ensureAnimating();
  }
  
  _startLowerOneShot(name, chainTo=null) {
    const info = this._animInfo('lower', name);
    if (!info) return;
    if (this.lowerAction) return;

    const from = this._currentPoseFrame('lower');
    const to = info.firstFrame;
    this.player.startLegsCrossfade(from, to, 0.10);
    
    const duration = Math.max(0.001, info.numFrames / Math.max(1, info.fps));
    this._setLegs(name);
    this.viewer.setPlayingLower(false);
    this.viewer.timeLowerSec = 0;
    this.lowerAction = { name, duration, elapsed: 0 };
    this.lowerChainNext = chainTo || null;
    this.viewer.ensureAnimating();
  }
  
  _updateUpperOneShot(dt) {
    if (!this.upperAction) return;
    const act = this.upperAction;
    act.elapsed += dt;
    this.viewer.timeUpperSec = Math.max(0, act.elapsed);
    if (act.elapsed >= act.duration) {
      const from = this._lastFrameOf('upper', act.name);
      const hasWeapon = this.currentWeapon > 0 && this.weapons[this.currentWeapon] !== 'gauntlet';
      const stance = hasWeapon ? 'TORSO_STAND' : 'TORSO_STAND2';
      const to = this._firstFrameOf('upper', stance);
      this.player.startTorsoCrossfade(from, to, 0.10);

      this.upperAction = null;
      this.viewer.setPlayingUpper(true);
      this.isAttacking = false;
      this._updateAnimationState(true);
    }
  }
  
  _updateLowerOneShot(dt) {
    if (!this.lowerAction) return;
    const act = this.lowerAction;
    act.elapsed += dt;
    this.viewer.timeLowerSec = Math.max(0, act.elapsed);
    if (act.elapsed >= act.duration) {
      if (this.lowerChainNext) {
        const from = this._lastFrameOf('lower', act.name);
        const nextName = this.lowerChainNext;
        const nextInfo = this._animInfo('lower', nextName);
        const to = nextInfo ? nextInfo.firstFrame : 0;
        this.player.startLegsCrossfade(from, to, 0.08);

        const durationNext = nextInfo ? Math.max(0.001, nextInfo.numFrames / Math.max(1, nextInfo.fps)) : 0.12;
        this.lowerAction = { name: nextName, duration: durationNext, elapsed: 0 };
        this.lowerChainNext = null;
        this._setLegs(nextName);
        this.viewer.setPlayingLower(false);
        this.viewer.timeLowerSec = 0;
      } else {
        const from = this._lastFrameOf('lower', act.name);
        const isMoving = this.currentSpeed > 0;
        let legs = 'LEGS_IDLE';
        if (this.isCrouching) legs = isMoving ? 'LEGS_WALKCR' : 'LEGS_IDLECR';
        else if (isMoving) legs = this.isRunning ? 'LEGS_RUN' : 'LEGS_WALK';
        const to = this._firstFrameOf('lower', legs);
        this.player.startLegsCrossfade(from, to, 0.10);

        this.lowerAction = null;
        this.viewer.setPlayingLower(true);
        this.isJumping = false;
        this._updateAnimationState(true);
      }
    }
  }
  
  // ---------- Actions ----------
  _tryJump() {
    if (this.isJumping || this.lowerAction) return;
    this.isJumping = true;
    this._startLowerOneShot('LEGS_JUMP', 'LEGS_LAND');
  }
  
  _tryAttack() {
    if (this.attackCooldown > 0 || this.isAttacking || this.upperAction) return;
    const hasWeapon = this.currentWeapon > 0 && this.weapons[this.currentWeapon] !== 'gauntlet';
    this.isAttacking = true;
    this.attackCooldown = 0.5;

    // Muzzle flash (if weapon has flash model)
    try {
      const w = this.player && this.player.weapon;
      if (w && typeof w.triggerFlash === 'function') {
        w.triggerFlash(90);
      }
    } catch {}

    this._startUpperOneShot(hasWeapon ? 'TORSO_ATTACK' : 'TORSO_ATTACK2');
  }
  
  performGesture() { if (!this.upperAction) this._startUpperOneShot('TORSO_GESTURE'); }
  performDrop()    { if (!this.upperAction) this._startUpperOneShot('TORSO_DROP'); }
  performRaise()   { if (!this.upperAction) this._startUpperOneShot('TORSO_RAISE'); }
  performBackJump(){ if (!this.lowerAction) this._startLowerOneShot('LEGS_JUMPB', 'LEGS_LANDB'); }
  performTurn()    { if (!this.lowerAction) this._startLowerOneShot('LEGS_TURN'); }

  // ---------- Movement / Anim state ----------
  _updateMovementState() {
    const screenInput = vec3.fromValues(0, 0, 0);
    if (this.keys.w) screenInput[2] -= 1;
    if (this.keys.s) screenInput[2] += 1;
    if (this.keys.d) screenInput[0] -= 1;
    if (this.keys.a) screenInput[0] += 1;
    
    const isMoving = vec3.length(screenInput) > 0;
    if (isMoving) {
      vec3.normalize(screenInput, screenInput);
      const yaw = this.camera.orbitAngles.theta;
      const cameraForward = vec3.fromValues(-Math.sin(yaw), 0, -Math.cos(yaw));
      const cameraRight = vec3.fromValues(Math.cos(yaw), 0, -Math.sin(yaw));
      
      vec3.set(this.worldMoveDirection, 0, 0, 0);
      vec3.scaleAndAdd(this.worldMoveDirection, this.worldMoveDirection, cameraForward, screenInput[2]);
      vec3.scaleAndAdd(this.worldMoveDirection, this.worldMoveDirection, cameraRight, screenInput[0]);
      vec3.normalize(this.worldMoveDirection, this.worldMoveDirection);
      
      this.targetFacing = Math.atan2(this.worldMoveDirection[0], this.worldMoveDirection[2]);
      this.currentSpeed = this.isCrouching ? this.crouchSpeed : (this.isRunning ? this.runSpeed : this.walkSpeed);
    } else {
      vec3.set(this.worldMoveDirection, 0, 0, 0);
      this.currentSpeed = 0;
    }
  }
  
  _updateAnimationState(immediate=false) {
    // Torso stance
    if (!this.upperAction && !this.isAttacking) {
      const hasWeapon = this.currentWeapon > 0 && this.weapons[this.currentWeapon] !== 'gauntlet';
      const nextTorso = hasWeapon ? 'TORSO_STAND' : 'TORSO_STAND2';
      if (nextTorso !== this.currentTorsoName) {
        const from = this._currentPoseFrame('upper');
        const to = this._firstFrameOf('upper', nextTorso);
        this.player.startTorsoCrossfade(from, to, 0.08);
      }
      this._setTorso(nextTorso, immediate);
    }
    // Legs locomotion
    if (!this.lowerAction && !this.isJumping) {
      const isMoving = this.currentSpeed > 0;
      let nextLegs = 'LEGS_IDLE';
      if (this.isCrouching) nextLegs = isMoving ? 'LEGS_WALKCR' : 'LEGS_IDLECR';
      else if (isMoving) nextLegs = this.isRunning ? 'LEGS_RUN' : 'LEGS_WALK';

      if (nextLegs !== this.currentLegsName) {
        const from = this._currentPoseFrame('lower');
        const to = this._firstFrameOf('lower', nextLegs);
        this.player.startLegsCrossfade(from, to, 0.08);
      }
      this._setLegs(nextLegs, immediate);
    }
  }

  _setTorso(name, preserve=false) {
    if (this.currentTorsoName === name) return;
    this.player.setTorsoAnimation(name);
    if (preserve && this.viewer) {
      this.viewer.timeUpperSec = 0;
    }
    this.currentTorsoName = name;
  }
  _setLegs(name, preserve=false) {
    if (this.currentLegsName === name) return;
    this.player.setLegsAnimation(name);
    if (preserve && this.viewer) {
      this.viewer.timeLowerSec = 0;
    }
    this.currentLegsName = name;
  }
  
  // ---------- Camera ----------
  _startCameraControl(event) {
    this.cameraControlActive = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    document.body.style.cursor = 'grabbing';
  }
  
  _updateCameraFromMouse(event) {
    const dx = event.clientX - this.lastMouseX;
    const dy = event.clientY - this.lastMouseY;
    this.camera.orbitAngles.theta -= dx * 0.005;
    this.camera.orbitAngles.phi -= dy * 0.005;
    this.camera.orbitAngles.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.camera.orbitAngles.phi));
    this.camera.update();
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    if (this.viewer && this.viewer.draw) this.viewer.draw();
    // Recompute movement state after camera change so screen space stays correct
    this._updateMovementState();
    this._updateAnimationState();
  }
  
  _endCameraControl() {
    this.cameraControlActive = false;
    document.body.style.cursor = '';
  }
  
  // ---------- Update ----------
  update(deltaTime) {
    this._updateMovementState();
    this._updateAnimationState();

    this._updateUpperOneShot(deltaTime);
    this._updateLowerOneShot(deltaTime);
    
    // Smooth facing towards movement
    if (this.currentSpeed > 0) {
      let angleDiff = this.targetFacing - this.facing;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      if (Math.abs(angleDiff) > 1e-3) {
        const rot = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.facingSpeed * deltaTime);
        this.facing += rot;
        while (this.facing > Math.PI) this.facing -= 2 * Math.PI;
        while (this.facing < -Math.PI) this.facing += 2 * Math.PI;
      }
    }
    
    // Ground scroll
    if (this.currentSpeed > 0 && this.ground && this.ground.setTextureOffset) {
      const scrollSpeed = this.currentSpeed * 0.008;
      const scrollX = -this.worldMoveDirection[0] * scrollSpeed * deltaTime;
      const scrollZ = -this.worldMoveDirection[2] * scrollSpeed * deltaTime;
      this.groundOffset[0] += scrollX;
      this.groundOffset[2] += scrollZ;
      this.ground.setTextureOffset(this.groundOffset[0], this.groundOffset[2]);
    }
    
    // Cooldowns
    if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
  }
  
  hasActiveOneShot() {
    return !!(this.upperAction || this.lowerAction);
  }
  
  // ---------- Rendering transform ----------
  getModelMatrix() {
    // FIX: rotate around Z (Q3 models), with +PI/2 offset to align forward properly
    const m = mat4.create();
    mat4.fromZRotation(m, this.facing + Math.PI / 2);
    return m;
  }
  
  // ---------- Info & state ----------
  getCurrentWeaponName() { return this.weapons[this.currentWeapon] || 'none'; }
  getMovementInfo() {
    return {
      speed: this.currentSpeed,
      isMoving: this.currentSpeed > 0,
      isRunning: this.isRunning,
      isCrouching: this.isCrouching,
      isAttacking: this.isAttacking || !!this.upperAction,
      isJumping: this.isJumping || !!this.lowerAction,
      facing: this.facing,
      targetFacing: this.targetFacing,
      weapon: this.getCurrentWeaponName(),
      inputEnabled: this.inputEnabled
    };
  }
  getState() {
    return {
      facing: this.facing,
      targetFacing: this.targetFacing,
      isCrouching: this.isCrouching,
      currentWeapon: this.getCurrentWeaponName(),
      groundOffset: [this.groundOffset[0], this.groundOffset[2]]
    };
  }
  applyState(state) {
    if (!state) return;
    if (typeof state.facing === 'number') this.facing = state.facing;
    if (typeof state.targetFacing === 'number') this.targetFacing = state.targetFacing;
    if (typeof state.isCrouching === 'boolean') this.isCrouching = state.isCrouching;
    if (Array.isArray(state.groundOffset) && state.groundOffset.length === 2) {
      this.groundOffset[0] = state.groundOffset[0];
      this.groundOffset[2] = state.groundOffset[1];
      if (this.ground && this.ground.setTextureOffset) {
        this.ground.setTextureOffset(this.groundOffset[0], this.groundOffset[2]);
      }
    }
    if (typeof state.currentWeapon === 'string') {
      const idx = this.weapons.indexOf(state.currentWeapon);
      this.currentWeapon = idx >= 0 ? idx : 0;
      // Ensure player weapon object matches
      if (this.currentWeapon === 0) this.player.setWeapon(null);
      else this._equipWeapon(this.weapons[this.currentWeapon]);
    }
    this._updateAnimationState(true);
  }
  
  // ---------- Cleanup ----------
  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown, true);
    window.removeEventListener('keyup', this._boundKeyUp, true);
    window.removeEventListener('mousedown', this._boundMouseDown, true);
    window.removeEventListener('mouseup', this._boundMouseUp, true);
    window.removeEventListener('mousemove', this._boundMouseMove, true);
    window.removeEventListener('contextmenu', this._boundContextMenu, true);
    window.removeEventListener('focus', this._boundFocus);
    window.removeEventListener('blur', this._boundBlur);
    document.body.style.cursor = '';
  }
}

export default CharacterController;