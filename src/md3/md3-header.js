export class MD3_Header {
  static MAX_QPATH        = 64;
  static MAX_IDENT        = 4;
  static MD3_MAX_FRAMES   = 1024;
  static MD3_MAX_TAGS     = 16;
  static MD3_MAX_SURFACES = 32;

  constructor(md3_reader) {
    this.md3_reader = md3_reader;
    const byter = md3_reader.byter;

    this._start_pos        = byter.getPos();
    this.IDENT             = byter.getString(0, MD3_Header.MAX_IDENT);
    this.VERSION           = byter.getInt32Value(0);
    this.NAME              = byter.getString(0, MD3_Header.MAX_QPATH, "\0");
    this.S32_FLAGS         = byter.getInt32Value(0);
    this.S32_NUM_FRAMES    = byter.getInt32Value(0);
    this.S32_NUM_TAGS      = byter.getInt32Value(0);
    this.S32_NUM_SURFACES  = byter.getInt32Value(0);
    this.S32_NUM_SKINS     = byter.getInt32Value(0);
    this.S32_OFS_FRAMES    = byter.getInt32Value(0);
    this.S32_OFS_TAGS      = byter.getInt32Value(0);
    this.S32_OFS_SURFACES  = byter.getInt32Value(0);
    this.S32_OFS_EOF       = byter.getInt32Value(0);
    this._end_pos          = byter.getPos();
  }
}