// TIE Fighter (.tfr) pilot definition: field table, sections and rules.
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};
  PE.games = PE.games || {};

  const options = labels => labels.map((label, value) => ({ value, label }));
  const num = (id, type, offset, label, extra) =>
    Object.assign({ id, type, offset, label, kind: 'number' }, extra);
  const sel = (id, type, offset, label, labels, extra) =>
    Object.assign({ id, type, offset, label, kind: 'enum', options: options(labels), max: labels.length - 1 }, extra);
  const chk = (id, offset, label) => ({ id, type: 'u8', offset, label, kind: 'bool' });
  const flags = (id, offset, label, bitLabel) =>
    ({ id, type: 'u8', offset, label, kind: 'flags', hint: 'Each box is one objective; tick the ones completed.', bits: Array.from({ length: 8 }, (_, i) => bitLabel + ' ' + (i + 1)) });

  const MAX_SCORE = 2046820351; // 0x79FFFFFF, the game's limit for 'long' values

  const HEALTH = ['Alive', 'Captured', 'Killed'];
  const RANKS = ['Cadet', 'Officer', 'Lieutenant', 'Captain', 'Commander', 'General'];
  const DIFFICULTY = ['Easy', 'Medium', 'Hard'];
  const SECRET = ['None', 'First Initiate', 'Second Circle', 'Third Circle', 'Fourth Circle', 'Inner Circle',
    "Emperor's Hand", "Emperor's Eyes", "Emperor's Voice", "Emperor's Reach"];
  const SHIPS = ['TIE Fighter', 'TIE Interceptor', 'TIE Bomber', 'TIE Advanced', 'Assault Gunboat', 'TIE Defender', 'Missile Boat'];
  const BATTLE_STATUS = ['Inactive', 'Active', 'Pending', 'Done'];
  const BATTLES = ['The Aftermath of Hoth', 'The Sepan Civil War', 'Battle on the Frontier', 'Conflict at Mylock IV',
    'Battle for Honor', 'Arms Race', 'Treachery at Ottega', 'Strategic Warfare', 'TIE Defender Technology',
    'New Threats', 'Hunt for Zaarin', 'Prelude to Endor', "The Emperor's Will"];
  const MISSIONS = [6, 5, 6, 5, 5, 4, 5, 6, 6, 6, 7, 7, 8];
  const NPC = ['X-Wing', 'Y-Wing', 'A-Wing', 'B-Wing', 'TIE Fighter', 'TIE Interceptor', 'TIE Bomber', 'TIE Advanced',
    'TIE Defender', 'TIE New 1', 'TIE New 2', 'Missile Boat', 'T-Wing', 'Z-95 Headhunter', 'R-41 Starchaser',
    'Assault Gunboat', 'Tyderian Shuttle', 'Escort Shuttle', 'Patrol Craft', 'Scout Craft', 'Transport',
    'Assault Transport', 'Escort Transport', 'Tug', 'Combat Utility Vehicle', 'Container A', 'Container B',
    'Container C', 'Container D', 'Heavy Lifter', 'Bulk Barge', 'Freighter', 'Cargo Ferry', 'Modular Conveyor',
    'Con Transport', 'New Freighter 3', 'Murrian Transport', 'Corellian Transport', 'Millennium Falcon', 'Corvette',
    'Modified Corvette', 'Nebulon-B Frigate', 'Modified Frigate', 'C-3 Passenger Liner', 'Carrack Cruiser',
    'Strike Cruiser', 'Escort Carrier', 'Dreadnaught', 'Calamari Cruiser', 'Light Calamari', 'Interdictor',
    'Victory-class Star Destroyer', 'Star Destroyer', 'Super Star Destroyer', 'Container E', 'Container F',
    'Container G', 'Container H', 'Container I', 'Platform Class A', 'Platform Class B', 'Platform Class C',
    'Platform Class D', 'Platform Class E', 'Platform Class F', 'R&D Facility', 'Laser Battery', 'Weapons Launcher',
    'X/7 Factory Station'];

  const fields = [];
  fields.push(sel('pilot.health', 'u8', 1, 'Duty status', HEALTH));
  fields.push(sel('pilot.rank', 'u8', 2, 'Rank', RANKS));
  fields.push(sel('pilot.difficulty', 'u8', 3, 'Difficulty', DIFFICULTY));
  fields.push(num('pilot.score', 'i32', 4, 'Score', { min: 0, max: MAX_SCORE }));
  fields.push(num('pilot.skill', 'u16', 8, 'Skill level', { hint: 'Skill level of the pilot (0 = novice, 65535 = super ace).' }));
  fields.push(sel('pilot.secret', 'u8', 10, 'Secret Order rank', SECRET, { hint: 'Rank in the Emperor\'s Secret Order.' }));

  SHIPS.forEach((name, i) => {
    fields.push(num('training.' + i + '.next', 'u8', 29 + i, name + ' next training level', { softMax: 21, hint: 'The next training level offered for this craft.' }));
    fields.push(num('training.' + i + '.score', 'u32', 42 + 4 * i, name + ' training score', { max: MAX_SCORE }));
    fields.push(num('training.' + i + '.done', 'u8', 90 + i, name + ' training level completed', {
      softMax: 20, hint: 'Training status for this craft. Seen in files: 2 = not completed, 4 = certificate.', valueLabels: { 2: 'Not completed', 4: 'Certificate' }
    }));
  });

  SHIPS.forEach((name, s) => {
    for (let m = 0; m < 4; m++) {
      fields.push(chk('hist.' + s + '.' + m + '.done', 520 + 8 * s + m, name + ' historic mission ' + (m + 1) + ' complete'));
      fields.push(num('hist.' + s + '.' + m + '.score', 'u32', 136 + 32 * s + 4 * m, name + ' historic mission ' + (m + 1) + ' score', { max: MAX_SCORE }));
    }
  });

  fields.push(sel('battle.active', 'u8', 616, 'Active battle', BATTLES.map((n, i) => 'Battle ' + (i + 1) + ': ' + n)));
  BATTLES.forEach((name, b) => {
    const p = 'Battle ' + (b + 1);
    fields.push(sel('battle.' + b + '.status', 'u8', 617 + b, p + ' status', BATTLE_STATUS));
    // The samples use 8 as "finished" in every battle, whatever its mission count.
    fields.push(num('battle.' + b + '.last', 'u8', 637 + b, p + ' last mission completed', { max: 8, hint: 'Last mission completed (0 = none). Finished battles use 8.' }));
    fields.push(flags('battle.' + b + '.secondary', 913 + b, p + ' secondary objectives', 'Secondary'));
    fields.push(flags('battle.' + b + '.bonus', 933 + b, p + ' bonus objectives', 'Bonus'));
    for (let m = 0; m < MISSIONS[b]; m++) {
      fields.push(num('battle.' + b + '.score.' + m, 'u32', 986 + 32 * b + 4 * m, p + ' mission ' + (m + 1) + ' score', { max: MAX_SCORE }));
    }
  });

  fields.push(num('stat.kills', 'u16', 1626, 'Total kills', { hint: 'Total kills. Compare with the sum of kills by type shown beside it.' }));
  fields.push(num('stat.captures', 'u16', 1628, 'Total captures'));
  NPC.forEach((name, i) => fields.push(num('stat.npc.' + i, 'u16', 1632 + 2 * i, name + ' kills')));
  fields.push(num('stat.laserFired', 'u32', 1908, 'Lasers fired'));
  fields.push(num('stat.laserHit', 'u32', 1912, 'Laser hits'));
  fields.push(num('stat.warheadFired', 'u16', 1920, 'Warheads fired'));
  fields.push(num('stat.warheadHit', 'u16', 1922, 'Warhead hits'));
  fields.push(num('stat.lost', 'u16', 1926, 'Craft lost'));

  const pct = (hits, fired) => fired === 0 ? '(0%)' : Math.floor(hits / fired * 100) + '%';
  const sumNpc = get => {
    let s = 0;
    for (let i = 0; i < NPC.length; i++) s += get('stat.npc.' + i);
    return s;
  };

  const derived = {
    'stat.laserAcc': { label: 'Laser accuracy', compute: g => pct(g('stat.laserHit'), g('stat.laserFired')) },
    'stat.warheadAcc': { label: 'Warhead accuracy', compute: g => pct(g('stat.warheadHit'), g('stat.warheadFired')) },
    'stat.npcSum': {
      label: 'Sum of kills by type',
      compute: sumNpc,
      sync: { id: 'stat.kills', label: 'Set total kills to this sum', value: sumNpc }
    }
  };
  BATTLES.forEach((_, b) => {
    derived['battle.' + b + '.total'] = {
      label: 'Total score',
      compute: g => {
        let s = 0;
        for (let m = 0; m < MISSIONS[b]; m++) s += g('battle.' + b + '.score.' + m);
        return s;
      }
    };
  });

  const battleCards = BATTLES.map((name, b) => ({
    id: 'battle' + b,
    title: 'Battle ' + (b + 1) + ': ' + name,
    badge: g => ({ text: BATTLE_STATUS[g('battle.' + b + '.status')] || 'Unknown', tone: ['idle', 'active', 'warn', 'done'][g('battle.' + b + '.status')] || 'warn' }),
    progress: g => ({ value: Math.min(g('battle.' + b + '.last'), MISSIONS[b]), total: MISSIONS[b] }),
    total: derived['battle.' + b + '.total'].compute,
    blocks: [
      { type: 'form', items: [{ id: 'battle.' + b + '.status', label: 'Status' }, { id: 'battle.' + b + '.last', label: 'Last mission completed (8 = finished)' }, { derived: 'battle.' + b + '.total' }] },
      { type: 'form', items: [{ id: 'battle.' + b + '.secondary', label: 'Secondary objectives' }, { id: 'battle.' + b + '.bonus', label: 'Bonus objectives' }] },
      {
        type: 'table', title: 'Mission scores', columns: ['Score'],
        rows: Array.from({ length: MISSIONS[b] }, (_, m) => ({ label: 'Mission ' + (m + 1), cells: ['battle.' + b + '.score.' + m] })),
        actions: [{
          label: 'Mark battle finished', title: 'Set this battle to Done, last mission 8, all objectives ticked (scores are not changed)',
          run: api => {
            api.set('battle.' + b + '.status', 3);
            api.set('battle.' + b + '.last', 8);
            api.set('battle.' + b + '.secondary', 255);
            api.set('battle.' + b + '.bonus', 255);
          }
        }, {
          label: 'Clear scores', title: 'Set every mission score in this battle to 0',
          run: api => { for (let m = 0; m < MISSIONS[b]; m++) api.set('battle.' + b + '.score.' + m, 0); }
        }]
      }
    ]
  }));

  const sections = [
    {
      id: 'pilot', title: 'Pilot',
      blocks: [{ type: 'form', layout: 'list', items: ['pilot.health', 'pilot.rank', 'pilot.difficulty', 'pilot.score', 'pilot.skill', 'pilot.secret'] }]
    },
    {
      id: 'training', title: 'Training',
      blocks: [{
        type: 'table', title: 'Training simulator', columns: ['Next level', 'Best score', 'Level completed'],
        rows: SHIPS.map((name, i) => ({ label: name, cells: ['training.' + i + '.next', 'training.' + i + '.score', 'training.' + i + '.done'] }))
      }]
    },
    {
      id: 'historic', title: 'Historic combat',
      blocks: [{
        type: 'table', title: 'Missions (complete, score)', columns: ['Mission 1', 'Mission 2', 'Mission 3', 'Mission 4'],
        rows: SHIPS.map((name, s) => ({
          label: name,
          cells: Array.from({ length: 4 }, (_, m) => ['hist.' + s + '.' + m + '.done', 'hist.' + s + '.' + m + '.score'])
        })),
        actions: [{
          label: 'Mark all complete', title: 'Tick every historic mission as complete (scores are not changed)',
          run: api => SHIPS.forEach((_, s) => { for (let m = 0; m < 4; m++) api.set('hist.' + s + '.' + m + '.done', true); })
        }, {
          label: 'Clear all', title: 'Untick every historic mission and set its score to 0',
          run: api => SHIPS.forEach((_, s) => {
            for (let m = 0; m < 4; m++) { api.set('hist.' + s + '.' + m + '.done', false); api.set('hist.' + s + '.' + m + '.score', 0); }
          })
        }]
      }]
    },
    {
      id: 'stats', title: 'Statistics',
      blocks: [
        {
          type: 'form', title: 'Totals and weapons',
          items: ['stat.kills', { derived: 'stat.npcSum' }, 'stat.captures', 'stat.laserFired', 'stat.laserHit', { derived: 'stat.laserAcc' },
            'stat.warheadFired', 'stat.warheadHit', { derived: 'stat.warheadAcc' }, 'stat.lost']
        },
        {
          type: 'table', title: 'Kills by ship type', searchable: true, columns: ['Kills'],
          rows: NPC.map((name, i) => ({ label: name, cells: ['stat.npc.' + i] }))
        }
      ]
    },
    {
      id: 'campaign', title: 'Battles',
      blocks: [{ type: 'form', items: ['battle.active'] }, { type: 'cards', cards: battleCards }]
    },
    { id: 'raw', title: 'Raw bytes', blocks: [{ type: 'hex' }] }
  ];

  function warnings(get) {
    const out = [];
    if (get('stat.laserHit') > get('stat.laserFired')) out.push({ id: 'stat.laserHit', level: 'warn', text: 'Laser hits exceed lasers fired.' });
    if (get('stat.warheadHit') > get('stat.warheadFired')) out.push({ id: 'stat.warheadHit', level: 'warn', text: 'Warhead hits exceed warheads fired.' });
    const sum = sumNpc(get);
    if (sum !== get('stat.kills')) out.push({ id: 'stat.kills', level: 'info', text: 'Total kills (' + get('stat.kills') + ') differs from the sum by type (' + sum + ').' });
    BATTLES.forEach((_, b) => {
      if (get('battle.' + b + '.status') === 3 && get('battle.' + b + '.last') !== 8) {
        out.push({ id: 'battle.' + b + '.last', level: 'info', text: 'Battle ' + (b + 1) + ' is Done but last mission completed is not 8 (the value finished battles use).' });
      }
    });
    return out;
  }

  function blank() {
    const b = new Uint8Array(3856);
    for (const base of [0, 1928]) {
      b.fill(2, base + 90, base + 97);
      b[base + 617] = 1;
    }
    return b;
  }

  const presets = [{
    label: 'Top Ace',
    title: 'Max rank and skill, top Secret Order rank, first 10 battles finished (like the TOPACE10 sample)',
    run: api => {
      api.set('pilot.health', 0);
      api.set('pilot.rank', 5);
      api.set('pilot.skill', 65535);
      api.set('pilot.secret', 9);
      // Mirrors the TOPACE10 sample: the first 10 battles finished.
      for (let b = 0; b < 10; b++) {
        api.set('battle.' + b + '.status', 3);
        api.set('battle.' + b + '.last', 8);
        api.set('battle.' + b + '.secondary', 255);
        api.set('battle.' + b + '.bonus', 255);
      }
    }
  }];

  PE.games.tie = {
    id: 'tie',
    name: 'TIE Fighter',
    pilotTitle: 'TIE Fighter Pilot',
    ext: ['.tfr'],
    variants: { 3856: { half: 1928 } },
    theme: { accent: '#4fae6a', accent2: '#8d99a6', glyph: 'T' },
    fields, derived, sections, warnings, blank, presets,
    summary: g => (RANKS[g('pilot.rank')] || 'Unknown rank') + ' · ' + (HEALTH[g('pilot.health')] || 'Unknown status') +
      ' · score ' + g('pilot.score').toLocaleString('en-US')
  };
})(globalThis);
