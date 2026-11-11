// DOM helpers and field widgets bound to a pilot state.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  PE.ui = PE.ui || {};

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === false || v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function fmt(n) {
    return typeof n === 'number' ? n.toLocaleString('en-US') : String(n);
  }

  function createWidgets(state) {
    const codec = PE.codec;
    const index = codec.index(state.def);
    const fieldWidgets = new Map(); // id -> [widget]
    const globals = [];

    function add(id, widget) {
      if (!fieldWidgets.has(id)) fieldWidgets.set(id, []);
      fieldWidgets.get(id).push(widget);
      return widget;
    }

    function metaUpdater(f, wrap, chip) {
      return function () {
        wrap.classList.toggle('modified', state.isChanged(f.id));
        const ws = state.warningsFor(f.id);
        const worst = ws.find(w => w.level === 'warn') || ws[0];
        chip.hidden = !worst;
        chip.className = 'chip' + (worst ? ' ' + worst.level : '');
        chip.textContent = worst ? '!' : '';
        chip.title = worst ? ws.map(w => w.text).join('\n') : '';
        if (worst) chip.setAttribute('aria-label', chip.title); else chip.removeAttribute('aria-label');
      };
    }

    function numberWidget(f, label) {
      const { min, max } = codec.limits(f);
      const range = min + ' to ' + max + (f.softMax !== undefined ? ' (usual limit ' + f.softMax + ')' : '');
      const input = h('input', {
        type: 'number', class: 'num', step: 1, min, max, 'aria-label': label || f.label,
        title: f.hint ? f.hint + ' Range: ' + range + '.' : 'Range: ' + range
      });
      const chip = h('span', { class: 'chip', hidden: true });
      const vl = f.valueLabels ? h('span', { class: 'value-label' }) : null;
      const wrap = h('span', { class: 'field' }, input, chip, vl);
      input.addEventListener('focus', () => input.select());
      input.addEventListener('change', () => {
        const raw = input.value.trim();
        if (raw !== '') state.set(f.id, Number(raw));
        update();
      });
      function update() {
        input.value = String(state.get(f.id));
        if (vl) vl.textContent = f.valueLabels[state.get(f.id)] || '';
      }
      const meta = metaUpdater(f, wrap, chip);
      update(); meta();
      return add(f.id, { el: wrap, update, meta, input });
    }

    function enumWidget(f, label) {
      const select = h('select', { 'aria-label': label || f.label, title: f.hint || label || f.label });
      const chip = h('span', { class: 'chip', hidden: true });
      const wrap = h('span', { class: 'field' }, select, chip);
      select.addEventListener('change', () => { state.set(f.id, Number(select.value)); update(); });
      function update() {
        const v = state.get(f.id);
        select.textContent = '';
        const known = f.options.some(o => o.value === v);
        if (!known) select.append(h('option', { value: v, selected: true }, 'Unknown (' + v + ')'));
        for (const o of f.options) select.append(h('option', { value: o.value, selected: o.value === v }, o.label));
        select.value = String(v);
      }
      const meta = metaUpdater(f, wrap, chip);
      update(); meta();
      return add(f.id, { el: wrap, update, meta });
    }

    function boolWidget(f, label) {
      const box = h('input', { type: 'checkbox', 'aria-label': label || f.label, title: f.hint || label || f.label });
      const wrap = h('span', { class: 'field check' }, box);
      box.addEventListener('change', () => { state.set(f.id, box.checked); update(); });
      function update() { box.checked = !!state.get(f.id); }
      const chip = h('span', { class: 'chip', hidden: true });
      wrap.append(chip);
      const meta = metaUpdater(f, wrap, chip);
      update(); meta();
      return add(f.id, { el: wrap, update, meta });
    }

    function flagsWidget(f) {
      const boxes = f.bits.map((bitLabel, i) => {
        const box = h('input', { type: 'checkbox', 'aria-label': f.label + ': ' + bitLabel });
        box.addEventListener('change', () => {
          const cur = state.get(f.id);
          state.set(f.id, box.checked ? (cur | (1 << i)) : (cur & ~(1 << i)));
          update();
        });
        return box;
      });
      const wrap = h('span', { class: 'field flags', title: f.hint },
        boxes.map((b, i) => {
          const unused = f.used !== undefined && i >= f.used;
          const title = unused ? f.bits[i] + ' (no goal seen for this slot in the original Top Ace pilots)' : f.bits[i];
          return h('label', { title, class: unused ? 'unused' : null }, b, h('span', null, String(i + 1)));
        }));
      const chip = h('span', { class: 'chip', hidden: true });
      wrap.append(chip);
      function update() {
        const v = state.get(f.id);
        boxes.forEach((b, i) => { b.checked = !!(v & (1 << i)); });
      }
      const meta = metaUpdater(f, wrap, chip);
      update(); meta();
      return add(f.id, { el: wrap, update, meta });
    }

    function field(id, label) {
      const f = index.get(id);
      if (!f) throw new Error('Unknown field ' + id);
      if (f.kind === 'bool') return boolWidget(f, label);
      if (f.kind === 'enum') return enumWidget(f, label);
      if (f.kind === 'flags') return flagsWidget(f);
      return numberWidget(f, label);
    }

    function derived(did) {
      const d = state.def.derived[did];
      const out = h('output', { class: 'derived', title: d.hint || d.label + ' (calculated, read-only)' });
      const wrap = h('span', { class: 'field derived-field' }, out);
      let button = null;
      if (d.sync) {
        button = h('button', { type: 'button', class: 'btn small', title: d.sync.label }, 'Sync');
        button.addEventListener('click', () => state.set(d.sync.id, d.sync.value(state.get)));
        wrap.append(button);
      }
      function update() {
        const v = state.derived(d);
        out.textContent = fmt(v);
        if (button) button.hidden = state.get(d.sync.id) === d.sync.value(state.get);
      }
      update();
      globals.push(update);
      return { el: wrap, label: d.label };
    }

    function refresh(ids) {
      const all = !ids || !ids.length;
      if (all) {
        for (const list of fieldWidgets.values()) for (const w of list) w.update();
      } else {
        for (const id of ids) {
          const list = fieldWidgets.get(id);
          if (list) for (const w of list) w.update();
        }
      }
      for (const list of fieldWidgets.values()) for (const w of list) w.meta();
      for (const g of globals) g();
    }

    // Opens any collapsed card and cleared filter around a field, scrolls to it and focuses it.
    function reveal(id) {
      const list = fieldWidgets.get(id);
      if (!list) return false;
      const el = list[0].el;
      for (let n = el.parentElement; n; n = n.parentElement) if (n.tagName === 'DETAILS') n.open = true;
      const row = el.closest('tr');
      if (row && row.hidden) {
        const search = row.closest('.block').querySelector('input.search');
        if (search) { search.value = ''; search.dispatchEvent(new Event('input')); }
      }
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      const control = el.querySelector('input, select');
      if (control) control.focus({ preventScroll: true });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1600);
      return true;
    }

    return { field, derived, refresh, reveal, onRefresh: fn => globals.push(fn), index };
  }

  PE.ui.h = h;
  PE.ui.fmt = fmt;
  PE.ui.createWidgets = createWidgets;
})(globalThis);
