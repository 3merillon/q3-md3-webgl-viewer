export class Q3_surface_VBO {
  constructor(gl, MD3_file, surface_idx) {
    this.gl = gl;
    this.surface_idx = surface_idx;
    this.MD3_surface = MD3_file.surfaces[surface_idx];
    this.num_of_frames = this.MD3_surface.S32_NUM_FRAMES;
    this.num_of_indices = this.MD3_surface.Uint16_3_INDICES.length;
    this.num_of_vertices = this.MD3_surface.S32_NUM_VERTS;

    this.buffer_Int16_indices = this.MD3_surface.Uint16_3_INDICES;
    this.buffer_Float32_texcoords = this.MD3_surface.S32_2_ST;
    this.buffer_Float32_vertices = new Array(this.num_of_frames);
    for (let i = 0; i < this.num_of_frames; i++) {
      this.buffer_Float32_vertices[i] = this.MD3_surface.surface_frames[i].vertexbuffer_xyzn;
    }

    this.HANDLE_vbo_indices = gl.createBuffer();
    this.HANDLE_vbo_vertices_xyzn = new Array(this.num_of_frames);
    for (let i = 0; i < this.num_of_frames; i++) {
      this.HANDLE_vbo_vertices_xyzn[i] = gl.createBuffer();
    }
    this.HANDLE_vbo_texcoords_st = gl.createBuffer();

    this._fillVBOs();
  }

  _fillVBOs() {
    const gl = this.gl;
    
    // INDICES
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.HANDLE_vbo_indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.buffer_Int16_indices, gl.STATIC_DRAW);

    // VERTEX FRAMES (xyzn packed as [pos(3), normal(3)] floats)
    for (let i = 0; i < this.num_of_frames; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.HANDLE_vbo_vertices_xyzn[i]);
      gl.bufferData(gl.ARRAY_BUFFER, this.buffer_Float32_vertices[i], gl.STATIC_DRAW);
    }

    // TEXCOORDS
    gl.bindBuffer(gl.ARRAY_BUFFER, this.HANDLE_vbo_texcoords_st);
    gl.bufferData(gl.ARRAY_BUFFER, this.buffer_Float32_texcoords, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  beginDrawMorph(program, frameA, frameB, lerp) {
    const gl = this.gl;

    // Get attribute locations
    const loc_pos0 = gl.getAttribLocation(program, "IN0_VEC3_POSITION");
    const loc_nrm0 = gl.getAttribLocation(program, "IN0_VEC3_NORMAL");
    const loc_pos1 = gl.getAttribLocation(program, "IN1_VEC3_POSITION");
    const loc_nrm1 = gl.getAttribLocation(program, "IN1_VEC3_NORMAL");
    const loc_st   = gl.getAttribLocation(program, "IN_VEC2_ST");

    // Bind Frame A buffer
    const handleA = this.HANDLE_vbo_vertices_xyzn[Math.max(0, Math.min(frameA, this.num_of_frames - 1))];
    gl.bindBuffer(gl.ARRAY_BUFFER, handleA);
    if (loc_pos0 >= 0) {
      gl.vertexAttribPointer(loc_pos0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc_pos0);
    }
    if (loc_nrm0 >= 0) {
      gl.vertexAttribPointer(loc_nrm0, 3, gl.FLOAT, false, 24, 12);
      gl.enableVertexAttribArray(loc_nrm0);
    }

    // Bind Frame B buffer
    const handleB = this.HANDLE_vbo_vertices_xyzn[Math.max(0, Math.min(frameB, this.num_of_frames - 1))];
    gl.bindBuffer(gl.ARRAY_BUFFER, handleB);
    if (loc_pos1 >= 0) {
      gl.vertexAttribPointer(loc_pos1, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc_pos1);
    }
    if (loc_nrm1 >= 0) {
      gl.vertexAttribPointer(loc_nrm1, 3, gl.FLOAT, false, 24, 12);
      gl.enableVertexAttribArray(loc_nrm1);
    }

    // TEXCOORDS (only for main pass, not depth pass)
    if (loc_st >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.HANDLE_vbo_texcoords_st);
      gl.vertexAttribPointer(loc_st, 2, gl.FLOAT, false, 8, 0);
      gl.enableVertexAttribArray(loc_st);
    }

    // LERP UNIFORM
    const uLerp = gl.getUniformLocation(program, "UN_F32_LERP");
    if (uLerp !== null) gl.uniform1f(uLerp, Math.max(0, Math.min(1, lerp)));
  }

  // Simplified version for depth-only rendering
  beginDrawDepth(program, frameA, frameB, lerp) {
    const gl = this.gl;

    const loc_pos0 = gl.getAttribLocation(program, "IN0_VEC3_POSITION");
    const loc_pos1 = gl.getAttribLocation(program, "IN1_VEC3_POSITION");

    // Bind Frame A positions
    const handleA = this.HANDLE_vbo_vertices_xyzn[Math.max(0, Math.min(frameA, this.num_of_frames - 1))];
    gl.bindBuffer(gl.ARRAY_BUFFER, handleA);
    if (loc_pos0 >= 0) {
      gl.vertexAttribPointer(loc_pos0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc_pos0);
    }

    // Bind Frame B positions
    const handleB = this.HANDLE_vbo_vertices_xyzn[Math.max(0, Math.min(frameB, this.num_of_frames - 1))];
    gl.bindBuffer(gl.ARRAY_BUFFER, handleB);
    if (loc_pos1 >= 0) {
      gl.vertexAttribPointer(loc_pos1, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc_pos1);
    }

    // LERP UNIFORM
    const uLerp = gl.getUniformLocation(program, "UN_F32_LERP");
    if (uLerp !== null) gl.uniform1f(uLerp, Math.max(0, Math.min(1, lerp)));
  }

  draw() {
    const gl = this.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.HANDLE_vbo_indices);
    gl.drawElements(gl.TRIANGLES, this.num_of_indices, gl.UNSIGNED_SHORT, 0);
  }

  endDraw(program) {
    // Attributes can remain enabled for simplicity
  }
}