// Bot-vs-bot sweep: node tools/simulate.mjs [games=200] [mode] [modifier,modifier]
// Prints win share by seat, average final score, and how often the bot's choices mattered.
import { loadData } from "../engine/load-node.js";
import { playOut } from "../engine/run.js";

const [n = 200, onlyMode, mods = ""] = process.argv.slice(2);
const { data, modes, modifiers } = loadData();
for (const mode of Object.values(modes)) {
  if (onlyMode && mode.id !== onlyMode) continue;
  const mm = mods ? mods.split(",").map((id) => modifiers[id]) : [];
  for (const players of mode.players) {
    const wins = Array(players).fill(0), score = Array(players).fill(0);
    const t0 = Date.now();
    for (let g = 0; g < +n; g++) {
      const st = playOut({ mode, modifiers: mm, seats: Array.from({ length: players }, () => ({ kind: "bot" })), seed: `sim-${g}` }, data);
      wins[st.result.order[0]]++;
      st.result.scores.forEach((s, i) => (score[i] += s));
    }
    console.log(`${mode.id.padEnd(15)} ${players}p  wins ${wins.map((w) => ((100 * w) / n).toFixed(0) + "%").join(" ")}  avg ${mode.win.track} ${score.map((s) => (s / n).toFixed(1)).join(" ")}  (${Date.now() - t0} ms)`);
  }
}
