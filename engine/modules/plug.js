// The Plug (experiment, 12_Player_Choices.md §7.1; GP3_OVERHAUL_PLAN.md §0.1): a Rep-ordered refill market.
// At Refill, after the used cards leave the hands and before anyone draws, 4 cards are dealt face up. Crews pick one
// each (or pass), worst-off first: Corners lowest Rep, Classic most damage. Ties: more contests lost this round
// (Classic: more damage this round), then a logged roll-off. Then everyone draws blind up to 8 as usual and the
// unpicked cards go to the discard. Not in the last round (nothing left to play them in).
import { rankEntries } from "../rank.js";
import { enumerateLines } from "../line.js";
import { limitsFor } from "../cast.js";
import { discardUsed, drawable } from "./core.js";

const live = (st, ctx) => st.round < ctx.p.rounds;
const open = (st) => st.plug && st.plug.i < st.plug.order.length && st.plug.cards.length > 0;

/** Pick order, worst-off first. */
function pickOrder(st, ctx) {
  const dmg = ctx.cfg.win.track === "damage";
  const entries = st.players.map((p) => ({
    pid: p.id,
    val: dmg ? p.tracks.damage : -p.tracks.rep,   // rankEntries sorts the higher value first
    len: 0,
    other: dmg ? st.rd[p.id] : st.plugLost?.[p.id] ?? 0, // tie: more damage / more contests lost this round first
  }));
  return rankEntries(st, entries, "The Plug");
}

const score = (st, ctx, pid, hand) => {
  const lim = limitsFor(st, ctx, pid);
  let best = 0;
  for (const l of enumerateLines(hand.map(ctx.card), lim.line, lim.maxCards)) best = Math.max(best, l.atk + l.blk - l.len * 0.05);
  return best;
};

export default {
  id: "plug",
  steps: [
    {
      id: "plugReveal", phase: "REFILL", order: -20, kind: "auto",
      when: (st, ctx) => live(st, ctx),
      run(st, ctx) {
        discardUsed(st, ctx); // used cards leave the hands first; core refill then skips its own discard
        const cards = [];
        for (let i = 0; i < (ctx.p.plugSize ?? 4) && drawable(st, ctx); i++) cards.push(st.deck.shift());
        const order = cards.length ? pickOrder(st, ctx) : [];
        st.plug = { cards, order, i: 0, picks: [] };
        if (cards.length) st.log.push({ r: st.round, k: "plug", cards: [...cards], order, text: `The Plug: ${cards.map((id) => ctx.card(id).name).join(", ")} face up. Pick order: ${order.map((id) => st.players[id].name).join(" → ")}.` });
      },
    },
    {
      id: "plugPick", phase: "REFILL", order: -10, kind: "choice",
      when: (st, ctx) => live(st, ctx) && open(st),
      who: (st) => [st.plug.order[st.plug.i]],
      spec(st, ctx, pid) {
        return {
          type: "option", plug: true, cards: [...st.plug.cards],
          prompt: `The Plug: take one card, or pass (${st.plug.i + 1} of ${st.plug.order.length}). You draw up to ${ctx.p.hand} after.`,
          options: [...st.plug.cards.map((id) => ({ value: id, label: ctx.card(id).name })), { value: "pass", label: "Pass" }],
        };
      },
      validate: (st, ctx, pid, v) => (v === "pass" || st.plug.cards.includes(v) ? null : "That card isn't on the Plug"),
      apply(st, ctx, answers) {
        const pid = st.plug.order[st.plug.i];
        const v = answers[pid];
        if (v === "pass") st.log.push({ r: st.round, k: "plugPick", pid, text: `${st.players[pid].name} passes on the Plug.` });
        else {
          st.plug.cards = st.plug.cards.filter((id) => id !== v);
          st.players[pid].hand.push(v);
          st.plug.picks.push({ pid, card: v });
          st.log.push({ r: st.round, k: "plugPick", pid, card: v, text: `${st.players[pid].name} takes ${ctx.card(v).name} from the Plug.` });
        }
        st.plug.i += 1;
        if (st.plug.i >= st.plug.order.length || !st.plug.cards.length) {
          st.discard.push(...st.plug.cards); // unpicked cards are discarded
          st.plug.cards = [];
          st.plug.i = st.plug.order.length;
          return undefined;
        }
        return "repeat";
      },
      bot(st, ctx, pid) {
        const hand = st.players[pid].hand;
        const base = score(st, ctx, pid, hand);
        let best = "pass", gain = 0.5; // must improve the best line by at least this much, else pass
        for (const id of st.plug.cards) {
          const g = score(st, ctx, pid, [...hand, id]) - base;
          if (g > gain) { gain = g; best = id; }
        }
        return best;
      },
    },
  ],
  // Corners: count the contests each crew lost this round, after Mugged (hook from corners.js)
  afterContests(st, ctx, out) {
    st.plugLost = {};
    for (const o of out) for (const pid of o.pids) if (pid !== o.winner) st.plugLost[pid] = (st.plugLost[pid] || 0) + 1;
  },
};
