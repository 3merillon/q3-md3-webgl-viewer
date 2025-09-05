// TGA loader supporting uncompressed (type 2) and RLE-compressed (type 10) 24/32-bit TGA
export class TgaLoader {
  static load(url, callback) {
    fetch(url)
      .then(res => res.arrayBuffer())
      .then(arrayBuffer => {
        const buf = new Uint8Array(arrayBuffer);
        let offset = 0;

        const idLength       = buf[offset++];
        const colorMapType   = buf[offset++];
        const imageType      = buf[offset++]; // 2 = uncompressed true-color, 10 = RLE true-color

        // Color map specification (skip)
        const cmFirstIndex   = buf[offset++] | (buf[offset++] << 8);
        const cmLength       = buf[offset++] | (buf[offset++] << 8);
        const cmEntrySize    = buf[offset++];

        // Image specification
        const xOrigin        = buf[offset++] | (buf[offset++] << 8);
        const yOrigin        = buf[offset++] | (buf[offset++] << 8);
        const width          = buf[offset++] | (buf[offset++] << 8);
        const height         = buf[offset++] | (buf[offset++] << 8);
        const pixelDepth     = buf[offset++];   // 24 or 32
        const imageDescriptor= buf[offset++];

        // Skip ID field
        offset += idLength;

        // Only true-color, no color map
        if (colorMapType !== 0) {
          console.error("TGA: Color-mapped images are not supported");
          callback(new Uint8Array([0,0,0,255]), 1, 1);
          return;
        }

        const bytesPerPixel = pixelDepth / 8;
        if (!(bytesPerPixel === 3 || bytesPerPixel === 4)) {
          console.error("TGA: Only 24/32-bit images are supported");
          callback(new Uint8Array([0,0,0,255]), 1, 1);
          return;
        }

        const pixels = new Uint8Array(width * height * 4);

        // Determine origin: bit 5 of imageDescriptor (0x20) set => top-left origin
        const topLeftOrigin = (imageDescriptor & 0x20) !== 0;

        // Helpers to write a pixel at (x,y) considering origin
        function writePixel(x, y, r, g, b, a) {
          let yy = topLeftOrigin ? y : (height - 1 - y);
          const idx = (yy * width + x) * 4;
          pixels[idx + 0] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }

        // Read a BGR(A) pixel from buffer at current offset
        function readSrcPixel() {
          const b = buf[offset++], g = buf[offset++], r = buf[offset++];
          const a = (bytesPerPixel === 4) ? buf[offset++] : 255;
          return { r, g, b, a };
        }

        try {
          if (imageType === 2) {
            // Uncompressed true-color
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const { r, g, b, a } = readSrcPixel();
                writePixel(x, y, r, g, b, a);
              }
            }
          } else if (imageType === 10) {
            // RLE-compressed true-color
            let x = 0, y = 0;
            while (y < height) {
              const packetHeader = buf[offset++];
              const count = 1 + (packetHeader & 0x7F);
              const isRLE = (packetHeader & 0x80) !== 0;

              if (isRLE) {
                // One pixel repeated count times
                const { r, g, b, a } = readSrcPixel();
                for (let i = 0; i < count; i++) {
                  writePixel(x, y, r, g, b, a);
                  x++;
                  if (x >= width) { x = 0; y++; if (y >= height) break; }
                }
              } else {
                // Raw packet: count distinct pixels
                for (let i = 0; i < count; i++) {
                  const { r, g, b, a } = readSrcPixel();
                  writePixel(x, y, r, g, b, a);
                  x++;
                  if (x >= width) { x = 0; y++; if (y >= height) break; }
                }
              }
            }
          } else {
            console.error("TGA: Only uncompressed (2) and RLE (10) true-color images are supported");
            callback(new Uint8Array([0,0,0,255]), 1, 1);
            return;
          }
        } catch (e) {
          console.error("TGA: Error decoding image", e);
          callback(new Uint8Array([0,0,0,255]), 1, 1);
          return;
        }

        callback(pixels, width, height);
      })
      .catch(err => {
        console.error("TGA: Failed to fetch", url, err);
        callback(new Uint8Array([0,0,0,255]), 1, 1);
      });
  }
}