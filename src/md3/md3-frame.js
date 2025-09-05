export class MD3_Frame {
  static STR_NAME_MAX_LENGTH = 16;

  constructor(md3_reader, index) {
    this.md3_reader = md3_reader;
    this.INDEX = index;
    const byter = md3_reader.byter;

    this._start_pos         = byter.getPos();
    this.VEC3_MIN_BOUNDS    = byter.getFloat32Array(0, 3);
    this.VEC3_MAX_BOUNDS    = byter.getFloat32Array(0, 3);
    this.VEC3_LOCAL_ORIGIN  = byter.getFloat32Array(0, 3);
    this.F32_RADIUS         = byter.getFloat32Value(0);
    this.STR_NAME           = byter.getString(0, MD3_Frame.STR_NAME_MAX_LENGTH, "\0");
    this._end_pos           = byter.getPos();
  }
}