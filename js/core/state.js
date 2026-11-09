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

    state.set = function (id, value) {
      const f = index.get(id);
      if (!f) throw new Error('Unknown field ' + id);
      const v = coerce(f, value);
      if (v === null) return false;
      let changed = false;
      batch(() => {
        changed = setRaw(id, v);
        if (changed && def.onChange) def.onChange(id, v, hookApi);
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
      return out;
    };

    state.revert = function (id) {
      batch(() => { setRaw(id, baseline[id]); });
    };

    state.revertAll = function () {
      batch(() => { for (const f of def.fields) setRaw(f.id, baseline[f.id]); });
    };

    state.toBytes = function (opts) {
      return codec.serialize(def, values, sourceBytes, opts);
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
