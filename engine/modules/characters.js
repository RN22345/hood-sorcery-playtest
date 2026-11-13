// Character cards (experiment, FIN-12; D-39 "contrabands that are passive", D-42 "ok to not be tied to crew").
// `13_Character_Cards_and_Contraband_All_Modes.md` §4 has the draft and the cut list. Each crew is dealt `charDeal` (2)
// cards from the pool and keeps 1, picked at the same time before the first spin (hidden until everyone picked, then all
// flip). With `charDeal: 1` the card is simply dealt. The kept card is PUBLIC and always on: no item, no action, no fingers.
// Not tied to a crew colour: any crew can get any card. Same wording in Classic and Corners; where Corners has several
// lines, "one of your lines" is chosen by the engine (the qualifying line with the most ATK + BLK, lowest corner on a tie).
// "A Fire card" = Fire at either end of the card (30 of the 72 cards per element). The elem cards' `stat` is the seam
// stat of that element; it only steers the bots' pick.
import { shuffle, d6 } from "../rng.js";
import { lineStats } from "../line.js";
import { botRng } from "../cast.js";

export const CHARACTERS = {
  arsonist:     { name: "The Arsonist",     text: "+1 ATK and +1 BLK on one of your lines with 2 or more Fire cards in it.", elem: "fire", stat: "atk" },
  stormChaser:  { name: "Storm Chaser",     text: "+1 ATK and +1 BLK on one of your lines with 2 or more Wind cards in it.", elem: "wind", stat: "atk" },
  groundskeeper:{ name: "The Groundskeeper",text: "+1 ATK and +1 BLK on one of your lines with 2 or more Earth cards in it.", elem: "earth", stat: "blk" },
  plumber:      { name: "The Plumber",      text: "+1 ATK and +1 BLK on one of your lines with 2 or more Water cards in it.", elem: "water", stat: "blk" },
  bigHands:     { name: "Big Hands",        text: "You may cast 1 more card (3 becomes 4; The Turf 5)." },
  tailor:       { name: "The Tailor",       text: "Your first seam each round pays its bonus twice (the length still drops by 1 only)." },
  underdog:     { name: "Underdog",         text: "From round 2: if you are last (ties count) when the round starts, +1 ATK and +1 BLK on one of your lines." },
  loadedDice:   { name: "Loaded Dice",      text: "You get 1 more Trigger Thumb, and you roll each Thumb twice and keep the higher roll." },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS);

const charOf = (st, pid) => st.chars?.pick?.[pid] ?? null;
const hasElem = (ctx, cards, e) => cards.some((id) => { const c = ctx.card(id); return c.start === e || c.end === e; });

/** Last place (ties count) at the start of the round: most damage (Classic) or least Rep (Corners). Round 1: nobody. */
export function isLast(st, ctx, pid) {
  if (st.round <= 1) return false;
  const dmg = ctx.cfg.win.track === "damage";
  const v = (p) => (dmg ? p.tracks.damage : -p.tracks.rep);
  return v(st.players[pid]) === Math.max(...st.players.map(v));
}
/** Which of this crew's cast lines (by zone) the card boosts this round, and how. Raw line stats pick the line. */
function boostFor(st, ctx, pid) {
  const id = charOf(st, pid), c = CHARACTERS[id];
  const cast = st.casts[pid];
  if (!c || !cast) return null;
  const lines = cast.lines.filter((l) => l.cards.length).map((l) => ({ zone: l.zone, cards: l.cards, ...lineStats(l.cards.map(ctx.card)) }));
  const best = (ls, key) => [...ls].sort((a, b) => key(b) - key(a) || a.zone - b.zone)[0];
  if (c.elem) {
    const ln = best(lines.filter((l) => l.cards.filter((id) => hasElem(ctx, [id], c.elem)).length >= 2), (l) => l.atk + l.blk);
    return ln && { zone: ln.zone, atk: 1, blk: 1 };
  }
  if (id === "tailor") {
    const ln = [...lines].sort((a, b) => a.zone - b.zone).find((l) => l.seams.length);
    return ln && { zone: ln.zone, [ln.seams[0].bonus]: 1 };
  }
  if (id === "underdog" && isLast(st, ctx, pid)) {
    const ln = best(lines, (l) => l.atk + l.blk);
    return ln && { zone: ln.zone, atk: 1, blk: 1 };
  }
  return null;
}

/** Bot pick: a rough worth of each card (from bot sweeps, see DEVLOG §6), plus a little noise (botRng, never the game rng). */
function botWorth(st, ctx, pid, id, r) {
  const c = CHARACTERS[id], hand = st.players[pid].hand;
  const corners = st.zones.length > 1;
  if (c.elem) {
    const share = hand.filter((h) => hasElem(ctx, [h], c.elem)).length / Math.max(1, hand.length);
    return 0.5 + share + (corners && c.stat === "atk" ? 0.2 : 0) + r() * 0.3; // Corners pays ATK more than BLK
  }
  const base = { bigHands: 1.0, tailor: 0.95, underdog: 0.7, loadedDice: 0.6 }[id] ?? 0.5;
  return base + r() * 0.3;
}

export default {
  id: "characters",

  init(st, ctx) {
    const n = Math.max(1, ctx.p.charDeal ?? 2);
    const deal = shuffle(st, [...CHARACTER_IDS]);
    st.chars = { offer: {}, pick: {}, done: false };
    for (const pl of st.players) st.chars.offer[pl.id] = deal.splice(0, n);
    if (n === 1) {
      for (const pl of st.players) st.chars.pick[pl.id] = st.chars.offer[pl.id][0];
      for (const pl of st.players) if (st.chars.pick[pl.id] === "loadedDice") pl.thumbs += 1;
      st.chars.done = true;
      st.log.push({ r: 0, k: "chars", picks: { ...st.chars.pick }, text: "Character cards: " + st.players.map((p) => `${p.name} is ${CHARACTERS[st.chars.pick[p.id]].name}`).join(" · ") + "." });
    } else st.log.push({ r: 0, k: "setup", text: `Character cards: every crew is dealt ${n} and keeps 1.` });
  },

  steps: [
    {
      // before the first spin, everyone keeps one card at the same time (hidden until all picked)
      id: "charPick", phase: "ROUND_START", order: 2, kind: "choice",
      when: (st) => st.chars && !st.chars.done,
      spec: (st, ctx, pid) => ({
        type: "option", chars: true, prompt: "Character card: keep one for the whole game. It is public and always on.",
        options: st.chars.offer[pid].map((id) => ({ value: id, label: CHARACTERS[id].name, hint: CHARACTERS[id].text })),
      }),
      validate: (st, ctx, pid, v) => (st.chars.offer[pid].includes(v) ? null : "Pick one of your two character cards"),
      apply(st, ctx, answers) {
        for (const pl of st.players) st.chars.pick[pl.id] = answers[pl.id];
        for (const pl of st.players) if (st.chars.pick[pl.id] === "loadedDice") pl.thumbs += 1;
        st.chars.done = true;
        st.log.push({ r: st.round, k: "chars", picks: { ...st.chars.pick }, text: "Character cards flip: " + st.players.map((p) => `${p.name} is ${CHARACTERS[st.chars.pick[p.id]].name}`).join(" · ") + "." });
      },
      bot(st, ctx, pid) {
        const r = botRng(st, pid, "char");
        const offer = st.chars.offer[pid];
        let best = offer[0], bs = -Infinity;
        for (const id of offer) { const w = botWorth(st, ctx, pid, id, r); if (w > bs) { bs = w; best = id; } }
        return best;
      },
    },
    {
      // one public line a round naming what the cards did (written after the flip, so the reveal lines stay together)
      id: "charNote", phase: "REVEAL", order: 5, kind: "auto",
      run(st, ctx) {
        const said = [];
        for (const pl of st.players) {
          const id = charOf(st, pl.id), b = st.charFx?.[pl.id];
          if (!b) continue;
          const what = [b.atk ? `+${b.atk} ATK` : "", b.blk ? `+${b.blk} BLK` : ""].filter(Boolean).join(" ");
          said.push(`${pl.name} ${what}${b.zone != null && st.zones.length > 1 ? ` at ${st.zones.find((z) => z.i === b.zone)?.name}` : ""} (${CHARACTERS[id].name})`);
        }
        for (const pl of st.players) if (st.charRolls?.[pl.id]) said.push(`${pl.name} rolls twice (Loaded Dice: ${st.charRolls[pl.id].join(", ")})`);
        delete st.charFx; delete st.charRolls;
        if (said.length) st.log.push({ r: st.round, k: "char", text: "Character cards: " + said.join(" · ") + "." });
      },
    },
  ],

  limitsFor(st, ctx, pid, lim) {
    return charOf(st, pid) === "bigHands" ? { ...lim, maxCards: lim.maxCards + 1 } : null;
  },

  adjustLine(st, ctx, pid, ln) {
    const b = boostFor(st, ctx, pid);
    if (!b || b.zone !== ln.zone) return;
    ln.atk += b.atk || 0; ln.blk += b.blk || 0;
    (st.charFx ||= {})[pid] = b;
  },

  thumbRoll(st, ctx, pid, r) {
    if (charOf(st, pid) !== "loadedDice") return r;
    const again = d6(st);
    ((st.charRolls ||= {})[pid] ||= []).push(`${r}/${again}`);
    return Math.max(r, again);
  },

  // the offers are secret (the card you didn't keep goes back unseen); the kept cards are public once everyone has picked
  redactView(st, v, pid) {
    if (!v.chars) return;
    v.chars = { done: st.chars.done, pick: st.chars.done ? { ...st.chars.pick } : {}, offer: pid != null && st.chars.offer[pid] ? { [pid]: [...st.chars.offer[pid]] } : {} };
  },
};
