// Rule helpers shared by the games' enforce hooks (used only when "Enforce rules" is on).
(function (root) {
  const PE = root.PilotEditor = root.PilotEditor || {};

  function earnedRank(points, score) {
    let r = 0;
    for (let i = 0; i < points.length; i++) if (score >= points[i]) r = i;
    return r;
  }

  // Keeps rank and score together. Ranks below firstRequired can also come from other sources, so they need no points.
  function rankScore(api, changedId, points, firstRequired) {
    const rank = api.get('pilot.rank');
    const score = api.get('pilot.score');
    if (changedId === 'pilot.rank') {
      if (rank >= firstRequired && score < points[rank]) api.set('pilot.score', points[rank]);
      else if (rank + 1 < points.length && score >= points[rank + 1]) api.set('pilot.score', points[rank + 1] - 1);
      return;
    }
    const earned = earnedRank(points, score);
    if (earned > rank) api.set('pilot.rank', earned);
    else if (rank >= firstRequired && earned < rank) api.set('pilot.rank', Math.max(earned, firstRequired - 1));
  }

  // points[i] is the score the guide gives for Secret Order level i + 1; 0 and values beyond the guide's six levels have no rule.
  function secretScore(api, changedId, points) {
    const secret = api.get('pilot.secret');
    const score = api.get('pilot.score');
    if (secret < 1 || secret > points.length) return;
    if (changedId === 'pilot.secret') {
      if (score < points[secret - 1]) api.set('pilot.score', points[secret - 1]);
      return;
    }
    let allowed = 0;
    points.forEach((p, i) => { if (score >= p) allowed = i + 1; });
    if (allowed < secret) api.set('pilot.secret', allowed);
  }

  // hitToFired maps each hit counter to the counter it cannot exceed.
  function hitsWithinFired(api, id, value, hitToFired) {
    if (hitToFired[id]) {
      if (value > api.get(hitToFired[id])) api.set(hitToFired[id], value);
      return;
    }
    for (const hit of Object.keys(hitToFired)) {
      if (hitToFired[hit] === id && api.get(hit) > value) api.set(hit, value);
    }
  }

  PE.rules = { earnedRank, rankScore, secretScore, hitsWithinFired };
})(globalThis);
