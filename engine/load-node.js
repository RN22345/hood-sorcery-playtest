// Node-only data loader (tests, tools/simulate.mjs). The browser loads the same JSON with fetch().
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prepareData } from "./game.js";

const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, root)), "utf8"));

export function loadData() {
  const data = prepareData({ cards: read("data/cards.json"), wheel: read("data/wheel.json"), matrices: read("data/matrices.json"), crews: read("data/crews.json") });
  const modes = Object.fromEntries(read("data/modes/index.json").map((id) => [id, read(`data/modes/${id}.json`)]));
  const modifiers = Object.fromEntries(read("data/modifiers.json").map((m) => [m.id, m]));
  return { data, modes, modifiers };
}
