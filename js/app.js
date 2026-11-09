// Wires the UI to files and state: open, new, save, restore, shortcuts.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  const shell = PE.ui.shell;
  const $ = shell.$;
  const h = PE.ui.h;

  const session = { state: null, handle: null, openedBytes: null, backupDone: false };

  function discardOk() {
    const s = session.state;
    return !s || !s.isDirty() || root.confirm('You have unsaved changes. Discard them?');
  }

  function startSession(state, handle, bytes) {
    session.state = state;
    session.handle = handle || null;
    session.openedBytes = new Uint8Array(bytes);
    session.backupDone = false;
    shell.show(state);
  }

  function loadBytes(name, bytes, handle) {
    let det, state;
    try {
      det = PE.files.detect(name, bytes.length);
      state = PE.createState(det.def, PE.files.baseName(name), bytes);
    } catch (err) {
      shell.banner(err.message, 'error');
      return;
    }
    if (!discardOk()) return;
    const notes = det.warnings.slice();
    if (PE.files.halvesDiffer(det.variant, bytes)) {
      notes.push('The backup half of this file differs from the active pilot. Saving will overwrite it with the active pilot (the original stays in Restore).');
    }
    startSession(state, handle, bytes);
    shell.banner('Opened ' + name + ' as a ' + det.def.name + ' pilot (' + bytes.length + ' bytes).', notes.length ? 'warn' : 'info', notes);
    PE.files.snapshots.save(name, det.def.id, bytes).catch(() => { /* snapshots are best effort */ });
  }

  function openPicker() {
    PE.files.pickFile().then(r => { if (r) loadBytes(r.name, r.bytes, r.handle); })
      .catch(err => shell.banner('Could not open the file: ' + err.message, 'error'));
  }

  function newPilot(gameId) {
    const def = PE.games[gameId];
    if (!def || !discardOk()) return;
    const bytes = def.blank();
    startSession(PE.createState(def, 'NEWPILOT', bytes), null, bytes);
    shell.banner('Started a new ' + def.name + ' pilot. Values are a best-effort blank; compare with a pilot created in the game.', 'info');
  }

  function save(asNew) {
    const s = session.state;
    if (!s) return Promise.resolve();
    const bytes = s.toBytes({ mirror: true });
    const fileName = s.name + s.def.ext[0];
    let work;
    if (!asNew && session.handle) {
      if (!session.backupDone && $('optBackup').checked) PE.files.download(fileName + '.bak', session.openedBytes);
      session.backupDone = true;
      work = PE.files.writeHandle(session.handle, bytes).then(() => 'Saved ' + fileName + ' in place.');
    } else if (PE.files.canSaveAs()) {
      work = PE.files.saveAsPicker(fileName, s.def.ext[0], bytes).then(handle => {
        if (!handle) return null;
        session.handle = handle;
        session.backupDone = true;
        s.setName(PE.files.baseName(handle.name));
        return 'Saved ' + handle.name + '.';
      });
    } else {
      PE.files.download(fileName, bytes);
      work = Promise.resolve('Downloaded ' + fileName + '. Your browser saves a new copy; the original file is untouched.');
    }
    return work.then(msg => {
      if (!msg) return;
      s.markSaved(bytes);
      shell.banner(msg, 'info');
    }).catch(err => shell.banner('Could not save: ' + err.message, 'error'));
  }

  function applyPreset(value) {
    const s = session.state;
    if (!s || value === '') return;
    if (value === 'new') {
      if (!root.confirm('Reset every field to a new pilot? You can undo this.')) return;
      const blank = s.def.blank();
      const values = PE.codec.parse(s.def, blank);
      s.batch(api => { for (const f of s.def.fields) api.set(f.id, values[f.id]); });
    } else {
      s.batch(api => s.def.presets[Number(value)].run(api));
    }
  }

  function showRestore() {
    const dlg = $('restoreDialog');
    const list = $('restoreList');
    list.textContent = '';
    list.append(h('li', { class: 'empty' }, 'Loading...'));
    if (dlg.showModal) dlg.showModal();
    PE.files.snapshots.list().then(all => {
      list.textContent = '';
      if (!all.length) list.append(h('li', { class: 'empty' }, 'No saved copies yet. A copy of each file is kept when you open it.'));
      for (const snap of all) {
        list.append(h('li', null,
          h('span', { class: 'chg-label' }, snap.name),
          h('span', { class: 'chg-vals' }, new Date(snap.time).toLocaleString() + ' · ' + snap.bytes.length + ' bytes'),
          h('button', { type: 'button', class: 'btn small', onclick: () => { dlg.close(); loadBytes(snap.name, new Uint8Array(snap.bytes), null); } }, 'Open'),
          h('button', { type: 'button', class: 'btn small', onclick: () => PE.files.download(snap.name, snap.bytes) }, 'Download')));
      }
    }).catch(() => {
      list.textContent = '';
      list.append(h('li', { class: 'empty' }, 'Saved copies are not available in this browser.'));
    });
  }

  function init() {
    shell.initTheme();
    shell.show(null);

    const newSel = $('newSelect');
    for (const def of Object.values(PE.games)) newSel.append(h('option', { value: def.id }, def.name));

    $('btnOpen').addEventListener('click', openPicker);
    $('landOpen').addEventListener('click', openPicker);
    $('btnSave').addEventListener('click', () => save(false));
    $('btnSaveAs').addEventListener('click', () => save(true));
    $('btnUndo').addEventListener('click', () => session.state && session.state.undo());
    $('btnRedo').addEventListener('click', () => session.state && session.state.redo());
    $('btnChanges').addEventListener('click', () => shell.toggleDrawer());
    $('closeDrawer').addEventListener('click', () => shell.toggleDrawer(false));
    $('btnRestore').addEventListener('click', showRestore);
    $('closeRestore').addEventListener('click', () => $('restoreDialog').close());
    $('btnTheme').addEventListener('click', () =>
      shell.setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
    $('bannerClose').addEventListener('click', () => shell.banner(null));
    $('revertAll').addEventListener('click', () => session.state && session.state.revertAll());
    for (const btn of document.querySelectorAll('[data-new]')) btn.addEventListener('click', () => newPilot(btn.dataset.new));
    newSel.addEventListener('change', () => { if (newSel.value) newPilot(newSel.value); newSel.value = ''; });
    $('presetSelect').addEventListener('change', e => { applyPreset(e.target.value); e.target.value = ''; });

    $('pilotName').addEventListener('change', e => {
      const clean = e.target.value.replace(/[\\/:*?"<>|]/g, '').trim();
      if (session.state && clean) session.state.setName(clean);
      e.target.value = session.state ? session.state.name : '';
    });

    let dragDepth = 0;
    root.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('dropOverlay').hidden = false; });
    root.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropOverlay').hidden = true; } });
    root.addEventListener('dragover', e => e.preventDefault());
    root.addEventListener('drop', e => {
      e.preventDefault();
      dragDepth = 0;
      $('dropOverlay').hidden = true;
      const item = e.dataTransfer.items && e.dataTransfer.items[0];
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      const handleP = item && item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null);
      handleP.then(handle => PE.files.readFile(file).then(r => loadBytes(r.name, r.bytes, handle && handle.kind === 'file' ? handle : null)))
        .catch(err => shell.banner('Could not open the file: ' + err.message, 'error'));
    });

    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'o') { e.preventDefault(); openPicker(); }
      else if (key === 's') { e.preventDefault(); save(e.shiftKey); }
      else if ((key === 'z' || key === 'y') && session.state) {
        e.preventDefault();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        if (key === 'y' || e.shiftKey) session.state.redo(); else session.state.undo();
      }
    });

    root.addEventListener('beforeunload', e => {
      if (session.state && session.state.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });

    if (!PE.files.canSaveAs()) {
      $('saveNote').textContent = 'This browser saves by downloading a new copy; your original file is never overwritten.';
    }
  }

  PE.app = { init, session, loadBytes, newPilot, save };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(globalThis);
