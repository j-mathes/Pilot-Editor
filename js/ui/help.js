// Help dialog: the byte ranges no field maps to are computed from the game tables.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  const { h } = PE.ui;

  // Consecutive offsets with no owning field, as [start, end] pairs (inclusive).
  function unknownRanges(def, length, limit) {
    const owners = PE.codec.owners(def, length);
    const out = [];
    for (let i = 0; i < limit; i++) {
      if (owners[i]) continue;
      const last = out[out.length - 1];
      if (last && last[1] === i - 1) last[1] = i; else out.push([i, i]);
    }
    return out;
  }

  function describeRanges(ranges) {
    return ranges.map(([a, b]) => a === b ? String(a) : a + '-' + b).join(', ');
  }

  function total(ranges) {
    return ranges.reduce((n, [a, b]) => n + b - a + 1, 0);
  }

  function fill(listId, def, length, limit) {
    const list = document.getElementById(listId);
    if (!list || !def) return;
    const ranges = unknownRanges(def, length, limit);
    list.textContent = '';
    list.append(h('li', null, total(ranges) + ' of ' + limit + ' bytes are not mapped to a field: ' + describeRanges(ranges) + '.'));
  }

  function fillRegions() {
    fill('helpRegionsXwing', PE.games.xwing, 1705, 1705);
    fill('helpRegionsTie', PE.games.tie, 3856, 1928);
  }

  function open() {
    fillRegions();
    const dlg = document.getElementById('helpDialog');
    if (dlg.showModal && !dlg.open) dlg.showModal();
  }

  PE.ui.help = { unknownRanges, describeRanges, fillRegions, open };
})(globalThis);
