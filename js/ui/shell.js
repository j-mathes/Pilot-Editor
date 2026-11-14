// Page chrome: header, banner, sidebar, drawer, theme and dialogs.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  const { h, fmt } = PE.ui;

  const $ = id => document.getElementById(id);
  let current = null; // { state, widgets, unsubscribe }
  let spy = null;

  function setFavicon(glyph, color) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="' + color +
      '"/><text x="16" y="23" font-size="20" font-family="Segoe UI,Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#fff">' + glyph + '</text></svg>';
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.append(link); }
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function applyTheme(def) {
    if (!def) {
      delete document.body.dataset.game;
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent2');
      $('brandMark').textContent = 'P';
      $('brandTitle').textContent = 'Pilot Editor';
      document.title = 'Pilot Editor';
      setFavicon('P', '#5b6b7e');
      return;
    }
    document.body.dataset.game = def.id;
    document.documentElement.style.setProperty('--accent', def.theme.accent);
    document.documentElement.style.setProperty('--accent2', def.theme.accent2);
    $('brandMark').textContent = def.theme.glyph;
    $('brandTitle').textContent = def.pilotTitle;
    setFavicon(def.theme.glyph, def.theme.accent);
  }

  function banner(text, level, detail) {
    const box = $('banner');
    if (!text) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'banner ' + (level || 'info');
    box.setAttribute('role', level === 'error' ? 'alert' : 'status');
    $('bannerText').textContent = text;
    const list = $('bannerList');
    list.textContent = '';
    for (const d of detail || []) list.append(h('li', null, d));
  }

  function updateHeader() {
    const s = current && current.state;
    const chip = $('fileChip');
    chip.hidden = !s;
    const diffOn = PE.ui.diff && PE.ui.diff.active();
    $('btnUndo').disabled = diffOn ? !PE.ui.diff.canUndo() : (!s || !s.canUndo());
    $('btnRedo').disabled = diffOn ? !PE.ui.diff.canRedo() : (!s || !s.canRedo());
    for (const id of ['btnSave', 'btnSaveAs', 'btnClose', 'btnCompare', 'btnChanges', 'presetSelect']) $(id).disabled = !s;
    if (!s) { document.title = 'Pilot Editor'; return; }
    const dirty = s.isDirty();
    chip.textContent = s.name + s.def.ext[0] + ' · ' + s.length + ' bytes' + (s.variant.use ? ' · ' + s.variant.use : '') + (dirty ? ' · unsaved changes' : '');
    chip.title = s.variant.detail || '';
    chip.classList.toggle('dirty', dirty);
    document.title = (dirty ? '* ' : '') + s.name + ' - ' + s.def.pilotTitle;
    $('summary').textContent = s.def.summary ? s.def.summary(s.get) : '';
    const n = s.changes().length;
    $('changeCount').textContent = n ? String(n) : '';
    $('changeCount').hidden = !n;
    const w = s.warnings().length;
    const badge = $('warnBadge');
    badge.textContent = w ? String(w) : '';
    badge.hidden = !w;
    badge.title = w + (w === 1 ? ' warning' : ' warnings') + ' (see Changes)';
    badge.setAttribute('aria-label', badge.title);
  }

  function updateDrawer() {
    const s = current && current.state;
    const changes = $('changeList');
    const warns = $('warnList');
    changes.textContent = '';
    warns.textContent = '';
    if (!s) return;
    const list = s.changes();
    if (!list.length) changes.append(h('li', { class: 'empty' }, 'No changes since the file was opened or saved.'));
    for (const c of list) {
      changes.append(h('li', null,
        h('span', { class: 'chg-label' }, c.field.label),
        h('span', { class: 'chg-vals' }, describe(c.field, c.from) + ' → ' + describe(c.field, c.to)),
        h('button', { type: 'button', class: 'btn small', title: 'Put this field back to its value when the file was opened or last saved', onclick: () => s.revert(c.id) }, 'Revert')));
    }
    const w = s.warnings();
    if (!w.length) warns.append(h('li', { class: 'empty' }, 'No warnings.'));
    for (const item of w) warns.append(h('li', { class: item.level }, item.text));
    $('warnCount').textContent = w.length ? String(w.length) : '';
    $('warnCount').hidden = !w.length;
  }

  function describe(f, v) {
    if (f.kind === 'bool') return v ? 'Yes' : 'No';
    if (f.kind === 'enum') {
      const o = f.options.find(x => x.value === v);
      return o ? o.label : 'Unknown (' + v + ')';
    }
    if (f.kind === 'flags') return '0x' + PE.bin.hex(v);
    return fmt(v);
  }

  function buildNav(sections) {
    const list = $('navList');
    list.textContent = '';
    for (const s of sections) {
      list.append(h('li', null, h('a', { href: '#sec-' + s.id, 'data-sec': s.id, title: 'Jump to ' + s.title }, s.title)));
    }
    if (spy) spy.disconnect();
    if (!('IntersectionObserver' in root)) return;
    spy = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          for (const a of list.querySelectorAll('a')) a.classList.toggle('active', a.dataset.sec === e.target.id.slice(4));
        }
      }
    }, { rootMargin: '-10% 0px -80% 0px' });
    for (const s of sections) spy.observe(s.el);
  }

  function show(state) {
    if (current) current.unsubscribe();
    current = null;
    $('sections').textContent = '';
    if (!state) {
      applyTheme(null);
      $('landing').hidden = false;
      $('editor').hidden = true;
      $('sidebar').hidden = true;
      $('presetSelect').textContent = '';
      updateHeader();
      updateDrawer();
      return;
    }
    const widgets = PE.ui.createWidgets(state);
    const sections = PE.ui.buildSections(state, widgets);
    for (const s of sections) $('sections').append(s.el);
    buildNav(sections);
    applyTheme(state.def);

    const preset = $('presetSelect');
    preset.textContent = '';
    preset.append(h('option', { value: '' }, 'Presets'));
    preset.append(h('option', { value: 'new', title: 'Set every field to the values of a new pilot' }, 'Reset to new pilot'));
    (state.def.presets || []).forEach((p, i) => preset.append(h('option', { value: String(i), title: p.title || p.label }, p.label)));
    preset.value = '';

    $('pilotName').value = state.name;
    $('landing').hidden = true;
    $('editor').hidden = false;
    $('sidebar').hidden = false;

    const unsubscribe = state.subscribe(ids => {
      widgets.refresh(ids);
      updateHeader();
      updateDrawer();
    });
    current = { state, widgets, unsubscribe };
    widgets.refresh();
    updateHeader();
    updateDrawer();
  }

  function toggleDrawer(force) {
    const d = $('drawer');
    d.hidden = force === undefined ? !d.hidden : !force;
    $('btnChanges').setAttribute('aria-expanded', String(!d.hidden));
  }

  function setTheme(mode) {
    document.documentElement.dataset.theme = mode;
    try { localStorage.setItem('pilot-editor-theme', mode); } catch (e) { /* storage unavailable */ }
  }

  function initTheme() {
    let mode = null;
    try { mode = localStorage.getItem('pilot-editor-theme'); } catch (e) { /* storage unavailable */ }
    if (!mode) mode = root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(mode);
  }

  PE.ui.shell = { $, show, banner, updateHeader, updateDrawer, toggleDrawer, setTheme, initTheme, applyTheme, describe, current: () => current };
})(globalThis);
