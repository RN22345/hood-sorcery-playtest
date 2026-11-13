// Contraband (experiment, 12_Player_Choices.md §7.3; GP3_OVERHAUL_PLAN.md §0.3, §0.3a). Corners and Classic (FIN-12, D-42).
// Each crew is dealt 2 face-down items from the 12 below at setup. At most ONE item a round: committed with the lock-in
// (cast.item = { id, zone?, target? }, hidden), revealed with the flip, gone after use. Items marked `pre` are played in
// the re-spin prompt right after the spin instead. Contraband is retired in the SRD (D-32): this is an experiment only.
// Classic (D-42 "there should be comonality"): 8 of the 12 items work word for word. Only the 4 that need a corner change, with
// the same name and idea: a corner in Corners is a ranking in Classic (1st on ATK, 1st on BLK). See `itemDef()` and
// `13_Character_Cards_and_Contraband_All_Modes.md` §2. Classic uses new neutral hooks only (adjustRolled, rankEntry,
// settleDamage, immune in the matrix); the Corners paths below are unchanged, so the Corners vectors stay byte-identical.
import { shuffle, pick } from "../rng.js";
import { lineStats, enumerateLines } from "../line.js";
import { botRng, limitsFor, repairCast } from "../cast.js";

export const ITEMS = {
  burnerPhone:   { name: "Burner Phone",   text: "Call for backup: you may cast 1 more card.", needs: null },
  luckyCharm:    { name: "Lucky Charm",    text: "Right after the spin: re-spin the Wheel.", needs: null, pre: true },
  fakeId:        { name: "Fake ID",        text: "At one corner where you have a line, you count as its holder.", needs: "zone" },
  smokeBomb:     { name: "Smoke Bomb",     text: "Your ties count as wins.", needs: null },
  brassKnuckles: { name: "Brass Knuckles", text: "+2 ATK on one line.", needs: "zone" },
  kevlarHoodie:  { name: "Kevlar Hoodie",  text: "+2 BLK on one line.", needs: "zone" },
  extraHand:     { name: "Extra Hand",     text: "+2 to your finger limit.", needs: null },
  bribe:         { name: "Bribe",          text: "This round's Curse doesn't affect you.", needs: null },
  getawayCar:    { name: "Getaway Car",    text: "After the reveal, one of your lines that lost moves to an empty corner and takes it if its ATK is 1+.", needs: null },
  snitch:        { name: "Snitch",         text: "Name a rival: each contest they win this round costs them 1 Rep.", needs: "rival" },
  sprayCan:      { name: "Spray Can",      text: "Each corner you hold at the end of this round pays +1 Rep.", needs: null },
  pickpocket:    { name: "Pickpocket",     text: "Take a random unused item from a rival, before anything else resolves.", needs: null },
};
// Classic: what changes (text and the pick it needs). Brass Knuckles / Kevlar Hoodie keep their text; there is only one line to pick.
export const CLASSIC = {
  fakeId:        { text: "After the Thumbs, swap your ATK and BLK.", needs: null },
  brassKnuckles: { needs: null },
  kevlarHoodie:  { needs: null },
  getawayCar:    { text: "If you would take 2 or more damage this round, take 1 less.", needs: null },
  snitch:        { text: "Name a rival: each ranking they top this round (1st on ATK, 1st on BLK) costs them 1 damage." },
  sprayCan:      { text: "Each ranking you top this round (1st on ATK, 1st on BLK) heals you 1 damage." },
};
/** The item as it works in this game's mode (name, text, needs). Corners = the base entry. */
export function itemDef(id, modeId) {
  const d = ITEMS[id];
  return d && modeId !== "corners" && CLASSIC[id] ? { ...d, ...CLASSIC[id] } : d;
}
export const ITEM_IDS = Object.keys(ITEMS);
// the Wheel's curses, by effect name: Corners, then Classic (the Classic names never occur in Corners and vice versa)
const CURSES = new Set(["cuffed", "muggedCorner", "challengerTies", "bleedingRep", "bleeding", "rotateAtk", "rotateBlk"]);

const mine = (st, pid) => st.items?.[pid] || [];
const usedId = (st, pid) => st.used?.[pid]?.id;
const zoneName = (st, i) => st.zones.find((z) => z.i === i)?.name;
const isCorners = (ctx) => ctx.cfg.id === "corners";
const def = (ctx, id) => itemDef(id, ctx.cfg.id);
/** How many rankings this crew tops after the matrix (Classic: 0, 1 or 2). */
const tops = (st, pid) => (st.ranks ? (st.ranks.atk[0] === pid) + (st.ranks.blk[0] === pid) : 0);

export default {
  id: "contraband",

  init(st, ctx) {
    const n = ctx.p.itemCount ?? 2;
    const deal = shuffle(st, [...ITEM_IDS]);
    st.items = {};
    for (const pl of st.players) st.items[pl.id] = deal.splice(0, n);
    st.used = {};
    st.log.push({ r: 0, k: "setup", text: `Contraband: every crew holds ${n} secret items.` });
  },

  steps: [
    {
      id: "itemReset", phase: "ROUND_START", order: 1, kind: "auto",
      run(st) { st.used = {}; },
    },
    {
      // items are revealed with the flip; Pickpocket resolves before anything else
      id: "itemReveal", phase: "REVEAL", order: -1, kind: "auto",
      run(st, ctx) {
        const spent = [];
        for (const pl of st.players) {
          const it = st.casts[pl.id]?.item;
          if (!it) continue;
          st.items[pl.id].splice(st.items[pl.id].indexOf(it.id), 1);
          st.used[pl.id] = it;
          spent.push(pl.id);
          const at = it.zone != null ? ` at ${zoneName(st, it.zone)}` : it.target != null ? `, naming ${st.players[it.target].name}` : "";
          const how = !isCorners(ctx) && it.id === "fakeId" ? ": ATK and BLK swap after the Thumbs" : "";
          st.log.push({ r: st.round, k: "item", pid: pl.id, item: it.id, text: `${pl.name} plays ${ITEMS[it.id].name}${at}${how}.` });
        }
        for (const pid of spent) {
          if (usedId(st, pid) !== "pickpocket") continue;
          const pool = st.players.filter((p) => p.id !== pid).flatMap((p) => mine(st, p.id).map((id, k) => ({ from: p.id, k })));
          if (!pool.length) { st.log.push({ r: st.round, k: "item", pid, text: `${st.players[pid].name}'s Pickpocket finds nothing to take.` }); continue; }
          const t = pick(st, pool);
          const [id] = st.items[t.from].splice(t.k, 1);
          st.items[pid].push(id);
          st.log.push({ r: st.round, k: "item", pid, stolen: t.from, text: `${st.players[pid].name} picks ${st.players[t.from].name}'s pocket: an item changes hands.` });
        }
      },
    },
  ],

  // ---- cast: the item list for the UI, per-item limits, validation
  castSpec(st, ctx, pid, spec) {
    const items = [...new Set(mine(st, pid).filter((id) => !ITEMS[id].pre))];
    spec.items = st.used?.[pid] ? [] : items.map((id) => ({ id, ...def(ctx, id) }));
    spec.limitsByItem = {};
    for (const id of items) {
      const lim = limitsFor(st, ctx, pid, { item: { id } });
      if (lim !== spec.limits) spec.limitsByItem[id] = lim;
    }
    if (st.used?.[pid]) spec.itemNote = `You already played ${ITEMS[st.used[pid].id].name} this round.`;
  },
  validateCast(st, ctx, pid, v) {
    const it = v.item;
    if (it == null) return null;
    const d = def(ctx, it.id);
    if (!d) return "Unknown item";
    if (d.pre) return `${d.name} is played right after the spin`;
    if (!mine(st, pid).includes(it.id)) return "You don't have that item";
    if (st.used?.[pid]) return "One item a round";
    const lines = (v.lines || []).filter((l) => l?.cards?.length);
    if (d.needs === "zone" && !lines.some((l) => l.zone === it.zone)) return `${d.name}: pick a corner where you have a line`;
    if (d.needs === "rival" && !(Number.isInteger(it.target) && it.target !== pid && st.players[it.target])) return `${d.name}: name a rival`;
    return null;
  },
  limitsFor(st, ctx, pid, lim, cast) {
    const id = cast?.item?.id;
    let out = lim;
    if (id === "bribe") { // Cuffed doesn't touch you
      const eff = ctx.mods.map((m) => m.effects?.[st.fx]).find(Boolean);
      if (st.fx === "cuffed" && eff) out = { ...out, ...Object.fromEntries(Object.keys(eff).map((k) => [k, ctx.p[k]])) };
    }
    if (id === "burnerPhone") out = { ...out, maxCards: out.maxCards + 1 };
    if (id === "extraHand") out = { ...out, line: out.line + 2 };
    return out;
  },
  immune: (st, ctx, pid, fx, cast) => CURSES.has(fx) && (cast?.item?.id ?? usedId(st, pid)) === "bribe",

  // ---- resolution
  adjustLine(st, ctx, pid, ln) {
    const it = st.used?.[pid];
    if (!it || (isCorners(ctx) ? it.zone : it.zone ?? ln.zone) !== ln.zone) return; // Classic: the one line
    if (it.id === "brassKnuckles") ln.atk += 2;
    if (it.id === "kevlarHoodie") ln.blk += 2;
  },
  // ---- resolution, Classic only (the Corners module never calls rankEntry / settleDamage; each checks the mode anyway)
  adjustRolled(st, ctx, pid, lines) {
    if (isCorners(ctx) || usedId(st, pid) !== "fakeId") return;
    for (const ln of lines) [ln.atk, ln.blk] = [ln.blk, ln.atk];
  },
  rankEntry(st, ctx, e) {
    if (!isCorners(ctx) && usedId(st, e.pid) === "smokeBomb") e.win = 1;
  },
  settleDamage(st, ctx, pid, d) {
    if (isCorners(ctx)) return d;
    const pl = st.players[pid];
    for (const p of st.players) { // Snitch: someone else's item naming this crew
      const it = st.used?.[p.id];
      const n = it?.id === "snitch" && it.target === pid ? tops(st, pid) : 0;
      if (!n) continue;
      d += n;
      st.log.push({ r: st.round, k: "item", pid, text: `${p.name}'s Snitch: ${pl.name} +${n} damage for topping ${n === 2 ? "both rankings" : "a ranking"}.` });
    }
    const own = usedId(st, pid);
    if (own === "getawayCar") {
      if (d >= 2) { d -= 1; st.log.push({ r: st.round, k: "item", pid, text: `Getaway Car: ${pl.name} gets away with 1 damage less.` }); }
      else st.log.push({ r: st.round, k: "item", pid, text: `${pl.name}'s Getaway Car wasn't needed.` });
    }
    if (own === "sprayCan") {
      const n = tops(st, pid);
      const cut = Math.min(n, d), heal = Math.min(n - cut, pl.tracks.damage);
      d -= cut; pl.tracks.damage -= heal;
      // `d` on the log = only the change to the damage track (the cut shows in the settle line), so log deltas add up
      const text = cut + heal ? `Spray Can: ${pl.name} tags ${n === 2 ? "both rankings" : "a ranking"}, −${cut + heal} damage.` : `${pl.name}'s Spray Can ${n ? "has nothing to heal" : "finds no ranking to tag"}.`;
      st.log.push(heal ? { r: st.round, k: "heal", pid, d: -heal, text } : { r: st.round, k: "item", pid, text });
    }
    return d;
  },

  holderFor(st, ctx, z) {
    for (const p of st.players) { const it = st.used?.[p.id]; if (it?.id === "fakeId" && it.zone === z.i) return p.id; }
    return null;
  },
  challengerTies: (st, ctx, z, pid) => pid != null && usedId(st, pid) === "smokeBomb",
  zoneRep: (st, ctx, z) => (z.holder != null && usedId(st, z.holder) === "sprayCan" ? 1 : 0),
  contestWon(st, ctx, z, winner) {
    for (const p of st.players) {
      const it = st.used?.[p.id];
      if (it?.id !== "snitch" || it.target !== winner) continue;
      const pl = st.players[winner], b = pl.tracks.rep;
      pl.tracks.rep = Math.max(0, b - 1);
      st.log.push({ r: st.round, k: "rep", pid: winner, d: pl.tracks.rep - b, zone: z.name, text: `${p.name}'s Snitch: ${pl.name} −1 Rep for winning ${z.name}.` });
    }
  },
  afterContests(st, ctx, out, lost) {
    for (const pl of st.players) {
      if (usedId(st, pl.id) !== "getawayCar") continue;
      const lostHere = out.filter((o) => o.pids.includes(pl.id) && o.winner !== pl.id);
      const ln = lostHere.map((o) => st.res[pl.id].lines.find((l) => l.zone === o.z.i)).filter(Boolean).sort((a, b) => b.atk - a.atk || a.zone - b.zone)[0];
      const pay = (z) => ctx.p.repPerCorner + ctx.mods.reduce((a, m) => a + (m.zoneRep?.(st, ctx, { ...z, holder: pl.id }) || 0), 0);
      const dest = st.zones.filter((z) => z.holder == null && z.i !== ln?.zone).sort((a, b) => pay(b) - pay(a) || a.i - b.i)[0];
      if (!ln || !dest) { st.log.push({ r: st.round, k: "item", pid: pl.id, text: `${pl.name}'s Getaway Car has nowhere to go.` }); continue; }
      const fromI = ln.zone, from = zoneName(st, fromI);
      ln.zone = dest.i;
      if (ln.atk >= 1) {
        dest.holder = pl.id;
        st.log.push({ r: st.round, k: "corner", zone: dest.name, holder: pl.id, pids: [pl.id], text: `Getaway Car: ${pl.name} slips out of ${from} and takes ${dest.name}.` });
      } else st.log.push({ r: st.round, k: "item", pid: pl.id, text: `Getaway Car: ${pl.name} runs to ${dest.name}, but with ATK 0 takes nothing.` });
      // the loss they ran from no longer counts towards Bleeding (other lost contests still do)
      if (!lostHere.some((o) => o.z.i !== fromI)) lost.delete(pl.id);
    }
  },

  // ---- re-spin prompt (Lucky Charm shares the step with Confession)
  respinOptions(st, ctx, pid) {
    return mine(st, pid).includes("luckyCharm") && !st.used?.[pid] ? [{ value: "luckyCharm", label: "Lucky Charm: re-spin", hint: "uses your item for the round" }] : [];
  },
  respinUsed(st, ctx, pid, value) {
    if (value !== "luckyCharm") return;
    st.items[pid].splice(st.items[pid].indexOf("luckyCharm"), 1);
    st.used[pid] = { id: "luckyCharm" };
  },

  // ---- bots: play an item when it helps the line they already chose, and in the last two rounds
  finishBotCast(st, ctx, pid, c) {
    c = repairCast(st, ctx, pid, c); // legal first, so the item is chosen against the lines that will really be cast
    const inv = mine(st, pid).filter((id) => !ITEMS[id].pre);
    if (!inv.length || st.used?.[pid]) return c;
    const r = botRng(st, pid, "item");
    const last = ctx.p.rounds - st.round <= 1;
    if (!last && r() > 0.35) return c;
    const lines = c.lines.filter((l) => l.cards?.length).map((l) => ({ ...l, ...lineStats(l.cards.map(ctx.card)) }));
    if (!lines.length) return c;
    if (!isCorners(ctx)) return classicBotItem(st, ctx, pid, c, inv, lines[0], last);
    const heldBy = (zi) => st.zones.find((z) => z.i === zi)?.holder;
    const rivals = st.players.filter((p) => p.id !== pid);
    const leader = [...rivals].sort((a, b) => b.tracks.rep - a.tracks.rep || a.id - b.id)[0];
    const bestBy = (key, pred = () => true) => lines.filter(pred).sort((a, b) => b[key] - a[key])[0];
    const choose = {
      brassKnuckles: () => { const l = bestBy("atk", (x) => heldBy(x.zone) !== pid); return l && { id: "brassKnuckles", zone: l.zone }; },
      kevlarHoodie: () => { const l = bestBy("blk", (x) => heldBy(x.zone) === pid) || bestBy("blk"); return l && { id: "kevlarHoodie", zone: l.zone }; },
      fakeId: () => { const l = bestBy("blk", (x) => heldBy(x.zone) != null && heldBy(x.zone) !== pid); return l && { id: "fakeId", zone: l.zone }; },
      smokeBomb: () => (lines.some((l) => heldBy(l.zone) != null && heldBy(l.zone) !== pid) ? { id: "smokeBomb" } : null),
      snitch: () => ({ id: "snitch", target: leader.id }),
      bribe: () => (CURSES.has(st.fx) ? { id: "bribe" } : null),
      getawayCar: () => (st.zones.some((z) => z.holder == null) ? { id: "getawayCar" } : null),
      sprayCan: () => ({ id: "sprayCan" }),
      pickpocket: () => (rivals.some((p) => mine(st, p.id).length) ? { id: "pickpocket" } : null),
      burnerPhone: () => (st.open ? null : { id: "burnerPhone" }),
      extraHand: () => (st.open ? null : { id: "extraHand" }),
    };
    for (const id of inv) {
      const item = choose[id]?.();
      if (!item) continue;
      if (id === "burnerPhone" || id === "extraHand") {
        // re-plan with the extra room
        const wide = ctx.mods.find((m) => m.id === "corners")?.botCast?.(st, ctx, pid, limitsFor(st, ctx, pid, { item }));
        if (wide) c = wide;
      }
      return { ...c, item };
    }
    return c;
  },

  // ---- hidden information
  redactView(st, v, pid) {
    v.items = pid != null && st.items?.[pid] ? { [pid]: [...st.items[pid]] } : {};
    v.itemCounts = Object.fromEntries(Object.entries(st.items || {}).map(([id, list]) => [id, list.length]));
  },
};

// Classic bots: one line, ranked against everyone. Rivals' strength is read from their history (what they cast before).
function classicBotItem(st, ctx, pid, c, inv, ln, last) {
  const rivals = st.players.filter((p) => p.id !== pid);
  const avg = (p, k) => (p.hist.length ? p.hist.reduce((a, h) => a + h[k], 0) / p.hist.length : 6);
  const leader = [...rivals].sort((a, b) => a.tracks.damage - b.tracks.damage || a.id - b.id)[0];
  const beats = (atk, blk) => rivals.filter((p) => atk > avg(p, "atk")).length + rivals.filter((p) => blk > avg(p, "blk")).length;
  const strong = ln.atk >= 7 || ln.blk >= 7, weak = ln.atk + ln.blk < 9;
  const replan = (item) => {
    const lim = limitsFor(st, ctx, pid, { item });
    const r = botRng(st, pid, "itemLine");
    let best = null, bs = ln.atk + ln.blk - ln.len * 0.05 + 0.5; // the wider line must beat the current one
    for (const l of enumerateLines(st.players[pid].hand.map(ctx.card), lim.line, lim.maxCards)) {
      const s = l.atk + l.blk - l.len * 0.05 + r() * 0.5;
      if (s > bs) { bs = s; best = l; }
    }
    return best;
  };
  const choose = {
    brassKnuckles: () => ({ id: "brassKnuckles" }),
    kevlarHoodie: () => ({ id: "kevlarHoodie" }),
    smokeBomb: () => ({ id: "smokeBomb" }),
    fakeId: () => (beats(ln.blk, ln.atk) > beats(ln.atk, ln.blk) ? { id: "fakeId" } : null),
    snitch: () => ({ id: "snitch", target: leader.id }),
    bribe: () => (CURSES.has(st.fx) ? { id: "bribe" } : null),
    getawayCar: () => (weak || last ? { id: "getawayCar" } : null),
    sprayCan: () => (strong || last ? { id: "sprayCan" } : null),
    pickpocket: () => (!last && rivals.some((p) => mine(st, p.id).length) ? { id: "pickpocket" } : null),
    burnerPhone: () => (st.open ? null : { id: "burnerPhone" }),
    extraHand: () => (st.open ? null : { id: "extraHand" }),
  };
  for (const id of inv) {
    const item = choose[id]?.();
    if (!item) continue;
    if (id === "burnerPhone" || id === "extraHand") {
      const wide = replan(item);
      if (!wide) continue; // no better line with the extra room: keep the item for later
      c = { ...c, lines: [{ zone: 0, cards: wide.cards }] };
    }
    return { ...c, item };
  }
  return c;
}
