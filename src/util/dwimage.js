import { TgaLoader } from './tga-loader.js';

export class DwImage {
  constructor(gl, path, filename) {
    this.gl = gl;
    this.path = path || '';
    this.filename = filename || '';
    this.image = null;
    this.LOADED = false;
    this.HANDLE_TEX = null;

    // Promise that resolves when this texture is ready (loaded or fallback created)
    this._resolveReady = null;
    this._readyPromise = new Promise((res) => { this._resolveReady = res; });

    const isAbsolute = (s) => /^(?:https?:)?\/\//.test(s) || s.startsWith('/');
    const src = isAbsolute(this.filename) ? this.filename : (this.path + this.filename);

    const dot = this.filename.lastIndexOf('.');
    this.filesuffix = dot >= 0 ? this.filename.substring(dot).toLowerCase() : '';

    if (this.filesuffix === '.tga') {
      // TGA loader (supports only uncompressed 24/32-bit)
      TgaLoader.load(src, (pixels, width, height) => {
        this.createTextureFromTGA(gl.RGBA, width, height, gl.RGBA, pixels);
        this.LOADED = true;
        if (this._resolveReady) this._resolveReady(true);
      });
    } else if (this.filesuffix) {
      // Standard image with known extension
      const img = new window.Image();
      img.src = src;
      img.onload = () => {
        this.createTexture(img);
        this.LOADED = true;
        if (this._resolveReady) this._resolveReady(true);
      };
      img.onerror = () => {
        console.error(`ERROR loading image: ${src}`);
        this._createFallbackTexture();
        this.LOADED = true;
        if (this._resolveReady) this._resolveReady(true);
      };
      this.image = img;
    } else {
      // No extension or unknown -> attempt load, but ensure fallback on error
      const img = new window.Image();
      img.src = src;
      img.onload = () => {
        this.createTexture(img);
        this.LOADED = true;
        if (this._resolveReady) this._resolveReady(true);
      };
      img.onerror = () => {
        console.warn(`Missing/unknown extension for image: ${src} — using fallback`);
        this._createFallbackTexture();
        this.LOADED = true;
        if (this._resolveReady) this._resolveReady(true);
      };
      this.image = img;
    }
  }

  whenReady() {
    return this._readyPromise;
  }

  _createFallbackTexture() {
    const gl = this.gl;
    try {
      if (!this.HANDLE_TEX) this.HANDLE_TEX = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.HANDLE_TEX);
      const data = new Uint8Array([255, 255, 255, 255]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.bindTexture(gl.TEXTURE_2D, null);
    } catch {
      // ignore
    }
  }

  createTexture(img) {
    const gl = this.gl;
    this.HANDLE_TEX = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.HANDLE_TEX);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  createTextureFromTGA(internalFormat, width, height, format, pixels) {
    const gl = this.gl;
    this.HANDLE_TEX = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.HANDLE_TEX);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, gl.UNSIGNED_BYTE, pixels);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}