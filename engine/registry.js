// Mode registry: turns a mode file + ticked modifiers into one game config, checks that the
// combination makes sense, and builds the ordered step list for a round.
import core from "./modules/core.js";
import matrix from "./modules/matrix.js";
import corners from "./modules/corners.js";
import holdTheBlock from "./modules/holdTheBlock.js";
import postedUp from "./modules/postedUp.js";
import callOut from "./modules/callOut.js";
import passTheTab from "./modules/passTheTab.js";
import forecast from "./modules/forecast.js";
import locations from "./modules/locations.js";
import blockCorner from "./modules/blockCorner.js";
import openCard from "./modules/openCard.js";
import runItUp from "./modules/runItUp.js";
import hotCorner from "./modules/hotCorner.js";

export const MODULES = { core, matrix, corners, holdTheBlock, postedUp, callOut, passTheTab, forecast, locations, blockCorner, openCard, runItUp, hotCorner };

// Fixed round phases (MULTIMODE_PLAYTEST_PLAN.md §2.1). Modules hook into phases, never reorder them.
export const PHASES = ["ROUND_START", "PRE_CAST", "CAST", "PRE_REVEAL", "REVEAL", "RESOLVE", "POST_RESOLVE", "REFILL", "ROUND_END"];

export const DEFAULT_PARAMS = { rounds: 8, hand: 8, thumbs: 2, line: 8, maxCards: 3, minCards: 1, matrixSet: "standard", wheelCooldown: 3, physicalDeck: false };

/**
 * @param mode       a data/modes/*.json object
 * @param modifiers  data/modifiers.json objects the host ticked
 * @param players    number of seats
 * @returns {{config, errors:string[]}}
 */
export function resolveMode(mode, modifiers = [], players = 4) {
  const errors = [];
  const modules = ["core", ...mode.modules];
  let params = { ...DEFAULT_PARAMS, ...mode.params };
  for (const m of modifiers) {
    errors.push(...modifierProblems(mode, m));
    for (const id of m.modules || []) if (!modules.includes(id)) modules.push(id);
    params = { ...params, ...m.params };
  }
  for (const id of modules) if (!MODULES[id]) errors.push(`Unknown module "${id}"`);
  if (!mode.players.includes(players)) errors.push(`${mode.name} plays with ${mode.players.join("/")} players, not ${players}`);
  const config = {
    id: mode.id, name: mode.name, pathway: mode.pathway,
    modifiers: modifiers.map((m) => m.id),
    modules, params, zones: mode.zones, wheel: mode.wheel || {}, win: mode.win, rules: mode.rules,
  };
  return { config, errors };
}

/** Why a modifier can't be ticked for this mode ([] = fine). Used by the lobby to grey options out. */
export function modifierProblems(mode, m) {
  const out = [];
  const req = m.requires || {};
  if (req.track && mode.win.track !== req.track) out.push(`${m.name} needs a damage-scored mode`);
  if (req.modes && !req.modes.includes(mode.id)) out.push(`${m.name} is for ${req.modes.join(", ")} only`);
  for (const id of req.modules || []) if (!mode.modules.includes(id)) out.push(`${m.name} needs ${id}`);
  return out;
}

const stepCache = new Map();
export function stepsFor(config) {
  const key = config.modules.join(",");
  if (!stepCache.has(key)) {
    const steps = [];
    config.modules.forEach((id, mi) => (MODULES[id].steps || []).forEach((s, si) => steps.push({ ...s, module: id, _k: mi * 100 + si })));
    steps.sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || (a.order ?? 50) - (b.order ?? 50) || a._k - b._k);
    stepCache.set(key, steps);
  }
  return stepCache.get(key);
}

export const modulesOf = (config) => config.modules.map((id) => MODULES[id]);

/** Limit changes from the Wheel (line length, cards). Modules may add effects. */
export function effectDef(config, fx) {
  for (const m of modulesOf(config)) if (m.effects && m.effects[fx]) return m.effects[fx];
  return null;
}
