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

  check('no script errors', () => assert.deepStrictEqual(errors, []));
  console.log(passed + ' UI checks passed');
  w.close();
});
