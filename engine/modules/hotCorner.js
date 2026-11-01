// Hot corner (GP2 Corners expansion, 2026-11-01; P15's rich Spot borrowed for Corners): after the Wheel, the Vein runs
// hot at one corner, picked at random (The Turf's extra corner included). Holding it at the end of the round pays
// `hotRep` extra Rep (default 1) on top of the usual pay. Bots don't aim for it yet.
import { pick } from "../rng.js";

export default {
  id: "hotCorner",
  steps: [
    {
      id: "hotCorner", phase: "ROUND_START", order: 20, kind: "auto",
      run(st, ctx) {
        for (const z of st.zones) z.hot = false;
        const z = pick(st, st.zones);
        z.hot = true;
        st.log.push({ r: st.round, k: "hot", zone: z.name, text: `The Vein runs hot at ${z.name}: holding it pays +${ctx.p.hotRep ?? 1} Rep this round.` });
      },
    },
  ],
  zoneRep: (st, ctx, z) => (z.hot ? ctx.p.hotRep ?? 1 : 0),
};
