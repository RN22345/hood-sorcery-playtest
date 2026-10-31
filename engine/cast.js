// Casting: which zones a crew may cast into, cast validation, and the shared bot helpers.
// A cast is { lines: [{ zone, cards: [cardId, ...] }], thumbs: [zone, ...] }.
// Classic has one zone; Corners lets you cast into any zone with one shared finger budget;
// Posted Up only into the Spot you posted at. Seams only count inside one line.
import { lineStats, enumerateLines } from "./line.js";
import { seedFrom } from "./rng.js";

export function allowedZones(st, ctx, pid) {
  const how = ctx.cfg.zones.castInto;
  if (how === "any") return st.zones.map((z) => z.i);
  if (how === "chosen") return st.players[pid].at == null ? [0] : [st.players[pid].at];
  return [0];
}

export function castProblem(st, ctx, pid, v, limits = st.limits) {
  if (!v || !Array.isArray(v.lines)) return "Malformed cast";
  const pl = st.players[pid];
  const allowed = allowedZones(st, ctx, pid);
  const used = new Set(), zonesUsed = new Set();
  let count = 0, fingers = 0;
  for (const ln of v.lines) {
    if (!ln || !Array.isArray(ln.cards) || !ln.cards.length) continue;
    if (!allowed.includes(ln.zone)) return `You can't cast at ${st.zones[ln.zone]?.name ?? "that zone"}`;
    if (zonesUsed.has(ln.zone)) return "Only one line per zone";
    zonesUsed.add(ln.zone);
    for (const id of ln.cards) {
      if (!pl.hand.includes(id)) return "That card isn't in your hand";
      if (used.has(id)) return "A card can only be cast once";
      used.add(id);
    }
    count += ln.cards.length;
    fingers += lineStats(ln.cards.map(ctx.card)).len;
  }
  if (count < ctx.p.minCards) return `Cast at least ${ctx.p.minCards} card`;
  if (count > limits.maxCards) return `Cast at most ${limits.maxCards} card${limits.maxCards === 1 ? "" : "s"} ${limits === st.limits ? "this round" : "here"}`;
  if (fingers > limits.line) return `Your line is ${fingers} fingers; the limit is ${limits.line}`;
  const th = v.thumbs || [];
  if (!Array.isArray(th)) return "Malformed Thumbs";
  if (th.length > 2) return "Commit at most 2 Thumbs a round";
  if (th.length > pl.thumbs) return `You only have ${pl.thumbs} Thumb${pl.thumbs === 1 ? "" : "s"} left`;
  for (const z of th) if (!zonesUsed.has(z)) return "Put each Thumb next to a line you cast";
  for (const m of ctx.mods) {
    const e = m.validateCast?.(st, ctx, pid, v);
    if (e) return e;
  }
  return null;
}

export function cleanCast(v) {
  return { lines: v.lines.filter((l) => l && l.cards && l.cards.length).map((l) => ({ zone: l.zone, cards: [...l.cards] })), thumbs: [...(v.thumbs || [])] };
}

/** Bot randomness that never touches the game rng (bots run outside act(), so they must not advance it). */
export function botRng(st, pid, salt = "") {
  let s = seedFrom(`${st.seed}|${st.round}|${pid}|${st.stepIdx}|${salt}|${st.log.length}`);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All lines this crew could cast right now (one zone), each with len/atk/blk. */
export function lineOptions(st, ctx, pid, maxCards = st.limits.maxCards, limit = st.limits.line) {
  return enumerateLines(st.players[pid].hand.map(ctx.card), limit, maxCards);
}

/** Pick the best-scoring single line, with a little noise so bots don't all play alike. */
export function bestLine(st, ctx, pid, score, noise = 1.5) {
  const r = botRng(st, pid, "line");
  let best = null, bs = -Infinity;
  for (const l of lineOptions(st, ctx, pid)) {
    const s = score(l) + r() * noise;
    if (s > bs) { bs = s; best = l; }
  }
  return best;
}

/** Simple Thumb habit: mostly save them, spend them at the end. */
export function botThumbs(st, ctx, pid, zone) {
  const pl = st.players[pid];
  const r = botRng(st, pid, "thumb");
  const left = ctx.p.rounds - st.round;
  if (pl.thumbs <= 0) return [];
  if (left === 0) return Array(Math.min(2, pl.thumbs)).fill(zone);
  if (pl.thumbs > left || r() < 0.12) return [zone];
  return [];
}

/**
 * Make a bot's cast legal under every module's extra rules (location cards, the opened card…): drop the last
 * card of the longest line until castProblem() is happy. Valid casts come back unchanged.
 */
export function repairCast(st, ctx, pid, cast) {
  let c = cleanCast(cast);
  for (let guard = 0; castProblem(st, ctx, pid, c) && guard < 20; guard++) {
    const lines = c.lines.filter((l) => l.cards.length);
    if (lines.reduce((a, l) => a + l.cards.length, 0) <= 1) break;
    const longest = lines.reduce((a, l) => (l.cards.length > a.cards.length ? l : a));
    longest.cards.pop();
    c = { lines: c.lines.filter((l) => l.cards.length), thumbs: c.thumbs.filter((z) => c.lines.some((l) => l.zone === z && l.cards.length)) };
  }
  return c;
}
