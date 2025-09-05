// ES6 port of the Byter utility for reading ArrayBuffers

export class Byter {
  constructor(arraybuffer) {
    this.buffer_is_valid = arraybuffer instanceof ArrayBuffer;
    if (!this.buffer_is_valid) {
      throw new Error("Byter: data must be ArrayBuffer");
    }
    this.bytearray = arraybuffer;
    this.idx = 0;
    this.total_size = this.bytearray.byteLength;
  }

  isValid() {
    return this.buffer_is_valid;
  }

  getFloat32Value(offset) {
    return this.getFloat32Array(offset, 1)[0];
  }
  getFloat32Array(offset, number_of_elements) {
    this.idx += offset;
    const values = new Float32Array(this.bytearray, this.idx, number_of_elements);
    this.idx += Float32Array.BYTES_PER_ELEMENT * number_of_elements;
    return values;
  }

  getInt32Value(offset) {
    return this.getInt32Array(offset, 1)[0];
  }
  getInt32Array(offset, number_of_elements) {
    this.idx += offset;
    const values = new Int32Array(this.bytearray, this.idx, number_of_elements);
    this.idx += Int32Array.BYTES_PER_ELEMENT * number_of_elements;
    return values;
  }

  getInt16Value(offset) {
    return this.getInt16Array(offset, 1)[0];
  }
  getInt16Array(offset, number_of_elements) {
    this.idx += offset;
    const values = new Int16Array(this.bytearray, this.idx, number_of_elements);
    this.idx += Int16Array.BYTES_PER_ELEMENT * number_of_elements;
    return values;
  }

  getUint16Value(offset) {
    return this.getUint16Array(offset, 1)[0];
  }
  getUint16Array(offset, number_of_elements) {
    this.idx += offset;
    const values = new Uint16Array(this.bytearray, this.idx, number_of_elements);
    this.idx += Uint16Array.BYTES_PER_ELEMENT * number_of_elements;
    return values;
  }

  getUint8Array(offset, number_of_elements) {
    this.idx += offset;
    const values = new Uint8Array(this.bytearray, this.idx, number_of_elements);
    this.idx += Uint8Array.BYTES_PER_ELEMENT * number_of_elements;
    return values;
  }

  getString(offset, number_of_elements, lastchar) {
    const chars = this.getUint8Array(offset, number_of_elements);
    let str = String.fromCharCode.apply(null, chars);
    if (lastchar) {
      const idx = str.indexOf("\0");
      if (idx >= 0) {
        str = str.substring(0, idx);
      }
    }
    return str;
  }

  setPos(newpos) {
    this.idx = newpos;
  }
  getPos() {
    return this.idx;
  }
  totalSize() {
    return this.total_size;
  }
}