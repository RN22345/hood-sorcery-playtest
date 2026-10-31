// Headless runner: plays a whole game with bots in every seat (or a given decide() function).
import { createGame, act, botChoice } from "./game.js";

export function playOut(setup, data, decide = botChoice) {
  let st = createGame(setup, data);
  for (let guard = 0; !st.over; guard++) {
    if (guard > 20000) throw new Error("playOut: too many actions");
    const pid = st.pending.who.find((id) => !(id in st.pending.answers));
    const r = act(st, data, { pid, value: decide(st, data, pid) });
    if (r.error) throw new Error(`${st.pending.step} P${pid + 1}: ${r.error}`);
    st = r.state;
  }
  return st;
}
