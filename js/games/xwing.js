// X-Wing (.plt) pilot definition: field table, sections and rules.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  PE.games = PE.games || {};

  const options = labels => labels.map((label, value) => ({ value, label }));
  const num = (id, type, offset, label, extra) =>
    Object.assign({ id, type, offset, label, kind: 'number' }, extra);
  const sel = (id, type, offset, label, labels, extra) =>
    Object.assign({ id, type, offset, label, kind: 'enum', options: options(labels), max: labels.length - 1 }, extra);
  const chk = (id, offset, label, extra) =>
    Object.assign({ id, type: 'u8', offset, label, kind: 'bool' }, extra);

  const RANKS = ['Cadet', 'Officer', 'Lieutenant', 'Captain', 'Commander', 'General'];
  const HEALTH = ['Alive', 'Captured', 'Dead'];
  const TOUR_STATUS = ['Inactive', 'Active', 'Incomplete', 'Complete'];
  const KALIDOR = ['None', 'Kalidor Crescent', 'Bronze Cluster', 'Silver Talons', 'Silver Scimitar', 'Gold Wings', 'Diamond Eyes'];
  const SHIPS = ['X-Wing', 'Y-Wing', 'A-Wing', 'B-Wing'];
  const HISTORIC = ['X-Wing', 'Y-Wing', 'A-Wing', 'B-Wing', 'Bonus'];
  const NPC = ['X-Wing', 'Y-Wing', 'A-Wing', 'TIE Fighter', 'TIE Interceptor', 'TIE Bomber', 'Assault Gunboat',
    'Transport', 'Shuttle', 'Tug', 'Container', 'Freighter', 'Calamari Cruiser', 'Nebulon B Frigate', 'Corvette',
    'Star Destroyer', 'TIE Advanced', 'Mine 1', 'Mine 2', 'Mine 3', 'Mine 4', 'Comm Sat 1', 'Comm Sat 2', 'Space Probe'];

  const TOUR_SLOTS = [12, 12, 14, 24, 24];
  const TOUR_OPS = [12, 12, 14, 20, 20];
  const TOUR_SCORE_BASE = [759, 859, 959, 1059, 1159];

  const seq = n => Array.from({ length: n }, (_, i) => String(i + 1));
  const TOUR_OP_LABELS = [
    seq(12), seq(12), seq(14),
    ['1', '2', '3', '4', '5', '6A', '6B', '7', '8A', '8B', '9', '10', '11', '12A', '12B', '13', '14', '15', '16A', '16B', '17', '18', '19', '20'],
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11A', '11B', '12', '13', '14A', '14B', '15', '16', '17A', '17B', '18', '19', '20A', '20B']
  ];

  const fields = [];
  fields.push(sel('pilot.health', 'u8', 2, 'Health', HEALTH));
  fields.push(sel('pilot.rank', 'u8', 3, 'Rank', RANKS));
  fields.push(num('pilot.score', 'i32', 4, 'Tour of Duty points', { min: 0, softMax: 999999 }));
  fields.push(num('pilot.experience', 'u16', 8, 'Experience points'));
  fields.push(sel('tour.current', 'u8', 640, 'Current tour', ['Tour 1', 'Tour 2', 'Tour 3', 'Tour 4', 'Tour 5']));
  // Samples show the game keeps this count at both 642 and 647.
  fields.push(num('tour.currentOps', 'u8', 647, 'Operations completed (current tour)', { mirrors: [642], softMax: 20 }));

  ['corellian', 'mantooine', 'alderaan', 'yavin', 'hoth'].forEach((k, i) => {
    const names = ['Corellian Cross', 'Mantooine Medallion', 'Star of Alderaan', 'Shield of Yavin', 'Talons of Hoth'];
    fields.push(chk('medal.' + k, 10 + i, names[i]));
  });
  fields.push(sel('medal.kalidor', 'u8', 17, 'Kalidor Crescent', KALIDOR));

  SHIPS.forEach((name, i) => {
    fields.push(num('training.' + i + '.level', 'u8', 134 + i, name + ' training level', { max: 8 }));
    fields.push(num('training.' + i + '.score', 'u32', 38 + 4 * i, name + ' best score', { softMax: 999999 }));
  });

  const HIST_FLAGS = [544, 560, 576, 592, 608];
  const HIST_SCORES = [160, 224, 288, 352, 416];
  HISTORIC.forEach((name, g) => {
    for (let m = 0; m < 6; m++) {
      fields.push(chk('hist.' + g + '.' + m + '.done', HIST_FLAGS[g] + m, name + ' mission ' + (m + 1) + ' complete'));
      fields.push(num('hist.' + g + '.' + m + '.score', 'u32', HIST_SCORES[g] + 4 * m, name + ' mission ' + (m + 1) + ' score', { softMax: 999999 }));
    }
  });

  TOUR_SLOTS.forEach((slots, t) => {
    fields.push(sel('tour.' + t + '.status', 'u8', 735 + t, 'Tour ' + (t + 1) + ' status', TOUR_STATUS));
    // The game stores the last completed operation index here (0xFF = none).
    fields.push(num('tour.' + t + '.last', 'u8', 743 + t, 'Tour ' + (t + 1) + ' last operation index', { hidden: true }));
    fields.push(num('tour.' + t + '.ops', 'u8', 751 + t, 'Tour ' + (t + 1) + ' operations completed', { max: slots, softMax: TOUR_OPS[t] }));
    for (let i = 0; i < slots; i++) {
      fields.push(num('tour.' + t + '.op.' + i, 'u32', TOUR_SCORE_BASE[t] + 4 * i,
        'Tour ' + (t + 1) + ' operation ' + TOUR_OP_LABELS[t][i] + ' score', { softMax: 999999 }));
    }
  });

  fields.push(num('stat.surface', 'u16', 1587, 'Surface victories'));
  NPC.forEach((name, i) => {
    fields.push(num('stat.kills.' + i, 'u16', 1589 + 2 * i, name + ' victories'));
    fields.push(num('stat.caps.' + i, 'u16', 1637 + 2 * i, name + ' captures'));
  });
  fields.push(num('stat.laserFired', 'u32', 1685, 'Lasers fired'));
  fields.push(num('stat.laserCraft', 'u32', 1689, 'Laser craft hits'));
  fields.push(num('stat.laserGround', 'u32', 1693, 'Laser ground hits'));
  fields.push(num('stat.missileFired', 'u16', 1697, 'Missiles fired'));
  fields.push(num('stat.missileCraft', 'u16', 1699, 'Missile craft hits'));
  fields.push(num('stat.missileGround', 'u16', 1701, 'Missile ground hits'));
  fields.push(num('stat.lost', 'u16', 1703, 'Craft lost'));

  const pct = (hits, fired) => fired === 0 ? 'n/a' : Math.floor(hits / fired * 100) + '%';
  const sumIds = (get, prefix, count) => {
    let s = 0;
    for (let i = 0; i < count; i++) s += get(prefix + i);
    return s;
  };

  const derived = {
    'stat.totalKills': { label: 'Total space victories', compute: g => sumIds(g, 'stat.kills.', NPC.length) },
    'stat.totalCaps': { label: 'Total space captures', compute: g => sumIds(g, 'stat.caps.', NPC.length) },
    'stat.laserAcc': { label: 'Laser craft accuracy', compute: g => pct(g('stat.laserCraft'), g('stat.laserFired')) },
    'stat.missileAcc': { label: 'Missile craft accuracy', compute: g => pct(g('stat.missileCraft'), g('stat.missileFired')) }
  };
  TOUR_SLOTS.forEach((slots, t) => {
    derived['tour.' + t + '.total'] = {
      label: 'Tour ' + (t + 1) + ' total score',
      compute: g => {
        let s = 0;
        for (let i = 0; i < slots; i++) s += g('tour.' + t + '.op.' + i);
        return s;
      }
    };
  });

  const tourCards = TOUR_SLOTS.map((slots, t) => ({
    id: 'tour' + t,
    title: 'Tour ' + (t + 1),
    badge: g => ({ text: TOUR_STATUS[g('tour.' + t + '.status')] || 'Unknown', tone: ['idle', 'active', 'warn', 'done'][g('tour.' + t + '.status')] || 'warn' }),
    progress: g => ({ value: g('tour.' + t + '.ops'), total: TOUR_OPS[t] }),
    total: derived['tour.' + t + '.total'].compute,
    blocks: [
      { type: 'form', items: [{ id: 'tour.' + t + '.status', label: 'Status' }, { id: 'tour.' + t + '.ops', label: 'Operations completed' }, { derived: 'tour.' + t + '.total' }] },
      {
        type: 'table', title: 'Operation scores', columns: ['Score'],
        rows: TOUR_OP_LABELS[t].map((label, i) => ({ label: 'Operation ' + label, cells: ['tour.' + t + '.op.' + i] })),
        actions: [{
          label: 'Mark all operations complete',
          run: api => {
            api.set('tour.' + t + '.status', 3);
            api.set('tour.' + t + '.ops', TOUR_OPS[t]);
          }
        }, {
          label: 'Clear scores',
          run: api => { for (let i = 0; i < slots; i++) api.set('tour.' + t + '.op.' + i, 0); }
        }]
      }
    ]
  }));

  const sections = [
    {
      id: 'pilot', title: 'Pilot',
      blocks: [{ type: 'form', layout: 'list', items: ['pilot.health', 'pilot.rank', 'pilot.score', 'pilot.experience', 'tour.current', 'tour.currentOps'] }]
    },
    {
      id: 'training', title: 'Training',
      blocks: [{
        type: 'table', title: 'Training simulator', columns: ['Level completed', 'Best score'],
        rows: SHIPS.map((name, i) => ({ label: name, cells: ['training.' + i + '.level', 'training.' + i + '.score'] })),
        actions: [{ label: 'Complete all levels', run: api => SHIPS.forEach((_, i) => api.set('training.' + i + '.level', 8)) }]
      }]
    },
    {
      id: 'historic', title: 'Historic combat',
      blocks: [{
        type: 'table', title: 'Missions (complete, score)', columns: seq(6).map(n => 'Mission ' + n),
        rows: HISTORIC.map((name, g) => ({
          label: name,
          cells: Array.from({ length: 6 }, (_, m) => ['hist.' + g + '.' + m + '.done', 'hist.' + g + '.' + m + '.score'])
        })),
        actions: [{
          label: 'Mark all complete',
          run: api => HISTORIC.forEach((_, g) => { for (let m = 0; m < 6; m++) api.set('hist.' + g + '.' + m + '.done', true); })
        }, {
          label: 'Clear all',
          run: api => HISTORIC.forEach((_, g) => {
            for (let m = 0; m < 6; m++) { api.set('hist.' + g + '.' + m + '.done', false); api.set('hist.' + g + '.' + m + '.score', 0); }
          })
        }]
      }]
    },
    {
      id: 'stats', title: 'Statistics', layout: 'columns',
      blocks: [
        {
          type: 'table', title: 'Space victories and captures', searchable: true, columns: ['Victories', 'Captures'],
          rows: NPC.map((name, i) => ({ label: name, cells: ['stat.kills.' + i, 'stat.caps.' + i] })),
          footer: [{ derived: 'stat.totalKills' }, { derived: 'stat.totalCaps' }]
        },
        {
          type: 'form', layout: 'list', title: 'Weapons and losses',
          items: ['stat.surface', 'stat.laserFired', 'stat.laserCraft', 'stat.laserGround', { derived: 'stat.laserAcc' },
            'stat.missileFired', 'stat.missileCraft', 'stat.missileGround', { derived: 'stat.missileAcc' }, 'stat.lost']
        }
      ]
    },
    { id: 'campaign', title: 'Tours of duty', blocks: [{ type: 'cards', cards: tourCards }] },
    {
      id: 'medals', title: 'Medals',
      blocks: [{ type: 'form', layout: 'list', items: ['medal.corellian', 'medal.mantooine', 'medal.alderaan', 'medal.yavin', 'medal.hoth', 'medal.kalidor'] }]
    },
    { id: 'raw', title: 'Raw bytes', blocks: [{ type: 'hex' }] }
  ];

  function onChange(id, value, api) {
    let m = /^tour\.(\d)\.status$/.exec(id);
    if (m && value === 1) {
      const t = Number(m[1]);
      for (let o = 0; o < 5; o++) if (o !== t && api.get('tour.' + o + '.status') === 1) api.set('tour.' + o + '.status', 2);
      api.set('tour.current', t);
      api.set('tour.currentOps', api.get('tour.' + t + '.ops'));
      return;
    }
    m = /^tour\.(\d)\.ops$/.exec(id);
    if (m) {
      const t = Number(m[1]);
      api.set('tour.' + t + '.last', value > 0 ? value - 1 : 255);
      if (api.get('tour.' + t + '.status') === 1 || api.get('tour.current') === t) api.set('tour.currentOps', value);
    }
  }

  function warnings(get) {
    const out = [];
    const active = [];
    TOUR_SLOTS.forEach((_, t) => { if (get('tour.' + t + '.status') === 1) active.push(t + 1); });
    if (active.length > 1) out.push({ level: 'warn', text: 'Tours ' + active.join(', ') + ' are all Active; only one should be.' });
    TOUR_SLOTS.forEach((_, t) => {
      const status = get('tour.' + t + '.status');
      const ops = get('tour.' + t + '.ops');
      if (status === 3 && ops < TOUR_OPS[t]) {
        out.push({ id: 'tour.' + t + '.ops', level: 'info', text: 'Tour ' + (t + 1) + ' is Complete but only ' + ops + ' of ' + TOUR_OPS[t] + ' operations are recorded.' });
      }
      if (status === 0 && ops > 0) {
        out.push({ id: 'tour.' + t + '.status', level: 'info', text: 'Tour ' + (t + 1) + ' is Inactive but has ' + ops + ' completed operations.' });
      }
      let scored = 0;
      for (let i = 0; i < TOUR_SLOTS[t]; i++) if (get('tour.' + t + '.op.' + i) > 0) scored++;
      if (status === 0 && scored > 0) {
        out.push({
          id: 'tour.' + t + '.status', level: 'info',
          text: 'Tour ' + (t + 1) + ' is Inactive but has scores for ' + scored + ' operations' +
            (get('tour.current') === t ? ' and is the current tour' : '') +
            '. If it was played, set its status and operations completed.'
        });
      }
    });
    if (get('stat.laserCraft') > get('stat.laserFired')) out.push({ id: 'stat.laserCraft', level: 'warn', text: 'Laser craft hits exceed lasers fired.' });
    if (get('stat.laserGround') > get('stat.laserFired')) out.push({ id: 'stat.laserGround', level: 'warn', text: 'Laser ground hits exceed lasers fired.' });
    if (get('stat.missileCraft') > get('stat.missileFired')) out.push({ id: 'stat.missileCraft', level: 'warn', text: 'Missile craft hits exceed missiles fired.' });
    if (get('stat.missileGround') > get('stat.missileFired')) out.push({ id: 'stat.missileGround', level: 'warn', text: 'Missile ground hits exceed missiles fired.' });
    return out;
  }

  function blank() {
    const b = new Uint8Array(1705);
    b.fill(255, 743, 751);
    b[134] = 1;
    return b;
  }

  const presets = [{
    label: 'Top Ace',
    run: api => {
      api.set('pilot.health', 0);
      api.set('pilot.rank', 5);
      api.set('pilot.score', 9999);
      api.set('pilot.experience', 65535);
      ['corellian', 'mantooine', 'alderaan', 'yavin', 'hoth'].forEach(k => api.set('medal.' + k, true));
      api.set('medal.kalidor', 6);
      SHIPS.forEach((_, i) => api.set('training.' + i + '.level', 8));
      HISTORIC.forEach((_, g) => { for (let m = 0; m < 6; m++) api.set('hist.' + g + '.' + m + '.done', true); });
      [0, 1, 2].forEach(t => {
        api.set('tour.' + t + '.status', 3);
        api.set('tour.' + t + '.ops', TOUR_OPS[t]);
      });
    }
  }];

  PE.games.xwing = {
    id: 'xwing',
    name: 'X-Wing',
    pilotTitle: 'X-Wing Pilot',
    ext: ['.plt'],
    variants: {
      1705: {},
      1706: {
        shift: 1, shiftFrom: 735,
        note: 'This 1706-byte layout is inferred from sample files: everything from byte 735 onward is shifted by one. Check results in the game.'
      },
      3410: { half: 1705 }
    },
    theme: { accent: '#e8832a', accent2: '#3d7fd6', glyph: 'X' },
    fields, derived, sections, onChange, warnings, blank, presets,
    summary: g => (RANKS[g('pilot.rank')] || 'Unknown rank') + ' · ' + (HEALTH[g('pilot.health')] || 'Unknown health') +
      ' · ' + g('pilot.score').toLocaleString('en-US') + ' Tour of Duty points'
  };
})(globalThis);
