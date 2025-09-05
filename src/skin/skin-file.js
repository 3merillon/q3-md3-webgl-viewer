export class Q3_SkinFile {
  constructor(path, filename) {
    this.path = path;
    this.filename = filename;
    this.total_file_path = this.path + this.filename;

    // Parallel arrays
    this.surface_names = [];
    this.image_fullpaths = []; // as written in skin (may include directories)
    this.image_dirs = [];
    this.image_names = [];
  }

  async load() {
    const res = await fetch(this.total_file_path);
    const text = await res.text();
    this.extractFileContent(text);
  }

  extractFileContent(content) {
    this.surface_names = [];
    this.image_fullpaths = [];
    this.image_dirs = [];
    this.image_names = [];

    const lines = content.split(/\r?\n/);
    for (const raw of lines) {
      const line = (raw || '').trim();
      if (!line || line.startsWith('//')) continue;
      const parts = line.split(',').map(s => s && s.trim());
      if (parts.length < 2) continue;
      const surf = parts[0];
      const imgRaw = parts[1];
      if (!surf || !imgRaw) continue;

      const img = imgRaw.replace(/\\/g, '/'); // normalize slashes
      const lastSlash = img.lastIndexOf('/');
      const dir = lastSlash >= 0 ? img.substring(0, lastSlash + 1) : '';
      const name = lastSlash >= 0 ? img.substring(lastSlash + 1) : img;

      this.surface_names.push(surf);
      this.image_fullpaths.push(img);
      this.image_dirs.push(dir);
      this.image_names.push(name);
    }
  }

  getSurfaceNameIDX(surface_name) {
    return this.surface_names.indexOf(surface_name);
  }

  getImageInfo(surface_name) {
    const idx = this.getSurfaceNameIDX(surface_name);
    if (idx < 0) return null;
    return {
      full: this.image_fullpaths[idx],
      dir: this.image_dirs[idx],
      name: this.image_names[idx]
    };
  }
}