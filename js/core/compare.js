// Compare two pilots of the same game field by field, and copy fields from one to the other.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};

  const cache = new WeakMap();

  function cellIds(cell, out) {
    if (cell === null || cell === undefined) return;
    if (typeof cell === 'string') out.push(cell);
    else if (Array.isArray(cell)) for (const c of cell) cellIds(c, out);
    else if (cell.id) out.push(cell.id);
  }

  function blockIds(block) {
    const out = [];
    if (block.type === 'form') for (const item of block.items) cellIds(typeof item === 'string' ? item : (item.derived ? null : item), out);
    else if (block.type === 'table') for (const row of block.rows) for (const cell of row.cells) cellIds(cell, out);
    return out;
  }

  // Fields grouped the way the sections show them: [{ title, ids }], every field exactly once.
  function groups(def) {
    if (cache.has(def)) return cache.get(def);
    const known = new Set(def.fields.map(f => f.id));
    const seen = new Set();
    const out = [];
    function add(title, ids) {
      const fresh = ids.filter(id => known.has(id) && !seen.has(id));
      if (!fresh.length) return;
      fresh.forEach(id => seen.add(id));
      const last = out[out.length - 1];
      if (last && last.title === title) last.ids.push(...fresh); else out.push({ title, ids: fresh });
    }
    for (const section of def.sections) {
      for (const block of section.blocks) {
        if (block.type === 'cards') {
          for (const card of block.cards) for (const inner of card.blocks) add(section.title + ' \u203A ' + card.title, blockIds(inner));
        } else {
          const sub = block.title && section.blocks.length > 1 ? ' \u203A ' + block.title : '';
          add(section.title + sub, blockIds(block));
        }
      }
    }
    add('Other', def.fields.map(f => f.id));
    cache.set(def, out);
    return out;
  }

  // Every field with both values, in section order.
  function rows(left, right) {
    const index = PE.codec.index(left.def);
    const out = [];
    for (const g of groups(left.def)) {
      for (const id of g.ids) {
        const a = left.get(id);
        const b = right.get(id);
        out.push({ id, field: index.get(id), group: g.title, left: a, right: b, same: a === b });
      }
    }
    return out;
  }

  function differences(left, right) {
    return rows(left, right).filter(r => !r.same);
  }

  // Fields that only make sense together are copied together.
  function withPartners(def, ids) {
    const set = new Set(ids);
    if (def.copyWith) for (const id of ids) for (const extra of def.copyWith(id)) set.add(extra);
    return Array.from(set);
  }

  // Copies the given fields as they are (no game rules applied) in one undoable step. Returns true if anything changed.
  function copy(from, to, ids) {
    const values = {};
    for (const id of withPartners(from.def, ids)) values[id] = from.get(id);
    return to.assign(values);
  }

  PE.compare = { groups, rows, differences, copy };
})(globalThis);
