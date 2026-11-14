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
    const note = h('p', { class: 'hint' }, 'The table compares and copies the fields the editor knows; the raw bytes below show every byte, including unknown ones. Copying sets values exactly as they are in the other file (game rules are not applied). Save each side when you are done.');

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

    // ---- raw bytes ----
    const hex2 = n => PE.bin.hex(n, 2);
    const hex4 = n => '0x' + PE.bin.hex(n, 4);
    const owners = PE.codec.owners(L.def, L.length);
    const labelOf = new Map(L.def.fields.map(f => [f.id, f.label]));
    let bd = null;
    let sel = null; // { a, b } byte offsets
    let marked = [];
    let cells = { l: [], r: [] };
    let dragging = false;

    const hxSummary = h('span', { class: 'hx-sum' });
    const hxPrev = h('button', { type: 'button', class: 'btn small', title: 'Select the previous block of differing bytes (P in the byte grid)', onclick: () => jump(-1) }, '\u25B2 Previous');
    const hxNext = h('button', { type: 'button', class: 'btn small', title: 'Select the next block of differing bytes (N in the byte grid)', onclick: () => jump(1) }, 'Next \u25BC');
    const hxGo = h('input', {
      type: 'text', class: 'hx-go', placeholder: 'Go to offset', 'aria-label': 'Go to offset', autocomplete: 'off',
      title: 'Type a byte offset in hex (0x2E1) or decimal (737) and press Enter',
      onkeydown: e => { if (e.key === 'Enter') goTo(hxGo.value); }
    });
    const hxOnly = h('input', { type: 'checkbox', title: 'Show only the rows that contain differing bytes' });
    const hxData = h('input', { type: 'checkbox', title: 'Show only the rows where either file has a byte other than 00' });
    const hxSel = h('span', { class: 'hx-sel', role: 'status' });
    const hxToLeft = h('button', { type: 'button', class: 'btn small', title: 'Copy the selected bytes to the left file (' + fileName(L) + ')', onclick: () => copySel('left') }, '\u25C0 Copy bytes');
    const hxToRight = h('button', { type: 'button', class: 'btn small', title: 'Copy the selected bytes to the right file (' + fileName(R) + ')', onclick: () => copySel('right') }, 'Copy bytes \u25B6');
    const hxClear = h('button', { type: 'button', class: 'btn small', title: 'Clear the byte selection', onclick: () => { sel = null; paint(); } }, 'Clear');
    const hxNote = h('p', { class: 'hint hx-note', hidden: true });
    const hxNameL = h('span', { class: 'hx-name' }, fileName(L));
    const hxNameR = h('span', { class: 'hx-name hr' }, fileName(R));
    const labels = (cls, items) => { const el = h('span', { class: cls }); el.innerHTML = items.map(t => '<span>' + t + '</span>').join(''); return el; };
    const byteLabels = Array.from({ length: 16 }, (_, i) => hex2(i));
    const charLabels = Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase());
    // Two rows in one grid so the file names sit exactly over their columns; it stays in view while the bytes scroll.
    const hxHead = h('div', { class: 'hx-row hx-head' },
      h('span'), hxNameL, h('span'), hxNameR, h('span'),
      h('span', { class: 'hx-lab' }, 'Offset'), labels('hx-pane hx-lab', byteLabels), labels('hx-ascii hx-lab', charLabels),
      labels('hx-pane hr hx-lab', byteLabels), labels('hx-ascii hx-lab', charLabels));
    const hxRows = h('div', { class: 'hx-rows', tabindex: 0, role: 'region', 'aria-label': 'Raw bytes of both files. Click a byte to select it; arrow keys move, shift extends, N and P jump between differences.' });
    const hxEl = h('section', { class: 'hx', 'aria-label': 'Raw bytes' },
      h('div', { class: 'hx-top' },
        h('div', { class: 'hx-title' }, h('strong', null, 'Raw bytes'), ' ', hxSummary),
        h('div', { class: 'hx-bar' }, hxPrev, hxNext, hxGo,
          h('label', { class: 'opt', title: 'Show only the rows that contain differing bytes' }, hxOnly, ' Rows with differences only'),
          h('label', { class: 'opt', title: 'Show only the rows where either file has a byte other than 00' }, hxData, ' Rows with data only'),
          hxSel, hxToLeft, hxToRight, hxClear),
        hxNote,
        h('div', { class: 'hx-headwrap' }, hxHead)),
      h('div', { class: 'hx-body' }, hxRows));

    const range = () => (sel ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)] : null);

    function ascii(v) {
      if (v < 32 || v > 126) return '.';
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[String.fromCharCode(v)] || String.fromCharCode(v);
    }

    function renderHex() {
      bd = PE.compare.byteDiff(L, R);
      hxNameL.textContent = fileName(L);
      hxNameR.textContent = fileName(R);
      const { a, b, la, lb, length, flags } = bd;
      const only = hxOnly.checked;
      const cell = (bytes, has, i) => '<span class="b' + (flags[i] ? ' d' : '') + (owners[i] ? ' k' : ' u') + (has ? '' : ' m') + '" data-i="' + i + '">' + (has ? hex2(bytes[i]) : '--') + '</span>';
      const chr = (bytes, has, i) => '<span class="a' + (flags[i] ? ' d' : '') + '" data-a="' + i + '">' + (has ? ascii(bytes[i]) : ' ') + '</span>';
      let html = '';
      let gap = false;
      for (let start = 0; start < length; start += 16) {
        const end = Math.min(start + 16, length);
        let rowDiff = false;
        let rowData = false;
        for (let i = start; i < end; i++) {
          if (flags[i]) rowDiff = true;
          if ((i < la && a[i] !== 0) || (i < lb && b[i] !== 0)) rowData = true;
        }
        if ((only && !rowDiff) || (hxData.checked && !rowData)) {
          if (!gap) html += '<div class="hx-gap">\u22EF</div>';
          gap = true;
          continue;
        }
        gap = false;
        let lh = '', ra = '', rh = '', la2 = '';
        for (let i = start; i < end; i++) {
          lh += cell(a, i < la, i); rh += cell(b, i < lb, i);
          la2 += chr(a, i < la, i); ra += chr(b, i < lb, i);
        }
        for (let i = end; i < start + 16; i++) {
          lh += '<span class="pad"></span>'; rh += '<span class="pad"></span>';
          la2 += '<span class="a"></span>'; ra += '<span class="a"></span>';
        }
        html += '<div class="hx-row"><span class="hx-off">' + PE.bin.hex(start, 4) + '</span><span class="hx-pane hl">' + lh + '</span><span class="hx-ascii al">' + la2 +
          '</span><span class="hx-pane hr">' + rh + '</span><span class="hx-ascii ar">' + ra + '</span></div>';
      }
      hxRows.innerHTML = html;
      cells = { l: [], r: [], al: [], ar: [] };
      for (const el of hxRows.querySelectorAll('.hl > .b')) cells.l[Number(el.dataset.i)] = el;
      for (const el of hxRows.querySelectorAll('.hr > .b')) cells.r[Number(el.dataset.i)] = el;
      for (const el of hxRows.querySelectorAll('.al > .a[data-a]')) cells.al[Number(el.dataset.a)] = el;
      for (const el of hxRows.querySelectorAll('.ar > .a[data-a]')) cells.ar[Number(el.dataset.a)] = el;
      marked = [];
      if (sel && (sel.a >= length || sel.b >= length)) sel = null;
      hxPrev.disabled = hxNext.disabled = !bd.blocks.length;
      const sameLayout = PE.compare.sameLayout(L, R);
      hxNote.hidden = sameLayout && la === lb;
      hxNote.textContent = !sameLayout
        ? 'These files use different layouts (' + L.length + ' and ' + R.length + ' bytes): from byte ' + (L.variant.shiftFrom || R.variant.shiftFrom) + ' every field sits one byte apart, so differences after that are expected and bytes cannot be copied. Use the field table above.'
        : 'The pilot parts are different sizes; missing bytes show as --.';
      paint();
    }

    function paint() {
      for (const el of marked) el.classList.remove('s');
      marked = [];
      const r = range();
      if (r) {
        for (let i = r[0]; i <= r[1]; i++) {
          for (const side of [cells.l, cells.r, cells.al, cells.ar]) if (side[i]) { side[i].classList.add('s'); marked.push(side[i]); }
        }
      }
      const total = bd ? bd.blocks.length : 0;
      let text = !bd || !bd.count ? 'The bytes are identical' : bd.count + (bd.count === 1 ? ' byte differs' : ' bytes differ') + ' in ' + total + (total === 1 ? ' block' : ' blocks');
      if (r && bd) {
        const k = bd.blocks.findIndex(([s, e]) => r[0] >= s && r[0] <= e);
        if (k >= 0) text += ' \u00B7 block ' + (k + 1);
      }
      hxSummary.textContent = text;
      if (!r) hxSel.textContent = 'Click a byte to select it; shift-click or drag selects a range.';
      else {
        const n = r[1] - r[0] + 1;
        hxSel.textContent = n === 1
          ? hex4(r[0]) + ' (' + r[0] + ')' + (owners[r[0]] ? ' \u00B7 ' + labelOf.get(owners[r[0]]) : '')
          : hex4(r[0]) + '\u2013' + hex4(r[1]) + ' (' + n + ' bytes)';
      }
      hxToLeft.disabled = hxToRight.disabled = !r || !PE.compare.sameLayout(L, R);
      hxClear.disabled = !r;
    }

    function scrollToCell(i, block) {
      const el = cells.l[i] || cells.r[i];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: block || 'nearest' });
    }

    function jump(dir) {
      if (!bd || !bd.blocks.length) return;
      const r = range();
      let target;
      if (dir > 0) target = bd.blocks.find(([s]) => !r || s > r[1]) || bd.blocks[0];
      else {
        const before = bd.blocks.filter(([s]) => !r || s < r[0]);
        target = before.length ? before[before.length - 1] : bd.blocks[bd.blocks.length - 1];
      }
      sel = { a: target[0], b: target[1] };
      paint();
      scrollToCell(target[0], 'center');
    }

    function goTo(text) {
      const n = PE.bin.parseOffset(text);
      if (!Number.isFinite(n) || n < 0 || n >= bd.length) {
        hxSel.textContent = 'Offset must be between 0 and ' + (bd.length - 1) + ' (hex like 0x2E1, or decimal).';
        return;
      }
      sel = { a: n, b: n };
      if (!cells.l[n]) { hxOnly.checked = false; hxData.checked = false; renderHex(); }
      paint();
      scrollToCell(n, 'center');
    }

    function copySel(to) {
      const r = range();
      if (!r) return;
      const from = to === 'left' ? R : L;
      const target = to === 'left' ? L : R;
      if (PE.compare.copyBytes(from, target, r[0], r[1])) {
        view.history.push(to);
        view.redone = [];
      }
      render();
    }

    function revealRow(id) {
      let row = body.querySelector('[data-row="' + id + '"]');
      if (!row) { only.checked = false; filter.value = ''; render(); row = body.querySelector('[data-row="' + id + '"]'); }
      if (!row) return;
      if (row.scrollIntoView) row.scrollIntoView({ block: 'center' });
      row.classList.add('flash-row');
      setTimeout(() => row.classList.remove('flash-row'), 1600);
    }

    function tip(i) {
      const l = i < bd.la ? hex2(bd.a[i]) : 'none';
      const r = i < bd.lb ? hex2(bd.b[i]) : 'none';
      return hex4(i) + ' (' + i + ')' + (owners[i] ? ' \u00B7 ' + labelOf.get(owners[i]) : ' \u00B7 unknown byte') + ' \u00B7 left ' + l + ' \u00B7 right ' + r + (owners[i] ? ' \u00B7 double-click to go to the field' : '');
    }

    const byteOf = e => {
      const el = e.target.closest && e.target.closest('.b, .a[data-a]');
      return el ? { el, i: Number(el.dataset.i !== undefined ? el.dataset.i : el.dataset.a) } : null;
    };
    hxRows.addEventListener('mousedown', e => {
      const hit = byteOf(e);
      if (!hit || e.button !== 0) return;
      if (e.shiftKey && sel) sel.b = hit.i; else sel = { a: hit.i, b: hit.i };
      dragging = true;
      e.preventDefault();
      hxRows.focus({ preventScroll: true });
      paint();
    });
    hxRows.addEventListener('mouseover', e => {
      const hit = byteOf(e);
      if (!hit) return;
      if (!hit.el.title) hit.el.title = tip(hit.i);
      if (dragging && sel) { sel.b = hit.i; paint(); }
    });
    hxRows.addEventListener('dblclick', e => {
      const hit = byteOf(e);
      if (hit && owners[hit.i]) revealRow(owners[hit.i]);
    });
    hxRows.addEventListener('keydown', e => {
      if (!bd || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); jump(1); return; }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); jump(-1); return; }
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(bd.length - 1, (sel ? sel.b : 0) + step));
      if (e.shiftKey && sel) sel.b = next; else sel = { a: next, b: next };
      paint();
      scrollToCell(next);
    });
    const stopDrag = () => { dragging = false; };
    document.addEventListener('mouseup', stopDrag);
    hxOnly.addEventListener('change', renderHex);
    hxData.addEventListener('change', renderHex);

    const host = $('diff');
    host.textContent = '';
    host.append(bar, note, wrap, hxEl);

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
      renderHex();
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
    view.unsubs.push(L.subscribe(() => render()), R.subscribe(() => render()), () => document.removeEventListener('mouseup', stopDrag));
    view.render = render;

    document.body.classList.add('diff-mode');
    const syncTop = () => document.documentElement.style.setProperty('--topbar-h', document.querySelector('.topbar').offsetHeight + 'px');
    syncTop();
    root.addEventListener('resize', syncTop);
    view.unsubs.push(() => root.removeEventListener('resize', syncTop));
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
    document.documentElement.style.removeProperty('--topbar-h');
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
