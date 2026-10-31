// Step-by-step replay of a downloaded game log (backlog A4). No DOM: rebuilds every state from the log's
// setup + actions with the engine, and marks the "stops" a viewer steps through (each finished decision step).
import { createGame, act } from "../engine/game.js";

/**
 * @param log  a game log (.json from the end screen; host or hot-seat logs carry the actions)
 * @param modes / modifiers  by id, as the app and loadData() hold them
 * @returns {{states, stops:number[], rounds:Object<number,number>, diverged:boolean} }  stops index into states
 */
export function buildReplay(log, data, modes, modifiers) {
  if (!log?.setup || !Array.isArray(log.actions)) throw new Error("This log has no moves (only the host's or a hot-seat log can be replayed).");
  const mode = modes[log.setup.modeId];
  if (!mode) throw new Error(`Unknown mode "${log.setup.modeId}"`);
  const mods = (log.setup.modifiers || []).map((id) => modifiers[id]).filter(Boolean);
  let st = createGame({ mode, modifiers: mods, seats: log.setup.seats, seed: log.setup.seed }, data);
  const states = [st], stops = [0];
  for (const a of log.actions) {
    const r = act(st, data, a);
    if (r.error) throw new Error(`The moves don't fit this version of the rules (round ${a.round}, ${a.step}: ${r.error}).`);
    st = r.state;
    states.push(st);
    if (st.over || !st.pending || !Object.keys(st.pending.answers).length) stops.push(states.length - 1);
  }
  if (stops[stops.length - 1] !== states.length - 1) stops.push(states.length - 1);
  const rounds = {};
  stops.forEach((k, i) => { if (!(states[k].round in rounds)) rounds[states[k].round] = i; });
  const diverged = !!log.result && JSON.stringify(st.result?.order) !== JSON.stringify(log.result.order);
  return { states, stops, rounds, diverged };
}
