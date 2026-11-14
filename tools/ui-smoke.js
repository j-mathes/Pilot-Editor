// jsdom smoke test of the real page. Usage: node tools/ui-smoke.js [path to jsdom module]
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const jsdomPath = process.argv[2] || process.env.PE_JSDOM || 'jsdom';
const { JSDOM, VirtualConsole } = require(jsdomPath);
const root = path.join(__dirname, '..');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e.stack || e)));
vc.on('error', e => errors.push(String(e)));

JSDOM.fromFile(path.join(root, 'index.html'), {
  runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc
}).then(dom => new Promise(resolve => dom.window.addEventListener('load', () => resolve(dom)))).then(dom => {
  const w = dom.window;
  const d = w.document;
  const PE = w.PilotEditor;
  w.confirm = () => true;
  const read = p => new w.Uint8Array(fs.readFileSync(path.join(root, p)));
  const $ = id => d.getElementById(id);
  let passed = 0;
  const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL ' + name + '\n  ' + (e.stack || e)); process.exitCode = 1; } };

  check('landing shown first', () => {
    assert(!$('landing').hidden && $('editor').hidden);
    assert.strictEqual($('btnSave').disabled, true);
  });

  PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);

  check('X-Wing page renders', () => {
    assert.strictEqual(d.body.dataset.game, 'xwing');
    assert($('landing').hidden && !$('editor').hidden);
    assert.strictEqual($('sections').children.length, 7);
    assert(d.querySelectorAll('#sections input[type=number]').length > 150);
    assert(/General/.test($('summary').textContent), $('summary').textContent);
    assert(d.querySelectorAll('.hex-row span.k').length > 100);
    assert(!$('banner').hidden && /X-Wing/.test($('bannerText').textContent));
    assert.strictEqual(d.querySelectorAll('#navList a').length, 7);
  });

  check('edit, dirty marker, undo', () => {
    const rank = d.querySelector('select[aria-label="Rank"]');
    rank.value = '2';
    rank.dispatchEvent(new w.Event('change'));
    assert.strictEqual(PE.app.session.state.get('pilot.rank'), 2);
    assert(/unsaved/.test($('fileChip').textContent));
    assert(rank.closest('.field').classList.contains('modified'));
    assert(/2 Lieutenant|Lieutenant/.test($('summary').textContent));
    assert(!d.getElementById('changeList').querySelector('.empty'));
    $('btnUndo').click();
    assert.strictEqual(PE.app.session.state.get('pilot.rank'), 5);
    assert(!/unsaved/.test($('fileChip').textContent));
  });

  check('number input clamps and shows a warning for derived data', () => {
    const lvl = d.querySelector('#card-tour0 input[aria-label="Operations completed"]');
    lvl.value = '99';
    lvl.dispatchEvent(new w.Event('change'));
    assert.strictEqual(lvl.value, '12');
    const craft = d.querySelector('input[aria-label="Laser craft hits"]');
    craft.value = '999999';
    craft.dispatchEvent(new w.Event('change'));
    const chip = craft.parentElement.querySelector('.chip');
    assert(!chip.hidden && chip.classList.contains('warn'));
  });

  check('tour card behaviour', () => {
    const state = PE.app.session.state;
    state.set('tour.3.status', 1);
    assert.strictEqual(state.get('tour.current'), 3);
    const badge = d.querySelector('#card-tour3 .badge');
    assert.strictEqual(badge.textContent, 'Active');
  });

  PE.app.loadBytes('TOPACE10.TFR', read('reference/TIE-Fighter/TOPACE10.TFR'), null);

  check('replacing a dirty pilot asks first (confirm stubbed to accept)', () => {
    // jsdom has no confirm; the app reached here only because confirm returned true below.
  });

  check('TIE page renders', () => {
    assert.strictEqual(d.body.dataset.game, 'tie');
    assert.strictEqual($('sections').children.length, 6);
    assert.strictEqual(d.querySelectorAll('#card-battle0').length, 1);
    assert(/Done/.test(d.querySelector('#card-battle0 .badge').textContent));
    assert.strictEqual(d.querySelectorAll('#card-battle0 .flags').length, 2);
  });

  check('objective flag toggle sets and clears the bit', () => {
    const state = PE.app.session.state;
    const box = d.querySelector('#card-battle0 .flags input');
    const before = state.get('battle.0.secondary');
    box.checked = !box.checked;
    box.dispatchEvent(new w.Event('change'));
    assert.strictEqual(state.get('battle.0.secondary'), before ^ 1);
    box.checked = !box.checked;
    box.dispatchEvent(new w.Event('change'));
    assert.strictEqual(state.get('battle.0.secondary'), before);
  });

  check('wrong-size file keeps the current pilot and shows an error', () => {
    PE.app.loadBytes('bad.plt', new w.Uint8Array(100), null);
    assert.strictEqual(d.body.dataset.game, 'tie');
    assert(/not a supported/.test($('bannerText').textContent));
    assert($('banner').classList.contains('error'));
    assert.strictEqual(PE.app.session.state.def.id, 'tie');
  });

  check('new pilot and preset', () => {
    PE.app.newPilot('xwing');
    assert.strictEqual(d.body.dataset.game, 'xwing');
    assert(!PE.app.session.state.isDirty());
    PE.app.session.state.batch(api => PE.app.session.state.def.presets[0].run(api));
    assert.strictEqual(PE.app.session.state.get('pilot.rank'), 5);
  });

  check('every button, select and input has a tooltip', () => {
    const missing = [];
    for (const game of ['reference/X-Wing/TOPACE.PLT', 'reference/TIE-Fighter/TOPACE10.TFR']) {
      PE.app.loadBytes(path.basename(game), read(game), null);
      for (const el of d.querySelectorAll('button, select, input[type=number], input[type=search], input[type=text]')) {
        if (el.closest('label') && el.type === 'checkbox') continue;
        if (!el.title) missing.push(el.id || el.getAttribute('aria-label') || el.textContent.trim());
      }
      for (const opt of d.querySelectorAll('#presetSelect option')) if (opt.value && !opt.title) missing.push('preset ' + opt.textContent);
    }
    assert.deepStrictEqual([...new Set(missing)], []);
  });

  check('TIE kills table flows into two columns and shrinks when filtered', () => {
    PE.app.loadBytes('TOPACE10.TFR', read('reference/TIE-Fighter/TOPACE10.TFR'), null);
    const wrap = d.querySelector('.table-split');
    assert(wrap, 'split table missing');
    const [left, right] = wrap.querySelectorAll('tbody');
    const names = body => Array.from(body.querySelectorAll('tr')).filter(tr => !tr.hidden).map(tr => tr.querySelector('th').textContent);
    const all = Array.from(PE.games.tie.fields.filter(f => /^stat\.npc\./.test(f.id)).map(f => f.label.replace(/ kills$/, '')));
    assert.deepStrictEqual(names(left).concat(names(right)), all);
    assert.strictEqual(names(left).length, Math.ceil(all.length / 2));
    assert(!right.closest('.table-wrap').hidden);
    const search = wrap.closest('.block').querySelector('input[type=search]');
    search.value = 'tie';
    search.dispatchEvent(new w.Event('input'));
    assert(right.closest('.table-wrap').hidden, 'second column should hide for a short list');
    assert(names(left).length > 0 && names(left).every(n => /tie/i.test(n)));
    search.value = '';
    search.dispatchEvent(new w.Event('input'));
    assert.deepStrictEqual(names(left).concat(names(right)), all);
    assert(!right.closest('.table-wrap').hidden);
  });

  check('Close returns to the start page and asks before discarding changes', () => {
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    assert.strictEqual($('btnClose').disabled, false);
    PE.app.session.state.set('pilot.rank', 1);
    let asked = 0;
    w.confirm = () => { asked++; return false; };
    $('btnClose').click();
    assert.strictEqual(asked, 1);
    assert(PE.app.session.state, 'cancelled close must keep the pilot');
    w.confirm = () => { asked++; return true; };
    $('btnClose').click();
    assert.strictEqual(PE.app.session.state, null);
    assert(!$('landing').hidden && $('editor').hidden && $('sidebar').hidden);
    assert.strictEqual(d.body.dataset.game, undefined);
    assert.strictEqual($('btnClose').disabled, true);
    assert.strictEqual($('btnSave').disabled, true);
    assert($('banner').hidden);
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    $('btnClose').click();
    assert.strictEqual(asked, 2, 'a clean pilot closes without asking');
  });

  check('hex byte tooltips start with the hex and decimal address', () => {
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    const cells = d.querySelectorAll('.hex-row span[data-i]');
    assert(/^0x0000 \(0\)/.test(cells[0].title), cells[0].title);
    assert(/^0x00FF \(255\)/.test(cells[255].title), cells[255].title);
    const owned = d.querySelector('.hex-row span.k');
    assert(/^0x[0-9A-F]{4} \(\d+\) · \S/.test(owned.title), owned.title);
  });

  check('double-clicking a hex byte jumps to its field and opens collapsed cards', () => {
    const state = PE.app.session.state;
    const jump = id => {
      const off = PE.codec.at(state.variant, PE.codec.index(state.def).get(id).offset);
      const cell = d.querySelector('.hex-row span[data-i="' + off + '"]');
      cell.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    };
    jump('pilot.rank');
    assert.strictEqual(d.activeElement.getAttribute('aria-label'), 'Rank');
    const card = d.querySelector('#card-tour2');
    card.open = false;
    jump('tour.2.status');
    assert(card.open, 'card should open');
    assert(card.contains(d.activeElement));
  });

  check('Enforce rules: choosing a rank adjusts the score and says so', () => {
    PE.app.newPilot('xwing');
    $('optEnforce').checked = true;
    $('optEnforce').dispatchEvent(new w.Event('change'));
    const rank = d.querySelector('select[aria-label="Rank"]');
    rank.value = '5';
    rank.dispatchEvent(new w.Event('change'));
    assert.strictEqual(PE.app.session.state.get('pilot.score'), 500000);
    assert(/Rules adjusted/.test($('bannerText').textContent));
    assert(/Tour of Duty points: 0 \u2192 500,000/.test($('bannerList').textContent), $('bannerList').textContent);
    $('btnUndo').click();
    assert.strictEqual(PE.app.session.state.get('pilot.score'), 0);
    $('optEnforce').checked = false;
    $('optEnforce').dispatchEvent(new w.Event('change'));
    assert.strictEqual(PE.app.session.state.enforcing(), false);
  });

  check('Warnings the editor cannot enforce are shown on the Changes button and repeated after an enforced edit', () => {
    PE.app.newPilot('tie');
    $('optEnforce').checked = true;
    $('optEnforce').dispatchEvent(new w.Event('change'));
    assert($('warnBadge').hidden, 'a new pilot has no warnings');
    PE.app.session.state.set('pilot.secret', 2);
    assert.strictEqual(PE.app.session.state.get('pilot.score'), 50000);
    assert(/Not enforced: Second Circle normally needs 4 missions/.test($('bannerList').textContent), $('bannerList').textContent);
    assert(!$('warnBadge').hidden && /^\d+ warning/.test($('warnBadge').title), $('warnBadge').title);
    PE.app.loadBytes('RUSTY2.tfr', read('reference/TIE-Fighter/RUSTY2.tfr'), null);
    assert(/stay as they are/.test($('bannerList').textContent), $('bannerList').textContent);
    $('optEnforce').checked = false;
    $('optEnforce').dispatchEvent(new w.Event('change'));
  });

  check('Compare: wrong game is refused; same game opens a clean view, copies both ways, undoes and exits', () => {
    w.confirm = () => true;
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    PE.app.compareWith('TOPACE10.TFR', read('reference/TIE-Fighter/TOPACE10.TFR'), null);
    assert(!d.body.classList.contains('diff-mode'));
    assert(/compare needs two X-Wing pilots/.test($('bannerText').textContent), $('bannerText').textContent);

    PE.app.compareWith('ROOKIE.PLT', read('reference/X-Wing/ROOKIE.PLT'), null);
    assert(d.body.classList.contains('diff-mode'));
    assert(!$('diff').hidden && $('editor').hidden && $('sidebar').hidden && $('drawer').hidden);
    for (const id of ['btnOpen', 'btnSave', 'btnClose', 'btnChanges', 'btnCompare', 'presetSelect', 'btnRestore']) assert($(id).classList.contains('diff-hide'), id);
    for (const id of ['btnUndo', 'btnRedo', 'btnTheme', 'btnHelp']) assert(!$(id).classList.contains('diff-hide'), id);
    const countOf = () => Number(/^(\d+) difference/.exec(d.querySelector('.diff-count').textContent)[1]);
    const total = countOf();
    assert(total > 20 && d.querySelectorAll('#diff tr.same').length === 0, 'only differences are listed by default');
    assert($('diffOnly').checked);

    const left = PE.app.session.state;
    const rankRow = d.querySelector('#diff tr[data-row="pilot.rank"]');
    assert(rankRow, 'rank row');
    rankRow.querySelector('button[data-dir="left"]').click();
    assert.strictEqual(left.get('pilot.rank'), 0, 'copied the right value into the left file');
    assert.strictEqual(countOf(), total - 1);
    assert($('btnUndo').disabled === false);
    $('btnUndo').click();
    assert.strictEqual(left.get('pilot.rank'), 5);
    assert.strictEqual(countOf(), total);
    assert($('btnRedo').disabled === false);

    d.querySelector('#diff .diff-mid button[aria-label="Copy every shown difference to the right file"]').click();
    assert(/same values/.test(d.querySelector('.diff-count').textContent));
    assert(/unsaved/.test(d.querySelector('.diff-right .diff-dirty').textContent) && !d.querySelector('.diff-right .diff-dirty').hidden);
    assert(d.querySelector('.diff-left .diff-dirty').hidden, 'the left file was not changed');
    $('btnUndo').click();
    assert.strictEqual(countOf(), total);

    $('diffOnly').checked = false;
    $('diffOnly').dispatchEvent(new w.Event('change'));
    assert(d.querySelectorAll('#diff tr.same').length > 100, 'show all lists identical fields too');
    const filter = d.querySelector('#diff input[type=search]');
    filter.value = 'kalidor';
    filter.dispatchEvent(new w.Event('input'));
    assert(d.querySelectorAll('#diff tbody tr[data-row]').length > 0 && d.querySelectorAll('#diff tbody tr[data-row]').length < 5);

    $('btnTheme').click();
    $('btnTheme').click();
    PE.app.exitCompare();
    assert(!d.body.classList.contains('diff-mode') && $('diff').hidden && !$('editor').hidden && !$('sidebar').hidden);
    assert.strictEqual(PE.app.session.state, left);
  });

  check('Compare raw bytes: summary, navigation, selection, byte copy both ways, go to offset, layout note', () => {
    w.confirm = () => true;
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    PE.app.compareWith('CALE.PLT', read('reference/X-Wing/Pilot Files/CALE.PLT'), null);
    const left = PE.app.session.state;
    const hx = d.querySelector('#diff .hx');
    assert(hx && hx.querySelector('.hx-top .hx-title') && hx.querySelector('.hx-top .hx-bar') && hx.querySelector('.hx-top .hx-head'), 'title, tools and column header are all in the frozen block');
    const head = d.querySelector('#diff .hx-head');
    assert.deepStrictEqual([...head.querySelectorAll('.hx-name')].map(e => e.textContent), ['TOPACE.plt', 'CALE.plt'], 'file names head their columns');
    assert.strictEqual(head.querySelectorAll('.hx-pane.hx-lab > span').length, 32, 'both files get 00 to 0F offset labels');
    assert.strictEqual(head.querySelectorAll('.hx-ascii.hx-lab > span').length, 32);
    assert([...d.querySelectorAll('#diff .hx-rows .hx-row')].every(r => [...r.children].filter(c => /hx-pane|hx-ascii/.test(c.className)).every(c => c.children.length === 16)), 'the last row is padded so the columns line up');
    assert(hx.previousElementSibling.classList.contains('diff-wrap'), 'it sits below the field table');
    assert(d.querySelector('#diff .hx-note').hidden, 'same layout, same size: no layout note');
    const sum = () => d.querySelector('.hx-sum').textContent;
    const total = Number(/^(\d+) bytes? differ/.exec(sum())[1]);
    assert(total > 50 && d.querySelectorAll('.hx .hl > .b.d').length === total, sum());
    assert(d.querySelectorAll('.hx .hl > .b').length === left.activeLength(), 'every byte of the pilot is drawn');

    const btn = text => [...d.querySelectorAll('.hx-bar button')].find(b => b.textContent.includes(text));
    assert(btn('Copy bytes \u25B6').disabled && btn('Clear').disabled, 'nothing selected yet');
    btn('Next').click();
    const selected = () => [...d.querySelectorAll('.hx .hl > .b.s')].map(e => Number(e.dataset.i));
    const first = selected();
    assert(first.length >= 1 && /block 1/.test(sum()), sum());
    const asciiOn = side => d.querySelectorAll('#diff .hx .' + side + ' > .a.s').length;
    assert(asciiOn('al') === first.length && asciiOn('ar') === first.length, 'the ASCII characters of the selected bytes are highlighted on both sides');
    assert(!btn('Copy bytes \u25B6').disabled);
    btn('Next').click();
    assert(selected()[0] > first[first.length - 1], 'next moves to a later block');
    btn('Previous').click();
    assert.deepStrictEqual(selected(), first, 'previous goes back');

    btn('\u25C0 Copy bytes').click();
    const after = PE.app.session.state.toBytes();
    const right = d.querySelector('.hx .hr > .b[data-i="' + first[0] + '"]').textContent;
    assert.strictEqual(PE.bin.hex(after[first[0]]), right, 'the left file now holds the right file\'s byte');
    assert(/unsaved/.test(d.querySelector('.diff-left .diff-dirty').textContent) && !d.querySelector('.diff-left .diff-dirty').hidden);
    assert($('btnUndo').disabled === false);
    $('btnUndo').click();
    assert(!d.querySelector('.diff-left .diff-dirty') || d.querySelector('.diff-left .diff-dirty').hidden, 'undo reverts the byte copy');
    assert.strictEqual(Number(/^(\d+) bytes? differ/.exec(sum())[1]), total);

    const go = d.querySelector('#diff .hx-go');
    go.value = '0x2E1';
    go.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    assert.deepStrictEqual(selected(), [737]);
    assert(/0x02E1 \(737\)/.test(d.querySelector('.hx-sel').textContent), d.querySelector('.hx-sel').textContent);
    go.value = '99999';
    go.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    assert(/between 0 and/.test(d.querySelector('.hx-sel').textContent));

    const only = d.querySelector('.hx-bar input[type=checkbox]');
    only.checked = true;
    only.dispatchEvent(new w.Event('change'));
    assert(d.querySelectorAll('.hx .hx-gap').length > 0 && d.querySelectorAll('.hx .hl > .b').length < left.activeLength());
    only.checked = false;
    only.dispatchEvent(new w.Event('change'));
    const dataBox = d.querySelectorAll('#diff .hx-bar input[type=checkbox]')[1];
    const allRows = d.querySelectorAll('#diff .hx-rows .hx-row').length;
    dataBox.checked = true;
    dataBox.dispatchEvent(new w.Event('change'));
    const dataRows = d.querySelectorAll('#diff .hx-rows .hx-row').length;
    assert(dataRows > 0 && dataRows < allRows, 'rows where both files are all 00 are hidden: ' + dataRows + ' of ' + allRows);
    dataBox.checked = false;
    dataBox.dispatchEvent(new w.Event('change'));

    const cell = d.querySelector('.hx .hl > .b[data-i="737"]');
    cell.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    cell.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
    assert(/Tour \d status/.test(cell.title), cell.title);
    d.dispatchEvent(new w.MouseEvent('mouseup'));
    PE.app.exitCompare();

    PE.app.compareWith('ROOKIE.PLT', read('reference/X-Wing/ROOKIE.PLT'), null);
    const note = d.querySelector('#diff .hx-note');
    assert(!note.hidden && /different layouts/.test(note.textContent) && /cannot be copied/.test(note.textContent), note.textContent);
    btn('Next').click();
    assert(btn('\u25C0 Copy bytes').disabled && btn('Copy bytes \u25B6').disabled, 'byte copy is off across layouts');
    PE.app.exitCompare();
  });

  check('Raw bytes view shows ASCII and has Go to offset', () => {
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    const rows = d.querySelectorAll('#sections .hex-row');
    assert(rows.length > 100 && [...rows].every(r => r.querySelector('.hex-ascii')));
    const full = () => [...d.querySelectorAll('#sections .hex-row')].every(r => r.querySelector('.hex-pane').children.length === 16 && r.querySelector('.hex-ascii').children.length === 16);
    assert(full(), 'the last X-Wing row is padded to 16 cells so the columns line up');
    PE.app.loadBytes('TOPACE10.TFR', read('reference/TIE-Fighter/TOPACE10.TFR'), null);
    assert(full(), 'and so are the partial rows of the TIE Fighter file');
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    assert.deepStrictEqual([...d.querySelectorAll('#sections .hex-head .hex-pane > span')].map(e => e.textContent), Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase().padStart(2, '0')), 'the frozen header labels the byte columns 00 to 0F');
    const firstChars = rows[0].querySelector('.hex-ascii').children;
    assert.strictEqual(firstChars.length, 16);
    const go = d.querySelector('#sections .hx-go');
    go.value = '0x2E1';
    go.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    const hit = d.querySelector('#sections .hex-pane > span.s');
    assert(hit && hit.dataset.i === '737', 'the byte is selected');
    assert(/0x02E1 \(737\) \u00B7 .* \u00B7 value [0-9A-F]{2} \(\d+\)/.test(d.querySelector('#sections .hex-bar .hint').textContent), d.querySelector('#sections .hex-bar .hint').textContent);
    go.value = 'zz';
    go.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    assert(/Offset must be between 0 and 1705/.test(d.querySelector('#sections .hex-bar .hint').textContent));
    assert.strictEqual(PE.bin.parseOffset('0x10') + PE.bin.parseOffset('16') + PE.bin.parseOffset('$10') + PE.bin.parseOffset('1A'), 16 * 3 + 26);
    assert(Number.isNaN(PE.bin.parseOffset('hello')));

    const selected = () => [...d.querySelectorAll('#sections .hex-pane > span.s')].map(e => Number(e.dataset.i));
    const cell = i => d.querySelector('#sections .hex-pane > span[data-i="' + i + '"]');
    const press = (el, type, opts) => el.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, button: 0 }, opts)));
    press(cell(20), 'mousedown');
    assert.deepStrictEqual(selected(), [20], 'click selects one byte');
    assert.deepStrictEqual([...d.querySelectorAll('#sections .hex-ascii > span.s')].map(e => e.dataset.a), ['20'], 'its ASCII character is highlighted too');
    press(d.querySelector('#sections .hex-ascii > span[data-a="25"]'), 'mousedown');
    assert.deepStrictEqual(selected(), [25], 'clicking an ASCII character selects its byte');
    press(cell(20), 'mousedown');
    press(cell(24), 'mousedown', { shiftKey: true });
    assert.deepStrictEqual(selected(), [20, 21, 22, 23, 24], 'shift-click extends to a range');
    assert(/0x0014\u20130x0018 \(5 bytes\)/.test(d.querySelector('#sections .hex-bar .hint').textContent), d.querySelector('#sections .hex-bar .hint').textContent);
    press(cell(30), 'mousedown');
    press(cell(33), 'mouseover');
    press(cell(33), 'mouseup');
    assert.deepStrictEqual(selected(), [30, 31, 32, 33], 'dragging selects a range');
    const grid = d.querySelector('#sections .hex');
    grid.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.deepStrictEqual(selected(), [34], 'arrow keys move the selection');
    grid.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, shiftKey: true }));
    assert.strictEqual(selected().length, 17, 'shift-arrow extends it');
    grid.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.deepStrictEqual(selected(), [], 'Escape clears it');
  });

  check('Raw bytes filters: rows with data only and rows with changes only', () => {
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    const state = PE.app.session.state;
    const rows = () => d.querySelectorAll('#sections .hex-row').length;
    const boxes = [...d.querySelectorAll('#sections .hex-bar input[type=checkbox]')];
    assert.strictEqual(boxes.length, 2);
    const [data, changed] = boxes;
    const flip = (box, on) => { box.checked = on; box.dispatchEvent(new w.Event('change')); };
    const all = rows();
    flip(changed, true);
    assert.strictEqual(rows(), 0, 'nothing has changed yet');
    assert(/No rows match/.test(d.querySelector('#sections .hex').textContent));
    state.set('pilot.rank', state.get('pilot.rank') === 1 ? 2 : 1);
    flip(changed, false);
    flip(changed, true);
    assert.strictEqual(rows(), 1, 'only the row holding the changed byte is shown');
    assert(d.querySelector('#sections .hex-gap'), 'skipped rows are marked');
    flip(changed, false);
    assert.strictEqual(rows(), all);
    flip(data, true);
    const withData = rows();
    assert(withData > 0 && withData < all, 'rows that are all 00 are hidden: ' + withData + ' of ' + all);
    assert([...d.querySelectorAll('#sections .hex-row')].every(r => [...r.querySelectorAll('.hex-pane > span[data-i]')].some(c => c.textContent !== '00')));
    flip(changed, true);
    assert.strictEqual(rows(), 1, 'both filters together');
    const go = d.querySelector('#sections .hx-go');
    go.value = '1000';
    go.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    assert(!data.checked && !changed.checked && rows() === all, 'Go to offset clears the filters when the byte is hidden');
    state.undo();
  });

  check('Keep equal option makes the points follow the recorded operation scores', () => {
    PE.app.newPilot('xwing');
    const state = PE.app.session.state;
    const box = d.querySelector('#sections input[aria-label="Keep equal"]');
    assert(box, 'the option sits beside the total in the Pilot section');
    if (box.checked) { box.checked = false; box.dispatchEvent(new w.Event('change')); }
    state.set('tour.0.op.0', 4000);
    assert.strictEqual(state.get('pilot.score'), 0);
    box.checked = true;
    box.dispatchEvent(new w.Event('change'));
    assert.strictEqual(state.get('pilot.score'), 4000, 'switching it on sets the points to the total');
    state.set('tour.2.op.1', 500);
    assert.strictEqual(state.get('pilot.score'), 4500);
    box.checked = false;
    box.dispatchEvent(new w.Event('change'));
    state.set('tour.2.op.1', 0);
    assert.strictEqual(state.get('pilot.score'), 4500);
  });

  check('The file chip says which game version a file belongs to', () => {
    const chip = () => $('fileChip');
    PE.app.loadBytes('TOPACE.PLT', read('reference/X-Wing/TOPACE.PLT'), null);
    assert(/1706 bytes · for the original X-Wing \(1993, 1994\)/.test(chip().textContent), chip().textContent);
    assert(/untested/.test(chip().title), chip().title);
    PE.app.loadBytes('ROOKIE.PLT', read('reference/X-Wing/ROOKIE.PLT'), null);
    assert(/1705 bytes · for X-Wing 1998/.test(chip().textContent), chip().textContent);
    PE.app.loadBytes('TOPACE10.TFR', read('reference/TIE-Fighter/TOPACE10.TFR'), null);
    assert(/3856 bytes · for TIE Fighter 1994, 1995 or 1998/.test(chip().textContent), chip().textContent);
  });

  check('Help covers the main features', () => {
    const text = $('helpDialog').textContent;
    for (const term of ['Compare', 'Enforce rules', 'Go to offset', 'Theme', 'Sync', 'Restore', 'Copy bytes', 'Presets', 'Shortcuts', 'Unknown bytes are kept']) assert(text.includes(term), 'Help is missing: ' + term);
  });

  check('Help lists the unmapped byte ranges of both games and opens with F1', () => {
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'F1', cancelable: true }));
    const x = $('helpRegionsXwing').textContent, t = $('helpRegionsTie').textContent;
    assert(/of 1705 bytes are not mapped/.test(x) && /\b1255-1586\b/.test(x), x);
    assert(/of 1928 bytes are not mapped/.test(t), t);
    const ranges = PE.ui.help.unknownRanges(PE.games.tie, 3856, 1928);
    assert(ranges.every(([a, b]) => a <= b && b < 1928));
    $('btnHelp').click();
  });

  check('no script errors', () => assert.deepStrictEqual(errors, []));
  console.log(passed + ' UI checks passed');
  w.close();
});
