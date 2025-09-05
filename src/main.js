import { Viewer } from './viewer.js';
import AudioManager from './audio/AudioManager.js';
import { loadPlayersIndex, loadWeaponsIndex, getPlayerInfo } from './data/assets.js';

const canvas = document.getElementById('webgl-canvas');

// Model selections
const characterSelect = document.getElementById('character-select');
const weaponSelect = document.getElementById('weapon-select');
const lodSelect = document.getElementById('lod-select');
const torsoAnimSelect = document.getElementById('torso-anim-select');
const legsAnimSelect = document.getElementById('legs-anim-select');

// Skin selection
const skinSelect = document.getElementById('skin-select');

// Animation controls
const btnAll = document.getElementById('play-pause-all');
const btnUpper = document.getElementById('play-pause-upper');
const sliderUpper = document.getElementById('slider-upper');
const readoutUpper = document.getElementById('readout-upper');
const btnLower = document.getElementById('play-pause-lower');
const sliderLower = document.getElementById('slider-lower');
const readoutLower = document.getElementById('readout-lower');

// One-shot action buttons
const btnGesture = document.getElementById('btn-gesture');
const btnDrop = document.getElementById('btn-drop');
const btnRaise = document.getElementById('btn-raise');
const btnBackJump = document.getElementById('btn-back-jump');
const btnTurn = document.getElementById('btn-turn');

// Character controller status
const statusWeapon = document.getElementById('status-weapon');
const statusMovement = document.getElementById('status-movement');
const statusAction = document.getElementById('status-action');

// Shadow controls
const shadowsEnabled = document.getElementById('shadows-enabled');
const shadowResolution = document.getElementById('shadow-resolution');
const shadowIntensity = document.getElementById('shadow-intensity');
const shadowIntensityValue = document.getElementById('shadow-intensity-value');
const shadowBias = document.getElementById('shadow-bias');
const shadowBiasValue = document.getElementById('shadow-bias-value');
const poissonRadius = document.getElementById('poisson-radius');
const poissonRadiusValue = document.getElementById('poisson-radius-value');

// Light controls
const lightSize = document.getElementById('light-size');
const lightSizeValue = document.getElementById('light-size-value');
const lightElevation = document.getElementById('light-elevation');
const lightElevationValue = document.getElementById('light-elevation-value');
const lightAzimuth = document.getElementById('light-azimuth');
const lightAzimuthValue = document.getElementById('light-azimuth-value');

// Music controls
const musicEnabled = document.getElementById('music-enabled');
const musicVolume = document.getElementById('music-volume');
const musicVolumeValue = document.getElementById('music-volume-value');

let viewer = null;
let lastCameraState = null;
let lastControllerState = null;

// Shared AudioManager instance
let sharedAudioManager = null;

// Dynamic assets (support stubs via assets.js)
let PLAYERS = [];
let WEAPONS = [];

// ---------------------------- Helpers ----------------------------
function canvasCssPixels() {
  const vw = window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth;
  const vh = window.visualViewport?.height || document.documentElement.clientHeight || window.innerHeight;
  return { w: Math.max(1, Math.floor(vw)), h: Math.max(1, Math.floor(vh)) };
}

function resizeCanvasToDisplaySize() {
  const { w, h } = canvasCssPixels();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(w * dpr);
  const height = Math.floor(h * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    if (viewer) viewer.handleResize();
  }
}

function setBtnState(btn, playing) {
  btn.classList.toggle('paused', !playing);
  if (btn === btnAll) {
    btn.textContent = playing ? 'PAUSE ALL' : 'PLAY ALL';
  } else {
    btn.textContent = playing ? 'PAUSE' : 'PLAY';
  }
}

function shieldButton(btn, handler) {
  if (!btn) return;
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
  btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    handler?.();
  }, true);
}

// ---------------------------- Dynamic UI from assets ----------------------------
function populateCharacterSelect(preferred = null) {
  characterSelect.innerHTML = '';

  // Always include a "none" option so we can gracefully load nothing.
  const noneOpt = document.createElement('option');
  noneOpt.value = 'none';
  noneOpt.textContent = 'NO PLAYER';
  characterSelect.appendChild(noneOpt);

  for (const p of PLAYERS) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.stub ? `${p.name.toUpperCase()} (STUB)` : p.name.toUpperCase();
    if (p.stub) {
      opt.disabled = true;
      opt.title = p.notes || 'Stub (not included)';
    }
    characterSelect.appendChild(opt);
  }

  // Pick selection:
  // - preferred if non-stub
  // - else first non-stub player
  // - else 'none'
  let target = null;
  if (preferred && PLAYERS.some(p => p.name === preferred && !p.stub)) {
    target = preferred;
  } else {
    const firstNonStub = PLAYERS.find(p => !p.stub);
    target = firstNonStub ? firstNonStub.name : 'none';
  }
  characterSelect.value = target;
}

function populateWeaponSelect(preferred = 'none') {
  weaponSelect.innerHTML = '';
  // Always 'none'
  const noneOpt = document.createElement('option');
  noneOpt.value = 'none';
  noneOpt.textContent = 'UNARMED';
  weaponSelect.appendChild(noneOpt);
  // Rest from WEAPONS (disable stubs)
  for (const w of WEAPONS) {
    const opt = document.createElement('option');
    opt.value = w.name;
    opt.textContent = w.stub ? `${w.name.toUpperCase()} (STUB)` : w.name.toUpperCase();
    if (w.stub) {
      opt.disabled = true;
      opt.title = w.notes || 'Stub (not included)';
    }
    weaponSelect.appendChild(opt);
  }
  const valid = preferred === 'none' || WEAPONS.some(w => w.name === preferred && !w.stub);
  weaponSelect.value = valid ? preferred : 'none';
}

function populateSkinOptions(character, keepSelection = false) {
  // If no player selected, just keep one "default" skin in UI to avoid confusion
  if (character === 'none' || !character) {
    skinSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = 'default';
    opt.textContent = 'DEFAULT';
    skinSelect.appendChild(opt);
    skinSelect.value = 'default';
    return;
  }

  const info = getPlayerInfo(PLAYERS, character) || { skins: ['default'] };
  const skins = info.skins && info.skins.length ? info.skins : ['default'];
  const prev = keepSelection ? skinSelect.value : null;
  skinSelect.innerHTML = '';
  for (const s of skins) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s.toUpperCase();
    skinSelect.appendChild(opt);
  }
  const target = (prev && skins.includes(prev)) ? prev : 'default';
  skinSelect.value = target;
}

function syncLodEnabledForCharacter(character) {
  const info = getPlayerInfo(PLAYERS, character) || { hasVariants: false };
  if (!info.hasVariants || character === 'none') {
    lodSelect.value = '0';
    lodSelect.disabled = true;
  } else {
    lodSelect.disabled = false;
  }
}

// ---------------------------- Animation UI ----------------------------
function refreshAnimLists() {
  if (!viewer) return;
  const { torso, legs } = viewer.getAnimationNames();
  const selected = viewer.getSelectedAnims();

  const fill = (sel, names, currentValue) => {
    const prev = currentValue || sel.value;
    sel.innerHTML = '';
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }
    if (prev && names.includes(prev)) sel.value = prev;
  };

  fill(torsoAnimSelect, torso, selected.torso);
  fill(legsAnimSelect, legs, selected.legs);
}

function refreshUpperTimeline() {
  if (!viewer) return;
  const info = viewer.getUpperAnimInfo();
  if (!info) {
    sliderUpper.min = '0'; sliderUpper.max = '0'; sliderUpper.value = '0';
    readoutUpper.textContent = `0 / 0`;
    return;
  }
  sliderUpper.min = '0';
  sliderUpper.max = String(Math.max(0, info.numFrames - 1));
  const curFrame = Math.floor(viewer.getTimeUpperSec() * info.fps) % Math.max(1, info.numFrames);
  readoutUpper.textContent = `${curFrame} / ${Math.max(0, info.numFrames - 1)}`;
  if (viewer.isPlayingUpper() === true && document.activeElement !== sliderUpper) {
    sliderUpper.value = String(curFrame);
  }
}

function refreshLowerTimeline() {
  if (!viewer) return;
  const info = viewer.getLowerAnimInfo();
  if (!info) {
    sliderLower.min = '0'; sliderLower.max = '0'; sliderLower.value = '0';
    readoutLower.textContent = `0 / 0`;
    return;
  }
  sliderLower.min = '0';
  sliderLower.max = String(Math.max(0, info.numFrames - 1));
  const curFrame = Math.floor(viewer.getTimeLowerSec() * info.fps) % Math.max(1, info.numFrames);
  readoutLower.textContent = `${curFrame} / ${Math.max(0, info.numFrames - 1)}`;
  if (viewer.isPlayingLower() === true && document.activeElement !== sliderLower) {
    sliderLower.value = String(curFrame);
  }
}

function refreshAllTimelinesAndButtons() {
  setBtnState(btnAll, viewer.isPlayingUpper() && viewer.isPlayingLower());
  setBtnState(btnUpper, viewer.isPlayingUpper());
  setBtnState(btnLower, viewer.isPlayingLower());
  refreshUpperTimeline();
  refreshLowerTimeline();
  updateCharacterStatus();
}

// ---------------------------- Shadows & Music ----------------------------
function updateShadowControls() {
  if (!viewer) return;
  const shadowSystem = viewer.getShadowSystem();
  if (!shadowSystem) return;

  if (!shadowSystem.isSupported()) {
    shadowsEnabled.checked = false;
    shadowsEnabled.disabled = true;
    shadowResolution.disabled = true;
    shadowIntensity.disabled = true;
    shadowBias.disabled = true;
    poissonRadius.disabled = true;
    lightSize.disabled = true;
    lightElevation.disabled = true;
    lightAzimuth.disabled = true;

    shadowIntensityValue.textContent = 'N/A';
    shadowBiasValue.textContent = 'N/A';
    poissonRadiusValue.textContent = 'N/A';
    lightSizeValue.textContent = 'N/A';
    lightElevationValue.textContent = 'N/A';
    lightAzimuthValue.textContent = 'N/A';
    return;
  }

  shadowSystem.setEnabled(shadowsEnabled.checked);
  shadowSystem.setShadowMapSize(parseInt(shadowResolution.value));
  shadowSystem.setIntensity(parseFloat(shadowIntensity.value));
  shadowSystem.setBias(parseFloat(shadowBias.value));
  shadowSystem.setPoissonRadius(parseFloat(poissonRadius.value));
  shadowSystem.setLightSize(parseFloat(lightSize.value));
  shadowSystem.setLightElevation(parseFloat(lightElevation.value));
  shadowSystem.setLightAzimuth(parseFloat(lightAzimuth.value));

  shadowIntensityValue.textContent = Number(shadowIntensity.value).toFixed(2);
  shadowBiasValue.textContent = Number(shadowBias.value).toFixed(4);
  poissonRadiusValue.textContent = Number(poissonRadius.value).toFixed(2);
  lightSizeValue.textContent = lightSize.value;
  lightElevationValue.textContent = lightElevation.value + '°';
  lightAzimuthValue.textContent = lightAzimuth.value + '°';

  viewer.draw();
}

function setupShadowControlListeners() {
  shadowsEnabled.addEventListener('change', updateShadowControls);
  shadowResolution.addEventListener('change', updateShadowControls);
  shadowIntensity.addEventListener('input', updateShadowControls);
  shadowBias.addEventListener('input', updateShadowControls);
  poissonRadius.addEventListener('input', updateShadowControls);
  lightSize.addEventListener('input', updateShadowControls);
  lightElevation.addEventListener('input', updateShadowControls);
  lightAzimuth.addEventListener('input', updateShadowControls);
}

async function initializeSharedAudio() {
  if (!sharedAudioManager) {
    sharedAudioManager = new AudioManager();
    try {
      const seed = Date.now() & 0xffff;
      await sharedAudioManager.initialize(seed, { autostartMusic: false });
    } catch (error) {
      console.warn('Failed to initialize shared audio:', error);
    }
  }
}

function updateMusicControls() {
  if (!sharedAudioManager) return;

  if (musicEnabled.checked && !sharedAudioManager.isPlaying()) {
    sharedAudioManager.startMusic();
  } else if (!musicEnabled.checked && sharedAudioManager.isPlaying()) {
    sharedAudioManager.stopMusic();
  }

  const volume = parseFloat(musicVolume.value);
  sharedAudioManager.setMusicVolume(volume);
  musicVolumeValue.textContent = Number(volume).toFixed(2);
}

function setupMusicControlListeners() {
  musicEnabled.addEventListener('change', updateMusicControls);
  musicVolume.addEventListener('input', updateMusicControls);
}

// ---------------------------- Status Panel ----------------------------
function updateCharacterStatus() {
  if (!viewer || !viewer.getCharacterController()) {
    statusWeapon.textContent = 'UNARMED';
    statusMovement.textContent = 'NO PLAYER';
    statusAction.textContent = 'READY';
    return;
  }
  const controller = viewer.getCharacterController();
  const info = controller.getMovementInfo();

  statusWeapon.textContent = (info.weapon || 'none').toUpperCase();

  let movementText = 'IDLE';
  if (info.isMoving) {
    if (info.isCrouching) movementText = 'CROUCH WALKING';
    else if (info.isRunning) movementText = 'RUNNING';
    else movementText = 'WALKING';
  } else if (info.isCrouching) {
    movementText = 'CROUCHING';
  }
  statusMovement.textContent = movementText;

  const actions = [];
  if (info.isAttacking) actions.push('ATTACKING');
  if (info.isJumping) actions.push('JUMPING');
  if (!info.inputEnabled) actions.push('UNFOCUSED');
  statusAction.textContent = actions.length ? actions.join(' + ') : 'READY';

  const statusItems = document.querySelectorAll('.status-item');
  statusItems.forEach(item => {
    const value = item.querySelector('.status-value');
    if (value && (value.textContent.includes('ATTACKING') || value.textContent.includes('JUMPING'))) {
      item.style.borderColor = 'var(--accent-red)';
      item.style.background = 'linear-gradient(135deg, rgba(255, 51, 0, 0.2), rgba(255, 102, 0, 0.1))';
    } else {
      item.style.borderColor = 'rgba(255, 102, 0, 0.2)';
      item.style.background = 'linear-gradient(135deg, rgba(255, 102, 0, 0.1), rgba(255, 51, 0, 0.05))';
    }
  });
}

// ---------------------------- Viewer boot ----------------------------
async function initViewer(character, initialWeapon, previousControllerState = null) {
  await initializeSharedAudio();

  if (viewer) {
    try { lastCameraState = viewer.getCameraState(); } catch { lastCameraState = null; }
    try { lastControllerState = viewer.getControllerState(); } catch { lastControllerState = null; }
    viewer.destroy();
  }

  viewer = new Viewer(canvas, character || 'none', initialWeapon || 'none', lastCameraState, sharedAudioManager);

  viewer.onReady = async () => {
    const controller = viewer.getCharacterController();
    if (controller) {
      controller.weapons = ['none', ...WEAPONS.filter(w => !w.stub).map(w => w.name)];
    }

    const toApply = previousControllerState || lastControllerState;
    if (toApply) {
      viewer.applyControllerState(toApply);
      try {
        const restoredWeapon = toApply.currentWeapon || 'none';
        if (Array.from(weaponSelect.options).some(o => o.value === restoredWeapon && !o.disabled)) {
          weaponSelect.value = restoredWeapon;
        }
      } catch {}
    } else if (initialWeapon && initialWeapon !== 'none') {
      const ok = Array.from(weaponSelect.options).some(o => o.value === initialWeapon && !o.disabled);
      if (ok) await viewer.setWeapon(initialWeapon, parseInt(lodSelect.value, 10) || 0);
    }

    // Skins + LOD
    populateSkinOptions(characterSelect.value, false);
    await viewer.setSkinSet(skinSelect.value || 'default');

    syncLodEnabledForCharacter(characterSelect.value);
    lodSelect.value = '0';
    await viewer.setAllVariants(0);
    await viewer.setWeaponVariant(0);

    refreshAnimLists();
    refreshAllTimelinesAndButtons();
    updateShadowControls();
    updateMusicControls();
    resizeCanvasToDisplaySize();
  };

  viewer.onTick = ({ upperSec, lowerSec }) => {
    if (viewer.isPlayingUpper()) {
      const info = viewer.getUpperAnimInfo();
      const f = info ? Math.floor(upperSec * info.fps) % Math.max(1, info.numFrames) : 0;
      readoutUpper.textContent = `${f} / ${Math.max(0, (info?.numFrames || 1) - 1)}`;
      if (document.activeElement !== sliderUpper) sliderUpper.value = String(f);
    }
    if (viewer.isPlayingLower()) {
      const info = viewer.getLowerAnimInfo();
      const f = info ? Math.floor(lowerSec * info.fps) % Math.max(1, info.numFrames) : 0;
      readoutLower.textContent = `${f} / ${Math.max(0, (info?.numFrames || 1) - 1)}`;
      if (document.activeElement !== sliderLower) sliderLower.value = String(f);
    }

    // Sync weapon select (ignore stub options)
    const controller = viewer.getCharacterController();
    if (controller) {
      const wname = controller.getCurrentWeaponName();
      const opt = Array.from(weaponSelect.options).find(o => o.value === wname);
      if (opt && !opt.disabled && weaponSelect.value !== wname) {
        weaponSelect.value = wname;
      }
    }

    updateCharacterStatus();
  };

  viewer.setPlayingUpper(true);
  viewer.setPlayingLower(true);
}

// ---------------------------- Event listeners ----------------------------
// Character selection
characterSelect.addEventListener('change', e => {
  const chosen = e.target.value;
  const pinfo = getPlayerInfo(PLAYERS, chosen);

  // If stub or invalid, fallback to 'none'
  if (!chosen || chosen === '' || pinfo?.stub) {
    characterSelect.value = 'none';
  }

  const prevState = viewer?.getControllerState ? viewer.getControllerState() : null;
  syncLodEnabledForCharacter(characterSelect.value);
  initViewer(characterSelect.value, weaponSelect.value, prevState);
});

// Weapon selection
weaponSelect.addEventListener('change', async (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.disabled) {
    weaponSelect.value = 'none';
  }
  const currentLod = parseInt(lodSelect.value, 10) || 0;
  await viewer?.setWeapon(weaponSelect.value, currentLod);
  updateCharacterStatus();
});

// LOD
lodSelect.addEventListener('change', async (e) => {
  const lod = parseInt(e.target.value, 10) || 0;
  if (!viewer) return;
  const info = getPlayerInfo(PLAYERS, characterSelect.value) || { hasVariants: false };
  if (!info.hasVariants && lod !== 0) {
    lodSelect.value = '0';
    return;
  }
  try {
    await Promise.all([
      viewer.setAllVariants(lod),
      viewer.setWeaponVariant(lod)
    ]);
  } catch (err) {
    console.warn('LOD change failed; reverting to 0', err);
    lodSelect.value = '0';
    await viewer.setAllVariants(0);
    await viewer.setWeaponVariant(0);
  }
  viewer.ensureAnimating();
  updateCharacterStatus();
});

// Skins
skinSelect.addEventListener('change', async (e) => {
  await viewer?.setSkinSet(e.target.value);
  viewer?.ensureAnimating();
});

// Anim pickers
torsoAnimSelect.addEventListener('change', (e) => {
  viewer?.setTorsoAnimation(e.target.value);
  refreshUpperTimeline();
});
legsAnimSelect.addEventListener('change', (e) => {
  viewer?.setLegsAnimation(e.target.value);
  refreshLowerTimeline();
});

// Play/pause
btnAll.addEventListener('click', () => {
  viewer.setPlayingUpper(!viewer.isPlayingUpper() || !viewer.isPlayingLower());
  viewer.setPlayingLower(!viewer.isPlayingUpper() || !viewer.isPlayingLower());
  refreshAllTimelinesAndButtons();
});
btnUpper.addEventListener('click', () => {
  viewer.setPlayingUpper(!viewer.isPlayingUpper());
  refreshAllTimelinesAndButtons();
});
btnLower.addEventListener('click', () => {
  viewer.setPlayingLower(!viewer.isPlayingLower());
  refreshAllTimelinesAndButtons();
});

// Timelines scrub
sliderUpper.addEventListener('input', (e) => {
  const frame = parseInt(e.target.value, 10) || 0;
  viewer?.setUpperFrame(frame);
  const info = viewer.getUpperAnimInfo();
  readoutUpper.textContent = `${frame} / ${Math.max(0, (info?.numFrames || 1) - 1)}`;
});
sliderLower.addEventListener('input', (e) => {
  const frame = parseInt(e.target.value, 10) || 0;
  viewer?.setLowerFrame(frame);
  const info = viewer.getLowerAnimInfo();
  readoutLower.textContent = `${frame} / ${Math.max(0, (info?.numFrames || 1) - 1)}`;
});

// Action buttons (prevent mousedown causing attack)
shieldButton(btnGesture, () => viewer?.getCharacterController()?.performGesture());
shieldButton(btnDrop, () => viewer?.getCharacterController()?.performDrop());
shieldButton(btnRaise, () => viewer?.getCharacterController()?.performRaise());
shieldButton(btnBackJump, () => viewer?.getCharacterController()?.performBackJump());
shieldButton(btnTurn, () => viewer?.getCharacterController()?.performTurn());

// Wire shadow & music controls
setupShadowControlListeners();
setupMusicControlListeners();

// ---------------------------- Startup ----------------------------
async function start() {
  // Load indexes (supports .jsonc comments)
  try {
    [PLAYERS, WEAPONS] = await Promise.all([loadPlayersIndex(), loadWeaponsIndex()]);
  } catch (e) {
    console.warn('Failed to load assets index:', e);
    PLAYERS = PLAYERS || [];
    WEAPONS = WEAPONS || [];
  }

  // Build selects with stub-aware flags
  populateCharacterSelect(characterSelect.value || null);
  populateWeaponSelect(weaponSelect.value || 'none');
  populateSkinOptions(characterSelect.value, false);
  syncLodEnabledForCharacter(characterSelect.value);

  // Default to 'none' if no non-stub players
  if (characterSelect.value !== 'none') {
    const pinfo = getPlayerInfo(PLAYERS, characterSelect.value);
    if (!pinfo || pinfo.stub) characterSelect.value = 'none';
  }

  await initViewer(characterSelect.value, weaponSelect.value, null);

  resizeCanvasToDisplaySize();
  window.addEventListener('resize', resizeCanvasToDisplaySize);
  window.addEventListener('orientationchange', resizeCanvasToDisplaySize);
}

start();