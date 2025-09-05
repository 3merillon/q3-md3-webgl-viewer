export class MD3_Shader {
  static MAX_QPATH = 64;

  constructor(md3_reader, parent_surface, index) {
    this.md3_reader = md3_reader;
    this.parent_surface = parent_surface;
    this.INDEX = index;

    const byter = md3_reader.byter;

    this._start_pos         = byter.getPos();
    this.STR_NAME           = byter.getString(0, MD3_Shader.MAX_QPATH, "\0");
    this.S32_SHADER_INDEX   = byter.getInt32Value(0);
    this._end_pos           = byter.getPos();
  }
}