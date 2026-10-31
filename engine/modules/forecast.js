// Posted Up modifier: from round `forecastFrom`, the Vein announces next round's rich Spot.
import { d6 } from "../rng.js";
import { richFromRoll } from "./postedUp.js";

export default {
  id: "forecast",
  steps: [
    {
      id: "forecast", phase: "ROUND_START", order: 25, kind: "auto",
      when: (st, ctx) => st.round >= ctx.p.forecastFrom && st.round < ctx.p.rounds,
      run(st) {
        st.ext.nextRich = richFromRoll(d6(st));
        st.log.push({ r: st.round, k: "forecast", text: `Forecast: the Vein is moving toward the ${st.zones[st.ext.nextRich].name}.` });
      },
    },
  ],
};
