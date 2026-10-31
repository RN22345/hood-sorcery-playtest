// Beats for the narrator (ui/show.js): new log entries -> a paced sequence. Pure (no DOM), so it is
// unit-tested in Node. The structured fields (d, ds, zone, holder, ranks, id) come from the engine's log.
const QUIET = new Set(["setup", "shuffle"]); // not worth a beat

/** Group new log entries into beats. pace "each" = one crew at a time, "together" = all at once. */
export function buildBeats(entries, v, pace = "each") {
  const beats = [];
  const name = (pid) => v.players[pid]?.name;
  const zoneIn = (text) => v.zones.filter((z) => text.includes(z.name)).map((z) => z.name);
  const pidsIn = (text) => v.players.filter((p) => text.includes(p.name)).map((p) => p.id);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (QUIET.has(e.k)) continue;
    if (e.k === "round") { beats.push({ type: "round", round: e.r, caption: e.text, dur: 1000 }); continue; }
    if (e.k === "wheel") { beats.push({ type: "wheel", id: e.id, caption: e.text, dur: 2700 }); continue; }
    if (e.k === "cast") { beats.push({ type: "say", caption: "All lines are in. Flip them!", dur: 700, sfx: "lock" }); continue; }
    if (e.k === "reveal") {
      const group = [e];
      while (entries[i + 1]?.k === "reveal") group.push(entries[++i]);
      beats.push({ type: "reveal", round: e.r, pids: group.map((x) => x.pid), caption: "Reveal!", dur: 1500 });
      const rolled = group.filter((x) => (resFor(v, e.r)?.[x.pid]?.rolls || []).length);
      if (pace === "together" && rolled.length) beats.push({ type: "dice", round: e.r, pids: rolled.map((x) => x.pid), caption: "Trigger Thumbs!", dur: 1500 });
      else for (const x of rolled) beats.push({ type: "dice", round: e.r, pids: [x.pid], caption: `${name(x.pid)} rolls Thumbs`, dur: 1300 });
      beats.push({ type: "totals", round: e.r, pids: group.map((x) => x.pid), caption: group.map((x) => x.text.split(",")[0]).join(" · "), dur: 1500 });
      continue;
    }
    if (e.k === "rank" && e.ranks) { beats.push({ type: "rank", ranks: e.ranks, caption: e.text, pids: e.ranks.atk, dur: 2200 }); continue; }
    if (e.zone && "holder" in e) {
      beats.push({ type: "claim", zone: e.zone, holder: e.holder, caption: e.text, pids: e.pids || (e.holder != null ? [e.holder] : []), zones: [e.zone], dur: 1500 });
      continue;
    }
    const deltas = e.ds ? Object.entries(e.ds).map(([pid, d]) => ({ pid: +pid, d })) : e.d != null && e.pid != null ? [{ pid: e.pid, d: e.d }] : [];
    if (deltas.length) {
      const b = { type: "score", k: e.k, deltas, caption: e.text, pids: deltas.map((x) => x.pid), zones: e.zone ? [e.zone] : zoneIn(e.text), dur: 1150 };
      const prev = beats[beats.length - 1];
      if (pace === "together" && prev?.type === "score" && prev.k === e.k) { prev.deltas.push(...deltas); prev.pids.push(...b.pids); prev.caption += " · " + e.text; }
      else beats.push(b);
      continue;
    }
    if (e.k === "end") { beats.push({ type: "end", pid: e.pid, caption: e.text, dur: 3200 }); continue; }
    beats.push({ type: "say", caption: e.text, pids: e.pid != null ? [e.pid] : pidsIn(e.text), zones: zoneIn(e.text), dur: Math.min(2400, 900 + e.text.length * 18) });
  }
  return beats;
}

/** The revealed lines of a round, if the view still has them (this round mid-reveal, or last round). */
export const resFor = (v, round) => (v.revealed && v.round === round ? v.res : !v.revealed && v.round - 1 === round ? v.lastRes : null);

