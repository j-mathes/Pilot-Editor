// Generic parse/serialize driven by a game's field table.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  const { TYPES, read, write } = PE.bin;

  function index(def) {
    if (!def._index) {
      const byId = new Map();
      for (const f of def.fields) {
        if (byId.has(f.id)) throw new Error('Duplicate field id ' + f.id);
        if (!TYPES[f.type]) throw new Error('Bad type for ' + f.id);
        byId.set(f.id, f);
      }
      def._index = byId;
    }
    return def._index;
  }

  function variantFor(def, length) {
    return def.variants[length] || null;
  }

  function at(variant, offset) {
    if (variant && variant.shift && offset >= variant.shiftFrom) return offset + variant.shift;
    return offset;
  }

  function limits(f) {
    const t = TYPES[f.type];
    return {
      min: f.min !== undefined ? f.min : t.min,
      max: f.max !== undefined ? f.max : t.max
    };
  }

  function readField(f, bytes, variant) {
    const raw = read(bytes, at(variant, f.offset), f.type);
    return f.kind === 'bool' ? raw !== 0 : raw;
  }

  function parse(def, bytes) {
    const variant = variantFor(def, bytes.length);
    if (!variant) throw new Error('Unsupported file size ' + bytes.length);
    const values = {};
    for (const f of def.fields) values[f.id] = readField(f, bytes, variant);
    return values;
  }

  // Writes only fields whose value differs from what is already in the bytes.
  function serialize(def, values, src, opts) {
    const variant = variantFor(def, src.length);
    if (!variant) throw new Error('Unsupported file size ' + src.length);
    const out = new Uint8Array(src);
    for (const f of def.fields) {
      const value = values[f.id];
      if (value === undefined) continue;
      if (readField(f, out, variant) === value) continue;
      const raw = f.kind === 'bool' ? (value ? 1 : 0) : value;
      write(out, at(variant, f.offset), f.type, raw);
      if (f.mirrors) for (const m of f.mirrors) write(out, at(variant, m), f.type, raw);
    }
    if (opts && opts.mirror && variant.half && out.length === variant.half * 2) {
      out.set(out.subarray(0, variant.half), variant.half);
    }
    return out;
  }

  // Maps each byte offset to the id of the field that owns it (or null).
  function owners(def, length) {
    const variant = variantFor(def, length);
    const map = new Array(length).fill(null);
    for (const f of def.fields) {
      const size = TYPES[f.type].size;
      const offsets = [f.offset].concat(f.mirrors || []);
      for (const o of offsets) {
        const start = at(variant, o);
        for (let i = 0; i < size; i++) if (start + i < length) map[start + i] = f.id;
      }
    }
    return map;
  }

  PE.codec = { index, variantFor, at, limits, readField, parse, serialize, owners };
})(globalThis);
