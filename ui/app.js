// Controller: loads data, runs the lobby, and drives a game as one of three roles:
//   local  - everything on this device (hot-seat humans + bots)
//   host   - like local, plus online seats; this browser owns the state and sends each client
//            only viewFor(state, theirSeat)
//   client - joined someone's room; renders the views it receives, sends its answers
// No rules here: the engine decides everything.
import { prepareData, createGame, act, viewFor, botChoice, makeCtx } from "../engine/game.js";
import { modifierProblems } from "../engine/registry.js";
import { castProblem, allowedZones } from "../engine/cast.js";
import { Host, Client } from "../net/peer.js";
import * as V from "./views.js";
import { md } from "./md.js";

const root = document.getElementById("app");
const getJson = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("hsp:" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hsp:" + k, JSON.stringify(v)); } catch {} },
};
const newSeed = () => Math.random().toString(36).slice(2, 8);

const app = {
  screen: "lobby", role: null, st: null, view: null, seat: null, setup: null,
  localSeats: [], localCount: 0, focus: null, cover: null, unlocked: null,
  draft: { key: "", zone: 0, lines: {}, thumbs: [], pick: [] }, allowedZones: [], castProblem: null,
  net: { code: null, status: "", seatNames: {}, conn2seat: {} },
  showLog: !window.matchMedia?.("(max-width: 900px)").matches, error: "", lobbyError: "", survey: { best: "", obvious: "", reads: "", fun: "" }, modal: null,
  botDelay: 220,
  reveal: { seen: 0, until: 0, fresh: false }, // the few seconds after a round's cards flip
  modProblem(mode, m) { return modifierProblems(mode, m)[0] || ""; },
};
window.hsApp = app; // handy in the console while playtesting

async function boot() {
  try {
    const [cards, wheel, matrices, crews, modeIds, modifiers] = await Promise.all(
      ["data/cards.json", "data/wheel.json", "data/matrices.json", "data/crews.json", "data/modes/index.json", "data/modifiers.json"].map(getJson));
    app.data = prepareData({ cards, wheel, matrices, crews });
    app.modes = Object.fromEntries((await Promise.all(modeIds.map((id) => getJson(`data/modes/${id}.json`)))).map((m) => [m.id, m]));
    app.modifiers = Object.fromEntries(modifiers.map((m) => [m.id, m]));
  } catch (e) {
    root.innerHTML = `<p class="err">Could not load game data (${V.esc(e.message)}). Serve this folder over http, e.g. <code>npx http-server</code> or <code>python -m http.server</code>.</p>`;
    return;
  }
  const saved = store.get("lobby", {});
  app.lob = {
    modeId: app.modes[saved.modeId] ? saved.modeId : "corners",
    mods: saved.mods || [],
    seats: saved.seats || [{ kind: "human", name: "" }, { kind: "bot", name: "" }, { kind: "bot", name: "" }, { kind: "bot", name: "" }],
    seed: newSeed(), joinName: saved.joinName || "",
    joinCode: new URLSearchParams(location.search).get("join") || "",
  };
  render();
}

// ------------------------------------------------------------------ rendering
function currentView() {
  if (app.role === "client") { app.cover = null; app.localCount = 1; return app.view; }
  return viewFor(app.st, app.data, app.focus);
}

function prepareDraft(v) {
  const c = v.choice;
  const key = `${v.round}|${v.stepIdx}|${v.you}|${c?.step}|${v.log.length}`;
  if (key !== app.draft.key) {
    const zones = c?.type === "cast" ? allowedZones(v, makeCtx(v, app.data), v.you) : [];
    app.draft = { key, zone: zones[0] ?? 0, lines: {}, thumbs: [], pick: [] };
    app.allowedZones = zones;
    app.error = app.error && app.role === "client" ? app.error : "";
  }
  if (c?.type === "cast") app.castProblem = castProblem(v, makeCtx(v, app.data), v.you, draftCast());
}

// A round's lines become visible either mid-round (v.revealed, e.g. before Flip the Script) or, when
// nothing is left to decide, only as last round's lines (v.lastRes). Either way: flip once, highlight a while.
const REVEAL_MS = 6000;
function trackReveal(v) {
  const r = v.revealed ? v.round : v.lastRes ? v.round - 1 : 0;
  if (r > app.reveal.seen) {
    app.reveal = { seen: r, until: Date.now() + REVEAL_MS, fresh: true };
    clearTimeout(app.revealTimer);
    app.revealTimer = setTimeout(() => app.screen === "game" && render(), REVEAL_MS + 50);
  }
  app.revealing = Date.now() < app.reveal.until ? r : 0;
}

function draftCast() {
  return { lines: Object.entries(app.draft.lines).map(([z, cards]) => ({ zone: +z, cards })), thumbs: [...app.draft.thumbs] };
}

function render() {
  let html;
  if (app.screen === "lobby") {
    html = app.role === "client" ? V.clientLobby(app) : V.lobby(app);
    if (app.role === "host") broadcastLobby();
  } else {
    const v = currentView();
    if (!v) { root.innerHTML = "<p class='muted'>Waiting for the host…</p>"; return; }
    prepareDraft(v);
    trackReveal(v);
    html = V.game(app, v);
    app.reveal.fresh = false; // the flip animates once; later renders keep only the highlights
  }
  if (app.modal) html += V.rulesModal(app, app.modal);
  root.innerHTML = html;
  const log = root.querySelector(".log");
  if (log) log.scrollTop = log.scrollHeight;
}

// ------------------------------------------------------------------ game flow (local / host)
function startGame() {
  const { lob, data } = app;
  const mode = app.modes[lob.modeId];
  const mods = lob.mods.map((id) => app.modifiers[id]).filter((m) => m && !app.modProblem(mode, m));
  const seats = lob.seats.map((s, i) => ({
    kind: s.kind === "bot" ? "bot" : "human",
    name: s.kind === "online" ? app.net.seatNames[i] : s.name.trim() || data.crews[i].name,
  }));
  try {
    app.st = createGame({ mode, modifiers: mods, seats, seed: lob.seed }, data);
  } catch (e) { app.lobbyError = e.message; render(); return; }
  app.setup = { modeId: mode.id, modifiers: mods.map((m) => m.id), seats, seed: lob.seed };
  app.localSeats = lob.seats.map((s, i) => (s.kind === "human" ? i : -1)).filter((i) => i >= 0);
  app.role = lob.seats.some((s) => s.kind === "online") ? "host" : "local";
  app.screen = "game";
  app.unlocked = null;
  app.survey = { best: "", obvious: "", reads: "", fun: "" };
  app.lobbyError = "";
  app.reveal = { seen: 0, until: 0, fresh: false };
  changed();
}

function updateFocus() {
  const st = app.st, locals = app.localSeats;
  app.localCount = locals.length;
  if (!locals.length) { app.focus = null; app.cover = null; return; }
  if (locals.length === 1) { app.focus = locals[0]; app.cover = null; return; }
  const waiting = st.pending && !st.over ? st.pending.who.filter((id) => locals.includes(id) && !(id in st.pending.answers)) : [];
  if (!waiting.length) { app.focus = null; app.cover = null; return; }
  if (waiting.includes(app.unlocked)) { app.focus = app.unlocked; app.cover = null; return; }
  app.focus = null; app.cover = waiting[0];
}

function changed() {
  updateFocus();
  if (app.role === "host") broadcastViews();
  render();
  scheduleBots();
}

function scheduleBots() {
  clearTimeout(app.botTimer);
  const st = app.st;
  if (!st || st.over || !st.pending) return;
  const bot = st.pending.who.find((id) => st.players[id].kind === "bot" && !(id in st.pending.answers));
  if (bot == null) return;
  app.botTimer = setTimeout(() => {
    if (app.st !== st) return;
    const r = act(st, app.data, { pid: bot, value: botChoice(st, app.data, bot) });
    if (r.error) { console.error("bot", bot, r.error); return; }
    app.st = r.state;
    changed();
  }, app.botDelay);
}

function submit(value) {
  app.error = "";
  if (app.role === "client") { app.net.client.act(value); return; }
  const r = act(app.st, app.data, { pid: app.focus, value });
  if (r.error) { app.error = r.error; render(); return; }
  app.st = r.state;
  if (app.localCount > 1) app.unlocked = null;
  changed();
}

function leave() {
  if (app.screen === "game" && app.st && !app.st.over && app.role !== "client" && !confirm("Leave this game?")) return;
  clearTimeout(app.botTimer); clearTimeout(app.revealTimer);
  app.reveal = { seen: 0, until: 0, fresh: false };
  app.net.host?.close(); app.net.client?.close();
  Object.assign(app, { screen: "lobby", role: null, st: null, view: null, seat: null, remoteLobby: null, error: "" });
  app.net = { code: null, status: "", seatNames: {}, conn2seat: {} };
  app.lob.seed = newSeed();
  render();
}

// ------------------------------------------------------------------ online
async function openHost() {
  app.role = "host";
  const host = new Host({
    onHello(connId, name) {
      const { lob, net } = app;
      let seat = Object.keys(net.seatNames).map(Number).find((i) => net.seatNames[i] === name && !Object.values(net.conn2seat).includes(i));
      if (seat == null && app.screen === "lobby") {
        seat = lob.seats.findIndex((s, i) => s.kind === "online" && !net.seatNames[i]);
        if (seat < 0) seat = null;
        else net.seatNames[seat] = name;
      }
      net.conn2seat[connId] = seat ?? null;
      queueMicrotask(() => { if (app.screen === "game") sendView(connId); render(); });
      return seat ?? null;
    },
    onAct(connId, value) {
      const seat = app.net.conn2seat[connId];
      if (seat == null || !app.st) return;
      const r = act(app.st, app.data, { pid: seat, value });
      if (r.error) { host.send(connId, { t: "error", text: r.error }); return; }
      app.st = r.state;
      changed();
    },
    onLeave(connId) {
      const seat = app.net.conn2seat[connId];
      delete app.net.conn2seat[connId];
      if (app.screen === "lobby" && seat != null) delete app.net.seatNames[seat];
      app.net.status = seat != null ? `${app.data.crews[seat].seat} disconnected${app.screen === "game" ? " (they can rejoin with the same name)" : ""}` : app.net.status;
      render();
    },
    onStatus(s) { app.net.status = s; render(); },
  });
  app.net.host = host;
  try { app.net.code = await host.open(); } catch (e) { app.net.status = `Couldn't open a room: ${e.message || e.type}. Try again, or play on one device.`; app.role = null; }
  render();
}

function broadcastLobby() {
  const { host, seatNames } = app.net;
  if (!host) return;
  const lobby = {
    modeId: app.lob.modeId, mods: app.lob.mods,
    seats: app.lob.seats.map((s, i) => (s.kind === "online" ? seatNames[i] || "(open seat)" : s.kind === "bot" ? "Bot" : s.name || app.data.crews[i].name)),
  };
  host.each((id) => host.send(id, { t: "lobby", lobby }));
}

const sendView = (connId) => app.net.host.send(connId, { t: "view", view: viewFor(app.st, app.data, app.net.conn2seat[connId] ?? null) });
function broadcastViews() { app.net.host?.each((id) => sendView(id)); }

async function joinRoom() {
  const { joinName, joinCode } = app.lob;
  if (!joinName.trim() || !joinCode.trim()) { app.lobbyError = "Enter your name and the room code."; render(); return; }
  store.set("lobby", { ...store.get("lobby", {}), joinName });
  app.role = "client";
  app.net.code = joinCode.trim().toUpperCase();
  const client = new Client({
    onMessage(m) {
      if (m.t === "welcome") app.seat = m.seat;
      else if (m.t === "lobby") app.remoteLobby = m.lobby;
      else if (m.t === "view") { app.view = m.view; app.screen = "game"; app.error = ""; }
      else if (m.t === "error") app.error = m.text;
      render();
    },
    onStatus(s) { app.net.status = s; render(); },
    onClose() { app.net.status = "Disconnected from the host. Rejoin with the same name to get your seat back."; render(); },
  });
  app.net.client = client;
  render();
  try { await client.join(app.net.code, joinName.trim()); } catch (e) { app.net.status = `Couldn't join: ${e.type || e.message}. Check the code.`; render(); }
}

// ------------------------------------------------------------------ misc actions
async function openRules() {
  const modeId = app.screen === "game" ? (app.role === "client" ? app.view.mode.id : app.st.mode.id) : app.lob.modeId;
  let text = "";
  try { text = await fetch(`modes/${modeId}.md`).then((r) => r.text()); } catch { text = "Rules page missing."; }
  const mods = Object.values(app.modifiers).map((m) => `- **${m.name}**: ${m.desc}`).join("\n");
  app.modal = md(text) + md(`## Modifiers\n\n${mods}\n\nThe printed rules are SRD v3.10.20; every mode here is a playtest variant.`);
  render();
}

function download() {
  const v = currentView();
  const out = {
    kind: "hood-sorcery-playtest-log", version: 1, date: new Date().toISOString(),
    setup: app.setup, role: app.role, viewer: v.you,
    mode: v.mode, result: v.result, survey: app.survey,
    players: v.players.map((p) => ({ seat: p.seat, crew: p.crew, name: p.name, kind: p.kind, tracks: p.tracks, hist: p.hist })),
    actions: app.st?.actions ?? null, log: v.log,
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
  a.download = `hood-sorcery-${v.mode.id}-${v.seed}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function saveLobby() { store.set("lobby", { modeId: app.lob.modeId, mods: app.lob.mods, seats: app.lob.seats.map((s) => ({ kind: s.kind, name: s.name })), joinName: app.lob.joinName }); }

function fitSeats() {
  const allowed = app.modes[app.lob.modeId].players;
  const seats = app.lob.seats;
  while (seats.length > Math.max(...allowed)) seats.pop();
  while (seats.length < Math.min(...allowed)) seats.push({ kind: "bot", name: "" });
}

// ------------------------------------------------------------------ events
root.addEventListener("click", (e) => {
  if (e.target.closest("[data-stop]") && !e.target.closest(".close")) return;
  const cardEl = e.target.closest("[data-card]");
  if (cardEl && app.screen === "game") return clickCard(cardEl.dataset.card, cardEl);
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
  const d = app.draft, v = app.screen === "game" ? currentView() : null;
  switch (t.dataset.act) {
    case "seatAdd": app.lob.seats.push({ kind: "bot", name: "" }); break;
    case "seatDel": app.lob.seats.pop(); break;
    case "host": openHost(); return;
    case "start": saveLobby(); startGame(); return;
    case "join": joinRoom(); return;
    case "copyLink": navigator.clipboard?.writeText(`${location.origin}${location.pathname}?join=${app.net.code}`); app.net.status = "Invite link copied."; break;
    case "rules": openRules(); return;
    case "closeModal": app.modal = null; break;
    case "toggleLog": app.showLog = !app.showLog; break;
    case "leave": leave(); return;
    case "unlock": app.unlocked = +t.dataset.pid; updateFocus(); break;
    case "opt": submit(v.choice.options[+t.dataset.i].value); return;
    case "pickDone": submit([...d.pick]); return;
    case "zone": d.zone = +t.dataset.zone; break;
    case "thumbAdd": d.thumbs.push(d.zone); break;
    case "thumbDel": d.thumbs.pop(); break;
    case "clear": d.lines = {}; d.thumbs = []; break;
    case "lock": submit(draftCast()); return;
    case "download": download(); return;
    default: return;
  }
  render();
});

function clickCard(id, elx) {
  const v = currentView();
  const c = v?.choice;
  const d = app.draft;
  if (!c) return;
  if (c.type === "pickCards" && elx.closest(".hand-cards")) {
    d.pick = d.pick.includes(id) ? d.pick.filter((x) => x !== id) : d.pick.length < c.count ? [...d.pick, id] : d.pick;
  } else if (c.type === "cast") {
    const slot = elx.closest(".slot");
    if (slot) {
      const z = +slot.dataset.zone;
      d.lines[z] = d.lines[z].filter((x) => x !== id);
      if (!d.lines[z].length) { delete d.lines[z]; d.thumbs = d.thumbs.filter((t) => t !== z); }
    } else if (elx.closest(".hand-cards") && !Object.values(d.lines).flat().includes(id)) {
      (d.lines[d.zone] ||= []).push(id);
    }
  } else return;
  render();
}

root.addEventListener("change", (e) => {
  const t = e.target, a = t.dataset.act, lob = app.lob;
  if (a === "mode") { lob.modeId = t.value; fitSeats(); }
  else if (a === "mod") lob.mods = t.checked ? [...lob.mods, t.value] : lob.mods.filter((x) => x !== t.value);
  else if (a === "seatKind") lob.seats[+t.dataset.i].kind = t.value;
  else return;
  saveLobby();
  render();
});

root.addEventListener("input", (e) => {
  const t = e.target, a = t.dataset.act, lob = app.lob;
  if (a === "seatName") lob.seats[+t.dataset.i].name = t.value;
  else if (a === "seed") lob.seed = t.value;
  else if (a === "joinName") lob.joinName = t.value;
  else if (a === "joinCode") lob.joinCode = t.value;
  else if (a === "survey") app.survey[t.dataset.k] = t.value;
});

boot();
