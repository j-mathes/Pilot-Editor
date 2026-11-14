// Renders a game's sections (forms, tables, cards, hex view) from its definition.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  const { h } = PE.ui;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function actionBar(state, actions) {
    if (!actions || !actions.length) return null;
    return h('div', { class: 'actions' }, actions.map(a =>
      h('button', { type: 'button', class: 'btn small', title: a.title || a.label + ' (can be undone)', onclick: () => state.batch(api => a.run(api)) }, a.label)));
  }

  function blockHead(block, extra) {
    if (!block.title && !extra) return null;
    return h('div', { class: 'block-head' }, block.title && h('h3', null, block.title), extra);
  }

  function formBlock(state, widgets, block) {
    const grid = h('div', { class: 'form-grid' + (block.layout === 'list' ? ' list' : '') });
    for (const raw of block.items) {
      const item = typeof raw === 'string' ? { id: raw } : raw;
      if (item.derived) {
        const d = widgets.derived(item.derived);
        grid.append(h('div', { class: 'row' }, h('span', { class: 'row-label' }, item.label || d.label), d.el));
      } else {
        const f = widgets.index.get(item.id);
        const label = item.label || f.label;
        const w = widgets.field(item.id, label);
        grid.append(h('div', { class: 'row' }, h('span', { class: 'row-label' }, label), w.el));
      }
    }
    return h('div', { class: 'block' }, blockHead(block), actionBar(state, block.actions), block.boxed ? h('div', { class: 'box' }, grid) : grid);
  }

  function cellNodes(widgets, cell) {
    if (cell === null || cell === undefined) return [];
    if (Array.isArray(cell)) return cell.map(c => widgets.field(c).el);
    if (typeof cell === 'string') return [widgets.field(cell).el];
    if (cell.derived) return [widgets.derived(cell.derived).el];
    return [];
  }

  function tableBlock(state, widgets, block) {
    const headRow = () => h('tr', null, h('th', { scope: 'col' }, ''), block.columns.map(c => h('th', { scope: 'col' }, c)));
    const rows = block.rows.map(r => {
      const tr = h('tr', null, h('th', { scope: 'row' }, r.label));
      for (const cell of r.cells) tr.append(h('td', null, h('div', { class: 'cell' }, cellNodes(widgets, cell))));
      tr.dataset.label = r.label.toLowerCase();
      return tr;
    });
    const makeTable = body => h('table', { class: 'grid' }, h('thead', null, headRow()), body);
    const bodyA = h('tbody', null, rows);
    const table = makeTable(bodyA);
    if (block.footer) {
      const tr = h('tr', null);
      block.footer.forEach(item => {
        const d = widgets.derived(item.derived);
        tr.append(h('th', { scope: 'row', colspan: 1 }, d.label), h('td', null, d.el));
      });
      table.append(h('tfoot', null, tr));
    }
    let search = null;
    // With block.split the rows flow into two columns (top to bottom, then the next column) while many rows match.
    const bodyB = block.split ? h('tbody') : null;
    const wrapB = block.split ? h('div', { class: 'table-wrap' }, makeTable(bodyB)) : null;
    function layout() {
      const q = search ? search.value.trim().toLowerCase() : '';
      const visible = [];
      for (const tr of rows) {
        tr.hidden = !!q && !tr.dataset.label.includes(q);
        if (!tr.hidden) visible.push(tr);
      }
      if (!bodyB) return;
      const two = visible.length > (block.splitMin || 12);
      const half = two ? Math.ceil(visible.length / 2) : visible.length;
      visible.forEach((tr, i) => (i < half ? bodyA : bodyB).append(tr));
      for (const tr of rows) if (tr.hidden) bodyA.append(tr);
      wrapB.hidden = !two;
    }
    if (block.searchable) {
      search = h('input', { type: 'search', class: 'search', placeholder: 'Filter rows', title: 'Type to show only rows whose name contains this text', 'aria-label': 'Filter ' + (block.title || 'rows') });
      search.addEventListener('input', layout);
    }
    layout();
    const tables = block.split
      ? h('div', { class: 'table-split' }, h('div', { class: 'table-wrap' }, table), wrapB)
      : h('div', { class: 'table-wrap' }, table);
    return h('div', { class: 'block' },
      blockHead(block, search),
      actionBar(state, block.actions),
      tables);
  }

  function cardsBlock(state, widgets, block) {
    const cards = block.cards.map(card => {
      const badge = h('span', { class: 'badge', title: 'Status' });
      const bar = h('progress', { max: 1, value: 0, title: 'Progress' });
      const label = h('span', { class: 'progress-label', title: 'Progress' });
      const total = card.total ? h('span', { class: 'card-total', title: 'Total of the scores in this card' }) : null;
      const body = h('div', { class: 'card-body' });
      for (const b of card.blocks) body.append(renderBlock(state, widgets, b));
      const node = h('details', { class: 'card', id: 'card-' + card.id },
        h('summary', { title: 'Click to expand or collapse' }, h('span', { class: 'card-title' }, card.title), badge, bar, label, total), body);
      function update() {
        const b = card.badge(state.get);
        badge.textContent = b.text;
        badge.className = 'badge tone-' + b.tone;
        const p = card.progress(state.get);
        bar.max = p.total; bar.value = Math.min(p.value, p.total);
        label.textContent = p.value + ' / ' + p.total;
        if (total) total.textContent = 'Score ' + PE.ui.fmt(card.total(state.get));
      }
      update();
      widgets.onRefresh(update);
      return node;
    });
    return h('div', { class: 'cards' }, cards);
  }

  function hexBlock(state, widgets) {
    const def = state.def;
    const owners = PE.codec.owners(def, state.length);
    const fieldLabel = new Map(def.fields.map(f => [f.id, f.label]));
    const host = h('div', { class: 'hex', tabindex: 0, role: 'region', 'aria-label': 'Raw file bytes' });
    const summary = h('p', { class: 'hint' });
    const half = state.variant.half;
    let sel = null; // { a, b } selected byte offsets
    let marked = [];
    let cells = [];
    let chars = [];
    let bytes = null; // bytes as currently shown
    let dragging = false;

    const ascii = v => (v >= 32 && v <= 126 ? esc(String.fromCharCode(v)) : '.');
    const status = h('span', { class: 'hint', role: 'status' });
    const goInput = h('input', {
      type: 'text', class: 'hx-go', placeholder: 'Go to offset', 'aria-label': 'Go to offset', autocomplete: 'off',
      title: 'Type a byte offset in hex (0x2E1) or decimal (737) and press Enter',
      onkeydown: e => { if (e.key === 'Enter') go(goInput.value); }
    });

    const range = () => (sel ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)] : null);
    const onlyData = h('input', { type: 'checkbox', title: 'Show only the rows that contain a byte other than 00', onchange: () => render() });
    const onlyChanged = h('input', { type: 'checkbox', title: 'Show only the rows that contain a byte changed since the file was opened', onchange: () => render() });
    let shown = 0;
    const hex4 = n => '0x' + PE.bin.hex(n, 4);

    function paint() {
      for (const el of marked) el.classList.remove('s');
      marked = [];
      const r = range();
      if (!r) { status.textContent = 'Click a byte to select it; shift-click or drag selects a range.'; return; }
      for (let i = r[0]; i <= r[1]; i++) {
        for (const el of [cells[i], chars[i]]) if (el) { el.classList.add('s'); marked.push(el); }
      }
      const n = r[1] - r[0] + 1;
      status.textContent = n === 1
        ? hex4(r[0]) + ' (' + r[0] + ')' + (owners[r[0]] ? ' \u00B7 ' + fieldLabel.get(owners[r[0]]) : ' \u00B7 unknown byte') + (bytes ? ' \u00B7 value ' + PE.bin.hex(bytes[r[0]]) + ' (' + bytes[r[0]] + ')' : '')
        : hex4(r[0]) + '\u2013' + hex4(r[1]) + ' (' + n + ' bytes)';
    }

    function scrollTo(i, block) {
      if (cells[i] && cells[i].scrollIntoView) cells[i].scrollIntoView({ block: block || 'nearest' });
    }

    function go(text) {
      const n = PE.bin.parseOffset(text);
      if (!Number.isFinite(n) || n < 0 || n >= state.length) {
        status.textContent = 'Offset must be between 0 and ' + (state.length - 1) + ' (hex like 0x2E1, or decimal).';
        return;
      }
      sel = { a: n, b: n };
      if (!cells[n]) { onlyData.checked = false; onlyChanged.checked = false; render(); }
      paint();
      scrollTo(n, 'center');
    }

    // The column labels sit above the scrolling bytes, not inside them, so nothing can show through behind them.
    const head = h('div', { class: 'hex-head' }, h('span', null, 'Offset'));
    const labelRow = (cls, items) => { const el = h('span', { class: cls }); el.innerHTML = items.map(t => '<span>' + t + '</span>').join(''); return el; };
    head.append(labelRow('hex-pane', Array.from({ length: 16 }, (_, i) => PE.bin.hex(i))), labelRow('hex-ascii', Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase())));

    function rowsHtml(now, src, from, to) {
      let html = '';
      let skipped = false;
      for (let start = from; start < to; start += 16) {
        const end = Math.min(start + 16, to);
        let hasData = false;
        let hasChange = false;
        for (let i = start; i < end; i++) {
          if (now[i] !== 0) hasData = true;
          if (now[i] !== src[i]) hasChange = true;
        }
        if ((onlyData.checked && !hasData) || (onlyChanged.checked && !hasChange)) {
          if (!skipped) html += '<div class="hex-gap">\u22EF</div>';
          skipped = true;
          continue;
        }
        skipped = false;
        shown++;
        let cells = '';
        let chars = '';
        for (let i = start; i < end; i++) {
          const changed = now[i] !== src[i];
          const cls = (owners[i] ? 'k' : 'u') + (changed ? ' c' : '');
          const addr = '0x' + PE.bin.hex(i, 4) + ' (' + i + ')';
          const title = ' title="' + addr + (owners[i] ? ' · ' + esc(fieldLabel.get(owners[i])) : '') + '"';
          cells += '<span class="' + cls + '" data-i="' + i + '"' + title + '>' + PE.bin.hex(now[i]) + '</span>';
          chars += '<span data-a="' + i + '"' + (changed ? ' class="c"' : '') + '>' + ascii(now[i]) + '</span>';
        }
        for (let i = end; i < start + 16; i++) {
          cells += '<span class="pad"></span>';
          chars += '<span></span>';
        }
        html += '<div class="hex-row"><span class="hex-off">' + PE.bin.hex(start, 4) + '</span><span class="hex-pane">' + cells + '</span><span class="hex-ascii">' + chars + '</span></div>';
      }
      return html;
    }

    function render() {
      const now = state.toBytes();
      const src = state.sourceBytes();
      bytes = now;
      let changed = 0;
      for (let i = 0; i < now.length; i++) if (now[i] !== src[i]) changed++;
      let html = '';
      shown = 0;
      if (half && now.length === half * 2) {
        html += '<div class="hex-sep">Active pilot</div>' + rowsHtml(now, src, 0, half);
        html += '<div class="hex-sep">Backup copy</div>' + rowsHtml(now, src, half, now.length);
      } else {
        html += rowsHtml(now, src, 0, now.length);
      }
      host.innerHTML = html;
      if (!shown) host.insertAdjacentHTML('beforeend', '<div class="hex-gap">No rows match the filter.</div>');
      cells = [];
      chars = [];
      for (const el of host.querySelectorAll('.hex-pane > span[data-i]')) cells[Number(el.dataset.i)] = el;
      for (const el of host.querySelectorAll('.hex-ascii > span[data-a]')) chars[Number(el.dataset.a)] = el;
      marked = [];
      if (sel && (sel.a >= now.length || sel.b >= now.length)) sel = null;
      paint();
      summary.textContent = changed + ' byte(s) differ from the opened file. Bright bytes belong to an editable field (double-click one to jump to it); dim bytes are unknown and preserved as they are.';
    }

    host.addEventListener('dblclick', e => {
      const cell = e.target.closest && e.target.closest('span[data-i], span[data-a]');
      const id = cell && owners[Number(cell.dataset.i !== undefined ? cell.dataset.i : cell.dataset.a)];
      if (!id) return;
      if (root.getSelection) root.getSelection().removeAllRanges();
      widgets.reveal(id);
    });

    const byteOf = e => {
      const el = e.target.closest && e.target.closest('.hex-pane > span[data-i], .hex-ascii > span[data-a]');
      return el ? Number(el.dataset.i !== undefined ? el.dataset.i : el.dataset.a) : null;
    };
    host.addEventListener('mousedown', e => {
      const i = byteOf(e);
      if (i === null || e.button !== 0) return;
      if (e.shiftKey && sel) sel.b = i; else sel = { a: i, b: i };
      dragging = true;
      e.preventDefault();
      host.focus({ preventScroll: true });
      paint();
    });
    host.addEventListener('mouseover', e => {
      const i = byteOf(e);
      if (i !== null && dragging && sel) { sel.b = i; paint(); }
    });
    host.addEventListener('mouseup', () => { dragging = false; });
    host.addEventListener('mouseleave', () => { dragging = false; });
    host.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { sel = null; paint(); return; }
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(state.length - 1, (sel ? sel.b : 0) + step));
      if (e.shiftKey && sel) sel.b = next; else sel = { a: next, b: next };
      paint();
      scrollTo(next);
    });

    let queued = false;
    state.subscribe(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; render(); });
    });
    render();
    return h('div', { class: 'block' }, summary, h('div', { class: 'hex-bar' }, goInput,
      h('label', { class: 'opt', title: 'Show only the rows that contain a byte other than 00' }, onlyData, ' Rows with data only'),
      h('label', { class: 'opt', title: 'Show only the rows that contain a byte changed since the file was opened' }, onlyChanged, ' Rows with changes only'),
      status), h('div', { class: 'hex-box' }, head, host));
  }

  function renderBlock(state, widgets, block) {
    switch (block.type) {
      case 'form': return formBlock(state, widgets, block);
      case 'table': return tableBlock(state, widgets, block);
      case 'cards': return cardsBlock(state, widgets, block);
      case 'hex': return hexBlock(state, widgets);
      default: throw new Error('Unknown block type ' + block.type);
    }
  }

  function buildSections(state, widgets) {
    return state.def.sections.map(s => ({
      id: s.id,
      title: s.title,
      el: h('section', { class: 'section', id: 'sec-' + s.id, 'aria-labelledby': 'sec-h-' + s.id },
        h('h2', { id: 'sec-h-' + s.id }, s.title),
        s.layout === 'columns' ? h('div', { class: 'cols' }, s.blocks.map(b => renderBlock(state, widgets, b))) : s.blocks.map(b => renderBlock(state, widgets, b)))
    }));
  }

  PE.ui.buildSections = buildSections;
})(globalThis);
