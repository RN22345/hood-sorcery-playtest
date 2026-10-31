// Controller: loads data, runs the menus, and drives a game as one of three roles:
//   local  - everything on this device (hot-seat humans + bots)
//   host   - like local, plus online seats; this browser owns the state and sends each client
//            only viewFor(state, theirSeat)
//   client - joined someone's room; renders the views it receives, sends its answers
// No rules here: the engine decides everything. The narrator (show.js) paces how results are *shown*.
import { prepareData, createGame, act, viewFor, botChoice, makeCtx, setSeatKind } from "../engine/game.js";
import { modifierProblems } from "../engine/registry.js";
import { castProblem, allowedZones } from "../engine/cast.js";
import { Host, Client } from "../net/peer.js";
import * as V from "./views.js";
import { md } from "./md.js";
import { Timer, computeStats, statsMarkdown, statsCsv, parseStatsFile, compareStats, compareMarkdown, compareCsv } from "./stats.js";
import { buildReplay } from "./replay.js";
import { statsPanel, statsImage } from "./statsView.js";
import "./stage.js";
import { sound, toggleMute, clearFx, music, setAudio } from "./fx.js";
import { Presenter } from "./show.js";
import { morph } from "./morph.js";

const root = document.getElementById("app");
const getJson = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("hsp:" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hsp:" + k, JSON.stringify(v)); } catch {} },
};
const newSeed = () => Math.random().toString(36).slice(2, 8);
const BOT_MS = { slow: 1100, normal: 650, fast: 250 };

const app = {
  screen: "menu", setupStep: 0, role: null, st: null, view: null, seat: null, setup: null,
  localSeats: [], localCount: 0, focus: null, cover: null, unlocked: null,
  draft: { key: "", zone: 0, lines: {}, thumbs: [], pick: [] }, allowedZones: [], castProblem: null,
  net: { code: null, status: "", seatNames: {}, conn2seat: {} },
  showLog: false, error: "", lobbyError: "", survey: { best: "", obvious: "", reads: "", fun: "" }, modal: null,
  settings: Object.assign({ speed: "normal", pace: "each", botSpeed: "normal", results: "auto" }, store.get("settings", {})),
  revealing: 0, drag: null, handOrder: [],
  modProblem(mode, m) { return modifierProblems(mode, m)[0] || ""; },
  netSeats: () => netSeats(),
};
window.hsApp = app; // handy in the console while playtesting

app.show = new Presenter({
  view: () => (app.screen === "game" || app.screen === "replay" ? currentView() : null),
  render: () => render(),
  data: null,
  speed: () => app.settings.speed,
  pace: () => app.settings.pace,
  results: () => app.settings.results,
  onIdle() {
    // keep the "what changed" highlights a few seconds after the narrator is done
    const v = app.show.h.view();
    if (v) {
      app.revealing = v.revealed ? v.round : v.round - 1;
      clearTimeout(app.revealTimer);
      app.revealTimer = setTimeout(() => { app.revealing = 0; if (app.screen === "game" || app.screen === "replay") render(); }, 5000);
      if (v.choice) sound("turn");
    }
    scheduleBots();
  },
});

async function boot() {
  try {
    const [cards, wheel, matrices, crews, modeIds, modifiers] = await Promise.all(
      ["data/cards.json", "data/wheel.json", "data/matrices.json", "data/crews.json", "data/modes/index.json", "data/modifiers.json"].map(getJson));
    app.data = prepareData({ cards, wheel, matrices, crews });
    app.show.h.data = app.data;
    for (const c of app.data.cards) if (c.img) new Image().src = c.img; // warm the cache: no lazy card art
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
    seed: newSeed(), seedRandom: saved.seedRandom ?? true, joinName: saved.joinName || "",
    joinCode: new URLSearchParams(location.search).get("join") || "",
  };
  if (app.lob.joinCode) app.screen = "online";
  render();
}

// ------------------------------------------------------------------ rendering
function currentView() {
  if (app.screen === "replay") return replayView();
  if (app.role === "client") { app.cover = null; app.localCount = 1; return app.view; }
  return app.st ? viewFor(app.st, app.data, app.focus) : null;
}

function prepareDraft(v) {
  const c = v.choice;
  const key = `${v.round}|${v.stepIdx}|${v.you}|${c?.step}|${v.log.length}`;
  if (key !== app.draft.key) {
    const zones = c?.type === "cast" ? allowedZones(v, makeCtx(v, app.data), v.you) : [];
    app.draft = { key, zone: c?.prefill?.zone ?? zones[0] ?? 0, lines: c?.prefill ? { [c.prefill.zone]: [...c.prefill.cards] } : {}, thumbs: [], pick: [] };
    app.allowedZones = zones;
    app.error = app.error && app.role === "client" ? app.error : "";
  }
  if (c?.type === "cast") app.castProblem = castProblem(v, makeCtx(v, app.data), v.you, draftCast(), c.limits);
}

function draftCast() {
  return { lines: Object.entries(app.draft.lines).map(([z, cards]) => ({ zone: +z, cards })), thumbs: [...app.draft.thumbs] };
}

function render() {
  let html;
  if (app.screen !== app.lastScreen) { clearFx(); app.lastScreen = app.screen; }
  music(app.screen === "game" || app.screen === "replay" ? "game" : "menu");
  if (app.screen === "stats") {
    const tab = app.statsTab ?? "0";
    const body = tab === "compare"
      ? V.compareBody(app.statsList.length, md(compareMarkdown(compareStats(app.statsList))))
      : statsPanel(app.statsList[+tab], +tab, app.statsLogs?.[+tab]?.actions ? `<button class="primary" data-act="replay" data-i="${tab}">Replay this game</button>` : "");
    html = V.statsScreen(app, body);
  } else if (app.screen === "replay") {
    const v = replayView();
    app.show.feed(v);
    html = V.game(app, v, { panel: V.replayPanel(app, v, app.rp), side: V.replayHands(app, v) });
  } else if (app.screen === "game") {
    const v = currentView();
    if (!v) { root.innerHTML = "<p class='muted'>Waiting for the host…</p>"; return; }
    prepareDraft(v);
    app.show.feed(v);
    (app.timer ||= new Timer(Date.now())).observe(v, Date.now());
    if (v.over && !app.statsSaved) { app.statsSaved = true; rememberStats(computeStats(gameRecord())); }
    html = V.game(app, v);
  } else {
    app.recentStats = store.get("recentStats", []);
    if (app.role === "host") broadcastLobby();
    html = { menu: V.menu, setup: V.setup, online: V.online, statsMenu: V.statsMenu, waiting: V.clientLobby }[app.screen](app);
  }
  const modal = typeof app.modal === "function" ? app.modal() : app.modal;
  // Every screen sits on the scaled 1920×1080 stage (ui/stage.js); modals live inside it so they scale too.
  // The page is *diffed* into the DOM (ui/morph.js), not replaced: a click on the sound button or a modal
  // opening must not restart the animations of everything else. Only a new page (screen, wizard step, stats
  // tab) is a new stage element, which is what plays the entry animations.
  const pageKey = `${app.screen}|${app.setupStep}|${app.statsTab}`;
  morph(root, `<div class="stage enter screen-${app.screen}" data-k="${pageKey}">${html}${modal ? V.rulesModal(app, modal) : ""}</div>`);
  const log = root.querySelector(".log");
  if (log) log.scrollTop = log.scrollHeight;
}

// ------------------------------------------------------------------ game flow (local / host)
function startGame() {
  const { lob, data } = app;
  const mode = app.modes[lob.modeId];
  const mods = lob.mods.map((id) => app.modifiers[id]).filter((m) => m && !app.modProblem(mode, m));
  const seed = lob.seedRandom ? newSeed() : lob.seed;
  const seats = lob.seats.map((s, i) => ({
    kind: s.kind === "bot" ? "bot" : "human",
    name: s.kind === "online" ? app.net.seatNames[i] : s.name.trim() || data.crews[i].name,
  }));
  try {
    app.st = createGame({ mode, modifiers: mods, seats, seed }, data);
  } catch (e) { app.lobbyError = e.message; render(); return; }
  app.setup = { modeId: mode.id, modifiers: mods.map((m) => m.id), seats, seed };
  app.localSeats = lob.seats.map((s, i) => (s.kind === "human" ? i : -1)).filter((i) => i >= 0);
  app.role = lob.seats.some((s) => s.kind === "online") ? "host" : "local";
  app.onlineSeats = lob.seats.map((s, i) => (s.kind === "online" ? i : -1)).filter((i) => i >= 0);
  app.screen = "game";
  app.unlocked = null; app.modal = null; app.handOrder = [];
  app.survey = { best: "", obvious: "", reads: "", fun: "" };
  app.lobbyError = "";
  app.timer = new Timer(Date.now()); app.statsSaved = false;
  updateFocus();
  const v0 = currentView() || viewFor(app.st, data, null);
  app.show.startAt(v0, v0.log.findIndex((e) => e.k === "round")); // play "Round 1" and the first Wheel spin
  sound("shuffle");
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

// Bots answer after a short "think", and never while the narrator is still showing the last result.
function scheduleBots() {
  clearTimeout(app.botTimer);
  const st = app.st;
  if (!st || st.over || !st.pending || app.screen !== "game" || app.show.busy) return;
  const bot = st.pending.who.find((id) => st.players[id].kind === "bot" && !(id in st.pending.answers));
  if (bot == null) return;
  app.botTimer = setTimeout(() => {
    if (app.st !== st || app.show.busy) return;
    const r = act(st, app.data, { pid: bot, value: botChoice(st, app.data, bot) });
    if (r.error) { console.error("bot", bot, r.error); return; }
    app.st = r.state;
    changed();
  }, BOT_MS[app.settings.botSpeed] ?? 650);
}

function submit(value) {
  app.error = "";
  if (app.role === "client") { app.net.client.act(value); return; }
  const r = act(app.st, app.data, { pid: app.focus, value });
  if (r.error) { app.error = r.error; sound("error"); render(); return; }
  app.st = r.state;
  if (app.localCount > 1) app.unlocked = null;
  changed();
}

function toMenu() {
  clearTimeout(app.botTimer); clearTimeout(app.revealTimer);
  app.show.reset();
  app.timer = null; app.statsSaved = false; app.modal = null;
  app.net.host?.close(); app.net.client?.close();
  Object.assign(app, { screen: "menu", role: null, st: null, view: null, seat: null, remoteLobby: null, remoteNet: null, onlineSeats: [], error: "", lobbyError: "" });
  app.net = { code: null, status: "", seatNames: {}, conn2seat: {} };
  render();
}

function leave() {
  if (app.screen === "game" && app.st && !app.st.over && app.role !== "client" && !confirm("Leave this game?")) return;
  toMenu();
}

// ------------------------------------------------------------------ online
async function openHost() {
  app.role = "host";
  const host = new Host({
    onHello(connId, name) {
      const { lob, net } = app;
      const connected = Object.values(net.conn2seat);
      let seat = Object.keys(net.seatNames).map(Number).find((i) => net.seatNames[i] === name && !connected.includes(i));
      if (seat == null && app.screen !== "game") {
        seat = lob.seats.findIndex((s, i) => s.kind === "online" && !net.seatNames[i]);
        if (seat < 0) seat = null;
        else net.seatNames[seat] = name;
      }
      net.conn2seat[connId] = seat ?? null;
      queueMicrotask(() => {
        if (app.screen !== "game") { sound("confirm"); render(); return; }
        // a dropped player who comes back takes their seat back from the bot
        if (seat != null && app.onlineSeats.includes(seat) && app.st.players[seat].kind === "bot") app.st = setSeatKind(app.st, seat, "human");
        app.net.status = seat != null ? `${name} is connected.` : app.net.status;
        changed();
      });
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
      if (app.screen !== "game" && seat != null) delete app.net.seatNames[seat];
      app.net.status = seat != null ? `${app.net.seatNames[seat] || app.data.crews[seat].seat} disconnected${app.screen === "game" ? ": they can rejoin with the same name, or a bot can take over" : ""}` : app.net.status;
      if (app.screen === "game") broadcastViews();
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

// Online seats and who is connected right now, for the in-game connection strip (host and clients).
function netSeats() {
  const on = Object.values(app.net.conn2seat);
  return (app.onlineSeats || []).map((i) => ({ seat: i, name: app.net.seatNames[i] || app.data.crews[i].seat, on: on.includes(i), bot: app.st?.players[i].kind === "bot" }));
}
const sendView = (connId) => app.net.host.send(connId, { t: "view", view: viewFor(app.st, app.data, app.net.conn2seat[connId] ?? null), net: netSeats() });
function broadcastViews() { app.net.host?.each((id) => sendView(id)); }

function reconnect() {
  app.net.client?.close();
  app.net.lost = false;
  joinRoom();
}

async function joinRoom() {
  const { joinName, joinCode } = app.lob;
  if (!joinName.trim() || !joinCode.trim()) { app.lobbyError = "Enter your name and the room code."; sound("error"); render(); return; }
  store.set("lobby", { ...store.get("lobby", {}), joinName });
  app.role = "client";
  app.net.code = joinCode.trim().toUpperCase();
  if (app.screen !== "game") app.screen = "waiting";
  const client = new Client({
    onMessage(m) {
      if (m.t === "welcome") { app.seat = m.seat; app.net.lost = false; app.net.status = `Connected to room ${app.net.code}.`; sound("confirm"); }
      else if (m.t === "lobby") app.remoteLobby = m.lobby;
      else if (m.t === "view") {
        const first = !app.view;
        app.view = m.view; app.remoteNet = m.net || []; app.error = "";
        if (first) {
          app.screen = "game";
          let k = -1; m.view.log.forEach((e, i) => { if (e.k === "round") k = i; });
          app.show.startAt(m.view, Math.max(0, k)); // show this round's opening
          app.timer = new Timer(Date.now());
        }
      } else if (m.t === "error") { app.error = m.text; sound("error"); }
      render();
    },
    onStatus(s) { app.net.status = s; render(); },
    onClose() { app.net.lost = true; app.net.status = "Lost the connection to the host. Press Reconnect: you get your seat back."; render(); },
  });
  app.net.client = client;
  render();
  try { await client.join(app.net.code, joinName.trim()); } catch (e) { app.net.lost = true; app.net.status = `Couldn't join: ${e.type || e.message}. Check the code, or try Reconnect.`; render(); }
}

// ------------------------------------------------------------------ misc actions
async function openRules(modeId) {
  modeId ||= app.screen === "game" || app.screen === "replay" ? currentView()?.mode.id : app.lob.modeId;
  let text = "";
  try { text = await fetch(`modes/${modeId}.md`).then((r) => r.text()); } catch { text = "Rules page missing."; }
  const mods = Object.values(app.modifiers).map((m) => `- **${m.name}**: ${m.desc}`).join("\n");
  app.modal = md(text) + md(`## House rules (modifiers)\n\n${mods}\n\nThe printed rules are SRD v3.10.20; every mode here is a playtest variant.`);
  render();
}

// The game as a record: the downloaded log, and the input to the stats (ui/stats.js).
function gameRecord() {
  const v = currentView();
  return {
    kind: "hood-sorcery-playtest-log", version: 2, date: new Date().toISOString(),
    setup: app.screen === "replay" ? app.rp.log.setup : app.setup, role: app.role, viewer: v.you, seed: v.seed,
    mode: v.mode, result: v.result, survey: app.survey,
    players: v.players.map((p) => ({ seat: p.seat, crew: p.crew, color: p.color, name: p.name, kind: p.kind, thumbs: p.thumbs, tracks: p.tracks, hist: p.hist })),
    actions: app.screen === "replay" ? null : app.st?.actions ?? null, log: v.log,
    timing: app.timer && app.screen !== "replay" ? { ...app.timer.t, last: Date.now() } : null,
    wheelNames: Object.fromEntries(app.data.wheel.map((w) => [w.id, w.name])),
    modifierNames: Object.fromEntries(Object.values(app.modifiers).map((m) => [m.id, m.name])),
  };
}

function saveFile(name, body, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(body instanceof Blob ? body : new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function download() {
  const rec = gameRecord();
  saveFile(`hood-sorcery-${rec.mode.id}-${rec.seed}-${Date.now()}.json`, JSON.stringify(rec, null, 1), "application/json");
}

// ------------------------------------------------------------------ stats
const statsAt = (i) => (i === "cur" ? app.curStats : app.statsList[+i]);
const statsName = (s, ext) => `hood-sorcery-${s.mode.id}-${s.seed ?? "game"}-stats.${ext}`;

function openStats() {
  app.curStats = computeStats(gameRecord());
  app.modal = statsPanel(app.curStats, "cur");
  render();
}

function rememberStats(s) {
  const list = store.get("recentStats", []).filter((x) => !(x.seed === s.seed && x.mode.id === s.mode.id));
  store.set("recentStats", [s, ...list].slice(0, 8));
}

async function loadStatsFiles(files) {
  const list = [], logs = [], bad = [];
  for (const f of files) {
    try {
      const text = await f.text();
      const st = parseStatsFile(text);
      let log = null;
      try { const o = JSON.parse(text); if (o.kind === "hood-sorcery-playtest-log") log = o; } catch {}
      // the same game loaded twice (its log and its .md report) counts once; keep the log for the replay
      const key = (x) => `${x.mode.id}|${x.seed}|${x.players.map((p) => p.name + ":" + p.final).join(",")}`;
      const dup = list.findIndex((x) => key(x) === key(st));
      if (dup >= 0) { logs[dup] ||= log; continue; }
      list.push(st); logs.push(log);
    } catch { bad.push(f.name); }
  }
  app.lobbyError = bad.length ? `Couldn't read ${bad.join(", ")}: load a stats .md or a game log .json.` : "";
  if (list.length) showStats(list, logs); else render();
}

function showStats(list, logs = []) {
  app.statsList = list;
  app.statsTab = list.length > 1 ? "compare" : "0";
  app.statsLogs = logs;
  app.screen = "stats";
  app.modal = null;
  render();
  scrollTo(0, 0);
}

// ------------------------------------------------------------------ replay (A4)
function openReplay(log, back) {
  try {
    app.rp = { ...buildReplay(log, app.data, app.modes, app.modifiers), at: 0, back, log, playing: false };
  } catch (e) { alert(e.message); return; }
  app.modal = null;
  app.cover = null; app.localCount = 0;
  app.screen = "replay";
  const v = replayView();
  app.show.startAt(v, v.log.findIndex((e) => e.k === "round"));
  render();
  scrollTo(0, 0);
}

// Everything visible: the replay is for after the game, so every hand is shown in the replay panel.
function replayView() {
  const st = app.rp.states[app.rp.stops[app.rp.at]];
  const v = viewFor(st, app.data, null);
  v.players.forEach((p) => (p.hand = st.players[p.id].hand));
  const prev = app.rp.at ? app.rp.states[app.rp.stops[app.rp.at - 1]] : null;
  v.replayNew = prev ? st.log.slice(prev.log.length) : st.log;
  return v;
}

function replayGo(to) {
  const rp = app.rp, last = rp.stops.length - 1;
  const round = rp.states[rp.stops[rp.at]].round;
  const at = {
    start: 0, end: last, prev: rp.at - 1, next: rp.at + 1,
    prevRound: rp.rounds[round] < rp.at ? rp.rounds[round] : rp.rounds[round - 1] ?? 0,
    nextRound: rp.rounds[round + 1] ?? last,
  }[to] ?? +to;
  const target = Math.max(0, Math.min(last, at));
  if (to !== "next") app.show.reset(); // jumps don't replay the narration; single steps forward do
  rp.at = target;
  if (to !== "next") app.show.reset(replayView());
  if (rp.at === last) replayPlay(false);
  render();
}

function replayPlay(on = !app.rp?.playing) {
  clearInterval(app.replayTimer);
  if (!app.rp) return;
  app.rp.playing = on;
  if (on) app.replayTimer = setInterval(() => { if (!app.show.busy) replayGo("next"); }, 400);
}

function closeReplay() {
  replayPlay(false);
  const back = app.rp?.back || "menu";
  app.rp = null;
  app.screen = back;
  if (back === "game") { updateFocus(); app.show.reset(currentView()); }
  render();
}

async function statsDownload(act, el) {
  if (act === "compareMd" || act === "compareCsv") {
    const c = compareStats(app.statsList), name = `hood-sorcery-compare-${app.statsList.length}-games`;
    if (act === "compareMd") saveFile(`${name}.md`, `# Hood Sorcery: ${app.statsList.length} games compared\n\n${compareMarkdown(c)}`, "text/markdown");
    else saveFile(`${name}.csv`, compareCsv(c), "text/csv");
    return;
  }
  const s = statsAt(el.dataset.i);
  if (!s) return;
  if (act === "statsMd") saveFile(statsName(s, "md"), statsMarkdown(s), "text/markdown");
  else if (act === "statsCsv") saveFile(statsName(s, "csv"), statsCsv(s), "text/csv");
  else {
    const type = el.dataset.type || "image/png";
    try { saveFile(statsName(s, type.split("/")[1].replace("jpeg", "jpg")), await statsImage(s, type)); }
    catch (e) { alert(e.message); }
  }
}

function saveLobby() { store.set("lobby", { modeId: app.lob.modeId, mods: app.lob.mods, seats: app.lob.seats.map((s) => ({ kind: s.kind, name: s.name })), joinName: app.lob.joinName, seedRandom: app.lob.seedRandom }); }
function saveSettings() { store.set("settings", app.settings); }

function fitSeats() {
  const allowed = app.modes[app.lob.modeId].players;
  const seats = app.lob.seats;
  while (seats.length > Math.max(...allowed)) seats.pop();
  while (seats.length < Math.min(...allowed)) seats.push({ kind: "bot", name: "" });
}

// ------------------------------------------------------------------ events
root.addEventListener("click", (e) => {
  if (app.justDragged) { app.justDragged = false; return; }
  const t = e.target.closest("[data-act]");
  const stop = e.target.closest("[data-stop]");
  if (stop && !(t && stop.contains(t))) return; // clicks inside a modal only count on its own buttons
  const cardEl = e.target.closest("[data-card]");
  if (cardEl && app.screen === "game" && !stop && !cardEl.closest(".results")) return clickCard(cardEl.dataset.card, cardEl);
  if (!t || t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
  if (t.tagName === "BUTTON" && !["lock", "sound"].includes(t.dataset.act)) sound("click", { vol: 0.7 });
  const d = app.draft, v = app.screen === "game" ? currentView() : null;
  switch (t.dataset.act) {
    case "go":
      if (t.dataset.to === "menu" && app.role) { toMenu(); return; }
      app.screen = t.dataset.to; app.lobbyError = ""; app.setupStep = 0; sound("whoosh2"); break;
    case "step": fitSeats(); app.setupStep = Math.max(0, Math.min(2, +t.dataset.to)); sound("whoosh2"); break;
    case "hostSetup":
      app.lob.seats.forEach((s, i) => { if (i > 0 && s.kind === "human") s.kind = "online"; });
      if (!app.lob.seats.some((s) => s.kind === "online")) app.lob.seats[1].kind = "online";
      app.screen = "setup"; app.setupStep = 1; saveLobby(); break;
    case "seatAdd": app.lob.seats.push({ kind: "bot", name: "" }); saveLobby(); break;
    case "seatDel": app.lob.seats.pop(); saveLobby(); break;
    case "host": openHost(); return;
    case "start": saveLobby(); startGame(); return;
    case "rematch": startGame(); return;
    case "join": joinRoom(); return;
    case "reseed": app.lob.seed = newSeed(); sound("dice"); break;
    case "copyLink": navigator.clipboard?.writeText(`${location.origin}${location.pathname}?join=${app.net.code}`); app.net.status = "Invite link copied."; break;
    case "rules": openRules(); return;
    case "rulesFor": e.preventDefault(); openRules(t.dataset.id); return;
    case "howto": app.modal = V.howToHtml; break;
    case "credits": app.modal = V.creditsHtml(); break;
    case "settings": app.modal = () => V.settingsModal(app); break;
    case "setting": app.settings[t.dataset.k] = t.dataset.v; saveSettings(); if (t.dataset.k === "speed" && t.dataset.v === "instant") app.show.skip(); break;
    case "skipShow": app.show.skip(); return;
    case "closeModal": app.modal = null; break;
    case "closeResults": app.show.closeResults(); return;
    case "showResults": app.show.openResults(+t.dataset.r); app.show.armResults(); break;
    case "toggleLog": app.showLog = !app.showLog; break;
    case "leave": leave(); return;
    case "unlock": app.unlocked = +t.dataset.pid; updateFocus(); break;
    case "opt": sound("lock"); submit(v.choice.options[+t.dataset.i].value); return;
    case "pickDone": sound("fan"); submit([...d.pick]); return;
    case "zone": d.zone = +t.dataset.zone; break;
    case "thumbAdd": d.thumbs.push(d.zone); sound("dice"); break;
    case "thumbDel": d.thumbs.pop(); break;
    case "clear": d.lines = {}; d.thumbs = []; sound("fan"); break;
    case "lock": sound("lock"); submit(draftCast()); return;
    case "download": download(); return;
    case "reconnect": reconnect(); return;
    case "stats": openStats(); return;
    case "statsMd": case "statsCsv": case "statsImg": case "compareMd": case "compareCsv": statsDownload(t.dataset.act, t); return;
    case "replay": openReplay(t.dataset.i === "cur" ? gameRecord() : app.statsLogs[+t.dataset.i], t.dataset.i === "cur" ? "game" : "stats"); return;
    case "replayGo": replayGo(t.dataset.to); return;
    case "replayPlay": replayPlay(); render(); return;
    case "replayClose": closeReplay(); return;
    case "recentStats": showStats([app.recentStats[+t.dataset.i]]); return;
    case "recentAll": showStats(app.recentStats); return;
    case "statsBack": app.screen = "statsMenu"; app.statsList = []; break;
    case "statsTab": app.statsTab = t.dataset.i; break;
    case "seatKind": app.lob.seats[+t.dataset.i].kind = t.dataset.v; saveLobby(); break;
    case "sound": toggleMute(); break;
    case "seatBot": case "seatHuman":
      if (app.role !== "host") return;
      app.st = setSeatKind(app.st, +t.dataset.i, t.dataset.act === "seatBot" ? "bot" : "human");
      changed(); return;
    default: return;
  }
  render();
});

// ---------------------------------------------------------------- cards: click, or pick up and drag
const castOpen = () => { const v = app.screen === "game" && !app.show.busy ? currentView() : null; return v?.choice?.type === "cast" ? v : null; };
const removeFromLines = (id) => {
  const d = app.draft;
  for (const z of Object.keys(d.lines)) {
    d.lines[z] = d.lines[z].filter((x) => x !== id);
    if (!d.lines[z].length) { delete d.lines[z]; d.thumbs = d.thumbs.filter((t) => t !== +z); }
  }
};

function clickCard(id, elx) {
  const v = currentView();
  const c = app.show.busy ? null : v?.choice;
  const d = app.draft;
  if (!c) return;
  if (c.type === "pickCards" && elx.closest(".hand-cards")) {
    d.pick = d.pick.includes(id) ? d.pick.filter((x) => x !== id) : d.pick.length < c.count ? [...d.pick, id] : d.pick;
    sound("pick");
  } else if (c.type === "cast") {
    if (elx.closest(".slot")) { removeFromLines(id); sound("pick"); }
    else if (elx.closest(".hand-cards") && !Object.values(d.lines).flat().includes(id)) { (d.lines[d.zone] ||= []).push(id); sound("place"); }
    else return;
  } else return;
  render();
}

// Pointer-based drag (mouse and touch): a ghost card follows the pointer in a layer outside #app, so
// re-renders while dragging (bots answering) don't drop it. Drop on a line slot or a zone on the table to
// cast it there (at that position: order matters for seams), back on the hand to take it out, or move it
// within the hand to rearrange your hand.
let press = null, ghost = null;
root.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || app.screen !== "game") return;
  const el = e.target.closest(".hand-cards .card, .slot .card");
  if (!el) return;
  press = { id: el.dataset.card, fromSlot: !!el.closest(".slot"), x: e.clientX, y: e.clientY, rect: el.getBoundingClientRect(), img: el.querySelector("img")?.src };
});
addEventListener("pointermove", (e) => {
  if (!press) return;
  if (!app.drag) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 7) return;
    if (!castOpen() && press.fromSlot) { press = null; return; }
    app.drag = { id: press.id };
    ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.innerHTML = `<img src="${press.img}" alt="">`;
    Object.assign(ghost.style, { width: press.rect.width + "px", height: press.rect.height + "px" });
    document.body.appendChild(ghost);
    sound("pick");
    render();
  }
  ghost.style.transform = `translate(${e.clientX - press.rect.width / 2}px, ${e.clientY - press.rect.height * 0.6}px) rotate(${Math.max(-12, Math.min(12, (e.clientX - press.x) / 30))}deg)`;
  document.querySelectorAll(".drop-on").forEach((x) => x.classList.remove("drop-on"));
  dropTarget(e)?.el.classList.add("drop-on");
});
addEventListener("pointerup", (e) => {
  if (!press) return;
  if (app.drag) {
    const target = dropTarget(e);
    finishDrag(target, e);
    app.justDragged = true;
    setTimeout(() => (app.justDragged = false), 0);
  }
  press = null;
});

function dropTarget(e) {
  const under = document.elementFromPoint(e.clientX, e.clientY);
  if (!under) return null;
  const v = castOpen();
  if (v) {
    const slot = under.closest(".slot");
    if (slot) return { el: slot, zone: +slot.dataset.zone };
    const zoneEl = under.closest(".zone");
    const z = zoneEl && v.zones.find((x) => x.name === zoneEl.dataset.zone);
    if (z && app.allowedZones.includes(z.i)) return { el: zoneEl, zone: z.i };
  }
  const hand = under.closest(".hand");
  if (hand) return { el: hand, hand: true };
  return null;
}

function finishDrag(target, e) {
  const id = app.drag.id;
  ghost?.remove(); ghost = null;
  app.drag = null;
  document.querySelectorAll(".drop-on").forEach((x) => x.classList.remove("drop-on"));
  const d = app.draft;
  if (target?.zone != null) {
    removeFromLines(id);
    const line = (d.lines[target.zone] ||= []);
    const cards = [...target.el.querySelectorAll(".slot-cards .card")].filter((c) => c.dataset.card !== id);
    const at = target.el.classList.contains("slot") ? cards.filter((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2 < e.clientX; }).length : line.length;
    line.splice(Math.min(at, line.length), 0, id);
    d.zone = target.zone;
    sound("place");
  } else if (target?.hand) {
    const wasInLine = Object.values(d.lines).flat().includes(id);
    removeFromLines(id);
    // rearrange the hand: drop position among the other hand cards
    const others = [...target.el.querySelectorAll(".hand-cards .card")].filter((c) => c.dataset.card !== id);
    const order = others.map((c) => c.dataset.card);
    const at = others.filter((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2 < e.clientX; }).length;
    order.splice(at, 0, id);
    app.handOrder = order;
    sound(wasInLine ? "pick" : "card");
  }
  render();
}

root.addEventListener("change", (e) => {
  const t = e.target, a = t.dataset.act, lob = app.lob;
  if (a === "statsFile") { loadStatsFiles([...t.files]); return; }
  if (a === "replaySeek") { replayGo(t.value); return; }
  if (a === "muteAll") { setAudio({ muted: t.checked }); render(); return; }
  if (a === "mode") { lob.modeId = t.value; fitSeats(); sound("select"); }
  else if (a === "mod") { lob.mods = t.checked ? [...lob.mods, t.value] : lob.mods.filter((x) => x !== t.value); sound("toggle"); }
  else if (a === "seedRandom") { lob.seedRandom = t.checked; sound("toggle"); }
  else return;
  saveLobby();
  render();
});

// replay: arrow keys step, shift+arrow jumps a round, space plays/pauses; Escape closes a modal
document.addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === "Escape" && app.modal) { app.modal = null; render(); return; }
  if ((e.key === "Escape" || e.key === "Enter") && app.show.res) { app.show.closeResults(); return; }
  if (app.screen !== "replay") return;
  if (e.key === "ArrowRight") replayGo(e.shiftKey ? "nextRound" : "next");
  else if (e.key === "ArrowLeft") replayGo(e.shiftKey ? "prevRound" : "prev");
  else if (e.key === " ") { replayPlay(); render(); }
  else return;
  e.preventDefault();
});

// drop stats reports / game logs anywhere outside a game
root.addEventListener("dragover", (e) => { if (app.screen !== "game") e.preventDefault(); });
root.addEventListener("drop", (e) => {
  if (app.screen === "game" || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  loadStatsFiles([...e.dataTransfer.files]);
});

root.addEventListener("input", (e) => {
  const t = e.target, a = t.dataset.act, lob = app.lob;
  if (a === "seatName") lob.seats[+t.dataset.i].name = t.value;
  else if (a === "seed") lob.seed = t.value;
  else if (a === "joinName") lob.joinName = t.value;
  else if (a === "joinCode") lob.joinCode = t.value.toUpperCase();
  else if (a === "survey") app.survey[t.dataset.k] = t.value;
  else if (a === "vol") { setAudio({ [t.dataset.k]: t.value / 100 }); if (t.dataset.k === "sfx") sound("chip"); }
});

boot();
