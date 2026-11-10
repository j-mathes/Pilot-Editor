// Node test runner: loads the browser scripts into a vm context and checks them against the sample files.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
for (const f of ['js/core/binary.js', 'js/core/codec.js', 'js/core/state.js', 'js/core/files.js', 'js/games/xwing.js', 'js/games/tie.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const PE = vm.runInContext('PilotEditor', ctx);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL ' + name + '\n  ' + (e.stack || e)); process.exitCode = 1; }
}

const samples = [];
for (const [dir, re] of [['reference/X-Wing', /\.(plt|bak)$/i], ['reference/TIE-Fighter', /\.tfr$/i]]) {
  for (const f of fs.readdirSync(path.join(root, dir)).filter(n => re.test(n))) {
    samples.push({ name: f, bytes: new Uint8Array(fs.readFileSync(path.join(root, dir, f))) });
  }
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
  assert.strictEqual(label('tour.3.op.0'), 'Tour 4 operation 1 score');
  assert.strictEqual(label('hist.0.0.score'), "X-Wing mission 1 (Dev's Sidestep) score");
  assert.strictEqual(label('hist.3.0.score'), 'B-Wing mission 1 score');
  const r = load('ROOKIE.PLT');
  assert.strictEqual(r.def.fields.find(f => f.id === 'pilot.rank').options[0].label, 'Flight Cadet');
  r.set('pilot.score', 25000);
  assert(r.warningsFor('pilot.rank').some(x => /rank of Flight Officer/.test(x.text)));
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
  st.set('training.0.level', 99);
  assert.strictEqual(st.get('training.0.level'), 8);
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
