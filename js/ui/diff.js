// Compare view: the open pilot beside another file of the same game, with copy buttons in both directions.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  const { h, fmt } = PE.ui;

  let view = null; // { ctx, unsubs, history, redone, ... }

  function show(f, v) {
    if (f.kind === 'bool') return v ? 'Yes' : 'No';
    if (f.kind === 'enum') {
      const o = f.options.find(x => x.value === v);
      return o ? o.label : 'Unknown (' + v + ')';
    }
    if (f.kind === 'flags') {
      const on = f.bits.filter((_, i) => v & (1 << i));
      return on.length ? on.join(', ') : 'None';
    }
    const text = fmt(v);
    return f.valueLabels && f.valueLabels[v] ? text + ' \u00B7 ' + f.valueLabels[v] : text;
  }

  function fileName(state) { return state.name + state.def.ext[0]; }

  function open(ctx) {
    if (view) close();
    const $ = id => document.getElementById(id);
    const L = ctx.left.state;
    const R = ctx.right.state;
    view = { ctx, unsubs: [], history: [], redone: [], shown: [] };

    const count = h('span', { class: 'diff-count', role: 'status' });
    const only = h('input', { type: 'checkbox', id: 'diffOnly', checked: true, title: 'Show only the fields that differ' });
    const filter = h('input', { type: 'search', class: 'search', placeholder: 'Filter fields', 'aria-label': 'Filter fields', title: 'Type to show only fields whose name or section contains this text' });
    const done = h('button', { type: 'button', class: 'btn primary', title: 'Leave the comparison and go back to editing this pilot (asks first if the other file has unsaved changes)', onclick: () => ctx.exit() }, 'Done');
    const bar = h('div', { class: 'diff-bar' },
      h('h2', null, 'Compare'), count,
      h('label', { class: 'opt', title: 'Show only the fields that differ' }, only, ' Differences only'),
      filter, done);
    const note = h('p', { class: 'hint' }, 'Only the fields the editor knows are compared and copied; unknown bytes are not. Copying sets values exactly as they are in the other file (game rules are not applied). Save each side when you are done.');

    const sideHead = (sess, which) => {
      const name = h('strong', null);
      const dirty = h('span', { class: 'diff-dirty', hidden: true }, 'unsaved');
      const save = h('button', { type: 'button', class: 'btn small', title: 'Save this file (writes over it where the browser allows, otherwise downloads a copy)', onclick: () => ctx.save(sess) }, 'Save');
      const th = h('th', { scope: 'col', class: 'diff-side diff-' + which }, name, dirty, save);
      return { th, update() { name.textContent = fileName(sess.state); dirty.hidden = !sess.state.isDirty(); } };
    };
    const headL = sideHead(ctx.left, 'left');
    const headR = sideHead(ctx.right, 'right');
    const allToLeft = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Copy every shown difference to the left file', title: 'Copy every shown difference to the left file (' + fileName(L) + ')', onclick: () => copyRows(view.shown, 'left') }, '\u25C0 all');
    const allToRight = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Copy every shown difference to the right file', title: 'Copy every shown difference to the right file (' + fileName(R) + ')', onclick: () => copyRows(view.shown, 'right') }, 'all \u25B6');
    const body = h('tbody');
    const table = h('table', { class: 'diff-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Field'), headL.th, h('th', { scope: 'col', class: 'diff-mid' }, allToLeft, allToRight), headR.th)),
      body);
    const wrap = h('div', { class: 'diff-wrap', tabindex: -1 }, table);

    const host = $('diff');
    host.textContent = '';
    host.append(bar, note, wrap);

    function copyRows(rows, to, focusId) {
      const ids = rows.filter(r => !r.same).map(r => r.id);
      if (!ids.length) return;
      const from = to === 'left' ? R : L;
      const target = to === 'left' ? L : R;
      if (PE.compare.copy(from, target, ids)) {
        view.history.push(to);
        view.redone = [];
      }
      render(focusId, to);
    }

    function render(focusId, dir) {
      const q = filter.value.trim().toLowerCase();
      const all = PE.compare.rows(L, R);
      const total = all.filter(r => !r.same).length;
      count.textContent = total ? total + (total === 1 ? ' difference' : ' differences') : 'The two files have the same values';
      headL.update();
      headR.update();
      view.shown = all.filter(r => (!only.checked || !r.same) && (!q || (r.field.label + ' ' + r.group).toLowerCase().includes(q)));
      allToLeft.disabled = allToRight.disabled = !view.shown.some(r => !r.same);

      body.textContent = '';
      let group = null;
      let groupRows = [];
      const flush = () => {
        if (!group) return;
        const toLeft = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Copy the differences in ' + group + ' to the left file', title: 'Copy the differences in this group to the left file', onclick: () => copyRows(groupRows, 'left') }, '\u25C0');
        const toRight = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Copy the differences in ' + group + ' to the right file', title: 'Copy the differences in this group to the right file', onclick: () => copyRows(groupRows, 'right') }, '\u25B6');
        toLeft.disabled = toRight.disabled = !groupRows.some(r => !r.same);
        body.insertBefore(h('tr', { class: 'diff-group' }, h('th', { scope: 'colgroup', colspan: 2 }, group), h('td', { class: 'diff-mid' }, toLeft, toRight), h('td')), groupAnchor);
        groupAnchor.remove();
      };
      let groupAnchor = null;
      for (const r of view.shown) {
        if (r.group !== group) {
          flush();
          group = r.group;
          groupRows = [];
          groupAnchor = h('tr', { hidden: true });
          body.append(groupAnchor);
        }
        groupRows.push(r);
        const toLeft = h('button', { type: 'button', class: 'btn small', 'data-dir': 'left', 'aria-label': 'Copy ' + r.field.label + ' to the left file', title: 'Copy to the left file (' + fileName(L) + ')', onclick: () => copyRows([r], 'left', nextId(r)) }, '\u25C0');
        const toRight = h('button', { type: 'button', class: 'btn small', 'data-dir': 'right', 'aria-label': 'Copy ' + r.field.label + ' to the right file', title: 'Copy to the right file (' + fileName(R) + ')', onclick: () => copyRows([r], 'right', nextId(r)) }, '\u25B6');
        toLeft.disabled = toRight.disabled = r.same;
        body.append(h('tr', { class: r.same ? 'same' : 'differs', 'data-row': r.id },
          h('th', { scope: 'row' }, r.field.label),
          h('td', { class: 'diff-val' }, show(r.field, r.left)),
          h('td', { class: 'diff-mid' }, toLeft, toRight),
          h('td', { class: 'diff-val' }, show(r.field, r.right))));
      }
      flush();
      if (!view.shown.length) {
        body.append(h('tr', { class: 'empty' }, h('td', { colspan: 4 }, total ? 'No fields match the filter.' : 'Nothing to show: the two files have the same values.')));
      }
      if (focusId !== undefined) {
        const next = focusId && body.querySelector('[data-row="' + focusId + '"] button[data-dir="' + dir + '"]:not(:disabled)');
        (next || wrap).focus();
      }
      PE.ui.shell.updateHeader();
    }

    function nextId(r) {
      const i = view.shown.findIndex(x => x.id === r.id);
      const next = view.shown.slice(i + 1).find(x => !x.same);
      return next ? next.id : null;
    }

    only.addEventListener('change', () => render());
    filter.addEventListener('input', () => render());
    view.unsubs.push(L.subscribe(() => render()), R.subscribe(() => render()));
    view.render = render;

    document.body.classList.add('diff-mode');
    $('editor').hidden = true;
    $('sidebar').hidden = true;
    PE.ui.shell.toggleDrawer(false);
    host.hidden = false;
    render();
    document.documentElement.scrollTop = 0;
    wrap.focus({ preventScroll: true });
  }

  function close() {
    if (!view) return;
    for (const off of view.unsubs) if (typeof off === 'function') off();
    const host = document.getElementById('diff');
    host.hidden = true;
    host.textContent = '';
    document.body.classList.remove('diff-mode');
    document.getElementById('editor').hidden = false;
    document.getElementById('sidebar').hidden = false;
    view = null;
    PE.ui.shell.updateHeader();
  }

  // Undo and redo follow the copies made in this comparison, whichever side they changed.
  function stateFor(side) { return side === 'left' ? view.ctx.left.state : view.ctx.right.state; }
  function undo() {
    if (!view || !view.history.length) return false;
    const side = view.history.pop();
    stateFor(side).undo();
    view.redone.push(side);
    view.render();
    return true;
  }
  function redo() {
    if (!view || !view.redone.length) return false;
    const side = view.redone.pop();
    stateFor(side).redo();
    view.history.push(side);
    view.render();
    return true;
  }

  PE.ui.diff = {
    open, close, undo, redo,
    active: () => !!view,
    canUndo: () => !!view && view.history.length > 0,
    canRedo: () => !!view && view.redone.length > 0,
    otherDirty: () => !!view && view.ctx.right.state.isDirty()
  };
})(globalThis);
