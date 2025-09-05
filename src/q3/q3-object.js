import { MD3_File } from '../md3/md3-file.js';
import { Q3_SkinFile } from '../skin/skin-file.js';
import { Q3_surface_VBO } from './q3-surface-vbo.js';
import { Q3_TexturePool } from './q3-texturepool.js';

function vlen(v){ return Math.hypot(v[0], v[1], v[2]); }
function vnorm(v){
  const l = vlen(v);
  if (l > 1e-8){ return [v[0]/l, v[1]/l, v[2]/l]; }
  return [0,0,1];
}
function vlerp(a,b,t){ return [ a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t ]; }

// Safe orthonormalization
function orthonormalizeBasis(X, Y, Z) {
  let x = vnorm(X);
  let z = vnorm(Z);
  if (vlen(z) < 1e-6) {
    z = vnorm([ x[1]*Y[2]-x[2]*Y[1], x[2]*Y[0]-x[0]*Y[2], x[0]*Y[1]-x[1]*Y[0] ]);
    if (vlen(z) < 1e-6) z = [0,0,1];
  }
  let y = vnorm([ z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0] ]);
  z = vnorm([ x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0] ]);
  return { X: x, Y: y, Z: z };
}

export class Q3_Object {
  constructor(gl, path, md3_filename, skin_filename, texturepool) {
    this.gl = gl;
    this.path = path;
    this.md3_filename = md3_filename;
    this.skin_filename = skin_filename;
    this.texturepool = texturepool || new Q3_TexturePool(gl);

    this.frame_IDX_max = 0;
    this.frame_IDX_cur = 0;
    this.surfaces = null;
    this.surfaces_count = 0;
    this.surface_vbo_list = [];
    this.texture_list = [];
    this.MD3_FILE = null;
    this.SKIN_FILE = null;
    this.onload = () => {};

    this.loaded = false;

    this._skinApplyToken = 0;

    // Per-surface metadata (cigar handling, transparent stages)
    this.surfaceMeta = [];

    // Additive alpha multiplier (used by muzzle flashes to fade)
    this.additiveAlpha = 1.0;
  }

  async load() {
    this.MD3_FILE = new MD3_File(this.path, this.md3_filename);
    await this.MD3_FILE.load();

    this.frame_IDX_max = this.MD3_FILE.header.S32_NUM_FRAMES - 1;
    this.frame_IDX_cur = 0;
    this.surfaces = this.MD3_FILE.surfaces;
    this.surfaces_count = this.surfaces.length;

    this.surface_vbo_list = new Array(this.surfaces_count);
    for (let i = 0; i < this.surfaces_count; i++) {
      this.surface_vbo_list[i] = new Q3_surface_VBO(this.gl, this.MD3_FILE, i);
    }

    // Init surface meta
    this.surfaceMeta = new Array(this.surfaces_count);
    for (let i = 0; i < this.surfaces_count; i++) {
      const rawName = this.surfaces[i].STR_NAME || '';
      const normKey = Q3_Object._normalizeSurfaceName(rawName);
      const isCigar = (normKey === 'h_cigar');
      this.surfaceMeta[i] = {
        name: rawName,
        normName: normKey,
        isCigar,
        hidden: false,
        glowTex: null,
        isLaser: false,
        isFlash: false,
        blend: 'opaque',          // 'opaque' | 'alpha' | 'add'
        uvScroll: [0, 0],         // scroll in UVs per second (S,T)
        // Laser fade metadata (computed from vertices when needed)
        laserAxis: [1, 0, 0],     // object-space axis for fade
        laserBounds: [0, 1],      // [min, max] projection along axis
        _laserComputed: false
      };
    }

    // Init textures
    if (!this.texture_list || this.texture_list.length !== this.surfaces_count) {
      this.texture_list = new Array(this.surfaces_count).fill(this.texturepool.getWhiteTexture());
    }

    // Load skin
    this.SKIN_FILE = new Q3_SkinFile(this.path, this.skin_filename);
    await this.SKIN_FILE.load();
    await this.applyTexturesFromSkinfileAsync(this.SKIN_FILE);

    this.loaded = true;
    this.onload();
  }

  static _normalizeSurfaceName(name) {
    if (!name) return '';
    let n = String(name).trim();
    n = n.replace(/\0+$/, '');
    n = n.replace(/_\d+$/, '');
    return n.toLowerCase();
  }

  _buildSkinLookup(skinfile) {
    const map = new Map();
    for (let i = 0; i < skinfile.surface_names.length; i++) {
      const surf = skinfile.surface_names[i];
      const imgName = skinfile.image_names[i];
      if (!surf || !imgName) continue;
      const exactKey = String(surf).trim().toLowerCase();
      const normKey = Q3_Object._normalizeSurfaceName(surf);
      if (!map.has(exactKey)) map.set(exactKey, imgName);
      if (!map.has(normKey)) map.set(normKey, imgName);
      for (let v = 1; v <= 3; v++) {
        const vkey = `${normKey}_${v}`;
        if (!map.has(vkey)) map.set(vkey, imgName);
      }
    }
    return map;
  }

  static _deriveCigarGlowName(diffuseName) {
    if (!diffuseName) return 'cigar.glow.tga';
    const idx = diffuseName.lastIndexOf('.');
    if (idx > 0) {
      return diffuseName.slice(0, idx) + '.glow' + diffuseName.slice(idx);
    }
    return diffuseName + '.glow';
  }

  static _isShotgunLaserTexture(name) {
    if (!name) return false;
    const low = String(name).toLowerCase();
    return /shotgun_laser(\.tga)?$/.test(low);
  }

  // Detect muzzle flash texture (f_*.tga)
  static _isFlashTexture(name) {
    if (!name) return false;
    const low = String(name).toLowerCase();
    return /^f_.*\.tga$/.test(low);
  }

  // Compute axis and bounds of a laser surface in object space using frame 0 vertices
  _computeLaserAxisAndBounds(surfaceIndex) {
    const meta = this.surfaceMeta[surfaceIndex];
    if (!this.MD3_FILE || !this.MD3_FILE.surfaces) return;

    const surf = this.MD3_FILE.surfaces[surfaceIndex];
    if (!surf || !surf.surface_frames || surf.surface_frames.length === 0) return;

    const vb = surf.surface_frames[0].vertexbuffer_xyzn; // [pos(3), normal(3)] per-vertex
    let minX = 1e9, minY = 1e9, minZ = 1e9;
    let maxX = -1e9, maxY = -1e9, maxZ = -1e9;

    for (let i = 0; i < vb.length; i += 6) {
      const x = vb[i + 0], y = vb[i + 1], z = vb[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;

    // Choose the dominant extent as the beam axis
    if (dx >= dy && dx >= dz) {
      meta.laserAxis = [1, 0, 0];
      meta.laserBounds = [minX, maxX];
    } else if (dy >= dx && dy >= dz) {
      meta.laserAxis = [0, 1, 0];
      meta.laserBounds = [minY, maxY];
    } else {
      meta.laserAxis = [0, 0, 1];
      meta.laserBounds = [minZ, maxZ];
    }

    meta._laserComputed = true;
  }

  _ensureLaserMeta(surfaceIndex) {
    const meta = this.surfaceMeta[surfaceIndex];
    if (meta && meta.isLaser && !meta._laserComputed) {
      this._computeLaserAxisAndBounds(surfaceIndex);
    }
  }

  applyTexturesFromSkinfile(skinfile) {
    const lookup = this._buildSkinLookup(skinfile);
    for (let i = 0; i < this.surfaces_count; i++) {
      const surface = this.surfaces[i];
      const rawName = surface.STR_NAME || '';
      const exactKey = String(rawName).trim().toLowerCase();
      const normKey  = Q3_Object._normalizeSurfaceName(rawName);

      let imgName = lookup.get(exactKey);
      if (!imgName) imgName = lookup.get(normKey);

      const meta = this.surfaceMeta[i] || {
        isCigar: (normKey === 'h_cigar'),
        hidden: false,
        glowTex: null,
        isLaser: false,
        isFlash: false,
        blend: 'opaque',
        uvScroll: [0,0],
        laserAxis:[1,0,0],
        laserBounds:[0,1],
        _laserComputed:false
      };

      // null.tga => hide
      const isNull = !!imgName && imgName.toLowerCase() === 'null.tga';
      meta.hidden = isNull;

      // Base texture
      if (imgName && !isNull) {
        this.texture_list[i] = this.texturepool.getTexture(this.path, imgName);
      } else {
        this.texture_list[i] = this.texturepool.getWhiteTexture();
      }

      // Cigar glow texture
      if (meta.isCigar && !meta.hidden) {
        const glowName = Q3_Object._deriveCigarGlowName(imgName || 'cigar.tga');
        meta.glowTex = this.texturepool.getTexture(this.path, glowName);
      } else {
        meta.glowTex = null;
      }

      // Transparent stages
      if (imgName && Q3_Object._isShotgunLaserTexture(imgName) && !meta.hidden) {
        meta.isLaser = true;
        meta.isFlash = false;
        meta.blend = 'add';
        meta.uvScroll = [0.75, 0.0];
        // Compute axis/bounds now
        this._ensureLaserMeta(i);
      } else if (imgName && Q3_Object._isFlashTexture(imgName) && !meta.hidden) {
        meta.isLaser = false;
        meta.isFlash = true;
        meta.blend = 'add';
        meta.uvScroll = [0.0, 0.0];
      } else {
        meta.isLaser = false;
        meta.isFlash = false;
        meta.blend = 'opaque';
        meta.uvScroll = [0, 0];
      }

      this.surfaceMeta[i] = meta;
    }
  }

  async applyTexturesFromSkinfileAsync(skinfile) {
    const currentToken = ++this._skinApplyToken;

    const lookup = this._buildSkinLookup(skinfile);
    const newTextures = new Array(this.surfaces_count);
    const promises = [];

    const newMeta = new Array(this.surfaces_count);
    for (let i = 0; i < this.surfaces_count; i++) {
      const surface = this.surfaces[i];
      const rawName = surface.STR_NAME || '';
      const exactKey = String(rawName).trim().toLowerCase();
      const normKey  = Q3_Object._normalizeSurfaceName(rawName);

      let imgName = lookup.get(exactKey);
      if (!imgName) imgName = lookup.get(normKey);

      const meta = this.surfaceMeta[i] || {
        isCigar: (normKey === 'h_cigar'),
        hidden: false,
        glowTex: null,
        isLaser: false,
        isFlash: false,
        blend: 'opaque',
        uvScroll: [0,0],
        laserAxis:[1,0,0],
        laserBounds:[0,1],
        _laserComputed:false
      };

      const isNull = !!imgName && imgName.toLowerCase() === 'null.tga';
      meta.hidden = isNull;

      let tex;
      if (imgName && !isNull) {
        tex = this.texturepool.getTexture(this.path, imgName);
      } else {
        tex = this.texturepool.getWhiteTexture();
      }
      newTextures[i] = tex;

      if (typeof tex.whenReady === 'function') {
        promises.push(tex.whenReady().catch(() => {}));
      }

      // Cigar glow texture (only when visible).
      if (meta.isCigar && !meta.hidden) {
        const glowName = Q3_Object._deriveCigarGlowName(imgName || 'cigar.tga');
        const glow = this.texturepool.getTexture(this.path, glowName);
        meta.glowTex = glow;
        if (typeof glow.whenReady === 'function') {
          promises.push(glow.whenReady().catch(() => {}));
        }
      } else {
        meta.glowTex = null;
      }

      // Transparent stages (laser / flash)
      if (imgName && Q3_Object._isShotgunLaserTexture(imgName) && !meta.hidden) {
        meta.isLaser = true;
        meta.isFlash = false;
        meta.blend = 'add';
        meta.uvScroll = [0.75, 0.0];
        // Compute axis/bounds now
        this._ensureLaserMeta(i);
      } else if (imgName && Q3_Object._isFlashTexture(imgName) && !meta.hidden) {
        meta.isLaser = false;
        meta.isFlash = true;
        meta.blend = 'add';
        meta.uvScroll = [0.0, 0.0];
      } else {
        meta.isLaser = false;
        meta.isFlash = false;
        meta.blend = 'opaque';
        meta.uvScroll = [0, 0];
      }

      newMeta[i] = meta;
    }

    await Promise.all(promises);

    if (currentToken !== this._skinApplyToken) return;

    this.texture_list = newTextures;
    this.surfaceMeta = newMeta;
  }

  setCurrentFrameIDX(frame_IDX) {
    this.frame_IDX_cur = frame_IDX;
    if (frame_IDX > this.frame_IDX_max) this.frame_IDX_cur = this.frame_IDX_max;
    if (frame_IDX < 0) this.frame_IDX_cur = 0;
    return this.frame_IDX_cur;
  }

  getTagByName(tag_name, frame_idx) {
    if (!this.MD3_FILE || !this.MD3_FILE.tag_frames) return null;
    frame_idx = (typeof frame_idx === 'number') ? frame_idx : this.frame_IDX_cur;
    if (frame_idx < 0) frame_idx = 0;
    if (frame_idx >= this.MD3_FILE.tag_frames.length) frame_idx = this.MD3_FILE.tag_frames.length - 1;
    const tagFrame = this.MD3_FILE.tag_frames[frame_idx];
    if (!tagFrame || !tagFrame.tags) return null;
    for (let i = 0; i < tagFrame.tags.length; i++) {
      if (tagFrame.tags[i].STR_NAME === tag_name) return tagFrame.tags[i];
    }
    return null;
  }

  getMinZAtFrame(frame) {
    if (!this.MD3_FILE || !this.MD3_FILE.frames) return 0;
    const idx = Math.max(0, Math.min(frame, this.MD3_FILE.frames.length - 1));
    return this.MD3_FILE.frames[idx].VEC3_MIN_BOUNDS[2] || 0;
  }

  static tagToMat4(tag) {
    const m = new Float32Array(16);
    m[0] = tag.VEC3_X_AXIS[0]; m[4] = tag.VEC3_Y_AXIS[0]; m[8]  = tag.VEC3_Z_AXIS[0]; m[12] = tag.VEC3_ORIGIN[0];
    m[1] = tag.VEC3_X_AXIS[1]; m[5] = tag.VEC3_Y_AXIS[1]; m[9]  = tag.VEC3_Z_AXIS[1]; m[13] = tag.VEC3_ORIGIN[1];
    m[2] = tag.VEC3_X_AXIS[2]; m[6] = tag.VEC3_Y_AXIS[2]; m[10] = tag.VEC3_Z_AXIS[2]; m[14] = tag.VEC3_ORIGIN[2];
    m[3] = 0;                  m[7] = 0;                  m[11] = 0;                 m[15] = 1;
    return m;
  }

  getLerpedTagMatrix(tag_name, frameA, frameB, t) {
    const tagA = this.getTagByName(tag_name, frameA);
    const tagB = this.getTagByName(tag_name, frameB);
    if (!tagA && !tagB) return null;
    if (tagA && !tagB) return Q3_Object.tagToMat4(tagA);
    if (!tagA && tagB) return Q3_Object.tagToMat4(tagB);

    const xA = [tagA.VEC3_X_AXIS[0], tagA.VEC3_X_AXIS[1], tagA.VEC3_X_AXIS[2]];
    const yA = [tagA.VEC3_Y_AXIS[0], tagA.VEC3_Y_AXIS[1], tagA.VEC3_Y_AXIS[2]];
    const zA = [tagA.VEC3_Z_AXIS[0], tagA.VEC3_Z_AXIS[1], tagA.VEC3_Z_AXIS[2]];
    const pA = [tagA.VEC3_ORIGIN[0], tagA.VEC3_ORIGIN[1], tagA.VEC3_ORIGIN[2]];

    const xB = [tagB.VEC3_X_AXIS[0], tagB.VEC3_X_AXIS[1], tagB.VEC3_X_AXIS[2]];
    const yB = [tagB.VEC3_Y_AXIS[0], tagB.VEC3_Y_AXIS[1], tagB.VEC3_Y_AXIS[2]];
    const zB = [tagB.VEC3_Z_AXIS[0], tagB.VEC3_Z_AXIS[1], tagB.VEC3_Z_AXIS[2]];
    const pB = [tagB.VEC3_ORIGIN[0], tagB.VEC3_ORIGIN[1], tagB.VEC3_ORIGIN[2]];

    const xL = vlerp(xA, xB, t);
    const yL = vlerp(yA, yB, t);
    const zL = vlerp(zA, zB, t);
    const pL = vlerp(pA, pB, t);

    const on = orthonormalizeBasis(xL, yL, zL);
    const m = new Float32Array(16);
    m[0] = on.X[0]; m[4] = on.Y[0]; m[8]  = on.Z[0]; m[12] = pL[0];
    m[1] = on.X[1]; m[5] = on.Y[1]; m[9]  = on.Z[1]; m[13] = pL[1];
    m[2] = on.X[2]; m[6] = on.Y[2]; m[10] = on.Z[2]; m[14] = pL[2];
    m[3] = 0;       m[7] = 0;       m[11] = 0;       m[15] = 1;
    return m;
  }

  getNumberOfFrames() {
    if (!this.MD3_FILE || !this.MD3_FILE.frames) return 0;
    return this.MD3_FILE.frames.length;
  }

  drawDepth(program, frameA, frameB, lerp, modelMatrix = null) {
    this.setCurrentFrameIDX(frameA);
    
    const uModel = this.gl.getUniformLocation(program, "UN_MAT4_MODEL");
    if (uModel && modelMatrix) {
      this.gl.uniformMatrix4fv(uModel, false, modelMatrix);
    } else if (uModel) {
      this.gl.uniformMatrix4fv(uModel, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }

    for (let i = 0; i < this.surfaces_count; i++) {
      const surface_vbo = this.surface_vbo_list[i];
      if (!surface_vbo) continue;

      // Skip hidden or transparent additive surfaces for shadow casting (laser/flash)
      const meta = this.surfaceMeta[i];
      if (meta && (meta.hidden || meta.isLaser || meta.isFlash)) continue;

      surface_vbo.beginDrawDepth(program, frameA, frameB, lerp);
      surface_vbo.draw();
      surface_vbo.endDraw(program);
    }
  }

  drawMorph(program, frameA, frameB, lerp, modelMatrix = null) {
    this.setCurrentFrameIDX(frameA);
    
    const gl = this.gl;
    
    const uModel     = gl.getUniformLocation(program, "UN_MAT4_MODEL");
    const uNormal    = gl.getUniformLocation(program, "UN_MAT4_NORMAL");
    const uIsCigar   = gl.getUniformLocation(program, "UN_BOOL_IS_CIGAR");
    const uIsLaser   = gl.getUniformLocation(program, "UN_BOOL_IS_LASER");
    const uIsFlash   = gl.getUniformLocation(program, "UN_BOOL_IS_FLASH");
    const uUVScroll  = gl.getUniformLocation(program, "UN_VEC2_UV_SCROLL");
    const uAddAlpha  = gl.getUniformLocation(program, "UN_F32_ADDITIVE_ALPHA");
    // Laser uniforms
    const uLaserAxis   = gl.getUniformLocation(program, "UN_VEC3_LASER_AXIS");
    const uLaserBounds = gl.getUniformLocation(program, "UN_VEC2_LASER_BOUNDS");

    if (uModel && modelMatrix) {
      gl.uniformMatrix4fv(uModel, false, modelMatrix);
    } else if (uModel) {
      gl.uniformMatrix4fv(uModel, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }
    if (uNormal && modelMatrix) {
      gl.uniformMatrix4fv(uNormal, false, modelMatrix);
    } else if (uNormal) {
      gl.uniformMatrix4fv(uNormal, false, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    }

    for (let i = 0; i < this.surfaces_count; i++) {
      const surface_vbo = this.surface_vbo_list[i];
      const tex = this.texture_list[i];
      const meta = this.surfaceMeta[i];

      if (!surface_vbo) continue;

      // Skip if hidden (null.tga in skin)
      if (meta && meta.hidden) {
        if (uIsCigar)  gl.uniform1i(uIsCigar, 0);
        if (uIsLaser)  gl.uniform1i(uIsLaser, 0);
        if (uIsFlash)  gl.uniform1i(uIsFlash, 0);
        if (uUVScroll) gl.uniform2f(uUVScroll, 0.0, 0.0);
        if (uAddAlpha) gl.uniform1f(uAddAlpha, 1.0);
        continue;
      }

      // Bind base diffuse
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex && tex.HANDLE_TEX ? tex.HANDLE_TEX : this.texturepool.getWhiteTexture().HANDLE_TEX);

      // Cigar glow map on unit 3 when present
      if (meta && meta.isCigar && meta.glowTex && meta.glowTex.HANDLE_TEX) {
        if (uIsCigar) gl.uniform1i(uIsCigar, 1);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, meta.glowTex.HANDLE_TEX);
      } else {
        if (uIsCigar) gl.uniform1i(uIsCigar, 0);
      }

      // Transparent additive passes (laser or flash)
      let changedBlend = false;
      let changedCull  = false;
      if (meta && (meta.isLaser || meta.isFlash)) {
        if (uIsLaser)  gl.uniform1i(uIsLaser, meta.isLaser ? 1 : 0);
        if (uIsFlash)  gl.uniform1i(uIsFlash, meta.isFlash ? 1 : 0);
        if (uUVScroll) gl.uniform2f(uUVScroll, meta.uvScroll[0] || 0.0, meta.uvScroll[1] || 0.0);
        if (uAddAlpha) gl.uniform1f(uAddAlpha, this.additiveAlpha);

        // Laser uniforms per-surface
        if (meta.isLaser) {
          if (uLaserAxis)   gl.uniform3f(uLaserAxis,   meta.laserAxis[0], meta.laserAxis[1], meta.laserAxis[2]);
          if (uLaserBounds) gl.uniform2f(uLaserBounds, meta.laserBounds[0], meta.laserBounds[1]);
        }

        // Additive blending, no depth write, and render both sides (cull disable)
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        changedBlend = true;

        gl.disable(gl.CULL_FACE);
        changedCull = true;
      } else {
        if (uIsLaser)  gl.uniform1i(uIsLaser, 0);
        if (uIsFlash)  gl.uniform1i(uIsFlash, 0);
        if (uUVScroll) gl.uniform2f(uUVScroll, 0.0, 0.0);
        if (uAddAlpha) gl.uniform1f(uAddAlpha, 1.0);
        // Opaque default
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }

      surface_vbo.beginDrawMorph(program, frameA, frameB, lerp);
      surface_vbo.draw();
      surface_vbo.endDraw(program);

      // Restore after additive
      if (changedBlend) {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
      if (changedCull) {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  async setSkinFilename(newSkinFilename) {
    if (!newSkinFilename || newSkinFilename === this.skin_filename) return;
    this.skin_filename = newSkinFilename;
    this.SKIN_FILE = new Q3_SkinFile(this.path, this.skin_filename);
    await this.SKIN_FILE.load();
    await this.applyTexturesFromSkinfileAsync(this.SKIN_FILE);
  }
}