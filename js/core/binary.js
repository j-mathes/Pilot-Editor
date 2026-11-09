// Little-endian read/write helpers over Uint8Array.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};

  const TYPES = {
    u8: { size: 1, min: 0, max: 255 },
    u16: { size: 2, min: 0, max: 65535 },
    u32: { size: 4, min: 0, max: 4294967295 },
    i32: { size: 4, min: -2147483648, max: 2147483647 }
  };

  function view(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  function read(bytes, offset, type) {
    const t = TYPES[type];
    if (!t) throw new Error('Unknown type ' + type);
    if (offset < 0 || offset + t.size > bytes.length) {
      throw new RangeError('Read past end of file at offset ' + offset);
    }
    const v = view(bytes);
    switch (type) {
      case 'u8': return v.getUint8(offset);
      case 'u16': return v.getUint16(offset, true);
      case 'u32': return v.getUint32(offset, true);
      default: return v.getInt32(offset, true);
    }
  }

  function write(bytes, offset, type, value) {
    const t = TYPES[type];
    if (!t) throw new Error('Unknown type ' + type);
    if (offset < 0 || offset + t.size > bytes.length) {
      throw new RangeError('Write past end of file at offset ' + offset);
    }
    if (!Number.isInteger(value) || value < t.min || value > t.max) {
      throw new RangeError('Value ' + value + ' does not fit ' + type);
    }
    const v = view(bytes);
    switch (type) {
      case 'u8': v.setUint8(offset, value); break;
      case 'u16': v.setUint16(offset, value, true); break;
      case 'u32': v.setUint32(offset, value, true); break;
      default: v.setInt32(offset, value, true);
    }
  }

  function hex(n, width) {
    return n.toString(16).toUpperCase().padStart(width || 2, '0');
  }

  PE.bin = { TYPES, read, write, hex };
})(globalThis);
