// Post-game analysis: timing, score economy, per-crew and per-round numbers. No DOM, no rules: it reads a
// game record (the same object as the downloaded log) and returns plain data, so Node tests and any tab can
// use it. Files: .md (readable report with the data embedded, loads back), .csv (one row per crew per round).
//
//   new Timer(now) / timer.observe(view, now)   wall-clock per round and per decision, from successive views
//   computeStats(record)                        -> stats object (kind "hood-sorcery-stats")
//   statsMarkdown(stats), statsCsv(stats)       -> text files
//   parseStatsFile(text)                        -> stats, from a .md report, a stats .json or a game log .json

export const STATS_KIND = "hood-sorcery-stats";
const MD_MARK = "<!-- hood-sorcery-stats data: this block lets the playtest site load the report back -->";

/** Watches views (any role) and records when rounds start and when each seat answered a decision. */
export class Timer {
  constructor(now) { this.t = { start: now, end: null, rounds: {}, decisions: [] }; this.pend = null; }
  observe(v, now) {
    const t = this.t;
    if (!v) return;
    if (v.round && !(v.round in t.rounds)) t.rounds[v.round] = now;
    const key = v.pending ? `${v.round}|${v.stepIdx}|${v.pending.step}` : null;
    const done = v.pending?.done || [];
    if (this.pend && (this.pend.key !== key || done.length < this.pend.done.size)) {
      // the step finished: whoever had not answered yet answered just now
      for (const pid of this.pend.who) if (!this.pend.done.has(pid)) this._add(pid, now);
      this.pend = null;
    }
    if (key && !this.pend) this.pend = { key, round: v.round, step: v.pending.step, since: now, who: [...v.pending.who], done: new Set() };
    if (this.pend) for (const pid of done) if (!this.pend.done.has(pid)) { this.pend.done.add(pid); this._add(pid, now); }
    if (v.over && t.end == null) t.end = now;
  }
  _add(pid, now) { this.t.decisions.push({ r: this.pend.round, step: this.pend.step, pid, ms: now - this.pend.since }); }
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * @param rec {{mode, players, log?, result?, seed?, setup?, timing?, wheelNames?, date?}} a game log (version 1 or 2)
 */
export function computeStats(rec) {
  const { track, best } = rec.mode.win;
  const lowWins = best === "lowest";
  const unit = track === "rep" ? "Rep" : "damage";
  const R = Math.max(0, ...rec.players.map((p) => p.hist.length));
  const wheelName = (id) => rec.wheelNames?.[id] || id || "";
  const timing = rec.timing || null;
  const hist = (p, r) => p.hist.find((h) => h.r === r);

  // standings after each round (1 = best), for lead changes and comebacks
  const totalsAt = (r) => rec.players.map((p) => hist(p, r)?.[track] ?? 0);
  const placesAt = (r) => {
    const t = totalsAt(r);
    return t.map((x) => 1 + t.filter((y) => (lowWins ? y < x : y > x)).length);
  };
  const rounds = [];
  let leadChanges = 0, lastLeader = null;
  for (let r = 1; r <= R; r++) {
    const totals = totalsAt(r);
    const prev = r > 1 ? totalsAt(r - 1) : totals.map(() => 0);
    const deltas = totals.map((x, i) => x - prev[i]);
    const places = placesAt(r);
    const leaders = places.map((pl, i) => (pl === 1 ? i : -1)).filter((i) => i >= 0);
    if (leaders.length === 1) {
      if (lastLeader != null && leaders[0] !== lastLeader) leadChanges++;
      lastLeader = leaders[0];
    }
    const wheel = rec.players.map((p) => hist(p, r)?.wheel).find(Boolean);
    const start = timing?.rounds?.[r], end = timing?.rounds?.[r + 1] ?? (r === R ? timing?.end : null);
    rounds.push({ r, wheel: wheelName(wheel), deltas, totals, leaders, tableDelta: sum(deltas), sec: start != null && end != null ? r1((end - start) / 1000) : null });
  }

  const order = rec.result?.order || (R ? placesAt(R).map((pl, i) => [pl, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]) : rec.players.map((p) => p.id ?? 0));
  // end-of-game payouts can still change who leads
  if (rec.result && lastLeader != null && order[0] !== lastLeader && rec.players[order[0]].tracks?.[track] !== rec.players[lastLeader].tracks?.[track]) leadChanges++;
  const players = rec.players.map((p, i) => {
    const hs = p.hist;
    const deltas = rounds.map((x) => x.deltas[i]);
    const taken = hs.map((h) => h.dmg ?? 0);
    const rolls = hs.flatMap((h) => h.rolls || []);
    let zonesTaken = 0;
    hs.forEach((h, k) => { zonesTaken += (h.holds || []).filter((z) => !(hs[k - 1]?.holds || []).includes(z)).length; });
    const places = rounds.map((x) => placesAt(x.r)[i]);
    const dec = (timing?.decisions || []).filter((d) => d.pid === i);
    const pick = (fn) => (deltas.length ? deltas.reduce((a, d, k) => (fn(d, deltas[a]) ? k : a), 0) + 1 : null);
    const better = (a, b) => (lowWins ? a < b : a > b);
    const final = p.tracks?.[track] ?? rounds[R - 1]?.totals[i] ?? 0;
    return {
      name: p.name, crew: p.crew, color: p.color, kind: p.kind,
      final,
      endAdjust: final - (rounds[R - 1]?.totals[i] ?? 0), // end-of-game payouts (Posted Up) land after the last round
      place: order.indexOf(i) + 1,
      deltas, totals: rounds.map((x) => x.totals[i]),
      bestRound: pick(better), worstRound: pick((a, b) => better(b, a)),
      worstPlace: places.length ? Math.max(...places) : null,
      avgAtk: r1(avg(hs.map((h) => h.atk))), avgBlk: r1(avg(hs.map((h) => h.blk))), avgLen: r1(avg(hs.map((h) => h.len))),
      avgCards: hs.some((h) => h.cards != null) ? r1(avg(hs.map((h) => h.cards ?? 0))) : null,
      thumbsUsed: rolls.length, thumbAvg: rolls.length ? r1(avg(rolls)) : null,
      damageTaken: track === "damage" ? sum(taken) : null,
      healed: track === "damage" ? sum(taken) - (p.tracks?.damage ?? 0) : null,
      zoneRounds: sum(hs.map((h) => (h.holds || []).length)), zonesTaken,
      decisions: dec.length, avgDecisionSec: dec.length ? r1(avg(dec.map((d) => d.ms)) / 1000) : null,
    };
  });

  const wheelCounts = {};
  for (const x of rounds) if (x.wheel) wheelCounts[x.wheel] = (wheelCounts[x.wheel] || 0) + 1;
  const ranked = [...players].sort((a, b) => a.place - b.place);
  const winner = ranked[0];
  const humanDec = (timing?.decisions || []).filter((d) => rec.players[d.pid]?.kind !== "bot");
  const roundSecs = rounds.map((x) => x.sec).filter((x) => x != null);
  const logCount = (k) => (rec.log || []).filter((e) => e.k === k).length;
  return {
    kind: STATS_KIND, version: 1,
    generated: rec.date || null,
    mode: { id: rec.mode.id, name: rec.mode.name, modifiers: (rec.mode.modifiers || []).map((id) => rec.modifierNames?.[id] || id) },
    seed: rec.seed ?? rec.setup?.seed ?? null,
    track, unit, best, roundsPlayed: R, roundsPlanned: rec.mode.params?.rounds ?? R, over: !!rec.result,
    winner: rec.result ? winner?.name : null,
    players, rounds,
    economy: {
      tableTotal: sum(players.map((p) => p.final)),
      endAdjustTotal: sum(players.map((p) => p.endAdjust)),
      perRoundAvg: r1(avg(rounds.map((x) => x.tableDelta))),
      biggestRound: rounds.length ? rounds.reduce((a, x) => (Math.abs(x.tableDelta) > Math.abs(a.tableDelta) ? x : a)).r : null,
      healedTotal: track === "damage" ? sum(players.map((p) => p.healed)) : null,
      thumbsUsed: sum(players.map((p) => p.thumbsUsed)),
      cardsCast: players.some((p) => p.avgCards != null) ? sum(rec.players.flatMap((p) => p.hist.map((h) => h.cards ?? 0))) : null,
      reshuffles: logCount("shuffle"), rolloffs: logCount("rolloff"),
      leadChanges, finalMargin: ranked.length > 1 ? Math.abs(ranked[0].final - ranked[1].final) : 0,
      winnerWorstPlace: winner?.worstPlace ?? null,
      wheelCounts,
    },
    time: timing ? {
      startedAt: new Date(timing.start).toISOString(),
      durationSec: r1(((timing.end ?? timing.last ?? timing.start) - timing.start) / 1000),
      avgRoundSec: roundSecs.length ? r1(avg(roundSecs)) : null,
      slowestRound: roundSecs.length ? rounds.filter((x) => x.sec != null).reduce((a, x) => (x.sec > a.sec ? x : a)).r : null,
      humanDecisions: humanDec.length,
      avgHumanDecisionSec: humanDec.length ? r1(avg(humanDec.map((d) => d.ms)) / 1000) : null,
      partial: !(1 in (timing.rounds || {})),
    } : null,
  };
}

const sign = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "0");
const cell = (x) => (x == null ? "–" : String(x).replace(/\|/g, "/"));
const row = (a) => `| ${a.map(cell).join(" | ")} |`;
const table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

export function statsMarkdown(s) {
  const e = s.economy, t = s.time;
  const title = `${s.mode.name}${s.mode.modifiers.length ? " + " + s.mode.modifiers.join(", ") : ""}`;
  const out = [
    `# Hood Sorcery game stats: ${title}`,
    "",
    `- **Result:** ${s.over ? `${s.winner} wins` : `in progress (round ${s.roundsPlayed} of ${s.roundsPlanned})`} · ${s.best === "lowest" ? "least" : "most"} ${s.unit} wins`,
    `- **Seed:** ${s.seed ?? "–"} · **Rounds:** ${s.roundsPlayed}/${s.roundsPlanned}${s.generated ? ` · **Saved:** ${s.generated}` : ""}`,
    t ? `- **Time:** ${fmtSec(t.durationSec)} total · ${fmtSec(t.avgRoundSec)} per round (slowest: round ${t.slowestRound ?? "–"}) · human decisions ${t.avgHumanDecisionSec ?? "–"} s on average${t.partial ? " · (timing started mid-game)" : ""}` : "- **Time:** not recorded",
    "",
    "## Standings",
    "",
    table(["#", "Crew", "Player", `Final ${s.unit}`, `${s.unit} each round`, "End of game", "Worst place"], [...s.players].sort((a, b) => a.place - b.place).map((p) => [p.place, p.crew, `${p.name}${p.kind === "bot" ? " (bot)" : ""}`, p.final, p.deltas.map(sign).join(" "), p.endAdjust ? sign(p.endAdjust) : null, p.worstPlace])),
    "",
    "## Crews",
    "",
    table(["Player", "Avg ATK", "Avg BLK", "Avg fingers", "Avg cards", "Thumbs used", "Avg Thumb roll", s.track === "damage" ? "Damage taken" : "Zones taken", s.track === "damage" ? "Healed" : "Rounds holding", "Best round", "Worst round", "Decisions", "Avg decision (s)"],
      s.players.map((p) => [p.name, p.avgAtk, p.avgBlk, p.avgLen, p.avgCards, p.thumbsUsed, p.thumbAvg, s.track === "damage" ? p.damageTaken : p.zonesTaken, s.track === "damage" ? p.healed : p.zoneRounds, p.bestRound, p.worstRound, p.decisions, p.avgDecisionSec])),
    "",
    "## Rounds",
    "",
    table(["Round", "Wheel", ...s.players.map((p) => p.name), "Table", "Leader", "Time (s)"],
      s.rounds.map((x) => [x.r, x.wheel, ...x.deltas.map((d, i) => `${sign(d)} → ${x.totals[i]}`), sign(x.tableDelta), x.leaders.map((i) => s.players[i].name).join(", "), x.sec])),
    "",
    "## Economy",
    "",
    `- Table ${s.unit}: ${e.tableTotal} in total, ${e.perRoundAvg} per round on average; biggest swing in round ${e.biggestRound ?? "–"}.`,
    e.healedTotal != null ? `- Healed: ${e.healedTotal} damage removed by heals and payouts.` : null,
    e.endAdjustTotal ? `- End-of-game payouts: ${sign(e.endAdjustTotal)} ${s.unit} across the table.` : null,
    `- Thumbs used: ${e.thumbsUsed}. Cards cast: ${e.cardsCast ?? "–"}. Deck reshuffles: ${e.reshuffles}. Roll-offs: ${e.rolloffs}.`,
    `- Lead changes: ${e.leadChanges}. Final margin: ${e.finalMargin} ${s.unit}. Winner's worst place during the game: ${e.winnerWorstPlace ?? "–"}.`,
    `- Wheel: ${Object.entries(e.wheelCounts).map(([k, n]) => `${k} ×${n}`).join(", ") || "–"}.`,
    "",
    MD_MARK,
    "```json",
    JSON.stringify(s),
    "```",
    "",
  ];
  return out.filter((l) => l != null).join("\n");
}

function fmtSec(x) {
  if (x == null) return "–";
  const m = Math.floor(x / 60), sec = Math.round(x % 60);
  return m ? `${m} min ${sec} s` : `${sec} s`;
}

const csvCell = (x) => (x == null ? "" : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));

/** Long format, one row per crew per round: opens in any spreadsheet and pivots easily. */
export function statsCsv(s) {
  const head = ["mode", "seed", "round", "wheel", "player", "crew", "kind", `${s.unit}_change`, `${s.unit}_total`, "place_after_round", "leader", "round_seconds", "final", "final_place"];
  const rows = [];
  for (const x of s.rounds) {
    const t = x.totals;
    s.players.forEach((p, i) => {
      const place = 1 + t.filter((y) => (s.best === "lowest" ? y < t[i] : y > t[i])).length;
      rows.push([s.mode.id, s.seed, x.r, x.wheel, p.name, p.crew, p.kind, x.deltas[i], t[i], place, x.leaders.includes(i) ? 1 : 0, x.sec, p.final, p.place]);
    });
  }
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** Accepts a .md report from statsMarkdown, a stats .json, or a downloaded game log .json. */
export function parseStatsFile(text) {
  const t = String(text);
  const m = t.match(/```json\s*\n([\s\S]*?)\n```/);
  let obj;
  try { obj = JSON.parse(m ? m[1] : t); } catch { throw new Error("Not a Hood Sorcery stats report or game log"); }
  if (obj?.kind === STATS_KIND) return obj;
  if (obj?.kind === "hood-sorcery-playtest-log" && obj.players && obj.mode) return computeStats(obj);
  throw new Error("Not a Hood Sorcery stats report or game log");
}
