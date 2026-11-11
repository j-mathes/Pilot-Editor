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

  const RANKS = ['Flight Cadet', 'Flight Officer', 'Lieutenant', 'Captain', 'Commander', 'General'];
  const HEALTH = ['Alive', 'Captured', 'Killed'];
  const TOUR_STATUS = ['Inactive', 'Active', 'Incomplete', 'Complete'];
  const KALIDOR = ['None', 'Kalidor Crescent', 'Bronze Cluster', 'Silver Talons', 'Silver Scimitar', 'Golden Wings', 'Diamond Eyes'];
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

  // Titles from the X-Wing strategy guides (original and Collector's CD-ROM editions); each slot of tours 4 and 5 follows the file order.
  const TOUR_TITLES = ['A New Ally', 'The Great Search', 'The Gathering Storm', 'Imperial Pursuit', 'B-wing'];
  const TOUR_OP_TITLES = [
    ['Destroy Imperial Convoy', 'Reconnaissance Mission', 'Fly Point During Evacuation', 'Protect Medical Frigate', 'Ambush Imperial Supply Convoy',
      'Raid for R2 Units', 'Recover Stolen X-wings', 'Rescue Sullustan Tech Staff', 'Diplomatic Summit at Sullust', 'Rescue Sullustan Leader',
      'Capture Staff from Cygnus', 'Recover Explosive Warhead'],
    ['Rescue from Star\'s End', 'Rescue Wookiee Slaves', 'Attack Weapons Convoy', 'Capture Stolen Freighter', 'Protect Captured Satellites',
      'Ambush in the Cron Drift', 'Protect a Disabled X-wing', 'Stop Hyperdrive Replacement', 'Take Out Intrepid\'s Escort', 'Destroy the Intrepid',
      'Deliver Plans to Princess Leia', 'Protect Princess Leia'],
    ['Guard Weapons Transfer', 'Destroy Repair Dock', 'Capture Military Transport', 'Scramble!', 'Intercept and Capture', 'Destroy Imperial Base',
      'Destroy Priam\'s Escort', 'Capture the Frigate Priam', 'Capture Ethar I and II', 'Guard Vital Supply Depot', 'Defend the Independence',
      'Begin Death Star Assault', 'Attack Death Star Surface', 'Death Star Trench Run'],
    ['Evacuate Yavin', 'Provide Area Protection', 'Evacuate Cruiser Maximus', 'Protect Frigate Anvil', 'Abandon Ship', 'Guard Repair Operations',
      'Protect Supply Container', 'Hide and Seek', 'Clear Minefield', 'Destroy Comm Area', 'Guard Cargo Transfer', 'Grain Snatch',
      'Capture Ghorin\'s Y-wings', 'Raid Storage Area', 'Corvette Alley', 'Grain Exchange', 'Confirm Grain Delivery', 'Steal TIE Advanced',
      'Escort Base Convoy', 'Support Allies', 'Attack Frigate Red Wind', 'Capture Imperial Gunboats', 'Capture Imperial Corvette', 'Defend Ram\'s Head'],
    ['Protect B-wing Assembly Area', 'Cover B-wing Evacuation', 'Protect B-wing Delivery', 'Destroy TIE Staging Area', 'Destroy Secret Weapons Base',
      'Prisoner Rescue', 'Help Neutrals Out of Ambush', 'Escort VIP to Alliance Cruiser', 'Guard Cargo Pickup', 'Probe Capture',
      'Destroy Corvette Base', 'Destroy Imperial Base', 'Intercept Imperial Attack', 'Protect B-wing Delivery', 'Capture Imperial Frigate',
      'Capture Imperial Officers', 'Escort B-wings on Attack', 'Attack Probe Calibration Site', 'Ambush Imperial Arms Shipment',
      'Disrupt Delivery of New TIEs', 'Destroy the Relentless', 'Operation Blunt Stick', 'Save the Cruiser Cathleen', 'Escape to Hoth!']
  ];
  const opTitle = (t, i) => TOUR_OP_TITLES[t] ? ': ' + TOUR_OP_TITLES[t][i] : '';
  const HIST_TITLES = [
    ['Dev\'s Sidestep', 'Wingmen Are Important', 'Satellites Near Coruscant', 'Beat the Odds', 'Rescue at Mon Calamari', 'Farlander\'s First Mission'],
    ['Commerce Raid', 'Y-wing Gunnery Practice', 'S.O.S. from Corvette Karinne', 'Prisoners from Kessel', 'Escape from Mytus VII', 'Interception and Capture'],
    ['Repair Depot Raid', 'Aggressor Squadron Training', 'Intercept TIE Bomber Run', 'Attack Run on Freighters', 'Protect Returning Starfighters', 'Deep Space Reconnaissance'],
    ['Project Shantipole', 'Assault on Imperial Convoy', 'Capture the Frigate Priam', 'B-wing Attack on the Shrike', 'Attack Death Star Surface', 'Death Star Trench Run'],
    ['Protect Cargo Transfer', 'Destroy Troop Convoy', 'Attack Star Destroyer', 'Protect Convoy', 'Attack Imperial Stockyard', 'Protect Your Mothership']
  ];

  // Slots of each operation number; the a and b versions of a choice share a number. Real saves (NOKSP.PLT) score one slot of each pair.
  const OP_SLOTS = TOUR_OP_LABELS.map(labels => {
    const groups = [];
    labels.forEach((label, slot) => {
      const n = parseInt(label, 10);
      (groups[n - 1] = groups[n - 1] || []).push(slot);
    });
    return groups;
  });
  // The file's last-operation marker is a slot position, so with n operations done it points at the slot flown for operation n.
  function lastSlot(t, n, get) {
    if (n <= 0) return 255;
    const slots = OP_SLOTS[t][Math.min(n, OP_SLOTS[t].length) - 1];
    const played = slots.filter(s => get('tour.' + t + '.op.' + s) > 0);
    return played.length ? played[0] : slots[0];
  }

  const fields = [];
  fields.push(sel('pilot.health', 'u8', 2, 'Health', HEALTH));
  fields.push(sel('pilot.rank', 'u8', 3, 'Rank', RANKS, { hint: 'Score needed (strategy guide): Flight Officer 20,000, Lieutenant 50,000, Captain 100,000, Commander 250,000, General 500,000.' }));
  fields.push(num('pilot.score', 'i32', 4, 'Tour of Duty points', { min: 0, softMax: 999999, hint: 'Total Tour of Duty points, which decide the rank.' }));
  fields.push(num('pilot.experience', 'u16', 8, 'Rookie number (experience)', {
    hint: 'Rookie number. It sets the pilot\'s standing: Novice, Officer, Veteran, Ace or Top Ace. The original game\'s premade pilots use 16500, 33000, 49500 and 65535, which probably mark the steps; the exact cut-offs are not documented.'
  }));
  fields.push(sel('tour.current', 'u8', 640, 'Current tour', ['Tour 1', 'Tour 2', 'Tour 3', 'Tour 4', 'Tour 5'].map((n, i) => TOUR_TITLES[i] ? n + ': ' + TOUR_TITLES[i] : n), { hint: 'The tour the pilot is on now (stored 0-based in the file).' }));
  // Samples show the game keeps this count at both 642 and 647.
  fields.push(num('tour.currentOps', 'u8', 647, 'Operations completed (current tour)', { mirrors: [642], softMax: 20, hint: 'Operations completed in the current tour. The game keeps this value in two places (bytes 642 and 647); both are updated.' }));

  ['corellian', 'mantooine', 'alderaan', 'yavin', 'hoth'].forEach((k, i) => {
    const names = ['Corellian Cross', 'Mantooine Medallion', 'Star of Alderaan', 'Shield of Yavin', 'Talons of Hoth'];
    fields.push(chk('medal.' + k, 10 + i, names[i], { hint: 'Awarded for completing Tour ' + (i + 1) + '.' }));
  });
  fields.push(sel('medal.kalidor', 'u8', 17, 'Kalidor Crescent', KALIDOR, {
    hint: 'Awarded for a score in a single Tour of Duty mission. In this file each level is checked against a different mission: Kalidor Crescent 10,000, Bronze Cluster 12,000, Silver Talons 14,000, Silver Scimitar 16,000, Golden Wings 18,000, Diamond Eyes 20,000.'
  }));

  SHIPS.forEach((name, i) => {
    fields.push(num('training.' + i + '.level', 'u8', 134 + i, name + ' training level', { hint: 'Proving ground levels completed. There are 8 main levels (completing level 8 earns that craft\'s flight badge), but the course continues past them and saves with 9 have been seen.' }));
    fields.push(num('training.' + i + '.score', 'u32', 38 + 4 * i, name + ' best score', { softMax: 999999, hint: 'Best proving ground score for this craft.' }));
  });

  const HIST_FLAGS = [544, 560, 576, 592, 608];
  const HIST_SCORES = [160, 224, 288, 352, 416];
  HISTORIC.forEach((name, g) => {
    for (let m = 0; m < 6; m++) {
      const title = HIST_TITLES[g] ? HIST_TITLES[g][m] : null;
      const hint = (title ? 'Mission ' + (m + 1) + ': ' + title + '. ' : '') + 'Completing a historical mission earns a battle patch.';
      fields.push(chk('hist.' + g + '.' + m + '.done', HIST_FLAGS[g] + m, name + ' mission ' + (m + 1) + (title ? ' (' + title + ')' : '') + ' complete', { hint }));
      fields.push(num('hist.' + g + '.' + m + '.score', 'u32', HIST_SCORES[g] + 4 * m, name + ' mission ' + (m + 1) + (title ? ' (' + title + ')' : '') + ' score', { softMax: 999999, hint: title ? 'Mission ' + (m + 1) + ': ' + title + '.' : undefined }));
    }
  });

  TOUR_SLOTS.forEach((slots, t) => {
    fields.push(sel('tour.' + t + '.status', 'u8', 735 + t, 'Tour ' + (t + 1) + ' status', TOUR_STATUS, { hint: 'Only one tour should be Active. Activating a tour also makes it the current tour.' }));
    // The game stores the slot position of the last completed operation here (0xFF = none); it is not the operation count for tours 4 and 5.
    fields.push(num('tour.' + t + '.last', 'u8', 743 + t, 'Tour ' + (t + 1) + ' last completed slot', {
      hint: 'Position (0-based) of the last completed operation in the file\'s slot order, 255 if none. The game uses it with Operations completed to pick the next mission.'
    }));
    fields.push(num('tour.' + t + '.ops', 'u8', 751 + t, 'Tour ' + (t + 1) + ' operations completed', {
      max: slots, softMax: TOUR_OPS[t],
      hint: 'Operations completed, counting each a/b pair once (a finished Tour 4 or 5 has 20). Changing it also sets the last completed slot.'
    }));
    for (let i = 0; i < slots; i++) {
      fields.push(num('tour.' + t + '.op.' + i, 'u32', TOUR_SCORE_BASE[t] + 4 * i,
        'Tour ' + (t + 1) + ' operation ' + TOUR_OP_LABELS[t][i] + opTitle(t, i) + ' score', { softMax: 999999 }));
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

  // Needs a different mission for each level; the best scores go to the highest levels.
  const KALIDOR_POINTS = [10000, 12000, 14000, 16000, 18000, 20000];
  function kalidorLevel(get) {
    const scores = [];
    TOUR_SLOTS.forEach((slots, t) => {
      for (let i = 0; i < slots; i++) scores.push(get('tour.' + t + '.op.' + i));
    });
    scores.sort((a, b) => b - a);
    let level = 0;
    for (let l = 1; l <= KALIDOR_POINTS.length; l++) {
      let ok = true;
      for (let i = 0; i < l; i++) if (scores[i] < KALIDOR_POINTS[l - 1 - i]) ok = false;
      if (!ok) break;
      level = l;
    }
    return level;
  }

  const derived = {
    'medal.kalidorEarned': {
      label: 'Highest level your mission scores qualify for',
      hint: 'The highest Kalidor Crescent level the Tour of Duty operation scores saved in this file are good enough for (10,000 for the first level, up to 20,000 for the last, each from a different mission). If you cleared scores it can read lower than the medal you hold.',
      compute: g => KALIDOR[kalidorLevel(g)],
      sync: { id: 'medal.kalidor', label: 'Set the Kalidor Crescent to this level', value: kalidorLevel }
    },
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
    title: 'Tour ' + (t + 1) + (TOUR_TITLES[t] ? ': ' + TOUR_TITLES[t] : ''),
    badge: g => ({ text: TOUR_STATUS[g('tour.' + t + '.status')] || 'Unknown', tone: ['idle', 'active', 'warn', 'done'][g('tour.' + t + '.status')] || 'warn' }),
    progress: g => ({ value: g('tour.' + t + '.ops'), total: TOUR_OPS[t] }),
    total: derived['tour.' + t + '.total'].compute,
    blocks: [
      { type: 'form', items: [{ id: 'tour.' + t + '.status', label: 'Status' }, { id: 'tour.' + t + '.ops', label: 'Operations completed' }, { id: 'tour.' + t + '.last', label: 'Last completed slot (255 = none)' }, { derived: 'tour.' + t + '.total' }] },
      {
        type: 'table', title: 'Operation scores', columns: ['Score'],
        rows: TOUR_OP_LABELS[t].map((label, i) => ({ label: 'Operation ' + label + opTitle(t, i), cells: ['tour.' + t + '.op.' + i] })),
        actions: [{
          label: 'Mark all operations complete', title: 'Set this tour to Complete with every operation done (scores are not changed)',
          run: api => {
            api.set('tour.' + t + '.status', 3);
            api.set('tour.' + t + '.ops', TOUR_OPS[t]);
          }
        }, {
          label: 'Clear scores', title: 'Set every operation score in this tour to 0',
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
        type: 'table', title: 'Proving ground (training simulator)', columns: ['Level completed', 'Best score'],
        rows: SHIPS.map((name, i) => ({ label: name, cells: ['training.' + i + '.level', 'training.' + i + '.score'] })),
        actions: [{ label: 'Complete all levels', title: 'Set every training ship to level 8 (can be undone)', run: api => SHIPS.forEach((_, i) => api.set('training.' + i + '.level', 8)) }]
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
          label: 'Mark all complete', title: 'Tick every historic mission as complete (scores are not changed)',
          run: api => HISTORIC.forEach((_, g) => { for (let m = 0; m < 6; m++) api.set('hist.' + g + '.' + m + '.done', true); })
        }, {
          label: 'Clear all', title: 'Untick every historic mission and set its score to 0',
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
          type: 'form', layout: 'list', boxed: true, title: 'Weapons and losses',
          items: ['stat.surface', 'stat.laserFired', 'stat.laserCraft', 'stat.laserGround', { derived: 'stat.laserAcc' },
            'stat.missileFired', 'stat.missileCraft', 'stat.missileGround', { derived: 'stat.missileAcc' }, 'stat.lost']
        }
      ]
    },
    { id: 'campaign', title: 'Tours of duty', blocks: [{ type: 'cards', cards: tourCards }] },
    {
      id: 'medals', title: 'Medals',
      blocks: [{ type: 'form', layout: 'list', items: ['medal.corellian', 'medal.mantooine', 'medal.alderaan', 'medal.yavin', 'medal.hoth', 'medal.kalidor', { derived: 'medal.kalidorEarned' }] }]
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
      api.set('tour.' + t + '.last', lastSlot(t, value, api.get));
      if (api.get('tour.' + t + '.status') === 1 || api.get('tour.current') === t) api.set('tour.currentOps', value);
    }
  }

  // Accumulated TOD points for each rank (strategy guide). Lieutenant can also come from training missions.
  const RANK_POINTS = [0, 20000, 50000, 100000, 250000, 500000];
  const MEDAL_KEYS = ['corellian', 'mantooine', 'alderaan', 'yavin', 'hoth'];

  function warnings(get) {
    const out = [];
    const rank = get('pilot.rank');
    const score = get('pilot.score');
    if (rank >= 3 && rank < RANK_POINTS.length && score < RANK_POINTS[rank]) {
      out.push({ id: 'pilot.rank', level: 'info', text: RANKS[rank] + ' normally needs ' + RANK_POINTS[rank].toLocaleString('en-US') + ' Tour of Duty points; this pilot has ' + score.toLocaleString('en-US') + '.' });
    }
    for (let r = RANK_POINTS.length - 1; r > rank; r--) {
      if (r >= 1 && score >= RANK_POINTS[r]) {
        out.push({ id: 'pilot.rank', level: 'info', text: score.toLocaleString('en-US') + ' Tour of Duty points normally earn the rank of ' + RANKS[r] + '.' });
        break;
      }
    }
    MEDAL_KEYS.forEach((key, t) => {
      const complete = get('tour.' + t + '.status') === 3;
      const medal = get('medal.' + key);
      if (medal && !complete) out.push({ id: 'medal.' + key, level: 'info', text: 'This medal is awarded for completing Tour ' + (t + 1) + ', which is not marked Complete.' });
      if (complete && !medal) out.push({ id: 'medal.' + key, level: 'info', text: 'Tour ' + (t + 1) + ' is Complete but its medal is not set.' });
    });
    const kalidor = get('medal.kalidor');
    const supported = kalidorLevel(get);
    if (supported > kalidor) {
      out.push({ id: 'medal.kalidor', level: 'info', text: 'The operation scores in this file qualify for the ' + KALIDOR[supported] + ', but the Kalidor Crescent is set to ' + (KALIDOR[kalidor] || kalidor) + '.' });
    }
    const active = [];
    TOUR_SLOTS.forEach((_, t) => {
      const ops = get('tour.' + t + '.ops');
      const last = get('tour.' + t + '.last');
      if (ops >= 1 && ops <= OP_SLOTS[t].length && OP_SLOTS[t][ops - 1].indexOf(last) < 0) {
        out.push({
          id: 'tour.' + t + '.last', level: 'info',
          text: 'Tour ' + (t + 1) + ' has ' + ops + ' operations completed, but its last completed slot (' + (last === 255 ? 'none' : last) +
            ') does not point at operation ' + ops + '. The game may load the wrong next mission; setting Operations completed again fixes it.'
        });
      }
    });
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

  // Operations completed and the last completed slot are one fact, so a compare copy takes both.
  function copyWith(id) {
    const m = /^tour\.(\d)\.(ops|last)$/.exec(id);
    return m ? ['tour.' + m[1] + '.ops', 'tour.' + m[1] + '.last'] : [];
  }

  const HIT_TO_FIRED = {
    'stat.laserCraft': 'stat.laserFired', 'stat.laserGround': 'stat.laserFired',
    'stat.missileCraft': 'stat.missileFired', 'stat.missileGround': 'stat.missileFired'
  };

  // Rules applied when the user turns on "Enforce rules"; each follows a warning above.
  function enforce(id, value, api) {
    if (id === 'pilot.rank' || id === 'pilot.score') { PE.rules.rankScore(api, id, RANK_POINTS, 3); return; }
    if (/^tour\.\d\.op\.\d+$/.test(id)) {
      const level = kalidorLevel(api.get);
      if (level > api.get('medal.kalidor')) api.set('medal.kalidor', level);
      return;
    }
    let m = /^tour\.(\d)\.status$/.exec(id);
    if (m && value === 3) {
      const t = Number(m[1]);
      api.set('medal.' + MEDAL_KEYS[t], true);
      api.set('tour.' + t + '.ops', TOUR_OPS[t]);
      return;
    }
    m = /^medal\.(\w+)$/.exec(id);
    const t = m ? MEDAL_KEYS.indexOf(m[1]) : -1;
    if (t >= 0 && value && api.get('tour.' + t + '.status') !== 3) { api.set('tour.' + t + '.status', 3); return; }
    if (t >= 0 && !value && api.get('tour.' + t + '.status') === 3) { api.set('tour.' + t + '.status', 2); return; }
    PE.rules.hitsWithinFired(api, id, value, HIT_TO_FIRED);
  }

  function blank() {
    const b = new Uint8Array(1705);
    // 0xFF means "no operation completed yet" for each tour, as in ROOKIE.PLT.
    b.fill(255, 743, 751);
    return b;
  }

  const presets = [{
    label: 'Top Ace',
    title: 'Max rank, experience, medals and training; complete historic missions and Tours 1 to 3 (with Enforce rules on, the medals for Tours 4 and 5 also complete those tours)',
    run: api => {
      api.set('pilot.health', 0);
      api.set('pilot.score', 9999);
      api.set('pilot.rank', 5);
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
        note: 'This is the 1706-byte layout of the original X-Wing (it matches 35 original pilot files): from byte 735 on everything sits one byte later than in the 1705-byte Collector\'s CD layout.'
      },
      3410: { half: 1705 }
    },
    theme: { accent: '#e8832a', accent2: '#3d7fd6', glyph: 'X' },
    fields, derived, sections, onChange, enforce, copyWith, warnings, blank, presets,
    summary: g => (RANKS[g('pilot.rank')] || 'Unknown rank') + ' · ' + (HEALTH[g('pilot.health')] || 'Unknown health') +
      ' · ' + g('pilot.score').toLocaleString('en-US') + ' Tour of Duty points'
  };
})(globalThis);
