import { MD3_Tag } from './md3-tag.js';

export class MD3_TagFrame {
  constructor(md3_reader, index) {
    this.md3_reader = md3_reader;
    this.INDEX = index;
    const byter = md3_reader.byter;

    this._start_pos = byter.getPos();
    this.tags = new Array(md3_reader.header.S32_NUM_TAGS);
    for (let i = 0; i < this.tags.length; i++) {
      this.tags[i] = new MD3_Tag(md3_reader, this, i);
    }
    this._end_pos = byter.getPos();
  }
}