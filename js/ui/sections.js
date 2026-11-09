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

  function hexBlock(state) {
    const def = state.def;
    const owners = PE.codec.owners(def, state.length);
    const fieldLabel = new Map(def.fields.map(f => [f.id, f.label]));
    const host = h('div', { class: 'hex', tabindex: 0, role: 'region', 'aria-label': 'Raw file bytes' });
    const summary = h('p', { class: 'hint' });
    const half = state.variant.half;

    function rowsHtml(now, src, from, to) {
      let html = '';
      for (let start = from; start < to; start += 16) {
        const end = Math.min(start + 16, to);
        let cells = '';
        for (let i = start; i < end; i++) {
          const cls = (owners[i] ? 'k' : 'u') + (now[i] !== src[i] ? ' c' : '');
          const title = owners[i] ? ' title="' + esc(fieldLabel.get(owners[i])) + '"' : '';
          cells += '<span class="' + cls + '"' + title + '>' + PE.bin.hex(now[i]) + '</span>';
        }
        html += '<div class="hex-row"><span class="hex-off">' + PE.bin.hex(start, 4) + '</span>' + cells + '</div>';
      }
      return html;
    }

    function render() {
      const now = state.toBytes();
      const src = state.sourceBytes();
      let changed = 0;
      for (let i = 0; i < now.length; i++) if (now[i] !== src[i]) changed++;
      let html = '';
      if (half && now.length === half * 2) {
        html += '<div class="hex-sep">Active pilot</div>' + rowsHtml(now, src, 0, half);
        html += '<div class="hex-sep">Backup copy</div>' + rowsHtml(now, src, half, now.length);
      } else {
        html += rowsHtml(now, src, 0, now.length);
      }
      host.innerHTML = html;
      summary.textContent = changed + ' byte(s) differ from the opened file. Bright bytes belong to an editable field; dim bytes are unknown and preserved as they are.';
    }

    let queued = false;
    state.subscribe(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; render(); });
    });
    render();
    return h('div', { class: 'block' }, summary, host);
  }

  function renderBlock(state, widgets, block) {
    switch (block.type) {
      case 'form': return formBlock(state, widgets, block);
      case 'table': return tableBlock(state, widgets, block);
      case 'cards': return cardsBlock(state, widgets, block);
      case 'hex': return hexBlock(state);
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
