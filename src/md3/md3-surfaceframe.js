export class MD3_SurfaceFrame {
  static MD3_XYZ_SCALE = 64;

  constructor(md3_reader, parent_surface, index) {
    this.md3_reader = md3_reader;
    this.parent_surface = parent_surface;
    this.INDEX = index;

    const byter = md3_reader.byter;
    this.num_vertices = this.parent_surface.S32_NUM_VERTS;

    this._start_pos = byter.getPos();
    this.xyz_normals = byter.getInt16Array(0, this.num_vertices * 4);
    this._end_pos = byter.getPos();

    // Unpack vertices and normals
    this.vertexbuffer_xyzn = new Float32Array(this.num_vertices * 6);
    for (let i = 0; i < this.num_vertices; i++) {
      const idx_src = i * 4;
      const x = this.xyz_normals[idx_src + 0];
      const y = this.xyz_normals[idx_src + 1];
      const z = this.xyz_normals[idx_src + 2];
      const n = this.xyz_normals[idx_src + 3];

      // Vertex
      const idx_dst = i * 6;
      const x_new = x * MD3_SurfaceFrame.MD3_XYZ_SCALE_INV;
      const y_new = y * MD3_SurfaceFrame.MD3_XYZ_SCALE_INV;
      const z_new = z * MD3_SurfaceFrame.MD3_XYZ_SCALE_INV;
      this.vertexbuffer_xyzn[idx_dst + 0] = x_new;
      this.vertexbuffer_xyzn[idx_dst + 1] = y_new;
      this.vertexbuffer_xyzn[idx_dst + 2] = z_new;

      // Normal decode (lat/lng packed in 16 bits)
      const lat = ((n >> 8) & 0xFF) * (2 * Math.PI / 255);
      const lng = ((n) & 0xFF) * (2 * Math.PI / 255);
      this.vertexbuffer_xyzn[idx_dst + 3] = Math.cos(lat) * Math.sin(lng);
      this.vertexbuffer_xyzn[idx_dst + 4] = Math.sin(lat) * Math.sin(lng);
      this.vertexbuffer_xyzn[idx_dst + 5] = Math.cos(lng);
    }
  }
}
MD3_SurfaceFrame.MD3_XYZ_SCALE_INV = 1 / MD3_SurfaceFrame.MD3_XYZ_SCALE;