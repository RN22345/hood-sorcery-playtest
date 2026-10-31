// P2 Hold the Block (Docs/Concept Rework/05_Pathways.md). The matrix retires; comparisons only.
// Holder's ATK hits each Street crew whose BLK is lower (+1 each). Each Street crew whose ATK is
// higher than the holder's BLK hits the holder (+1 each). The Vein heals the holder. Then stay or
// bail (holder) / in or out (Street): if the holder bails or took kickHits+ hits, the highest-ATK
// Street crew that said "in" moves in. Empty Block: the round's highest ATK takes it.
// Wheel rereads (playtest guesses): Mugged = no heal this round; Sabotage = holder BLK -2;
// Bleeding = last on ATK and last on BLK +1 each (ranked as in Classic).
import { rankStat } from "../rank.js";
import { bestLine, botThumbs, botRng } from "../cast.js";

const holderOf = (st) => st.zones[0].holder;

export default {
  id: "holdTheBlock",
  steps: [
    {
      id: "blockHits", phase: "RESOLVE", order: 10, kind: "auto",
      run(st, ctx) {
        const h = holderOf(st);
        const pids = st.players.map((p) => p.id);
        st.ext.hits = 0;
        if (h != null) {
          const hr = st.res[h];
          const hBlk = Math.max(0, hr.blk - (st.fx === "holderBlkDown" ? 2 : 0));
          const hitStreet = [], hitHolder = [];
          for (const s of pids) {
            if (s === h) continue;
            if (st.res[s].blk < hr.atk) { st.rd[s] += 1; hitStreet.push(st.players[s].name); }
            if (st.res[s].atk > hBlk) { st.rd[h] += 1; st.ext.hits += 1; hitHolder.push(st.players[s].name); }
          }
          st.log.push({ r: st.round, k: "block", text: `${st.players[h].name} (holder, ATK ${hr.atk} / BLK ${hBlk}) hits ${hitStreet.join(", ") || "nobody"}; hit by ${hitHolder.join(", ") || "nobody"}.` });
        }
        if (st.fx === "bleeding") {
          const last = pids.length - 1;
          const a = rankStat(st, pids, "atk"), b = rankStat(st, pids, "blk");
          st.rd[a[last]] += 1; st.rd[b[last]] += 1;
          st.log.push({ r: st.round, k: "block", text: `Bleeding: ${st.players[a[last]].name} (last ATK) and ${st.players[b[last]].name} (last BLK) +1.` });
        }
      },
    },
    {
      id: "blockHeal", phase: "POST_RESOLVE", order: 10, kind: "auto",
      when: (st) => holderOf(st) != null,
      run(st, ctx) {
        const h = st.players[holderOf(st)];
        if (st.fx === "noHeal") { st.log.push({ r: st.round, k: "block", text: "Mugged: the Vein doesn't feed the holder this round." }); return; }
        const before = h.tracks.damage;
        h.tracks.damage = Math.max(0, before - ctx.p.blockHeal);
        st.log.push({ r: st.round, k: "heal", pid: h.id, d: h.tracks.damage - before, text: `The Vein feeds ${h.name}: −${before - h.tracks.damage} damage.` });
      },
    },
    {
      id: "claimEmptyBlock", phase: "POST_RESOLVE", order: 20, kind: "auto",
      when: (st) => holderOf(st) == null,
      run(st) {
        const first = rankStat(st, st.players.map((p) => p.id), "atk", "the Block")[0];
        st.zones[0].holder = first;
        st.log.push({ r: st.round, k: "block", zone: st.zones[0].name, holder: first, text: `${st.players[first].name} has the highest ATK and takes the empty Block.` });
        st.ext.justClaimed = st.round;
      },
    },
    {
      id: "stayBail", phase: "POST_RESOLVE", order: 30, kind: "choice",
      when: (st, ctx) => holderOf(st) != null && st.ext.justClaimed !== st.round && st.round < ctx.p.rounds,
      spec(st, ctx, pid) {
        const h = holderOf(st);
        if (pid === h) return {
          type: "option", prompt: `You hold the Block (hit ${st.ext.hits} time${st.ext.hits === 1 ? "" : "s"} this round${st.ext.hits >= ctx.p.kickHits ? ": you're knocked off anyway" : ""}). Stay or bail?`,
          options: [{ value: "stay", label: "Thumb up: stay" }, { value: "bail", label: "Thumb down: bail" }],
        };
        return {
          type: "option", prompt: `${st.players[h].name} holds the Block. Do you want in if it opens up?`,
          options: [{ value: "in", label: "Thumb up: I want in" }, { value: "out", label: "Thumb down: stay out" }],
        };
      },
      validate(st, ctx, pid, v) {
        const ok = pid === holderOf(st) ? ["stay", "bail"] : ["in", "out"];
        return ok.includes(v) ? null : "Choose one of the options";
      },
      apply(st, ctx, answers) {
        const h = holderOf(st);
        const leaving = answers[h] === "bail" || st.ext.hits >= ctx.p.kickHits;
        const wants = st.players.filter((p) => p.id !== h && answers[p.id] === "in").map((p) => p.id);
        const shown = st.players.map((p) => `${p.name} ${answers[p.id]}`).join(", ");
        if (!leaving) { st.log.push({ r: st.round, k: "block", text: `Thumbs: ${shown}. ${st.players[h].name} stays on the Block.` }); return; }
        const next = wants.length ? rankStat(st, wants, "atk", "moving in")[0] : null;
        st.zones[0].holder = next;
        st.log.push({ r: st.round, k: "block", zone: st.zones[0].name, holder: next ?? null, text: `Thumbs: ${shown}. ${st.players[h].name} ${answers[h] === "bail" ? "bails" : "is knocked off"}; ${next == null ? "the Block is empty" : st.players[next].name + " moves in"}.` });
      },
      bot(st, ctx, pid) {
        const h = holderOf(st);
        const r = botRng(st, pid, "stay");
        const me = st.players[pid];
        if (pid === h) return st.ext.hits >= 2 && r() < 0.6 ? "bail" : "stay";
        const lowest = Math.min(...st.players.map((p) => p.tracks.damage));
        return st.res[pid].atk >= st.res[h].atk || me.tracks.damage > lowest + 1 || r() < 0.3 ? "in" : "out";
      },
    },
  ],

  botCast(st, ctx, pid) {
    const h = holderOf(st);
    const w = pid === h ? { atk: 1, blk: 1.2 } : h == null ? { atk: 1.4, blk: 0.8 } : { atk: 1.1, blk: 1 };
    const l = bestLine(st, ctx, pid, (l) => l.atk * w.atk + l.blk * w.blk);
    return { lines: [{ zone: 0, cards: l.cards }], thumbs: botThumbs(st, ctx, pid, 0) };
  },
};
