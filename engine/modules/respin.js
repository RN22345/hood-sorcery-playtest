// Shared step for every re-spin of the Wheel (Lucky Charm from Contraband, Confession from Turf Perks).
// Right after the spin, each crew that holds a re-spin sees the sector and answers in secret: keep it, or use one.
// At most one re-spin a round: Lucky Charm goes first (lowest seat), then Confession. The first `wheel` log line stays;
// the re-spin logs a `respin` line. Modules supply the options through `respinOptions(st, ctx, pid)` and are told
// which one was used through `respinUsed(st, ctx, pid, value)`. Loaded only by the experiment modifiers that need it
// (a step in every game would shift st.stepIdx and change every bot choice and test vector).
import { spinWheel } from "./core.js";

const options = (st, ctx, pid) => ctx.mods.flatMap((m) => m.respinOptions?.(st, ctx, pid) || []);

export default {
  id: "respin",
  steps: [
    {
      id: "respin", phase: "ROUND_START", order: 11, kind: "choice",
      who: (st, ctx) => st.players.filter((p) => options(st, ctx, p.id).length).map((p) => p.id),
      spec(st, ctx, pid) {
        const sector = ctx.data.wheel.find((w) => w.id === st.wheel);
        return {
          type: "option", respin: true, wheel: st.wheel,
          prompt: `The Wheel landed on ${sector?.name}. Keep it, or re-spin?`,
          options: [{ value: "keep", label: "Keep it" }, ...options(st, ctx, pid)],
        };
      },
      validate(st, ctx, pid, v) {
        if (v !== "keep" && !options(st, ctx, pid).some((o) => o.value === v)) return "You can't do that";
      },
      apply(st, ctx, answers) {
        const asked = Object.keys(answers).map(Number).filter((id) => answers[id] !== "keep").sort((a, b) => a - b);
        if (!asked.length) return;
        const value = asked.some((id) => answers[id] === "luckyCharm") ? "luckyCharm" : answers[asked[0]];
        const pid = asked.find((id) => answers[id] === value);
        for (const m of ctx.mods) m.respinUsed?.(st, ctx, pid, value);
        const was = ctx.data.wheel.find((w) => w.id === st.wheel).name;
        st.log.push({ r: st.round, k: "item", pid, text: `${st.players[pid].name} ${value === "luckyCharm" ? "plays a Lucky Charm" : "makes a Confession"}: re-spin (${was} is off the Wheel).` });
        spinWheel(st, ctx, { respin: true });
        const rest = asked.filter((id) => id !== pid);
        if (rest.length) st.log.push({ r: st.round, k: "say", text: `Only one re-spin a round: ${rest.map((id) => st.players[id].name).join(", ")} keep${rest.length === 1 ? "s" : ""} theirs.` });
      },
      bot(st, ctx, pid) {
        const bad = new Set(["cuffed", "bleedingRep", "bleeding", "muggedCorner", "rotateAtk", "rotateBlk", "challengerTies"]);
        const opts = options(st, ctx, pid);
        if (!opts.length || !bad.has(st.fx)) return "keep";
        // Confession is free (once a game), so spend it on any curse; Lucky Charm only when the round is late or the curse hurts a lot
        return opts.find((o) => o.value === "confession")?.value ?? (st.fx === "cuffed" || st.fx === "bleedingRep" || ctx.p.rounds - st.round <= 3 ? opts[0].value : "keep");
      },
    },
  ],
};
