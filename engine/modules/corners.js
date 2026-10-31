// P1 Corners (Docs/Concept Rework/05_Pathways.md): cast lines under any of the corners, one
// shared finger budget. Per corner: challengers count ATK, the holder counts BLK; holder wins
// ties; between challengers: shorter line, then roll-off. An undefended corner falls to the best
// challenger with ATK 1+. Each corner held pays Rep. Most Rep wins.
// Wheel rereads (playtest guesses, see modes/corners.md): The Turf opens an extra corner;
// Mugged gives the corner won with the highest total to its runner-up; Sabotage gives ties to
// challengers; Bleeding costs every crew that lost a contest 1 Rep. Thumb 6 = +1 Rep.
import { rankEntries } from "../rank.js";
import { enumerateLines } from "../line.js";
import { botRng, botThumbs } from "../cast.js";

const sig = (x) => 1 / (1 + Math.exp(-x));

export default {
  id: "corners",
  effects: { extraZone: { maxCards: 4 } },
  steps: [
    {
      id: "closeExtraCorner", phase: "ROUND_START", order: 5, kind: "auto",
      run(st) { st.zones = st.zones.filter((z) => !z.extra); },
    },
    {
      id: "openExtraCorner", phase: "ROUND_START", order: 15, kind: "auto",
      when: (st) => st.fx === "extraZone",
      run(st) {
        st.zones.push({ i: st.zones.length, name: "The Turf", holder: null, rich: false, extra: true });
        st.log.push({ r: st.round, k: "zone", text: "The Turf: an extra corner opens this round (up to 4 cards)." });
      },
    },
    {
      id: "corners", phase: "RESOLVE", order: 10, kind: "auto",
      run(st, ctx) {
        const out = [];
        const lost = new Set();
        for (const z of st.zones) {
          const here = st.players
            .map((p) => ({ pid: p.id, ln: st.res[p.id].lines.find((l) => l.zone === z.i) }))
            .filter((h) => h.ln);
          if (!here.length) continue;
          const def = here.find((h) => h.pid === z.holder);
          const chall = here.filter((h) => h.pid !== z.holder && h.ln.atk >= 1);
          const order = rankEntries(st, chall.map((h) => ({ pid: h.pid, val: h.ln.atk, len: h.ln.len, other: h.ln.blk })), z.name);
          const lineOf = (pid) => here.find((h) => h.pid === pid).ln;
          const before = z.holder;
          let winner = z.holder, score = def ? def.ln.blk : 0, runnerUp = null;
          if (order.length) {
            const b = order[0], bAtk = lineOf(b).atk;
            const tiesToChallenger = st.fx === "challengerTies" || ctx.mods.some((m) => m.challengerTies?.(st, ctx, z));
            if (!def || bAtk > def.ln.blk || (bAtk === def.ln.blk && tiesToChallenger)) {
              winner = b; score = bAtk; runnerUp = def ? def.pid : order[1] ?? null;
            } else runnerUp = b;
          }
          z.holder = winner;
          for (const h of here) if (h.pid !== winner) lost.add(h.pid);
          for (const m of ctx.mods) m.contestLost?.(st, ctx, z, here.map((h) => h.pid).filter((id) => id !== winner));
          out.push({ z, before, winner, score, runnerUp });
          const who = (id) => (id == null ? "nobody" : st.players[id].name);
          const verb = winner == null ? "stays empty" : winner === before ? `held by ${who(winner)}` : `taken by ${who(winner)}`;
          st.log.push({ r: st.round, k: "corner", text: `${z.name}: ${verb} (${here.map((h) => `${who(h.pid)} ${h.pid === before ? "BLK " + h.ln.blk : "ATK " + h.ln.atk}`).join(", ")})` });
        }
        if (st.fx === "muggedCorner") {
          const c = out.filter((o) => o.runnerUp != null && o.winner != null).sort((a, b) => b.score - a.score)[0];
          if (c) {
            lost.add(c.winner); lost.delete(c.runnerUp);
            c.z.holder = c.runnerUp;
            st.log.push({ r: st.round, k: "corner", text: `Mugged: ${c.z.name} goes to the runner-up, ${st.players[c.runnerUp].name}.` });
          }
        }
        for (const pl of st.players) {
          const heldZones = st.zones.filter((z) => z.holder === pl.id);
          // each corner pays repPerCorner, plus any module bonus (Bodega, the Block); upkeep beyond upkeepFrom corners
          let gain = heldZones.reduce((a, z) => a + ctx.p.repPerCorner + ctx.mods.reduce((b, m) => b + (m.zoneRep?.(st, ctx, z) || 0), 0), 0) + st.res[pl.id].six;
          const upkeep = ctx.p.repUpkeepFrom ? Math.max(0, heldZones.length - ctx.p.repUpkeepFrom + 1) : 0;
          gain -= upkeep;
          if (st.fx === "bleedingRep" && lost.has(pl.id) && !st.zones.some((z) => z.holder === pl.id && st.res[pl.id].lines.some((l) => l.zone === z.i))) gain -= 1;
          pl.tracks.rep = Math.max(0, pl.tracks.rep + gain);
          if (gain) st.log.push({ r: st.round, k: "rep", pid: pl.id, text: `${pl.name} ${gain > 0 ? "+" : ""}${gain} Rep${st.res[pl.id].six ? " (incl. Thumb 6)" : ""}${upkeep ? ` (upkeep −${upkeep})` : ""} → ${pl.tracks.rep}` });
        }
      },
    },
  ],

  botCast(st, ctx, pid) {
    const r = botRng(st, pid, "corners");
    const { line, maxCards } = st.limits;
    const hand = st.players[pid].hand.map(ctx.card);
    const lines = enumerateLines(hand, line, maxCards);
    const zoneVal = (z, l) => {
      if (z.holder === pid) return sig(l.blk - 5);
      if (z.holder == null) return sig(l.atk - 3);
      return sig(l.atk - 5.5);
    };
    const baseKeep = st.zones.filter((z) => z.holder === pid).length * 0.4;
    const undefendedLoss = (zs) => zs.filter((z) => z.holder === pid).length * 0.4;
    let best = null, bs = -Infinity;
    const consider = (plan, v) => { v += r() * 0.3; if (v > bs) { bs = v; best = plan; } };
    for (const l of lines) for (const z of st.zones) {
      consider([{ zone: z.i, cards: l.cards }], baseKeep - undefendedLoss([z]) + zoneVal(z, l));
    }
    const small = lines.filter((l) => l.cards.length <= 2).sort((a, b) => b.atk + b.blk - a.atk - a.blk).slice(0, 40);
    for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
      const a = small[i], b = small[j];
      if (a.len + b.len > line || a.cards.length + b.cards.length > maxCards || a.cards.some((c) => b.cards.includes(c))) continue;
      for (const za of st.zones) for (const zb of st.zones) {
        if (za === zb) continue;
        consider([{ zone: za.i, cards: a.cards }, { zone: zb.i, cards: b.cards }], baseKeep - undefendedLoss([za, zb]) + zoneVal(za, a) + zoneVal(zb, b));
      }
    }
    return { lines: best, thumbs: botThumbs(st, ctx, pid, best[0].zone) };
  },
};
