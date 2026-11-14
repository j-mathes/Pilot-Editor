// Writes X-Wing test pilots into tools/test-pilots/ for checking in the game: node tools/make-test-pilots.js
// Group 1 (T1*) varies bytes 642 and 647; group 2 (T4*, T5*) tests Operations completed in Tours 4 and 5.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
for (const f of ['js/core/binary.js', 'js/core/codec.js', 'js/core/state.js', 'js/core/rules.js', 'js/core/compare.js', 'js/core/files.js', 'js/games/xwing.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const PE = vm.runInContext('PilotEditor', ctx);
const def = PE.games.xwing;
const base = new Uint8Array(fs.readFileSync(path.join(root, 'reference', 'X-Wing', 'ROOKIE.PLT')));
if (base.length !== 1705) throw new Error('ROOKIE.PLT should be the 1705-byte layout');

// tour: 0-based; ops: operations completed; played: 'b' flies the b version of the last pair; raw: byte overrides written last.
const SPECS = [
  { name: 'T1BOTH', tour: 0, ops: 5, note: 'Tour 1, 5 done; 642 and 647 both 5 (control)' },
  { name: 'T1B642', tour: 0, ops: 5, raw: { 647: 0 }, note: 'Tour 1, 5 done; only 642 holds 5' },
  { name: 'T1B647', tour: 0, ops: 5, raw: { 642: 0 }, note: 'Tour 1, 5 done; only 647 holds 5' },
  { name: 'T1SPLIT', tour: 0, ops: 5, raw: { 642: 2, 647: 8 }, note: 'Tour 1, 5 done; 642 says 2, 647 says 8' },
  { name: 'T1ZERO', tour: 0, ops: 5, raw: { 642: 0, 647: 0 }, note: 'Tour 1, 5 done; 642 and 647 both 0' },
  { name: 'T4O3', tour: 3, ops: 3, note: 'Tour 4, 3 operations done' },
  { name: 'T4O5', tour: 3, ops: 5, note: 'Tour 4, 5 done (next is the 6A/6B choice)' },
  { name: 'T4O6A', tour: 3, ops: 6, note: 'Tour 4, 6 done, flew 6A' },
  { name: 'T4O6B', tour: 3, ops: 6, played: 'b', note: 'Tour 4, 6 done, flew 6B' },
  { name: 'T4O19', tour: 3, ops: 19, note: 'Tour 4, 19 done (one left)' },
  { name: 'T4DONE', tour: 3, done: true, note: 'Tour 4 complete' },
  { name: 'T5O3', tour: 4, ops: 3, note: 'Tour 5, 3 operations done' },
  { name: 'T5O10', tour: 4, ops: 10, note: 'Tour 5, 10 done (next is the 11A/11B choice)' },
  { name: 'T5O11A', tour: 4, ops: 11, note: 'Tour 5, 11 done, flew 11A' },
  { name: 'T5O11B', tour: 4, ops: 11, played: 'b', note: 'Tour 5, 11 done, flew 11B' },
  { name: 'T5DONE', tour: 4, done: true, note: 'Tour 5 complete' }
];

function build(spec) {
  const st = PE.createState(def, spec.name, new Uint8Array(base));
  st.setEnforce(true);
  for (let t = 0; t < spec.tour; t++) st.set('tour.' + t + '.status', 3);
  if (spec.done) {
    st.set('tour.' + spec.tour + '.status', 3);
    st.set('tour.current', spec.tour);
    st.set('tour.currentOps', st.get('tour.' + spec.tour + '.ops'));
  } else {
    st.set('tour.' + spec.tour + '.status', 1);
    for (let n = 1; n <= spec.ops; n++) {
      const group = def.opSlots[spec.tour][n - 1];
      const slot = spec.played === 'b' && n === spec.ops ? group[group.length - 1] : group[0];
      st.set('tour.' + spec.tour + '.op.' + slot, 4000 + n * 100);
    }
    st.set('tour.' + spec.tour + '.ops', spec.ops);
  }
  const bytes = st.toBytes({ mirror: true });
  for (const [offset, value] of Object.entries(spec.raw || {})) bytes[Number(offset)] = value;
  return bytes;
}

const outDir = path.join(__dirname, 'test-pilots');
fs.mkdirSync(outDir, { recursive: true });
const hex = n => n.toString(16).toUpperCase().padStart(2, '0');
console.log('name     size  640 642 643 647 | status(735+) last(743+)  ops(751+)  note');
for (const spec of SPECS) {
  const bytes = build(spec);
  fs.writeFileSync(path.join(outDir, spec.name + '.PLT'), bytes);
  const row = (from) => Array.from(bytes.subarray(from, from + 5), hex).join(' ');
  console.log(spec.name.padEnd(8), String(bytes.length).padEnd(5), [640, 642, 643, 647].map(o => hex(bytes[o]).padEnd(3)).join(' '), '|', row(735), '|', row(743), '|', row(751), '|', spec.note);
}
console.log('\nWrote ' + SPECS.length + ' files to ' + outDir);
