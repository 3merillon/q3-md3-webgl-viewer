import { Byter } from '../util/byter.js';
import { MD3_Header } from './md3-header.js';
import { MD3_Frame } from './md3-frame.js';
import { MD3_TagFrame } from './md3-tagframe.js';
import { MD3_Surface } from './md3-surface.js';

export class MD3_File {
  constructor(path, filename) {
    this.path = path || '';
    this.filename = filename;
    this.total_file_path = this.path + this.filename;
    if (!this.filename) {
      throw new Error(`(MD3_File) invalid filename, can't load MD3-File: ${this.total_file_path}`);
    }

    this.LOADED = false;
    this.onload = () => {};
    this.onerror = () => {
      console.error("ERROR while loading MD3-file: " + this.total_file_path);
    };
  }

  async load() {
    try {
      const response = await fetch(this.total_file_path);
      if (!response.ok) throw new Error('Failed to fetch MD3 file');
      const arrayBuffer = await response.arrayBuffer();
      this.loadFileContent(arrayBuffer);
      this.LOADED = true;
      this.onload();
    } catch (e) {
      this.onerror();
      throw e;
    }
  }

  loadFileContent(arraybuffer) {
    // initialize byte viewer
    this.byter = new Byter(arraybuffer);

    // get Header
    this.header = new MD3_Header(this);

    // get Frames
    this.byter.setPos(this.header.S32_OFS_FRAMES);
    this.frames = new Array(this.header.S32_NUM_FRAMES);
    for (let i = 0; i < this.frames.length; i++) {
      this.frames[i] = new MD3_Frame(this, i);
    }

    // get Tag frames
    this.byter.setPos(this.header.S32_OFS_TAGS);
    this.tag_frames = new Array(this.header.S32_NUM_FRAMES);
    for (let i = 0; i < this.tag_frames.length; i++) {
      this.tag_frames[i] = new MD3_TagFrame(this, i);
    }

    // get Surfaces
    this.byter.setPos(this.header.S32_OFS_SURFACES);
    this.surfaces = new Array(this.header.S32_NUM_SURFACES);
    for (let i = 0; i < this.surfaces.length; i++) {
      this.surfaces[i] = new MD3_Surface(this, i);
    }
  }
}