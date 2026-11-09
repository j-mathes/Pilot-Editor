// File detection, picking, saving and original-file snapshots.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};

  function extOf(name) {
    const i = name.lastIndexOf('.');
    return i < 0 ? '' : name.slice(i).toLowerCase();
  }

  function baseName(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0, i) : name;
  }

  // Chooses the game by size first; the extension only produces a warning.
  function detect(name, length) {
    const matches = Object.values(PE.games).filter(g => g.variants[length]);
    if (!matches.length) {
      const expected = Object.values(PE.games)
        .map(g => g.name + ': ' + Object.keys(g.variants).join(', ') + ' bytes').join('; ');
      throw new Error('This file is ' + length + ' bytes, which is not a supported pilot file size (' + expected + ').');
    }
    const def = matches[0];
    const variant = def.variants[length];
    const warnings = [];
    const ext = extOf(name);
    if (ext && !def.ext.includes(ext)) {
      warnings.push('The extension "' + ext + '" does not match a ' + def.name + ' pilot file, but the size does. Opened as ' + def.name + '.');
    }
    if (variant.note) warnings.push(variant.note);
    return { def, variant, warnings };
  }

  function halvesDiffer(variant, bytes) {
    if (!variant.half || bytes.length !== variant.half * 2) return false;
    for (let i = 0; i < variant.half; i++) if (bytes[i] !== bytes[i + variant.half]) return true;
    return false;
  }

  function fnv1a(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // ---- Browser-only helpers below ----

  function readFile(file) {
    return file.arrayBuffer().then(buf => ({ name: file.name, bytes: new Uint8Array(buf) }));
  }

  function pickWithInput(accept) {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) readFile(input.files[0]).then(r => resolve(r), reject);
        else resolve(null);
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  function pickFile() {
    const exts = Object.values(PE.games).flatMap(g => g.ext);
    if (root.showOpenFilePicker) {
      return root.showOpenFilePicker({
        types: [{ description: 'Pilot files', accept: { 'application/octet-stream': exts } }]
      }).then(([handle]) => handle.getFile().then(f => readFile(f).then(r => Object.assign(r, { handle }))))
        .catch(err => (err && err.name === 'AbortError') ? null : Promise.reject(err));
    }
    return pickWithInput(exts.join(','));
  }

  function download(name, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function writeHandle(handle, bytes) {
    return handle.createWritable().then(w => w.write(bytes).then(() => w.close()));
  }

  function saveAsPicker(suggestedName, ext, bytes) {
    return root.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Pilot file', accept: { 'application/octet-stream': [ext] } }]
    }).then(handle => writeHandle(handle, bytes).then(() => handle))
      .catch(err => (err && err.name === 'AbortError') ? null : Promise.reject(err));
  }

  // ---- IndexedDB snapshots of files as they were opened ----

  const DB_NAME = 'pilot-editor';
  const STORE = 'snapshots';
  const KEEP = 20;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = root.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  const snapshots = {
    list() {
      return openDb().then(db => tx(db, 'readonly', s => s.getAll()))
        .then(all => all.sort((a, b) => b.time - a.time));
    },
    save(name, gameId, bytes) {
      const key = fnv1a(bytes) + ':' + name;
      return openDb().then(db => tx(db, 'readwrite', s => s.put({ key, name, gameId, bytes, time: Date.now() }))
        .then(() => snapshots.list())
        .then(all => Promise.all(all.slice(KEEP).map(old => tx(db, 'readwrite', s => s.delete(old.key))))));
    }
  };

  PE.files = {
    extOf, baseName, detect, halvesDiffer, fnv1a,
    readFile, pickFile, download, writeHandle, saveAsPicker, snapshots,
    canSaveInPlace: () => !!root.showOpenFilePicker,
    canSaveAs: () => !!root.showSaveFilePicker
  };
})(globalThis);
