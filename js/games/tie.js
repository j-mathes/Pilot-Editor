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
  const flags = (id, offset, label, bitLabel, hint, used) =>
    ({ id, type: 'u8', offset, label, kind: 'flags', hint, used, bits: Array.from({ length: 8 }, (_, i) => bitLabel + ' ' + (i + 1)) });

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
  // Mission titles from the Collector's CD-ROM strategy guide.
  const MISSION_NAMES = [
    ['Patrol Jump Point D-34', 'Red Alert', 'Counter-Attack', 'Outpost D-34 Has Fallen', 'Attack Rebel Lt. Cruiser', 'Destroy the Lulsla'],
    ['Respond to S.O.S.', 'Intercept Attack', 'Rescue War Refugees', 'Capture Enemies', 'Guard Resupply'],
    ['Load Base Equipment', 'Destroy Pirate Outpost', 'Hold Position', 'Guard Space Station NL-1', 'Thrawn Inspects NL-1', 'Wait for Relief Forces'],
    ['Escort Convoy', 'Attack the Nharwaak', 'Defend Tech Center', 'Diplomatic Meeting', 'Rebel Arms Deal'],
    ['Mineclearing', 'Assault Gunboat Recon', 'Convoy Attack', 'Tactical Superiority', 'Capture Harkov'],
    ['Protect Prototypes', 'Prevent Rebel Ambush', 'Convoy Escort', 'Punitive Raid'],
    ['Trap the Protector', 'Destroy the Akaga', 'Retribution', 'TIE Defender', 'Save the Emperor'],
    ['Evacuate TIE Advanced Plants', 'Save TIE Advanced Factory', 'Secure TIE Advanced Plant', 'Supply TIE Advanced Plant', 'Capture Mag Pulse Weapon', 'Trapped'],
    ['Capture Platform', 'Hold Platform', 'Protect Evacuation', 'Escort to Rendezvous', 'Trapped by Pirates!', 'Transfer Prototypes'],
    ['Ransom', 'Rescue', 'Under the Gun', 'Missile Boat Diplomacy', 'Rebel Assault', 'Eliminate TIE Defender Factory'],
    ['Intercept Convoy', 'Preemptive Strike', 'Bait and Switch', 'An Unexpected Attack', 'The Real Thing', 'Protect Vorknkx Project', 'Evacuate'],
    ['Escort Prison Ship', 'Deliver Prisoners', 'Attack Bothuwui', 'Attack on Kothlis', 'Bothan Treachery', 'Recon Military Summit', 'Delay Strike Force'],
    ['Surprise Attack', 'Capture the Turncoat', 'Track Down Rebels', 'Missile Boat Trouble', 'Return to Vorknkx', 'Corvette Attack', 'Zaarin Takes the Bait', 'The Trap is Sprung']
  ];
  // Craft and role per mission for battles 1-7, from the original mission file names (F, I, B, A, G, D = craft; M = flight leader, W = wingman).
  const CRAFT_LETTER = { F: 'TIE Fighter', I: 'TIE Interceptor', B: 'TIE Bomber', A: 'TIE Advanced', G: 'Assault Gunboat', D: 'TIE Defender' };
  const MISSION_CRAFT = [
    ['FM', 'FM', 'BM', 'IM', 'GM', 'GM'], ['FW', 'BW', 'IW', 'GW', 'FW'], ['BM', 'BM', 'FM', 'GM', 'BM', 'GM'],
    ['FM', 'BM', 'BM', 'IM', 'GM'], ['IW', 'GW', 'GW', 'AW', 'GW'], ['AW', 'AW', 'GW', 'GW'], ['AM', 'AM', 'AW', 'DW', 'DM']
  ];
  const craftNote = (b, m) => {
    const code = MISSION_CRAFT[b] && MISSION_CRAFT[b][m];
    return code ? ' (' + CRAFT_LETTER[code[0]] + ', ' + (code[1] === 'M' ? 'flight leader' : 'wingman') + ')' : '';
  };
  // Objectives set in the original Top Ace pilots (TOPACE10), which have every goal of battles 1-10 done.
  const SECONDARY_GOALS = [5, 4, 4, 3, 5, 3, 2, 2, 3, 3];
  const BONUS_GOALS = [6, 4, 5, 2, 5, 4, 4, 4, 6, 5];
  // Accumulated score for each rank, from the guide's scoring appendix.
  const RANK_POINTS = [0, 20000, 50000, 100000, 250000, 500000];
  // Secret Order levels 1 to 6 (guide): score needed and missions with secondary goals needed.
  const SECRET_POINTS = [20000, 50000, 100000, 250000, 400000, 800000];
  const SECRET_MISSIONS = [2, 4, 6, 9, 12, 15];
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
  fields.push(sel('pilot.rank', 'u8', 2, 'Rank', RANKS, { hint: 'Score needed (strategy guide): Officer 20,000, Lieutenant 50,000, Captain 100,000, Commander 250,000, General 500,000.' }));
  fields.push(sel('pilot.difficulty', 'u8', 3, 'Difficulty', DIFFICULTY));
  fields.push(num('pilot.score', 'i32', 4, 'Score', { min: 0, max: MAX_SCORE, hint: 'Accumulated score, which decides the rank in the Imperial Navy.' }));
  fields.push(num('pilot.skill', 'u16', 8, 'Skill level', { hint: 'Skill level of the pilot (0 = novice, 65535 = super ace).' }));
  fields.push(sel('pilot.secret', 'u8', 10, 'Secret Order rank', SECRET, { hint: 'Rank in the Emperor\'s Secret Order. In the original game 0 = None up to 6 = Emperor\'s Hand, the six levels of the strategy guide, earned only through secondary goals: 20,000 points and 2 missions with secondary goals, then 50,000/4, 100,000/6, 250,000/9, 400,000/12 and 800,000/15. Values 7 to 9 come from the offsets list and the Top Ace pilots; no document describes them.' }));

  // Levels counted as the simulator shows them; inferred from three pilots made in the game (RUSTY-1, -2 and -3).
  const TRAINING_DONE_LABELS = { 2: 'New pilot (levels 1 and 2 count as done)', 4: 'Level 4 done: training badge' };
  for (let n = 3; n <= 12; n++) if (!TRAINING_DONE_LABELS[n]) TRAINING_DONE_LABELS[n] = 'Level ' + n + ' done';

  SHIPS.forEach((name, i) => {
    fields.push(num('training.' + i + '.next', 'u8', 29 + i, name + ' next training level', {
      softMax: 21,
      hint: 'The level chosen at the start of the last training run, counting from 0, so 2 means level 3. A new pilot has 0. It stayed 0 after level 1 was finished and level 2 begun (RUSTY-2) and became 2 after starting at level 3 (RUSTY-3).'
    }));
    fields.push(num('training.' + i + '.score', 'u32', 42 + 4 * i, name + ' training score', {
      max: MAX_SCORE,
      hint: 'Highest score of any training run with this craft (confirmed by the owner). The game keeps each run in TRAIN.HGH, not in the pilot file.'
    }));
    fields.push(num('training.' + i + '.done', 'u8', 90 + i, name + ' highest training level completed', {
      softMax: 20,
      hint: 'Highest training level completed. A new pilot has 2, so levels 1 to 3 can be chosen; finishing level 4 gives the training badge and sets 4. The course repeats with harder levels, and 6 and 7 have been seen (7 in LUKE-2). The game never lowers it when a lower level is replayed.',
      valueLabels: TRAINING_DONE_LABELS
    }));
  });

  SHIPS.forEach((name, s) => {
    for (let m = 0; m < 4; m++) {
      fields.push(chk('hist.' + s + '.' + m + '.done', 520 + 8 * s + m, name + ' historic mission ' + (m + 1) + ' complete'));
      fields.push(num('hist.' + s + '.' + m + '.score', 'u32', 136 + 32 * s + 4 * m, name + ' historic mission ' + (m + 1) + ' score', { max: MAX_SCORE }));
    }
  });

  fields.push(sel('battle.active', 'u8', 616, 'Active battle', BATTLES.map((n, i) => 'Battle ' + (i + 1) + ': ' + n), {
    hint: 'The battle the pilot is in. Order of play: battles 1 to 4 in any order, then 5 and/or 6, then 7, then 8 and/or 9, then 10, then 11 and/or 12, then 13.'
  }));
  BATTLES.forEach((name, b) => {
    const p = 'Battle ' + (b + 1);
    fields.push(sel('battle.' + b + '.status', 'u8', 617 + b, p + ' status', BATTLE_STATUS));
    // The samples use 8 as "finished" in every battle, whatever its mission count.
    fields.push(num('battle.' + b + '.last', 'u8', 637 + b, p + ' last mission completed', { max: 8, hint: 'Last mission completed (0 = none). Finished battles use 8.' }));
    fields.push(flags('battle.' + b + '.secondary', 913 + b, p + ' secondary objectives', 'Secondary',
      'Secondary goals completed in this battle; they raise your rank in the Secret Order. Each box is the next goal of this kind.', SECONDARY_GOALS[b]));
    fields.push(flags('battle.' + b + '.bonus', 933 + b, p + ' bonus objectives', 'Bonus',
      'Bonus goals completed in this battle; they add to your score and help promotion in the Imperial Navy. Each box is the next goal of this kind.', BONUS_GOALS[b]));
    for (let m = 0; m < MISSIONS[b]; m++) {
      fields.push(num('battle.' + b + '.score.' + m, 'u32', 986 + 32 * b + 4 * m, p + ' mission ' + (m + 1) + ' (' + MISSION_NAMES[b][m] + ') score', { max: MAX_SCORE }));
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
        rows: Array.from({ length: MISSIONS[b] }, (_, m) => ({ label: (m + 1) + ': ' + MISSION_NAMES[b][m] + craftNote(b, m), cells: ['battle.' + b + '.score.' + m] })),
        actions: [{
          label: 'Mark battle finished', title: 'Set this battle to Done, last mission 8, all objectives ticked (scores are not changed)',
          run: api => {
            api.set('battle.' + b + '.status', 3);
            api.set('battle.' + b + '.last', 8);
            api.set('battle.' + b + '.secondary', 255);
            api.set('battle.' + b + '.bonus', 255);
          }
        }, {
          label: 'Max scores', title: 'Set every mission score in this battle to 2,046,820,351, the game\'s limit (can be undone)',
          run: api => { for (let m = 0; m < MISSIONS[b]; m++) api.set('battle.' + b + '.score.' + m, MAX_SCORE); }
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
        type: 'table', title: 'Training simulator', columns: ['Next level (from 0)', 'Best score', 'Highest level completed'],
        rows: SHIPS.map((name, i) => ({ label: name, cells: ['training.' + i + '.next', 'training.' + i + '.score', 'training.' + i + '.done'] })),
        actions: [{
          label: 'Max all best scores', title: 'Set every training best score to 2,046,820,351, the game\'s limit (can be undone)',
          run: api => SHIPS.forEach((_, i) => api.set('training.' + i + '.score', MAX_SCORE))
        }]
      }]
    },
    {
      id: 'historic', title: 'Historic combat',
      blocks: [{
        type: 'table', title: 'Combat Chamber missions (complete, score)', columns: ['Mission 1', 'Mission 2', 'Mission 3', 'Mission 4'],
        rows: SHIPS.map((name, s) => ({
          label: name,
          cells: Array.from({ length: 4 }, (_, m) => ['hist.' + s + '.' + m + '.done', 'hist.' + s + '.' + m + '.score'])
        })),
        actions: [{
          label: 'Mark all complete', title: 'Tick every historic mission as complete (scores are not changed)',
          run: api => SHIPS.forEach((_, s) => { for (let m = 0; m < 4; m++) api.set('hist.' + s + '.' + m + '.done', true); })
        }, {
          label: 'Max all scores', title: 'Set every historic mission score to 2,046,820,351, the game\'s limit (completion ticks are not changed)',
          run: api => SHIPS.forEach((_, s) => { for (let m = 0; m < 4; m++) api.set('hist.' + s + '.' + m + '.score', MAX_SCORE); })
        }, {
          label: 'Clear all', title: 'Untick every historic mission and set its score to 0',
          run: api => SHIPS.forEach((_, s) => {
            for (let m = 0; m < 4; m++) { api.set('hist.' + s + '.' + m + '.done', false); api.set('hist.' + s + '.' + m + '.score', 0); }
          })
        }]
      }]
    },
    {
      id: 'stats', title: 'Statistics', layout: 'columns',
      blocks: [
        {
          type: 'table', title: 'Kills by ship type', searchable: true, split: true, columns: ['Kills'],
          rows: NPC.map((name, i) => ({ label: name, cells: ['stat.npc.' + i] }))
        },
        {
          type: 'form', layout: 'list', boxed: true, title: 'Totals, weapons and losses',
          items: ['stat.kills', { derived: 'stat.npcSum' }, 'stat.captures', 'stat.laserFired', 'stat.laserHit', { derived: 'stat.laserAcc' },
            'stat.warheadFired', 'stat.warheadHit', { derived: 'stat.warheadAcc' }, 'stat.lost']
        }
      ]
    },
    {
      id: 'campaign', title: 'Battles',
      blocks: [{ type: 'form', items: ['battle.active'] }, { type: 'cards', cards: battleCards }]
    },
    { id: 'raw', title: 'Raw bytes', blocks: [{ type: 'hex' }] }
  ];

  const secondaryGoalsDone = get => {
    let n = 0;
    for (let b = 0; b < BATTLES.length; b++) for (let v = get('battle.' + b + '.secondary'); v; v >>= 1) n += v & 1;
    return n;
  };

  function warnings(get) {
    const out = [];
    const rank = get('pilot.rank');
    const score = get('pilot.score');
    if (rank >= 1 && rank < RANK_POINTS.length && score < RANK_POINTS[rank]) {
      out.push({ id: 'pilot.rank', level: 'info', text: RANKS[rank] + ' normally needs a score of ' + RANK_POINTS[rank].toLocaleString('en-US') + '; this pilot has ' + score.toLocaleString('en-US') + '.' });
    }
    for (let r = RANK_POINTS.length - 1; r > rank; r--) {
      if (score >= RANK_POINTS[r]) {
        out.push({ id: 'pilot.rank', level: 'info', text: 'A score of ' + score.toLocaleString('en-US') + ' normally earns the rank of ' + RANKS[r] + '.' });
        break;
      }
    }
    const secret = get('pilot.secret');
    if (secret >= 1 && secret <= SECRET_POINTS.length) {
      if (score < SECRET_POINTS[secret - 1]) {
        out.push({ id: 'pilot.secret', level: 'info', text: SECRET[secret] + ' normally needs a score of ' + SECRET_POINTS[secret - 1].toLocaleString('en-US') + '; this pilot has ' + score.toLocaleString('en-US') + '.' });
      }
      const goals = secondaryGoalsDone(get);
      if (goals < SECRET_MISSIONS[secret - 1]) {
        out.push({ id: 'pilot.secret', level: 'info', text: SECRET[secret] + ' normally needs ' + SECRET_MISSIONS[secret - 1] + ' missions with secondary goals, so at least that many secondary goals ticked; this pilot has ' + goals + '.' });
      }
    }
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

  const HIT_TO_FIRED = { 'stat.laserHit': 'stat.laserFired', 'stat.warheadHit': 'stat.warheadFired' };

  // Rules applied when the user turns on "Enforce rules"; each follows a warning above.
  function enforce(id, value, api) {
    if (id === 'pilot.rank' || id === 'pilot.score') PE.rules.rankScore(api, id, RANK_POINTS, 1);
    if (id === 'pilot.score' || id === 'pilot.secret') { PE.rules.secretScore(api, id, SECRET_POINTS); return; }
    if (id === 'pilot.rank') return;
    const m = /^battle\.(\d+)\.status$/.exec(id);
    if (m && value === 3) { api.set('battle.' + m[1] + '.last', 8); return; }
    if (/^stat\.npc\.\d+$/.test(id)) { api.set('stat.kills', sumNpc(api.get)); return; }
    PE.rules.hitsWithinFired(api, id, value, HIT_TO_FIRED);
  }

  // Identical to a pilot created in the game (RUSTY-1.TFR): difficulty Medium and twelve training bytes at 2.
  function blank() {
    const b = new Uint8Array(3856);
    for (const base of [0, 1928]) {
      b[base + 3] = 1;
      b.fill(2, base + 90, base + 102);
    }
    return b;
  }

  // The original game ships Top Ace pilots with battles 1-7 or 1-10 finished and every goal of those battles done.
  const topAce = (battles, secret) => api => {
    api.set('pilot.health', 0);
    api.set('pilot.rank', 5);
    api.set('pilot.skill', 65535);
    api.set('pilot.secret', secret);
    for (let b = 0; b < battles; b++) {
      api.set('battle.' + b + '.status', 3);
      api.set('battle.' + b + '.last', 8);
      api.set('battle.' + b + '.secondary', (1 << SECONDARY_GOALS[b]) - 1);
      api.set('battle.' + b + '.bonus', (1 << BONUS_GOALS[b]) - 1);
    }
  };

  const presets = [{
    label: 'Top Ace: battles 1-10 done',
    title: 'Max rank and skill, top Secret Order rank, battles 1 to 10 finished with all goals (like the TOPACE10 sample)',
    run: topAce(10, 9)
  }, {
    label: 'Top Ace: battles 1-7 done',
    title: 'Max rank and skill, Secret Order value 6, battles 1 to 7 finished with all goals (like the TOPACE7 sample)',
    run: topAce(7, 6)
  }];

  PE.games.tie = {
    id: 'tie',
    name: 'TIE Fighter',
    pilotTitle: 'TIE Fighter Pilot',
    ext: ['.tfr'],
    variants: {
      3856: {
        half: 1928,
        use: 'for TIE Fighter 1994, 1995 or 1998',
        detail: 'New pilots from the 1994, 1995 and 1998 versions are byte for byte identical, so any of them can open this file.'
      }
    },
    theme: { accent: '#4fae6a', accent2: '#8d99a6', glyph: 'T' },
    fields, derived, sections, enforce, warnings, blank, presets,
    summary: g => (RANKS[g('pilot.rank')] || 'Unknown rank') + ' · ' + (HEALTH[g('pilot.health')] || 'Unknown status') +
      ' · score ' + g('pilot.score').toLocaleString('en-US')
  };
})(globalThis);
