import { MD3_Shader } from './md3-shader.js';
import { MD3_SurfaceFrame } from './md3-surfaceframe.js';

export class MD3_Surface {
  static MAX_QPATH         = 64;
  static MD3_MAX_SHADERS   = 256;
  static MD3_MAX_VERTS     = 4096;
  static MD3_MAX_TRIANGLES = 8192;

  constructor(md3_reader, index) {
    this.md3_reader = md3_reader;
    this.INDEX = index;
    const byter = md3_reader.byter;

    this._start_pos         = byter.getPos();
    this.STR_IDENT          = byter.getString(0, 4);
    this.STR_NAME           = byter.getString(0, MD3_Surface.MAX_QPATH, "\0");
    this.S32_FLAGS          = byter.getInt32Value(0);
    this.S32_NUM_FRAMES     = byter.getInt32Value(0);
    this.S32_NUM_SHADERS    = byter.getInt32Value(0);
    this.S32_NUM_VERTS      = byter.getInt32Value(0);
    this.S32_NUM_TRIANGLES  = byter.getInt32Value(0);
    this.S32_OFS_TRIANGLES  = byter.getInt32Value(0);
    this.S32_OFS_SHADERS    = byter.getInt32Value(0);
    this.S32_OFS_ST         = byter.getInt32Value(0);
    this.S32_OFS_XYZNORMAL  = byter.getInt32Value(0);
    this.S32_OFS_END        = byter.getInt32Value(0);
    this._end_pos           = byter.getPos();

    // get Shaders for current surface
    byter.setPos(this._start_pos + this.S32_OFS_SHADERS);
    this.shaders = new Array(this.S32_NUM_SHADERS);
    for (let i = 0; i < this.S32_NUM_SHADERS; i++) {
      this.shaders[i] = new MD3_Shader(this.md3_reader, this, i);
    }

    // get Triangle Indices for current surface
    byter.setPos(this._start_pos + this.S32_OFS_TRIANGLES);
    const num_indices = this.S32_NUM_TRIANGLES * 3;
    this.S32_3_INDICES = byter.getInt32Array(0, num_indices);
    this.Uint16_3_INDICES = new Uint16Array(num_indices);
    for (let i = 0; i < num_indices; i++) {
      this.Uint16_3_INDICES[i] = this.S32_3_INDICES[i];
    }

    // get texcoords for current surface
    byter.setPos(this._start_pos + this.S32_OFS_ST);
    this.S32_2_ST = byter.getFloat32Array(0, this.S32_NUM_VERTS * 2);

    // get Vertices (XYZ, NORMAL) for each frame of current surface
    byter.setPos(this._start_pos + this.S32_OFS_XYZNORMAL);
    this.surface_frames = new Array(this.S32_NUM_FRAMES);
    for (let i = 0; i < this.S32_NUM_FRAMES; i++) {
      this.surface_frames[i] = new MD3_SurfaceFrame(this.md3_reader, this, i);
    }
  }
}