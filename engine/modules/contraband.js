// Contraband (experiment, 12_Player_Choices.md §7.3; GP3_OVERHAUL_PLAN.md §0.3, §0.3a). Corners only in v1.
// Each crew is dealt 2 face-down items from the 12 below at setup. At most ONE item a round: committed with the lock-in
// (cast.item = { id, zone?, target? }, hidden), revealed with the flip, gone after use. Items marked `pre` are played in
// the re-spin prompt right after the spin instead. Contraband is retired in the SRD (D-32): this is an experiment only.
import { shuffle, pick } from "../rng.js";
import { lineStats } from "../line.js";
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
export const ITEM_IDS = Object.keys(ITEMS);
const CURSES = new Set(["cuffed", "muggedCorner", "challengerTies", "bleedingRep"]); // the Wheel's curses, by Corners effect name

const mine = (st, pid) => st.items?.[pid] || [];
const usedId = (st, pid) => st.used?.[pid]?.id;
const zoneName = (st, i) => st.zones.find((z) => z.i === i)?.name;

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
      run(st) {
        const spent = [];
        for (const pl of st.players) {
          const it = st.casts[pl.id]?.item;
          if (!it) continue;
          st.items[pl.id].splice(st.items[pl.id].indexOf(it.id), 1);
          st.used[pl.id] = it;
          spent.push(pl.id);
          const at = it.zone != null ? ` at ${zoneName(st, it.zone)}` : it.target != null ? `, naming ${st.players[it.target].name}` : "";
          st.log.push({ r: st.round, k: "item", pid: pl.id, item: it.id, text: `${pl.name} plays ${ITEMS[it.id].name}${at}.` });
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
    spec.items = st.used?.[pid] ? [] : items.map((id) => ({ id, ...ITEMS[id] }));
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
    const def = ITEMS[it.id];
    if (!def) return "Unknown item";
    if (def.pre) return `${def.name} is played right after the spin`;
    if (!mine(st, pid).includes(it.id)) return "You don't have that item";
    if (st.used?.[pid]) return "One item a round";
    const lines = (v.lines || []).filter((l) => l?.cards?.length);
    if (def.needs === "zone" && !lines.some((l) => l.zone === it.zone)) return `${def.name}: pick a corner where you have a line`;
    if (def.needs === "rival" && !(Number.isInteger(it.target) && it.target !== pid && st.players[it.target])) return `${def.name}: name a rival`;
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
    if (!it || it.zone !== ln.zone) return;
    if (it.id === "brassKnuckles") ln.atk += 2;
    if (it.id === "kevlarHoodie") ln.blk += 2;
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
