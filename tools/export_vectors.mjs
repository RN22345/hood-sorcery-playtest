// Test vectors for the Unity (C#) port: node tools/export_vectors.mjs
// Each vector = setup (mode id, modifier ids, seats, seed) + every action + expected wheel spins,
// final scores and finishing order. The C# engine must replay every action and match exactly.
import { writeFileSync, mkdirSync } from "node:fs";
import { loadData } from "../engine/load-node.js";
import { playOut } from "../engine/run.js";
import { modifierProblems } from "../engine/registry.js";

const { data, modes, modifiers } = loadData();
const out = new URL("../tests/vectors/", import.meta.url);
mkdirSync(out, { recursive: true });
const sets = [[], ...Object.values(modifiers).map((m) => [m])];
let n = 0;
for (const mode of Object.values(modes)) {
  for (const mods of sets) {
    if (mods.some((m) => modifierProblems(mode, m).length)) continue;
    for (const players of mode.players) {
      for (let s = 0; s < 2; s++) {
        const seed = `vec-${mode.id}-${players}-${s}`;
        const setup = { mode: mode.id, modifiers: mods.map((m) => m.id), seats: Array.from({ length: players }, () => ({ kind: "bot" })), seed };
        const st = playOut({ ...setup, mode, modifiers: mods }, data);
        const id = [mode.id, ...setup.modifiers, `${players}p`, s].join("_");
        writeFileSync(new URL(`${id}.json`, out), JSON.stringify({
          id, setup, actions: st.actions,
          expect: { wheel: st.log.filter((e) => e.k === "wheel").map((e) => e.id), scores: st.result.scores, order: st.result.order },
        }));
        n++;
      }
    }
  }
}
console.log(`${n} vectors -> tests/vectors/`);
