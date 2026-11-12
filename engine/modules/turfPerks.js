// Turf Perks (experiment, 12_Player_Choices.md §7.2; GP3_OVERHAUL_PLAN.md §0.2, §0.3a): the crew holding a corner AT THE
// START OF THE ROUND gets that location's perk. Needs the `locations` module (the modifier loads it). Bodega already
// pays 2 Rep, so it has no extra perk.
//   Laundromat  Wash        at Refill, before drawing, put 1 hand card on the bottom of the deck
//   Rooftop     Lookout     before casting, see one rival's hand (your choice whose)
//   Precinct    Badge       Cuffed and Mugged don't affect you
//   Subway Grate Back Way   your total finger limit is +1
//   Old Church  Confession  once per game, right after the spin, re-spin the Wheel (shares the re-spin step)
import { discardUsed } from "./core.js";

export const PERKS = {
  laundromat: { name: "Wash", text: "At Refill, before you draw, put 1 card from your hand on the bottom of the deck." },
  rooftop: { name: "Lookout", text: "Before you cast, see one rival's hand." },
  precinct: { name: "Badge", text: "Cuffed and Mugged don't affect you." },
  subwayGrate: { name: "Back Way", text: "Your finger limit is +1." },
  oldChurch: { name: "Confession", text: "Once per game, right after the spin, re-spin the Wheel." },
};

/** Who holds the corner with this location, as of the start of the round (null if nobody / no such corner). */
const holder = (st, loc) => st.perks?.[loc] ?? null;
const live = (st, ctx) => st.round < ctx.p.rounds;
const CURSE_HITS = new Set(["cuffed", "muggedCorner"]); // what the Badge shrugs off

export default {
  id: "turfPerks",
  steps: [
    {
      id: "perkSnapshot", phase: "ROUND_START", order: 1, kind: "auto",
      run(st) {
        st.perks = {};
        st.look = null;
        for (const z of st.zones) if (z.loc && PERKS[z.loc] && z.holder != null) st.perks[z.loc] = z.holder;
        const held = Object.entries(st.perks);
        if (held.length) st.log.push({ r: st.round, k: "perks", perks: { ...st.perks }, text: "Perks this round: " + held.map(([loc, pid]) => `${st.players[pid].name} ${PERKS[loc].name}`).join(" · ") + "." });
      },
    },
    {
      id: "lookout", phase: "PRE_CAST", order: 20, kind: "choice",
      when: (st) => holder(st, "rooftop") != null,
      who: (st) => [holder(st, "rooftop")],
      spec: (st, ctx, pid) => ({
        type: "option", prompt: "Lookout (Rooftop): whose hand do you want to see?",
        options: st.players.filter((p) => p.id !== pid).map((p) => ({ value: p.id, label: p.name })),
      }),
      validate: (st, ctx, pid, v) => (Number.isInteger(v) && v !== pid && st.players[v] ? null : "Pick a rival"),
      apply(st, ctx, answers) {
        const pid = holder(st, "rooftop"), target = answers[pid];
        st.look = { pid, target, hand: [...st.players[target].hand] };
        st.log.push({ r: st.round, k: "perk", pid, text: `${st.players[pid].name} (Lookout) checks ${st.players[target].name}'s hand.` });
      },
      bot(st, ctx, pid) {
        // look at the crew in front (most Rep), lowest seat on a tie
        return st.players.filter((p) => p.id !== pid).sort((a, b) => b.tracks.rep - a.tracks.rep || a.id - b.id)[0].id;
      },
    },
    {
      // the Wash prompt comes before core's refill, so the used cards must already have left the hands (idempotent; The Plug does the same)
      id: "washPrep", phase: "REFILL", order: -25, kind: "auto",
      when: (st, ctx) => live(st, ctx) && holder(st, "laundromat") != null,
      run: (st, ctx) => discardUsed(st, ctx),
    },
    {
      id: "wash", phase: "REFILL", order: -15, kind: "choice",
      when: (st, ctx) => live(st, ctx) && holder(st, "laundromat") != null,
      who: (st) => [holder(st, "laundromat")],
      spec(st, ctx, pid) {
        return {
          type: "option", wash: true, cards: [...st.players[pid].hand],
          prompt: "Wash (Laundromat): put 1 card from your hand on the bottom of the deck, or keep them all.",
          options: [...st.players[pid].hand.map((id) => ({ value: id, label: ctx.card(id).name })), { value: "skip", label: "Keep my hand" }],
        };
      },
      validate: (st, ctx, pid, v) => (v === "skip" || st.players[pid].hand.includes(v) ? null : "That card isn't in your hand"),
      apply(st, ctx, answers) {
        const pid = holder(st, "laundromat"), v = answers[pid];
        if (v === "skip") return;
        const hand = st.players[pid].hand;
        hand.splice(hand.indexOf(v), 1);
        st.deck.push(v);
        st.log.push({ r: st.round, k: "perk", pid, text: `${st.players[pid].name} (Wash) puts a card on the bottom of the deck.` });
      },
      bot(st, ctx, pid) {
        // wash the card that adds least to any line (the weakest by ATK+BLK, then the longest)
        const hand = st.players[pid].hand;
        if (!hand.length) return "skip";
        const worst = [...hand].sort((a, b) => ctx.card(a).atk + ctx.card(a).blk - ctx.card(b).atk - ctx.card(b).blk || ctx.card(b).len - ctx.card(a).len)[0];
        const c = ctx.card(worst);
        return c.atk + c.blk <= 3 ? worst : "skip";
      },
    },
  ],

  limitsFor(st, ctx, pid, lim) {
    let out = lim;
    // Badge: a Cuffed Wheel doesn't touch this crew, so the limits the effect changed go back to normal
    const eff = ctx.mods.map((m) => m.effects?.[st.fx]).find(Boolean);
    if (holder(st, "precinct") === pid && CURSE_HITS.has(st.fx) && eff) out = { ...out, ...Object.fromEntries(Object.keys(eff).map((k) => [k, ctx.p[k]])) };
    // Back Way: +1 to the total finger limit
    if (holder(st, "subwayGrate") === pid) out = { ...out, line: out.line + 1 };
    return out;
  },
  immune: (st, ctx, pid, fx) => holder(st, "precinct") === pid && CURSE_HITS.has(fx),

  respinOptions(st, ctx, pid) {
    if (holder(st, "oldChurch") !== pid || st.confessed?.[pid]) return [];
    return [{ value: "confession", label: "Confession: re-spin", hint: "Old Church · once a game" }];
  },
  respinUsed(st, ctx, pid, value) {
    if (value === "confession") (st.confessed ||= {})[pid] = true;
  },

  redactView(st, v, pid) {
    if (!st.look) return;
    v.look = st.look.pid === pid ? { ...st.look } : { pid: st.look.pid, target: st.look.target };
  },
};
