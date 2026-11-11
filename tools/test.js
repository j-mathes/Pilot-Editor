// Node test runner: loads the browser scripts into a vm context and checks them against the sample files.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
for (const f of ['js/core/binary.js', 'js/core/codec.js', 'js/core/state.js', 'js/core/rules.js', 'js/core/compare.js', 'js/core/files.js', 'js/games/xwing.js', 'js/games/tie.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const PE = vm.runInContext('PilotEditor', ctx);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL ' + name + '\n  ' + (e.stack || e)); process.exitCode = 1; }
}

const samples = [];
const walk = (dir, re) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name), re) : (re.test(e.name) ? [{ name: e.name, file: path.join(root, dir, e.name) }] : []));
for (const [dir, re] of [['reference/X-Wing', /\.(plt|bak)$/i], ['reference/TIE-Fighter', /\.tfr$/i]]) {
  for (const s of walk(dir, re)) samples.push({ name: s.name, bytes: new Uint8Array(fs.readFileSync(s.file)) });
}

// ---- Table sanity ----
for (const def of Object.values(PE.games)) {
  test(def.id + ': field ids unique and ranges do not overlap', () => {
    PE.codec.index(def);
    const sizes = { u8: 1, u16: 2, u32: 4, i32: 4 };
    const seen = new Map();
    for (const f of def.fields) {
      for (const o of [f.offset].concat(f.mirrors || [])) {
        for (let i = 0; i < sizes[f.type]; i++) {
          assert(!seen.has(o + i), f.id + ' overlaps ' + seen.get(o + i) + ' at ' + (o + i));
          seen.set(o + i, f.id);
        }
      }
    }
  });

  test(def.id + ': every field fits every variant', () => {
    for (const len of Object.keys(def.variants)) {
      const owners = PE.codec.owners(def, Number(len));
      assert.strictEqual(owners.length, Number(len));
      const variant = def.variants[len];
      const active = variant.half || Number(len);
      for (const f of def.fields) {
        const start = PE.codec.at(variant, f.offset);
        assert(start + PE.bin.TYPES[f.type].size <= active, f.id + ' outside the active half in ' + len);
      }
    }
  });

  test(def.id + ': section references resolve', () => {
    const ids = new Set(def.fields.map(f => f.id));
    const check = item => {
      if (typeof item === 'string') assert(ids.has(item), 'missing field ' + item);
      else if (Array.isArray(item)) item.forEach(check);
      else if (item && item.derived) assert(def.derived[item.derived], 'missing derived ' + item.derived);
      else if (item && item.id) assert(ids.has(item.id), 'missing field ' + item.id);
    };
    const walk = block => {
      if (block.items) block.items.forEach(check);
      if (block.footer) block.footer.forEach(check);
      if (block.rows) block.rows.forEach(r => r.cells.forEach(check));
      if (block.cards) block.cards.forEach(c => c.blocks.forEach(walk));
    };
    def.sections.forEach(s => s.blocks.forEach(walk));
  });

  test(def.id + ': blank template parses and round-trips', () => {
    const b = def.blank();
    const values = PE.codec.parse(def, b);
    assert.deepStrictEqual(Array.from(PE.codec.serialize(def, values, b)), Array.from(b));
  });
}

// ---- Round trip on every sample ----
for (const s of samples) {
  test('round trip ' + s.name, () => {
    const { def } = PE.files.detect(s.name, s.bytes.length);
    const values = PE.codec.parse(def, s.bytes);
    const out = PE.codec.serialize(def, values, s.bytes);
    assert.strictEqual(Buffer.compare(Buffer.from(out), Buffer.from(s.bytes)), 0);
  });
}

const sample = n => samples.find(s => s.name === n);
const load = n => {
  const s = sample(n);
  const { def } = PE.files.detect(s.name, s.bytes.length);
  return PE.createState(def, PE.files.baseName(s.name), s.bytes);
};

// ---- Known values from the sample files ----
test('TOPACE.PLT (1706-byte layout)', () => {
  const st = load('TOPACE.PLT');
  assert.strictEqual(st.get('pilot.rank'), 5);
  assert.strictEqual(st.get('pilot.score'), 9999);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map(t => st.get('tour.' + t + '.status')), [3, 3, 3, 0, 0]);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map(t => st.get('tour.' + t + '.ops')), [12, 12, 14, 0, 0]);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map(t => st.get('tour.' + t + '.last')), [11, 11, 13, 255, 255]);
  assert.strictEqual(st.get('stat.laserFired'), 13426);
  assert.strictEqual(st.get('stat.lost'), 12);
});

test('TOPACE.PLT: Tour 4 has scores but is Inactive, and the editor says so', () => {
  const st = load('TOPACE.PLT');
  assert.strictEqual(st.get('tour.3.status'), 0);
  assert.strictEqual(st.get('tour.current'), 3);
  assert.strictEqual(st.get('tour.3.op.14'), 0x08a2);
  const w = st.warningsFor('tour.3.status');
  assert(w.length === 1 && /15 operations and is the current tour/.test(w[0].text), JSON.stringify(w));
});

test('X-Wing rank, medal and Kalidor rules use the offsets document', () => {
  const top = load('TOPACE.PLT');
  const w = top.warningsFor('pilot.rank');
  assert(w.length === 1 && /General normally needs 500,000/.test(w[0].text), JSON.stringify(w));
  assert.strictEqual(top.warningsFor('medal.corellian').length, 0);
  assert.strictEqual(top.derived(top.def.derived['medal.kalidorEarned']), 'Silver Scimitar');
  assert.strictEqual(load('RUSTY.PLT').warningsFor('pilot.rank').length, 0);
  const ip = load('IPTOPACE.PLT');
  assert(ip.warningsFor('medal.mantooine').some(x => /Tour 2/.test(x.text)));
  assert.strictEqual(ip.warningsFor('medal.yavin').length, 0);
  const rookie = load('ROOKIE.PLT');
  rookie.set('pilot.score', 120000);
  assert(rookie.warningsFor('pilot.rank').some(x => /rank of Captain/.test(x.text)));
});

test('TIE: mission names cover every score slot, rank warnings and Top Ace presets', () => {
  const tie = PE.games.tie;
  assert(tie.fields.every(f => !/undefined/.test(f.label)), 'a label has no mission name');
  assert(tie.fields.some(f => f.label === 'Battle 13 mission 8 (The Trap is Sprung) score'));
  assert.strictEqual(load('RUSTY.tfr').warningsFor('pilot.rank').length, 0);
  assert.strictEqual(load('TOPACE10.TFR').warningsFor('pilot.rank').length, 0);
  const t = load('RUSTY2.tfr');
  t.set('pilot.rank', 5);
  assert(t.warningsFor('pilot.rank').some(x => /General normally needs a score of 500,000/.test(x.text)));
  t.set('pilot.rank', 0);
  t.set('pilot.score', 60000);
  assert(t.warningsFor('pilot.rank').some(x => /rank of Lieutenant/.test(x.text)));
  const ref = load('TOPACE10.TFR');
  const mine = load('RUSTY2.tfr');
  mine.batch(api => tie.presets[0].run(api));
  for (let b = 0; b < 10; b++) {
    assert.strictEqual(mine.get('battle.' + b + '.secondary'), ref.get('battle.' + b + '.secondary'), 'secondary ' + b);
    assert.strictEqual(mine.get('battle.' + b + '.bonus'), ref.get('battle.' + b + '.bonus'), 'bonus ' + b);
  }
  const ref7 = load('TOPACE7.TFR');
  const mine7 = load('RUSTY2.tfr');
  mine7.batch(api => tie.presets[1].run(api));
  for (let b = 0; b < 7; b++) assert.strictEqual(mine7.get('battle.' + b + '.secondary'), ref7.get('battle.' + b + '.secondary'));
  assert.strictEqual(mine7.get('pilot.secret'), ref7.get('pilot.secret'));
});

test('X-Wing guide names: ranks, tour operations, historical missions', () => {
  const xw = PE.games.xwing;
  const label = id => xw.fields.find(f => f.id === id).label;
  assert.strictEqual(label('tour.0.op.2'), 'Tour 1 operation 3: Fly Point During Evacuation score');
  assert.strictEqual(label('tour.2.op.13'), 'Tour 3 operation 14: Death Star Trench Run score');
  assert.strictEqual(label('tour.3.op.0'), 'Tour 4 operation 1: Evacuate Yavin score');
  assert.strictEqual(label('tour.3.op.14'), 'Tour 4 operation 12B: Corvette Alley score');
  assert.strictEqual(label('tour.4.op.23'), 'Tour 5 operation 20B: Escape to Hoth! score');
  assert.strictEqual(label('hist.0.0.score'), "X-Wing mission 1 (Dev's Sidestep) score");
  assert.strictEqual(label('hist.3.0.score'), 'B-Wing mission 1 (Project Shantipole) score');
  assert.strictEqual(label('hist.4.5.score'), 'Bonus mission 6 (Protect Your Mothership) score');
  const r = load('ROOKIE.PLT');
  assert.strictEqual(r.def.fields.find(f => f.id === 'pilot.rank').options[0].label, 'Flight Cadet');
  r.set('pilot.score', 25000);
  assert(r.warningsFor('pilot.rank').some(x => /rank of Flight Officer/.test(x.text)));
});

test('NOKSP.PLT: a real save with Tours 4 and 5 played', () => {
  const st = load('NOKSP.PLT');
  assert.strictEqual(st.get('tour.3.status'), 3);
  assert.strictEqual(st.get('tour.3.ops'), 20);
  assert.strictEqual(st.get('tour.3.last'), 23);
  assert.strictEqual(st.warningsFor('tour.3.last').length, 0);
  // Exactly one version of each Tour 4 choice pair (slots 5/6, 8/9, 13/14, 18/19) holds a score.
  for (const [a, b] of [[5, 6], [8, 9], [13, 14], [18, 19]]) {
    assert.strictEqual((st.get('tour.3.op.' + a) > 0) + (st.get('tour.3.op.' + b) > 0), 1, 'pair ' + a + '/' + b);
  }
  assert(st.warningsFor('tour.4.ops').some(w => /above the usual limit of 20/.test(w.text)));
  // Operations are counted once per pair, and the marker follows the version that was flown.
  st.set('tour.3.ops', 6);
  assert.strictEqual(st.get('tour.3.last'), 5);
  st.set('tour.3.ops', 8);
  assert.strictEqual(st.get('tour.3.last'), 9);
  st.set('tour.3.ops', 15);
  assert.strictEqual(st.get('tour.3.last'), 17);
  st.set('tour.3.ops', 0);
  assert.strictEqual(st.get('tour.3.last'), 255);
  assert(load('RUSTY1.PLT').warningsFor('tour.4.last').length === 1);
});

test('X-Wing: a new pilot has no training levels completed', () => {
  const st = PE.createState(PE.games.xwing, 'NEW', PE.games.xwing.blank());
  for (let i = 0; i < 4; i++) assert.strictEqual(st.get('training.' + i + '.level'), 0);
  assert(!st.isDirty());
});

test('TIE: the blank pilot equals a pilot created in the game, and one training run changes only the score', () => {
  const tie = PE.games.tie;
  const fresh = load('RUSTY-1.TFR');
  const blank = PE.createState(tie, 'NEW', tie.blank());
  for (const f of tie.fields) assert.strictEqual(blank.get(f.id), fresh.get(f.id), f.id);
  const trained = load('RUSTY-2.TFR');
  const changed = tie.fields.filter(f => trained.get(f.id) !== fresh.get(f.id)).map(f => f.id);
  assert.deepStrictEqual(Array.from(changed), ['training.0.score']);
  assert.strictEqual(trained.get('training.0.score'), 2430);
});

test('TIE: finishing training levels 3 and 4 changes the next level, the completed level and the score', () => {
  const tie = PE.games.tie;
  const fresh = load('RUSTY-1.TFR');
  const done = load('RUSTY-3.TFR');
  const changed = tie.fields.filter(f => done.get(f.id) !== fresh.get(f.id)).map(f => f.id + '=' + done.get(f.id));
  assert.deepStrictEqual(Array.from(changed).sort(), ['training.0.done=4', 'training.0.next=2', 'training.0.score=5650']);
});

test('TIE: the 1998 version creates the same new pilot as 1994', () => {
  const luke = samples.find(s => s.name === 'LUKE-1.tfr').bytes;
  const blank = PE.games.tie.blank();
  assert.strictEqual(Buffer.compare(Buffer.from(luke.subarray(1928)), Buffer.from(blank.subarray(1928))), 0, 'backup half is the pilot as created');
  const diffs = [];
  for (let i = 0; i < 1928; i++) if (luke[i] !== blank[i]) diffs.push(i);
  assert.deepStrictEqual(Array.from(diffs), [29], 'only the first craft next-level byte was touched');
});

test('TIE: LUKE-2 training (started at level 3, finished level 7, score 29530)', () => {
  const a = samples.find(s => s.name === 'LUKE-1.tfr').bytes, b = samples.find(s => s.name === 'LUKE-2.tfr').bytes;
  const diffs = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i);
  assert.deepStrictEqual(Array.from(diffs), [42, 43, 90]);
  assert.strictEqual(b[90], 7);
  assert.strictEqual(b[29], 2);
  assert.strictEqual(b[42] | (b[43] << 8), 29530);
});

test('Enforce rules: off by default, and rank and score move together when on', () => {
  const st = PE.createState(PE.games.xwing, 'NEW', PE.games.xwing.blank());
  st.set('pilot.rank', 5);
  assert.strictEqual(st.get('pilot.score'), 0, 'nothing is adjusted while rules are off');
  st.undo();
  st.setEnforce(true);
  const seen = [];
  st.onAdjust = list => seen.push(...list.map(c => c.id + ':' + c.from + '>' + c.to));
  st.set('pilot.rank', 5);
  assert.strictEqual(st.get('pilot.score'), 500000);
  assert.deepStrictEqual(Array.from(seen), ['pilot.score:0>500000']);
  st.undo();
  assert.strictEqual(st.get('pilot.rank') + ':' + st.get('pilot.score'), '0:0', 'one undo reverts the edit and the adjustment');
  st.set('pilot.score', 260000);
  assert.strictEqual(st.get('pilot.rank'), 4, 'score earns the rank');
  st.set('pilot.rank', 3);
  assert.strictEqual(st.get('pilot.score'), 249999, 'a lower rank caps the score');
  st.set('pilot.rank', 5);
  st.set('pilot.score', 0);
  assert.strictEqual(st.get('pilot.rank'), 2, 'X-Wing keeps Lieutenant, which training can earn');
  const tie = PE.createState(PE.games.tie, 'NEW', PE.games.tie.blank());
  tie.setEnforce(true);
  tie.set('pilot.rank', 2);
  assert.strictEqual(tie.get('pilot.score'), 50000);
  tie.set('pilot.score', 0);
  assert.strictEqual(tie.get('pilot.rank'), 0);
});

test('Enforce rules: tours, medals, weapons, battles and kill totals', () => {
  const x = PE.createState(PE.games.xwing, 'NEW', PE.games.xwing.blank());
  x.setEnforce(true);
  x.set('tour.2.status', 3);
  assert.strictEqual(x.get('medal.alderaan'), true);
  assert.strictEqual(x.get('tour.2.ops'), 14);
  x.set('medal.alderaan', false);
  assert.strictEqual(x.get('tour.2.status'), 2);
  x.set('medal.hoth', true);
  assert.strictEqual(x.get('tour.4.status'), 3, 'a medal completes its tour');
  assert.strictEqual(x.get('tour.4.ops'), 20);
  x.set('stat.laserCraft', 50);
  assert.strictEqual(x.get('stat.laserFired'), 50);
  x.set('stat.laserFired', 20);
  assert.strictEqual(x.get('stat.laserCraft'), 20);
  const t = PE.createState(PE.games.tie, 'NEW', PE.games.tie.blank());
  t.setEnforce(true);
  t.set('battle.0.status', 3);
  assert.strictEqual(t.get('battle.0.last'), 8);
  t.set('stat.npc.0', 7);
  t.set('stat.npc.3', 5);
  assert.strictEqual(t.get('stat.kills'), 12);
  t.set('stat.warheadHit', 9);
  assert.strictEqual(t.get('stat.warheadFired'), 9);
});

test('Enforce rules: presets and resets end consistent and leave no warnings about rank', () => {
  for (const [def, preset] of [[PE.games.xwing, 0], [PE.games.tie, 0], [PE.games.tie, 1]]) {
    const st = PE.createState(def, 'NEW', def.blank());
    st.setEnforce(true);
    st.batch(api => def.presets[preset].run(api));
    assert.strictEqual(st.get('pilot.rank'), 5);
    assert(st.get('pilot.score') >= 500000, def.id + ' score ' + st.get('pilot.score'));
    assert.deepStrictEqual(Array.from(st.warnings().filter(w => w.id === 'pilot.rank')), []);
  }
});

test('Enforce rules: Secret Order level follows the score, and pilots made in the game have no Secret Order warnings', () => {
  for (const name of ['RUSTY.tfr', 'RUSTY (2).tfr', 'RUSTY3.tfr', 'RUSTY2.tfr', 'TOPACE7.TFR', 'TOPACE10.TFR']) {
    const s = samples.find(x => x.name === name);
    const st = PE.createState(PE.games.tie, name, s.bytes);
    assert.deepStrictEqual(Array.from(st.warnings().filter(w => w.id === 'pilot.secret')), [], name);
  }
  const t = PE.createState(PE.games.tie, 'NEW', PE.games.tie.blank());
  t.setEnforce(true);
  t.set('pilot.secret', 6);
  assert.strictEqual(t.get('pilot.score'), 800000);
  assert.strictEqual(t.get('pilot.rank'), 5, 'the score also earns the rank');
  t.set('pilot.score', 60000);
  assert.strictEqual(t.get('pilot.secret'), 2);
  t.set('pilot.secret', 9);
  assert.strictEqual(t.get('pilot.score'), 60000, 'values beyond the guide have no rule');
  const open = PE.createState(PE.games.tie, 'NEW', PE.games.tie.blank());
  open.set('pilot.secret', 4);
  assert(open.warnings().some(w => w.id === 'pilot.secret'), 'a warning without enforcement');
});

test('Enforce rules: Kalidor Crescent follows the operation scores; game-made pilots have no medal warnings', () => {
  for (const name of ['CALE.PLT', 'NOKSP.PLT', 'TOPACE.PLT']) {
    const s = samples.find(x => x.name === name);
    const st = PE.createState(PE.games.xwing, name, s.bytes);
    assert.deepStrictEqual(Array.from(st.warnings().filter(w => /^medal\./.test(w.id || ''))), [], name);
  }
  const x = PE.createState(PE.games.xwing, 'NEW', PE.games.xwing.blank());
  x.set('tour.0.op.0', 10000);
  assert.strictEqual(x.get('medal.kalidor'), 0, 'nothing is adjusted while rules are off');
  assert(x.warnings().some(w => w.id === 'medal.kalidor'));
  x.setEnforce(true);
  x.set('tour.0.op.1', 10000);
  assert.strictEqual(x.get('medal.kalidor'), 1);
  x.set('tour.0.op.0', 12000);
  assert.strictEqual(x.get('medal.kalidor'), 2);
  x.set('tour.0.op.0', 0);
  assert.strictEqual(x.get('medal.kalidor'), 2, 'cleared scores do not take the medal away');
});

test('Compare: every field is in exactly one group, for both games', () => {
  for (const def of [PE.games.xwing, PE.games.tie]) {
    const ids = PE.compare.groups(def).flatMap(g => g.ids);
    assert.strictEqual(ids.length, def.fields.length, def.id);
    assert.strictEqual(new Set(ids).size, ids.length, def.id + ' has duplicates');
    const other = PE.compare.groups(def).find(g => g.title === 'Other');
    assert(!other, def.id + ' fields missing from the sections: ' + (other && other.ids.slice(0, 5)));
  }
});

test('Compare: copying fields moves values exactly, in one undo step, without game rules', () => {
  const get = n => samples.find(s => s.name === n).bytes;
  const a = PE.createState(PE.games.xwing, 'A', get('TOPACE.PLT'));
  const b = PE.createState(PE.games.xwing, 'B', get('ROOKIE.PLT'));
  const diffs = PE.compare.differences(a, b);
  assert(diffs.length > 20, 'the two pilots differ');
  assert.strictEqual(PE.compare.differences(a, a).length, 0);
  b.setEnforce(true);
  assert(PE.compare.copy(a, b, diffs.map(r => r.id)));
  assert.strictEqual(PE.compare.differences(a, b).length, 0, 'every difference copied');
  assert.strictEqual(b.warnings().length, a.warnings().length);
  b.undo();
  assert.strictEqual(PE.compare.differences(a, b).length, diffs.length, 'one undo reverts the whole copy');
  assert.strictEqual(a.canUndo(), false, 'the source is untouched');
  assert.strictEqual(PE.compare.copy(a, a, ['pilot.rank']), false, 'copying equal values changes nothing');

  const c = PE.createState(PE.games.xwing, 'C', get('ROOKIE.PLT'));
  c.set('tour.2.status', 1);
  assert.strictEqual(c.get('tour.current'), 2);
  const d = PE.createState(PE.games.xwing, 'D', get('ROOKIE.PLT'));
  const currentBefore = d.get('tour.current');
  PE.compare.copy(c, d, ['tour.2.status']);
  assert.strictEqual(d.get('tour.2.status'), 1);
  assert.strictEqual(d.get('tour.current'), currentBefore, 'no sync side effects');
  d.undo();
  const e = PE.createState(PE.games.xwing, 'E', get('ROOKIE.PLT'));
  e.set('tour.0.ops', 5);
  PE.compare.copy(e, d, ['tour.0.ops']);
  assert.strictEqual(d.get('tour.0.last'), e.get('tour.0.last'), 'ops and last slot travel together');
});

test('Compare: raw byte diff and byte copies update fields, keep unknown bytes, and undo in one step', () => {
  const get = n => samples.find(s => s.name === n).bytes;
  const a = PE.createState(PE.games.xwing, 'A', get('TOPACE.PLT'));
  const b = PE.createState(PE.games.xwing, 'B', get('CALE.PLT'));
  assert.strictEqual(a.length, b.length, 'same layout');
  const diff = PE.compare.byteDiff(a, b);
  assert(diff.count > 50 && diff.blocks.length > 5);
  assert.strictEqual(diff.blocks.reduce((n, [s, e]) => n + e - s + 1, 0), diff.count);
  assert(PE.compare.sameLayout(a, b));
  const owners = PE.codec.owners(PE.games.xwing, a.length);
  const mapped = diff.blocks.find(([s]) => owners[s]);
  const loose = diff.blocks.find(([s, e]) => { for (let i = s; i <= e; i++) if (!owners[i]) return true; return false; });
  assert(mapped && loose);
  for (const [s, e] of diff.blocks) assert(PE.compare.copyBytes(a, b, s, e) || true);
  assert.strictEqual(PE.compare.byteDiff(a, b).count, 0, 'copying every block makes the bytes equal');
  assert.strictEqual(PE.compare.differences(a, b).length, 0, 'and the fields too');
  assert(b.changes().some(c => /^raw:/.test(c.id)), 'unmapped byte edits are listed as changes');
  b.revertAll();
  assert.strictEqual(PE.compare.byteDiff(a, b).count, diff.count, 'revert all puts the original bytes back');
  const c = PE.createState(PE.games.xwing, 'C', get('CALE.PLT'));
  PE.compare.copyBytes(a, c, mapped[0], mapped[1]);
  c.undo();
  assert.strictEqual(PE.compare.byteDiff(a, c).count, diff.count, 'one undo reverts a byte copy');
  const saved = c.toBytes({ mirror: true });
  const t1 = PE.createState(PE.games.tie, 'T1', get('TOPACE10.TFR'));
  const t2 = PE.createState(PE.games.tie, 'T2', get('RUSTY-1.TFR'));
  assert.strictEqual(t1.activeLength(), 1928);
  assert.strictEqual(PE.compare.byteDiff(t1, t2).length, 1928, 'only the pilot half of a two-half file is compared');
  assert(saved.length === c.length);
  const rookie = PE.createState(PE.games.xwing, 'R', get('ROOKIE.PLT'));
  assert.strictEqual(PE.compare.sameLayout(a, rookie), a.length === rookie.length, 'the 1706-byte layout is not aligned with the 1705-byte one');
});

test('X-Wing: the 35 premade pilots of the original game fit the 1706-byte layout', () => {
  const roster = samples.filter(s => s.bytes.length === 1706 && !/^(TOPACE|IPTOPACE)/i.test(s.name) && s.name !== 'CALE.PLT');
  assert(roster.length >= 30, 'roster files missing: ' + roster.length);
  for (const s of roster) {
    const st = PE.createState(PE.games.xwing, s.name, s.bytes);
    for (let t = 0; t < 5; t++) {
      assert.strictEqual(st.get('tour.' + t + '.ops'), 0, s.name + ' tour ' + t);
      assert.strictEqual(st.get('tour.' + t + '.last'), 255, s.name + ' tour ' + t);
    }
    assert([0, 1].includes(st.get('tour.0.status')), s.name);
    assert.deepStrictEqual([0, 1, 2, 3].map(i => st.get('training.' + i + '.level')), [8, 8, 8, 0], s.name);
    assert.strictEqual(st.get('pilot.health'), 0, s.name);
  }
});

test('RUSTY.PLT (3410 bytes)', () => {
  const st = load('RUSTY.PLT');
  assert.strictEqual(st.get('tour.0.status'), 1);
  assert.strictEqual(st.get('tour.0.ops'), 6);
  assert.strictEqual(st.get('tour.0.last'), 5);
});

test('RUSTY1.PLT ops', () => {
  const st = load('RUSTY1.PLT');
  assert.deepStrictEqual([0, 1, 2, 3, 4].map(t => st.get('tour.' + t + '.ops')), [12, 12, 14, 20, 20]);
  assert.strictEqual(st.get('stat.laserFired'), 2411);
});

test('TOPACE10.TFR', () => {
  const st = load('TOPACE10.TFR');
  assert.strictEqual(st.get('pilot.rank'), 5);
  assert.strictEqual(st.get('pilot.secret'), 9);
  assert.strictEqual(st.get('pilot.score'), 1600000);
  assert.strictEqual(st.get('battle.0.status'), 3);
  assert.strictEqual(st.get('battle.0.secondary'), 0x1f);
  assert.strictEqual(st.get('battle.0.bonus'), 0x3f);
});

test('RUSTY1.tfr max score', () => {
  assert.strictEqual(load('RUSTY1.tfr').get('pilot.score'), 2046820351);
});

// ---- Editing, hooks, undo, mirroring ----
test('edit changes only the expected bytes', () => {
  const st = load('RUSTY1.PLT');
  const before = st.sourceBytes();
  st.set('pilot.experience', 1234);
  const after = st.toBytes();
  const diffs = [];
  for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) diffs.push(i);
  assert.deepStrictEqual(diffs, [8, 9]);
});

test('undo restores the exact original bytes; redo reapplies', () => {
  const st = load('TOPACE.TFR');
  const before = Buffer.from(st.sourceBytes());
  st.set('pilot.rank', 2);
  st.set('stat.kills', 77);
  assert(st.isDirty());
  assert(st.undo() && st.undo());
  assert(!st.isDirty());
  assert.strictEqual(Buffer.compare(Buffer.from(st.toBytes()), before), 0);
  assert(st.redo());
  assert.strictEqual(st.get('pilot.rank'), 2);
});

test('values are clamped to field limits', () => {
  const st = load('RUSTY1.PLT');
  st.set('training.0.level', 300);
  assert.strictEqual(st.get('training.0.level'), 255);
  st.set('training.0.level', 9);
  assert.strictEqual(st.get('training.0.level'), 9);
  assert.strictEqual(st.warningsFor('training.0.level').length, 0);
  st.set('pilot.experience', -5);
  assert.strictEqual(st.get('pilot.experience'), 0);
});

test('X-Wing: activating a tour demotes the other and syncs current tour', () => {
  const st = load('RUSTY.PLT');
  st.set('tour.0.status', 1);
  st.set('tour.1.ops', 4);
  st.set('tour.1.status', 1);
  assert.strictEqual(st.get('tour.0.status'), 2);
  assert.strictEqual(st.get('tour.current'), 1);
  assert.strictEqual(st.get('tour.currentOps'), 4);
  assert.strictEqual(st.get('tour.1.last'), 3);
  assert(st.undo());
  assert.strictEqual(st.get('tour.0.status'), 1);
});

test('mirrors write both copies of the current-tour count', () => {
  const st = load('RUSTY.PLT');
  st.set('tour.currentOps', 9);
  const out = st.toBytes();
  assert.strictEqual(out[647], 9);
  assert.strictEqual(out[642], 9);
});

test('mirror option copies the active half over the backup half', () => {
  for (const [name, half] of [['RUSTY1.tfr', 1928], ['RUSTYx.PLT', 1705]]) {
    const st = load(name);
    st.set('pilot.rank', 3);
    const plain = st.toBytes();
    const mirrored = st.toBytes({ mirror: true });
    assert.strictEqual(Buffer.compare(Buffer.from(mirrored.subarray(0, half)), Buffer.from(mirrored.subarray(half))), 0, name);
    assert.strictEqual(Buffer.compare(Buffer.from(plain.subarray(0, half)), Buffer.from(mirrored.subarray(0, half))), 0, name);
  }
});

test('1706-byte files keep their length and trailing byte', () => {
  const st = load('TOPACE.PLT');
  st.set('stat.lost', 99);
  const out = st.toBytes({ mirror: true });
  assert.strictEqual(out.length, 1706);
  assert.strictEqual(out[1704], 99);
});

test('detect rejects unknown sizes and warns on extension mismatch', () => {
  assert.throws(() => PE.files.detect('x.plt', 1234), /not a supported/);
  assert.strictEqual(PE.files.detect('x.tfr', 1705).def.id, 'xwing');
  assert(PE.files.detect('x.tfr', 1705).warnings.length > 0);
});

test('presets apply without throwing', () => {
  for (const name of ['RUSTY2.PLT', 'RUSTY2.tfr']) {
    const st = load(name);
    st.batch(api => st.def.presets[0].run(api));
    assert(st.isDirty());
  }
});

console.log(passed + ' tests passed' + (process.exitCode ? ', with failures' : ''));
