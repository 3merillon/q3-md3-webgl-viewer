export class MD3_Tag {
  static MAX_QPATH = 64;

  constructor(md3_reader, parent_tag_frame, index) {
    this.md3_reader = md3_reader;
    this.parent_tag_frame = parent_tag_frame;
    this.INDEX = index;

    const byter = md3_reader.byter;

    this._start_pos         = byter.getPos();
    this.STR_NAME           = byter.getString(0, MD3_Tag.MAX_QPATH, "\0");
    this.VEC3_ORIGIN        = byter.getFloat32Array(0, 3);
    this.VEC3_X_AXIS        = byter.getFloat32Array(0, 3);
    this.VEC3_Y_AXIS        = byter.getFloat32Array(0, 3);
    this.VEC3_Z_AXIS        = byter.getFloat32Array(0, 3);
    this._end_pos           = byter.getPos();
    // TODO: Matrix creation for tag axes and origin
  }
}