import { DwImage } from '../util/dwimage.js';

export class Q3_TexturePool {
  constructor(gl) {
    this.gl = gl;
    this.tex_list = [];
    this._white = this._createWhiteTexture();
    // Wrapper with a whenReady method for consistency
    this._whiteWrapper = { 
      HANDLE_TEX: this._white, 
      path: '', 
      filename: '__white__', 
      LOADED: true,
      whenReady: () => Promise.resolve(true)
    };
  }

  _createWhiteTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const data = new Uint8Array([255, 255, 255, 255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  getWhiteTexture() {
    return this._whiteWrapper;
  }

  getTexture(path, filename) {
    const p = path || '';
    const f = filename || '';
    for (const tex of this.tex_list) {
      if (tex.path === p && tex.filename === f) return tex;
    }
    const tex = new DwImage(this.gl, p, f);
    this.tex_list.push(tex);
    return tex;
  }
}