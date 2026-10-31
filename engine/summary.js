// One-line round summaries ("Round 3: Ana +1 damage · Ben took the Lot"). Reads a state or a view
// (players[].hist, zones); decides nothing. Pure, so the UI, logs and the Unity port can share it.

/**
 * @returns {{round:number, items:{pid:number, kind:'damage'|'rep'|'take'|'lose', delta?:number, zone?:string, text:string}[], text:string} | null}
 */
export function roundSummary(v, round) {
  const r = round ?? Math.max(0, ...v.players.map((p) => p.hist.length ? p.hist[p.hist.length - 1].r : 0));
  if (!r) return null;
  const track = v.mode.win.track;
  const items = [];
  const zoneNames = new Set(v.zones.map((z) => z.name));
  const holderOf = {};
  for (const p of v.players) for (const name of p.hist.find((h) => h.r === r)?.holds || []) holderOf[name] = p.id;
  for (const p of v.players) {
    const h = p.hist.find((x) => x.r === r);
    if (!h) continue;
    const prev = p.hist.find((x) => x.r === r - 1);
    const delta = h[track] - (prev ? prev[track] : 0);
    const unit = track === "rep" ? "Rep" : "damage";
    if (delta) items.push({ pid: p.id, kind: track, delta, text: `${p.name} ${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${unit}` });
    const before = prev?.holds || [];
    const now = h.holds || [];
    for (const z of now) if (!before.includes(z)) items.push({ pid: p.id, kind: "take", zone: z, text: `${p.name} took ${z}` });
    for (const z of before) {
      // Zones that closed (The Turf) are not "lost"; a zone taken by someone else is reported once, as "took".
      if (now.includes(z) || !zoneNames.has(z) || holderOf[z] != null) continue;
      items.push({ pid: p.id, kind: "lose", zone: z, text: `${p.name} left ${z}` });
    }
  }
  return { round: r, items, text: `Round ${r}: ${items.length ? items.map((i) => i.text).join(" · ") : "no change"}` };
}
