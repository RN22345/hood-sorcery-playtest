// P16 Call Out (Docs/Concept Rework/11_Call_Out.md). After the cast, before the flip, a crew may
// spend a ready Thumb (one not committed to its line) to call out a rival. Picks are hidden and
// simultaneous (the app version). Settle after ranking: caller ATK > target BLK -> target +1
// damage, else caller +1. With Posted Up you may only call out a crew at your Spot.
import { botRng } from "../cast.js";

const readyThumbs = (st, pid) => st.players[pid].thumbs - (st.casts[pid]?.thumbs.length || 0);

function targets(st, ctx, pid) {
  const local = ctx.cfg.modules.includes("postedUp");
  return st.players.filter((p) => p.id !== pid && (!local || p.at === st.players[pid].at)).map((p) => p.id);
}

export default {
  id: "callOut",
  steps: [
    {
      id: "callOut", phase: "PRE_REVEAL", order: 10, kind: "choice",
      who: (st, ctx) => st.players.filter((p) => readyThumbs(st, p.id) > 0 && targets(st, ctx, p.id).length).map((p) => p.id),
      spec: (st, ctx, pid) => ({
        type: "option",
        prompt: `Call out a rival? Costs 1 Thumb (you have ${readyThumbs(st, pid)} ready). Your ATK must beat their BLK, or you take the hit.`,
        options: [{ value: -1, label: "No call-out" }, ...targets(st, ctx, pid).map((id) => ({ value: id, label: `Call out ${st.players[id].name}` }))],
      }),
      validate: (st, ctx, pid, v) => (v === -1 || targets(st, ctx, pid).includes(v) ? null : "Pick a rival or no call-out"),
      apply(st, ctx, answers) {
        st.ext.callouts = [];
        for (const pid in answers) {
          if (answers[pid] === -1) continue;
          st.ext.callouts.push({ from: +pid, to: answers[pid] });
          st.players[pid].thumbs -= 1;
        }
        st.log.push({ r: st.round, k: "callout", text: st.ext.callouts.length ? "Call-outs: " + st.ext.callouts.map((c) => `${st.players[c.from].name} → ${st.players[c.to].name}`).join(", ") : "No call-outs." });
      },
      bot(st, ctx, pid) {
        const r = botRng(st, pid, "callout");
        const t = targets(st, ctx, pid);
        const cast = st.casts[pid];
        if (st.round < 3 || r() > 0.25) return -1;
        const leader = t.sort((a, b) => st.players[a].tracks.damage - st.players[b].tracks.damage)[0];
        return cast ? leader : -1;
      },
    },
    {
      id: "settleCallOuts", phase: "POST_RESOLVE", order: 30, kind: "auto",
      when: (st) => st.ext.callouts?.length,
      run(st) {
        for (const c of st.ext.callouts) {
          const a = st.res[c.from].atk, b = st.res[c.to].blk;
          const loser = a > b ? c.to : c.from;
          st.players[loser].tracks.damage += 1;
          st.log.push({ r: st.round, k: "callout", pid: loser, d: 1, pids: [c.from, c.to], text: `${st.players[c.from].name} ATK ${a} vs ${st.players[c.to].name} BLK ${b}: ${a > b ? "lands" : "backfires"}, ${st.players[loser].name} +1 damage.` });
        }
        st.ext.callouts = [];
      },
    },
  ],
};
