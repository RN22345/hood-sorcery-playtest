// Engine entry points. Pure rules: no DOM, no network, no Math.random.
//   createGame(setup, data) -> state
//   act(state, data, {pid, value}) -> {state, error?}     (never mutates the input state)
//   choiceFor(state, data, pid)  -> what this player must decide now (or null)
//   viewFor(state, data, pid)    -> what this player may see (hands and secret picks hidden)
//   botChoice(state, data, pid)  -> a value a bot would send for its pending choice
// A game is fully described by its setup + the list in state.actions, so replay(setup, actions)
// reproduces it exactly.
import { seedFrom, shuffle } from "./rng.js";
import { resolveMode, stepsFor, modulesOf } from "./registry.js";

export function prepareData(raw) {
  return { ...raw, cardMap: Object.fromEntries(raw.cards.map((c) => [c.id, c])) };
}

export function makeCtx(st, data) {
  return { data, card: (id) => data.cardMap[id], p: st.mode.params, cfg: st.mode, mods: modulesOf(st.mode) };
}

/**
 * @param setup {{mode, modifiers?, seats:{name?:string, kind?:'human'|'bot'}[], seed}}
 */
export function createGame(setup, data) {
  const { mode, modifiers = [], seats, seed } = setup;
  const { config, errors } = resolveMode(mode, modifiers, seats.length);
  if (errors.length) throw new Error(errors.join("; "));
  const p = config.params;
  const st = {
    v: 1, seed: String(seed), rng: seedFrom(seed), mode: config,
    round: 0, stepIdx: 0, pending: null,
    players: seats.map((s, i) => ({
      id: i, seat: data.crews[i].seat, crew: data.crews[i].name, color: data.crews[i].color, img: data.crews[i].img,
      name: s.name || data.crews[i].name, kind: s.kind || "human",
      hand: [], thumbs: p.thumbs, tracks: { damage: 0, rep: 0 }, at: null, hist: [],
    })),
    deck: [], discard: [], zones: [],
    wheel: null, fx: null, limits: null,
    casts: {}, res: {}, rd: null, revealed: false,
    ext: {}, log: [], actions: [], over: false, result: null,
  };
  st.deck = shuffle(st, data.cards.map((c) => c.id));
  for (const pl of st.players) pl.hand = st.deck.splice(0, p.hand);
  const names = config.zones.names;
  const count = Math.min(p.zoneCount ?? names.length, names.length);
  st.zones = names.slice(0, count).map((name, i) => ({ i, name, holder: null, rich: false, extra: false }));
  const ctx = makeCtx(st, data);
  for (const m of ctx.mods) m.init?.(st, ctx);
  st.log.push({ r: 0, k: "setup", text: `${config.name}${config.modifiers.length ? " + " + config.modifiers.join(", ") : ""} · ${seats.length} crews · seed ${st.seed}` });
  advance(st, data);
  return st;
}

/** Run automatic steps until someone has to decide something, or the game ends. Mutates st. */
export function advance(st, data) {
  const ctx = makeCtx(st, data);
  const steps = stepsFor(st.mode);
  for (let guard = 0; !st.over && !st.pending; guard++) {
    if (guard > 5000) throw new Error("advance(): runaway loop");
    if (st.stepIdx >= steps.length) { st.stepIdx = 0; continue; }
    const s = steps[st.stepIdx];
    if (s.when && !s.when(st, ctx)) { st.stepIdx++; continue; }
    if (s.kind === "auto") { s.run(st, ctx); st.stepIdx++; continue; }
    const who = s.who ? s.who(st, ctx) : st.players.map((pl) => pl.id);
    if (!who.length) { st.stepIdx++; continue; }
    st.pending = { step: s.id, who, answers: {} };
  }
}

const currentStep = (st) => stepsFor(st.mode)[st.stepIdx];

export function act(state, data, { pid, value }) {
  const pend = state.pending;
  if (state.over || !pend) return { state, error: "Nothing to decide right now" };
  if (!pend.who.includes(pid)) return { state, error: "Not your decision" };
  if (pid in pend.answers) return { state, error: "Already locked in" };
  const st = structuredClone(state);
  const ctx = makeCtx(st, data);
  const step = currentStep(st);
  const err = step.validate?.(st, ctx, pid, value);
  if (err) return { state, error: err };
  st.pending.answers[pid] = value;
  st.actions.push({ round: st.round, step: step.id, pid, value });
  if (pend.who.every((id) => id in st.pending.answers)) {
    const answers = st.pending.answers;
    st.pending = null;
    if (step.apply(st, ctx, answers) !== "repeat") st.stepIdx++;
    advance(st, data);
  }
  return { state: st };
}

export function choiceFor(st, data, pid) {
  const pend = st.pending;
  if (!pend || !pend.who.includes(pid) || pid in pend.answers) return null;
  const step = currentStep(st);
  return { step: step.id, ...step.spec(st, makeCtx(st, data), pid) };
}

export function botChoice(st, data, pid) {
  const step = currentStep(st);
  const ctx = makeCtx(st, data);
  if (step.bot) return step.bot(st, ctx, pid);
  const spec = step.spec(st, ctx, pid);
  return spec.options[0].value;
}

export function viewFor(st, data, pid) {
  const v = structuredClone(st);
  delete v.rng; delete v.actions;
  v.deckCount = st.deck.length; delete v.deck;
  for (const pl of v.players) {
    pl.handCount = pl.hand.length;
    if (pl.id !== pid) pl.hand = null;
  }
  if (!st.revealed) v.casts = pid in st.casts ? { [pid]: st.casts[pid] } : {};
  if (v.pending) {
    v.pending.done = Object.keys(st.pending.answers).map(Number);
    v.pending.answers = pid in st.pending.answers ? { [pid]: st.pending.answers[pid] } : {};
  }
  v.you = pid;
  v.choice = pid == null ? null : choiceFor(st, data, pid);
  return v;
}

/**
 * Hand a seat to a bot or back to a human (host replaces a dropped online player). Not a rule and not an
 * action: bots never touch the game rng, so the recorded actions still replay to the same game.
 */
export function setSeatKind(state, pid, kind) {
  const pl = state.players[pid];
  if (!pl || (kind !== "bot" && kind !== "human") || pl.kind === kind) return state;
  const st = structuredClone(state);
  st.players[pid].kind = kind;
  st.log.push({ r: st.round, k: "seat", pid, text: kind === "bot" ? `${pl.name} dropped: a bot plays for them.` : `${pl.name} is back in control.` });
  return st;
}

/** Rebuild a game from its setup and recorded actions (for logs, tests and the Unity vectors). */
export function replay(setup, actions, data) {
  let st = createGame(setup, data);
  for (const a of actions) {
    const r = act(st, data, a);
    if (r.error) throw new Error(`replay: ${a.step} by P${a.pid + 1}: ${r.error}`);
    st = r.state;
  }
  return st;
}
