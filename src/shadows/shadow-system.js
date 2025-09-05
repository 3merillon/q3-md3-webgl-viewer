import { mat4, vec3 } from 'gl-matrix';

export class ShadowSystem {
  constructor(gl, shadowMapSize = 4096) {
    this.gl = gl;
    this.shadowMapSize = shadowMapSize;
    
    // Shadow settings (defaults)
    this.enabled = true;
    this.intensity = 0.7;
    this.bias = 0.0001;     // default bias
    this.poissonRadius = 3; // default radius in texels

    // Light properties
    this.lightDirection = vec3.normalize(vec3.create(), [-0.6, -1.0, -0.5]);
    this.lightDistance = 1000;
    this.lightSize = 800;
    
    // Angles (UI)
    this.lightElevation = 45.0;
    this.lightAzimuth = 225.0;
    
    // Matrices
    this.lightView = mat4.create();
    this.lightProjection = mat4.create();
    this.lightViewProjection = mat4.create();
    
    // GL resources
    this.shadowFramebuffer = null;
    this.shadowTexture = null;
    this.shadowSupported = true;

    // Polygon offset for casters (reduces acne)
    this.polyOffsetFactor = 1.1;
    this.polyOffsetUnits = 4.0;
    
    this._createShadowMap();
    this._updateLightMatrices();
  }

  _createShadowMap() {
    const gl = this.gl;
    try {
      // FBO
      this.shadowFramebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);

      // Depth texture
      this.shadowTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);

      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24,
        this.shadowMapSize, this.shadowMapSize, 0,
        gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null
      );

      // LINEAR + compare mode for hardware PCF
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

      // Attach
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D, this.shadowTexture, 0
      );

      // No color attachments
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Shadow framebuffer not complete:', status);
        this.shadowSupported = false;
        this.enabled = false;
      } else {
        //console.log(`Shadow FBO ready ${this.shadowMapSize}x${this.shadowMapSize} (LINEAR + compare)`);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

    } catch (e) {
      console.error('Failed to create shadow map:', e);
      this.shadowSupported = false;
      this.enabled = false;
    }
  }

  _updateLightMatrices() {
    const lightPos = vec3.create();
    vec3.scale(lightPos, this.lightDirection, -this.lightDistance);

    const target = vec3.fromValues(0, 0, 0);
    const up = vec3.fromValues(0, 1, 0);

    mat4.lookAt(this.lightView, lightPos, target, up);

    const s = this.lightSize;
    mat4.ortho(this.lightProjection, -s, s, -s, s, 1, this.lightDistance * 2);
    mat4.multiply(this.lightViewProjection, this.lightProjection, this.lightView);
  }

  _updateLightDirectionFromAngles() {
    const elevRad = this.lightElevation * Math.PI / 180.0;
    const azimRad = this.lightAzimuth * Math.PI / 180.0;
    const x = Math.cos(elevRad) * Math.sin(azimRad);
    const y = -Math.sin(elevRad);
    const z = Math.cos(elevRad) * Math.cos(azimRad);
    vec3.set(this.lightDirection, x, y, z);
    vec3.normalize(this.lightDirection, this.lightDirection);
    this._updateLightMatrices();
  }

  setLightElevation(e) { this.lightElevation = Math.max(5, Math.min(85, e)); this._updateLightDirectionFromAngles(); }
  setLightAzimuth(a)   { this.lightAzimuth = ((a % 360) + 360) % 360; this._updateLightDirectionFromAngles(); }
  setLightDirection(x, y, z) { vec3.set(this.lightDirection, x, y, z); vec3.normalize(this.lightDirection, this.lightDirection); this._updateLightMatrices(); }
  setLightSize(size) { this.lightSize = size; this._updateLightMatrices(); }

  setShadowMapSize(size) {
    const valid = [512, 1024, 2048, 4096];
    if (!valid.includes(size)) size = 4096;
    if (size !== this.shadowMapSize) {
      this.shadowMapSize = size;
      const gl = this.gl;
      if (this.shadowFramebuffer) gl.deleteFramebuffer(this.shadowFramebuffer);
      if (this.shadowTexture) gl.deleteTexture(this.shadowTexture);
      this._createShadowMap();
    }
  }

  setEnabled(v) { this.enabled = v && this.shadowSupported; }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }
  setBias(v) { this.bias = Math.max(0.0, v); }
  setPoissonRadius(v) { this.poissonRadius = Math.max(0.25, Math.min(5.0, v)); }

  getEnabled() { return this.enabled && this.shadowSupported; }
  isSupported() { return this.shadowSupported; }

  beginShadowPass() {
    if (!this.shadowSupported || !this.enabled) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
    gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.colorMask(false, false, false, false);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT); // reduce acne (frontFace is CW in your viewer)
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(this.polyOffsetFactor, this.polyOffsetUnits);
  }

  endShadowPass() {
    if (!this.shadowSupported || !this.enabled) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.colorMask(true, true, true, true);
    gl.cullFace(gl.BACK);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  bindShadowTexture(unit = 1) {
    if (!this.shadowSupported || !this.enabled) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
  }

  setShadowUniforms(program, cameraPos) {
    const gl = this.gl;
    const uLightVP         = gl.getUniformLocation(program, "UN_MAT4_LIGHT_VP");
    const uLightDir        = gl.getUniformLocation(program, "UN_VEC3_LIGHT_DIR");
    const uCameraPos       = gl.getUniformLocation(program, "UN_VEC3_CAMERA_POS");
    const uShadowBias      = gl.getUniformLocation(program, "UN_F32_SHADOW_BIAS");
    const uShadowsEnabled  = gl.getUniformLocation(program, "UN_BOOL_SHADOWS_ENABLED");
    const uShadowIntensity = gl.getUniformLocation(program, "UN_F32_SHADOW_INTENSITY");
    const uShadowSampler   = gl.getUniformLocation(program, "UN_SAMP_SHADOW");
    const uPoissonRadius   = gl.getUniformLocation(program, "UN_F32_POISSON_RADIUS");
    
    if (uLightVP)         gl.uniformMatrix4fv(uLightVP, false, this.lightViewProjection);
    if (uLightDir)        gl.uniform3fv(uLightDir, this.lightDirection);
    if (uCameraPos)       gl.uniform3fv(uCameraPos, cameraPos);
    if (uShadowBias)      gl.uniform1f(uShadowBias, this.bias);
    if (uShadowsEnabled)  gl.uniform1i(uShadowsEnabled, (this.enabled && this.shadowSupported) ? 1 : 0);
    if (uShadowIntensity) gl.uniform1f(uShadowIntensity, this.intensity);
    if (uShadowSampler)   gl.uniform1i(uShadowSampler, 1); // unit 1
    if (uPoissonRadius)   gl.uniform1f(uPoissonRadius, this.poissonRadius);
  }

  destroy() {
    const gl = this.gl;
    if (this.shadowFramebuffer) gl.deleteFramebuffer(this.shadowFramebuffer);
    if (this.shadowTexture) gl.deleteTexture(this.shadowTexture);
  }
}