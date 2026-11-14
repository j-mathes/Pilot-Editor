// Pilot state: values, undo/redo, baseline comparison and warnings.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  const codec = PE.codec;

  function createState(def, name, bytes) {
    const index = codec.index(def);
    const listeners = new Set();
    const variant = codec.variantFor(def, bytes.length);
    if (!variant) throw new Error('Unsupported file size ' + bytes.length);

    let sourceBytes = new Uint8Array(bytes);
    const values = codec.parse(def, sourceBytes);
    let baseline = Object.assign({}, values);
    let undoStack = [];
    let redoStack = [];
    let pending = null;
    let cleanMark = 0;
    let cleanValid = true;
    let warningCache = null;
    let enforce = false;
    let ruleDepth = 0;
    let adjusted = null; // rule-made edits of the current top-level set, for the user message
    const rawKeys = new Set(); // 'raw:<offset>' ids for unmapped bytes changed by hand (compare view)
    const autos = new Set(); // keys of the game's optional "keep in step" calculations that are switched on
    let ownersMap = null;

    const state = { def, variant, name, get length() { return sourceBytes.length; } };

    function emit(ids) {
      warningCache = null;
      for (const fn of listeners) fn(ids, state);
    }

    function coerce(f, value) {
      if (f.kind === 'bool') return !!value;
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return null;
      const { min, max } = codec.limits(f);
      return Math.min(max, Math.max(min, Math.trunc(n)));
    }

    function setRaw(id, value) {
      const before = values[id];
      if (before === value) return false;
      values[id] = value;
      (pending || (pending = [])).push({ id, before, after: value });
      return true;
    }

    const hookApi = {
      get: id => values[id],
      set(id, value) {
        const f = index.get(id);
        if (!f) throw new Error('Unknown field ' + id);
        const v = coerce(f, value);
        if (v !== null) setRaw(id, v);
      },
      def
    };

    function batch(fn) {
      if (pending) { fn(); return; }
      pending = [];
      try { fn(); } finally {
        const edits = pending;
        pending = null;
        commit(edits);
      }
    }

    function commit(edits) {
      const first = new Map();
      const last = new Map();
      for (const e of edits) {
        if (!first.has(e.id)) first.set(e.id, e.before);
        last.set(e.id, e.after);
      }
      const entry = [];
      for (const [id, before] of first) {
        if (before !== last.get(id)) entry.push({ id, before, after: last.get(id) });
      }
      if (!entry.length) return;
      if (undoStack.length < cleanMark) cleanValid = false;
      undoStack.push(entry);
      redoStack = [];
      emit(entry.map(e => e.id));
    }

    state.get = id => values[id];

    // Applies one value, then the game's onChange sync and, when enforcing, its rules.
    function applySet(id, v, viaRule) {
      const before = values[id];
      if (!setRaw(id, v)) return false;
      if (viaRule && adjusted) adjusted.push({ id, before });
      if (def.onChange) def.onChange(id, v, hookApi);
      if (enforce && def.enforce && ruleDepth < 8) {
        ruleDepth++;
        try { def.enforce(id, v, ruleApi); } finally { ruleDepth--; }
      }
      if (def.autoUpdate && autos.size && ruleDepth < 8) {
        ruleDepth++;
        try { def.autoUpdate(id, v, ruleApi, autos); } finally { ruleDepth--; }
      }
      return true;
    }

    const ruleApi = {
      get: id => values[id],
      set(id, value) {
        const f = index.get(id);
        if (!f) throw new Error('Unknown field ' + id);
        const v = coerce(f, value);
        if (v !== null) applySet(id, v, true);
      }
    };

    state.set = function (id, value) {
      const f = index.get(id);
      if (!f) throw new Error('Unknown field ' + id);
      const v = coerce(f, value);
      if (v === null) return false;
      const outer = !pending;
      if (outer) adjusted = [];
      let changed = false;
      let list = null;
      try {
        batch(() => { changed = applySet(id, v, false); });
      } finally {
        if (outer) { list = adjusted; adjusted = null; }
      }
      if (list && changed && state.onAdjust) {
        const seen = new Set();
        const out = [];
        for (const a of list) {
          if (seen.has(a.id) || a.id === id) continue;
          seen.add(a.id);
          if (values[a.id] !== a.before) out.push({ id: a.id, field: index.get(a.id), from: a.before, to: values[a.id] });
        }
        if (out.length) state.onAdjust(out, id);
      }
      return changed;
    };

    state.setEnforce = on => { enforce = !!on; };
    state.setAuto = (key, on) => { if (on) autos.add(key); else autos.delete(key); };
    state.hasAuto = key => autos.has(key);
    state.enforcing = () => enforce;

    // Sets values exactly as given, with no onChange sync or rules, as one undo step (used when copying from another pilot).
    state.assign = function (map) {
      let changed = false;
      batch(() => {
        for (const id of Object.keys(map)) {
          if (index.has(id) && setRaw(id, map[id])) changed = true;
        }
      });
      return changed;
    };

    state.batch = function (fn) {
      batch(() => fn({
        get: hookApi.get,
        set: (id, value) => state.set(id, value)
      }));
    };

    function applyEntry(entry, direction) {
      const ids = [];
      for (const e of entry) {
        values[e.id] = direction === 'undo' ? e.before : e.after;
        ids.push(e.id);
      }
      emit(ids);
    }

    state.undo = function () {
      const entry = undoStack.pop();
      if (!entry) return false;
      applyEntry(entry, 'undo');
      redoStack.push(entry);
      return true;
    };

    state.redo = function () {
      const entry = redoStack.pop();
      if (!entry) return false;
      applyEntry(entry, 'redo');
      undoStack.push(entry);
      return true;
    };

    state.canUndo = () => undoStack.length > 0;
    state.canRedo = () => redoStack.length > 0;
    state.isDirty = () => !(cleanValid && undoStack.length === cleanMark);
    state.isChanged = id => values[id] !== baseline[id];
    state.baseline = id => baseline[id];

    state.changes = function () {
      const out = [];
      for (const f of def.fields) {
        if (values[f.id] !== baseline[f.id]) out.push({ id: f.id, field: f, from: baseline[f.id], to: values[f.id] });
      }
      for (const key of rawKeys) {
        const offset = Number(key.slice(4));
        const from = baseline[key] !== undefined ? baseline[key] : sourceBytes[offset];
        if (values[key] !== undefined && values[key] !== from) {
          out.push({ id: key, field: { id: key, label: 'Unmapped byte ' + offset + ' (0x' + PE.bin.hex(offset, 4) + ')' }, from, to: values[key] });
        }
      }
      return out;
    };

    state.revert = function (id) {
      batch(() => { setRaw(id, baseline[id]); });
    };

    state.revertAll = function () {
      batch(() => {
        for (const f of def.fields) setRaw(f.id, baseline[f.id]);
        for (const key of rawKeys) setRaw(key, baseline[key]);
      });
    };

    function withOverlay(src) {
      if (!rawKeys.size) return src;
      const out = new Uint8Array(src);
      for (const key of rawKeys) if (values[key] !== undefined) out[Number(key.slice(4))] = values[key];
      return out;
    }

    state.toBytes = function (opts) {
      return codec.serialize(def, values, withOverlay(sourceBytes), opts);
    };

    // Number of bytes that are the pilot itself; the rest of a two-half file is a backup rewritten on save.
    state.activeLength = () => variant.half || sourceBytes.length;

    // Writes raw bytes at an offset as one undo step: bytes that belong to a field set that field, the rest are kept as they are.
    state.patchBytes = function (offset, data) {
      if (!ownersMap) ownersMap = codec.owners(def, sourceBytes.length);
      const limit = state.activeLength();
      const cur = state.toBytes();
      const next = new Uint8Array(cur);
      const fields = new Set();
      const loose = [];
      for (let k = 0; k < data.length; k++) {
        const i = offset + k;
        if (i < 0 || i >= limit) continue;
        next[i] = data[k];
        if (ownersMap[i]) fields.add(ownersMap[i]); else loose.push(i);
      }
      let changed = false;
      batch(() => {
        for (const id of fields) {
          if (setRaw(id, codec.readField(index.get(id), next, variant))) changed = true;
        }
        for (const i of loose) {
          if (cur[i] === next[i]) continue;
          rawKeys.add('raw:' + i);
          if (setRaw('raw:' + i, next[i])) changed = true;
        }
      });
      return changed;
    };

    state.markSaved = function (savedBytes) {
      sourceBytes = new Uint8Array(savedBytes);
      baseline = Object.assign({}, values);
      cleanMark = undoStack.length;
      cleanValid = true;
      emit([]);
    };

    state.sourceBytes = () => sourceBytes;

    state.derived = function (d) {
      return d.compute(hookApi.get);
    };

    state.warnings = function () {
      if (warningCache) return warningCache;
      const out = [];
      for (const f of def.fields) {
        const v = values[f.id];
        if (f.kind === 'bool') continue;
        const { min, max } = codec.limits(f);
        if (v < min || v > max) {
          out.push({ id: f.id, level: 'warn', text: f.label + ': value ' + v + ' is outside ' + min + '..' + max + ' (kept until you edit it)' });
        } else if (f.softMax !== undefined && v > f.softMax) {
          out.push({ id: f.id, level: 'info', text: f.label + ': ' + v + ' is above the usual limit of ' + f.softMax });
        }
      }
      if (def.warnings) for (const w of def.warnings(hookApi.get)) out.push(w);
      warningCache = out;
      return out;
    };

    state.warningsFor = function (id) {
      return state.warnings().filter(w => w.id === id);
    };

    state.subscribe = function (fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    };

    state.setName = function (n) { state.name = n; emit([]); };

    return state;
  }

  PE.createState = createState;
})(globalThis);
