export class Ground {
  constructor(gl, size = 2000, uvScale = 1) {
    this.gl = gl;
    this.size = size;
    this.uvScale = uvScale;
    this.textureOffsetX = 0;
    this.textureOffsetZ = 0;
    
    const half = size * 0.5;

    // Two triangles (XZ plane) at y=0
    this.positions = new Float32Array([
      -half, 0, -half,
       half, 0, -half,
       half, 0,  half,
      -half, 0,  half,
    ]);
    
    this.normals = new Float32Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ]);
    
    // Base UV coordinates
    this.baseST = new Float32Array([
      0,       0,
      uvScale, 0,
      uvScale, uvScale,
      0,       uvScale,
    ]);
    
    // Dynamic UV coordinates (will be updated)
    this.st = new Float32Array(this.baseST);
    
    const indices = new Uint16Array([0,1,2, 0,2,3]);

    const glb = this.gl;
    this.vboPos = glb.createBuffer();
    this.vboNrm = glb.createBuffer();
    this.vboST  = glb.createBuffer();
    this.ebo    = glb.createBuffer();

    glb.bindBuffer(glb.ARRAY_BUFFER, this.vboPos);
    glb.bufferData(glb.ARRAY_BUFFER, this.positions, glb.STATIC_DRAW);
    glb.bindBuffer(glb.ARRAY_BUFFER, this.vboNrm);
    glb.bufferData(glb.ARRAY_BUFFER, this.normals, glb.STATIC_DRAW);
    glb.bindBuffer(glb.ARRAY_BUFFER, this.vboST);
    glb.bufferData(glb.ARRAY_BUFFER, this.st, glb.DYNAMIC_DRAW); // Changed to DYNAMIC
    glb.bindBuffer(glb.ELEMENT_ARRAY_BUFFER, this.ebo);
    glb.bufferData(glb.ELEMENT_ARRAY_BUFFER, indices, glb.STATIC_DRAW);
    glb.bindBuffer(glb.ARRAY_BUFFER, null);
    glb.bindBuffer(glb.ELEMENT_ARRAY_BUFFER, null);

    this.indexCount = indices.length;
  }
  
  setTextureOffset(offsetX, offsetZ) {
    this.textureOffsetX = offsetX;
    this.textureOffsetZ = offsetZ;
    
    // Update UV coordinates
    for (let i = 0; i < this.baseST.length; i += 2) {
      this.st[i] = this.baseST[i] + offsetX;     // U coordinate
      this.st[i + 1] = this.baseST[i + 1] + offsetZ; // V coordinate
    }
    
    // Update VBO
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboST);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.st);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // Main rendering with shadows (textures are bound by caller)
  draw(program, modelMatrix) {
    const gl = this.gl;

    // Get attribute locations
    const loc_pos0 = gl.getAttribLocation(program, "IN0_VEC3_POSITION");
    const loc_nrm0 = gl.getAttribLocation(program, "IN0_VEC3_NORMAL");
    const loc_pos1 = gl.getAttribLocation(program, "IN1_VEC3_POSITION");
    const loc_nrm1 = gl.getAttribLocation(program, "IN1_VEC3_NORMAL");
    const loc_st   = gl.getAttribLocation(program, "IN_VEC2_ST");

    // Bind same buffers to A and B to keep geometry static
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
    if (loc_pos0 >= 0) { gl.vertexAttribPointer(loc_pos0, 3, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(loc_pos0); }
    if (loc_pos1 >= 0) { gl.vertexAttribPointer(loc_pos1, 3, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(loc_pos1); }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboNrm);
    if (loc_nrm0 >= 0) { gl.vertexAttribPointer(loc_nrm0, 3, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(loc_nrm0); }
    if (loc_nrm1 >= 0) { gl.vertexAttribPointer(loc_nrm1, 3, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(loc_nrm1); }

    if (loc_st >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboST);
      gl.vertexAttribPointer(loc_st, 2, gl.FLOAT, false, 8, 0);
      gl.enableVertexAttribArray(loc_st);
    }

    // LERP = 0 for static plane
    const uLerp = gl.getUniformLocation(program, "UN_F32_LERP");
    if (uLerp) gl.uniform1f(uLerp, 0.0);

    // Model matrix
    const uModel = gl.getUniformLocation(program, "UN_MAT4_MODEL");
    if (uModel) gl.uniformMatrix4fv(uModel, false, modelMatrix || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

    // Normal matrix
    const uNormal = gl.getUniformLocation(program, "UN_MAT4_NORMAL");
    if (uNormal) gl.uniformMatrix4fv(uNormal, false, modelMatrix || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  // Depth-only rendering
  drawDepth(program, modelMatrix) {
    const gl = this.gl;

    const loc_pos0 = gl.getAttribLocation(program, "IN0_VEC3_POSITION");
    const loc_pos1 = gl.getAttribLocation(program, "IN1_VEC3_POSITION");

    // Bind same position buffer to both inputs
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
    if (loc_pos0 >= 0) { gl.vertexAttribPointer(loc_pos0, 3, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(loc_pos0); }
    if (loc_pos1 >= 0) { gl.vertexAttribPointer(loc_pos1, 3, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(loc_pos1); }

    // LERP = 0 for static plane
    const uLerp = gl.getUniformLocation(program, "UN_F32_LERP");
    if (uLerp) gl.uniform1f(uLerp, 0.0);

    // Model matrix
    const uModel = gl.getUniformLocation(program, "UN_MAT4_MODEL");
    if (uModel) gl.uniformMatrix4fv(uModel, false, modelMatrix || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }
}