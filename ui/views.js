// HTML for every screen. Pure functions: (data, view/ui state) -> string. No game rules here:
// anything rule-shaped comes from the engine (view, castProblem, lineStats).
//
// Layout: every screen is drawn on one 1920×1080 "stage" that ui/stage.js scales to fit the window
// (letterboxed), like a Unity Canvas Scaler with a 1920×1080 reference. Screens return the stage's inner
// HTML; app.js wraps it. Narrow/portrait windows (phones) get the same markup in a scrolling flow layout.
import { lineStats } from "../engine/line.js";
import { roundSummary } from "../engine/summary.js";
import { LOCATIONS } from "../engine/modules/locations.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const el = (e) => `<img class="el" src="assets/elements/${e}.png" alt="${e}">`;
const dots = (n, max) => Array.from({ length: Math.max(n, max) }, (_, i) => `<span class="dot ${i < n ? "on" : ""}"></span>`).join("");
const chip = (p) => `<span class="chip" style="--c:${p.color}">${esc(p.name)}</span>`;
const unitOf = (track) => (track === "rep" ? "Rep" : "damage");

export function card(c, { cls = "", tag = "button", style = "" } = {}) {
  const title = `${c.name}: ${c.start} → ${c.end}, length ${c.len}, ATK ${c.atk}, BLK ${c.blk}`;
  const face = c.img
    ? `<img src="${c.img}" alt="${esc(c.name)}" loading="lazy" draggable="false">`
    : `<div class="card-text"><b>${esc(c.name)}</b>${el(c.start)}→${el(c.end)}<span>L${c.len} · A${c.atk} · B${c.blk}</span></div>`;
  return `<${tag} class="card ${cls}" data-card="${c.id}" title="${esc(title)}" ${style ? `style="${style}"` : ""}>${face}<span class="card-stats">${el(c.start)}${el(c.end)} L${c.len} <b class="a">${c.atk}</b>/<b class="b">${c.blk}</b></span></${tag}>`;
}
const backs = (n) => `<span class="backs">${Array.from({ length: n }, (_, i) => `<img src="assets/card_back.webp" alt="" style="--i:${i}">`).join("")}</span>`;

export function topbar(app, sub) {
  const inGame = app.screen === "game" || app.screen === "replay";
  return `<header class="top">
    <div class="brand"><b>Hood Sorcery</b> <span class="muted">${esc(sub)}</span></div>
    <nav>
      <button class="icon" data-act="sound" title="Sound on/off">${app.muted ? "🔇" : "🔊"}</button>
      <button data-act="rules">Rules</button>
      ${inGame ? `<button data-act="stats">Stats</button><button data-act="toggleLog" class="${app.showLog ? "on" : ""}">Log</button>` : ""}
      ${app.screen === "game" ? `<button data-act="leave">Leave</button>` : ""}
      ${app.screen === "replay" ? `<button data-act="replayClose">Close replay</button>` : ""}
    </nav></header>`;
}

// ------------------------------------------------------------------ lobby (title screen)
export function lobby(app) {
  const { modes, modifiers, data, lob, net } = app;
  const mode = modes[lob.modeId];
  const modeCards = Object.values(modes).map((m) => `
    <label class="mode ${m.id === lob.modeId ? "sel" : ""}">
      <input type="radio" name="mode" value="${m.id}" ${m.id === lob.modeId ? "checked" : ""} data-act="mode">
      <span class="mode-name">${esc(m.name)} <small>${esc(m.pathway)}</small></span>
      <span class="mode-blurb">${esc(m.blurb)}</span>
      <small class="muted">${m.players.join("/")} crews · ${m.win.best === "lowest" ? "least damage" : "most Rep"} wins</small>
    </label>`).join("");
  const ticked = [];
  const mods = Object.values(modifiers).map((m) => {
    const why = app.modProblem(mode, m);
    const on = lob.mods.includes(m.id) && !why;
    if (on) ticked.push(m);
    return `<label class="toggle ${why ? "off" : ""} ${on ? "on" : ""}" title="${esc(why || m.desc)}">
      <input type="checkbox" data-act="mod" value="${m.id}" ${on ? "checked" : ""} ${why ? "disabled" : ""}>${esc(m.name)}</label>`;
  }).join("");
  const seats = lob.seats.map((s, i) => {
    const crew = data.crews[i];
    const taken = net.seatNames?.[i];
    const kinds = [["human", "Human"], ["bot", "Bot"], ["online", "Online"]].map(([v, l]) => `<button class="seg ${s.kind === v ? "on" : ""}" data-act="seatKind" data-i="${i}" data-v="${v}">${l}</button>`).join("");
    return `<div class="seat" style="--c:${crew.color}">
      <img src="${crew.img}" alt="">
      <div class="seat-body"><div><b class="seat-crew">${esc(crew.name)}</b> <small class="muted">${crew.seat}</small></div>
        <div class="seat-row"><div class="segs">${kinds}</div>
        ${s.kind === "online" ? `<span class="muted small">${taken ? "✔ " + esc(taken) : net.code ? "waiting to join…" : "open a room to invite"}</span>` : `<input data-act="seatName" data-i="${i}" placeholder="${s.kind === "bot" ? "Bot name" : "Player name"}" value="${esc(s.name)}" maxlength="24">`}</div>
      </div></div>`;
  }).join("");
  const online = lob.seats.some((s) => s.kind === "online");
  const missing = lob.seats.filter((s, i) => s.kind === "online" && !net.seatNames?.[i]).length;
  const recent = app.recentStats || [];
  return `${topbar(app, "Playtest table")}
  <div class="hero">
    <div class="logo"><span>Hood</span> <span>Sorcery</span></div>
    <div class="tagline">Four crews. One Vein. Cast your line.</div>
    <div class="hero-crews">${data.crews.map((c) => `<img src="${c.img}" alt="" style="--c:${c.color}">`).join("")}</div>
  </div>
  <main class="lobby">
    <section class="pane"><h2>Mode</h2><div class="modes">${modeCards}</div>
      <h2>Modifiers <small class="muted">tap to combine</small></h2><div class="toggles">${mods}</div>
      <div class="mod-desc small">${ticked.length ? ticked.map((m) => `<div><b>${esc(m.name)}:</b> ${esc(m.desc)}</div>`).join("") : '<span class="muted">No modifiers: the mode as written.</span>'}</div>
    </section>
    <section class="pane"><h2>Crews <small class="muted">${mode.players.join("/")} crews</small></h2>
      <div class="seats">${seats}</div>
      <div class="row"><button data-act="seatAdd" ${lob.seats.length >= 4 ? "disabled" : ""}>+ crew</button><button data-act="seatDel" ${lob.seats.length <= 2 ? "disabled" : ""}>− crew</button></div>
    </section>
    <section class="pane play">
      ${online
        ? `${net.code
            ? `<div class="code">Room <b>${net.code}</b></div><button data-act="copyLink">Copy invite link</button><p class="muted small">${missing ? `Waiting for ${missing} player${missing > 1 ? "s" : ""}.` : "Everyone is in."}</p>`
            : `<button class="big" data-act="host">Open online room</button>`}
           <button class="primary big" data-act="start" ${!net.code || missing ? "disabled" : ""}>Start game</button>`
        : `<button class="primary big" data-act="start">Play</button><p class="muted small">Humans share this device; bots play themselves.</p>`}
      ${app.lobbyError ? `<p class="err">${esc(app.lobbyError)}</p>` : ""}
      <p class="muted small">${esc(net.status || "")}</p>
      <h2>Join a room</h2>
      <div class="row"><input data-act="joinName" placeholder="Your name" value="${esc(lob.joinName)}" maxlength="24"><input data-act="joinCode" placeholder="Code" value="${esc(lob.joinCode)}" size="6"><button data-act="join">Join</button></div>
      <h2>Game stats</h2>
      ${recent.length ? `<div class="recent">${recent.slice(0, 4).map((s, i) => `<button data-act="recentStats" data-i="${i}" title="${esc(s.generated || "")}">${esc(s.mode.name)} · ${esc(s.winner || "?")}</button>`).join("")}${recent.length > 1 ? `<button data-act="recentAll">All ${recent.length}</button>` : ""}</div>` : ""}
      <label class="file button">Load report / log…<input type="file" accept=".md,.json,.txt" multiple data-act="statsFile"></label>
      <span class="muted small">or drop files on the page</span>
      <div class="seed muted small">Seed <input data-act="seed" value="${esc(lob.seed)}" size="8"> same seed + same choices = same game</div>
    </section>
  </main>`;
}

export function clientLobby(app) {
  const l = app.remoteLobby;
  const crew = app.seat != null ? app.data.crews[app.seat] : null;
  return `${topbar(app, "Joined")}
  <div class="hero"><div class="logo"><span>Hood</span> <span>Sorcery</span></div><div class="tagline">Room ${esc(app.net.code || "")}</div></div>
  <main class="lobby waiting"><section class="pane">
    ${crew ? `<div class="you-are" style="--c:${crew.color}"><img src="${crew.img}" alt=""><div>You are<br><b>${esc(crew.name)}</b></div></div>` : "<p>The table is full: you're watching.</p>"}
    ${l ? `<p>Mode: <b>${esc(app.modes[l.modeId]?.name)}</b>${l.mods.length ? " + " + l.mods.map((id) => esc(app.modifiers[id]?.name)).join(", ") : ""}</p>
      <ul>${l.seats.map((s, i) => `<li>${app.data.crews[i].name}: ${esc(s)}</li>`).join("")}</ul>` : ""}
    <p class="muted">Waiting for the host to start…</p>
    ${app.net.lost ? `<button class="primary big" data-act="reconnect">Reconnect</button>` : ""}
    <p class="muted small">${esc(app.net.status || "")}</p>
  </section></main>`;
}

// ------------------------------------------------------------------ stats screen
export function statsScreen(app, body) {
  const n = app.statsList.length;
  const tabs = (n > 1 ? [["compare", "Compare"]] : []).concat(app.statsList.map((s, i) => [String(i), `${s.mode.name} · ${s.winner || "in progress"}`]));
  return `${topbar(app, "Game stats")}
  <main class="statsview">
    <div class="tabs"><button data-act="statsBack">← Lobby</button>${tabs.length > 1 ? tabs.map(([k, l]) => `<button class="tab ${String(app.statsTab) === k ? "on" : ""}" data-act="statsTab" data-i="${k}">${esc(l)}</button>`).join("") : ""}</div>
    ${body}
  </main>`;
}

export function compareBody(n, html) {
  return `<section class="stats compare"><h2>${n} games compared</h2><div class="stats-md">${html}</div>
    <div class="row"><button data-act="compareMd">Comparison (.md)</button><button data-act="compareCsv">Comparison (.csv)</button><span class="muted small">Each game's own report is in its tab.</span></div></section>`;
}

// ------------------------------------------------------------------ game
export function game(app, v, opts = {}) {
  const { data } = app;
  const pl = v.players;
  const me = v.you != null ? pl[v.you] : null;
  const track = v.mode.win.track;
  const sector = data.wheel.find((w) => w.id === v.wheel);
  const sum = roundSummary(v);
  const hot = app.revealing && sum?.round === app.revealing ? sum : null; // what changed in the round just flipped
  const opps = pl.filter((p) => p !== me);
  const title = `${v.mode.name}${v.mode.modifiers.length ? " + " + v.mode.modifiers.map((id) => app.modifiers[id]?.name || id).join(", ") : ""}`;
  const side = `
    <div class="roundbox"><span class="muted">Round</span><b>${v.round}</b><span class="muted">of ${v.mode.params.rounds}</span></div>
    ${sector ? `<div class="wheelbox ${sector.type}"><img src="${sector.img}" alt=""><b>${esc(sector.name)}</b>${v.fx !== sector.effect ? `<small class="muted">${esc(v.mode.name)} reading</small>` : ""}<p>${esc(fxText(v, sector))}</p></div>` : ""}
    <div class="limits"><span>Line <b>${v.limits?.line}</b></span><span>Cards <b>${v.limits?.maxCards}</b></span><span class="deck">${backs(1)} <b>${v.deckCount}</b></span></div>
    ${v.stake > 1 || v.folded?.length ? `<div class="stake">Stakes <b>×${v.stake}</b>${v.folded?.length ? ` · folded ${v.folded.map((id) => esc(pl[id].name)).join(", ")}` : ""}</div>` : ""}
    ${netStrip(app)}
    ${opts.side || ""}`;
  const board = v.over && !opts.panel
    ? endPanel(app, v)
    : `<div class="zones n${v.zones.length}">${v.zones.map((z) => zoneBox(app, v, z, hot)).join("")}</div>${summaryStrip(v, sum, hot)}${opts.panel || actionPanel(app, v)}`;
  const hand = me && me.hand ? handRow(app, v, me)
    : app.cover == null && app.localCount > 1 && !v.over ? `<div class="hand hidden-hand muted">Hands are hidden between turns (pass-and-play).</div>` : "";
  const cls = [app.showLog ? "with-log" : "", app.revealing ? "revealing" : "", app.revealing && app.reveal.fresh ? "fresh" : "", me ? "has-me" : "no-me", `opp${opps.length}`].join(" ");
  return `<div class="game ${cls}">
    ${topbar(app, title)}
    <aside class="side">${side}</aside>
    <section class="opps">${opps.map((p) => playerBox(app, v, p, track, hot)).join("")}</section>
    <section class="board">${board}</section>
    <section class="mine">${me ? playerBox(app, v, me, track, hot) : ""}</section>
    <section class="handarea">${hand}</section>
    ${app.showLog ? `<aside class="log">${logHtml(v)}</aside>` : ""}
    ${app.cover != null ? coverScreen(app, v, sum) : ""}
  </div>`;
}

// The cards cast in a round, as small face-up cards that flip over on the first render of a reveal.
const resOf = (v) => (v.revealed ? v.res : v.lastRes);
const flipCards = (app, ids, start = 0) => ids.map((id, i) => `<span class="flip" style="--i:${start + i}">${card(app.data.cardMap[id], { cls: "mini", tag: "span" })}</span>`).join("");

function summaryStrip(v, sum, hot) {
  if (!sum) return `<div class="summary muted">The Vein is waiting. First round.</div>`;
  const items = sum.items.length
    ? sum.items.map((i) => `<span class="sum-item ${i.kind}" style="--c:${v.players[i.pid].color}">${esc(i.text)}</span>`).join("")
    : `<span class="muted">no change</span>`;
  return `<div class="summary ${hot ? "hot" : ""}" title="${esc(sum.text)}"><b>Round ${sum.round}</b>${items}</div>`;
}

// Online games: who is connected. The host can hand a dropped seat to a bot (and back); a client can reconnect.
function netStrip(app) {
  const seats = app.role === "host" ? app.netSeats() : app.role === "client" && !app.net.lost ? app.remoteNet || [] : [];
  if (app.role !== "client" && !seats.length) return "";
  const me = app.role === "client"
    ? `<span class="conn ${app.net.lost ? "off" : "on"}">You: ${app.net.lost ? "disconnected" : "connected"}</span>${app.net.lost ? `<button class="primary" data-act="reconnect">Reconnect</button>` : ""}`
    : "";
  const list = seats.map((s) => {
    const p = app.data.crews[s.seat];
    const btn = app.role !== "host" || app.screen !== "game" ? ""
      : s.bot ? `<button data-act="seatHuman" data-i="${s.seat}" title="Stop the bot; ${esc(s.name)} decides again">Give back</button>`
      : !s.on ? `<button data-act="seatBot" data-i="${s.seat}">Bot takes over</button>` : "";
    return `<span class="conn ${s.on ? "on" : "off"}"><span class="chip" style="--c:${p.color}">${esc(s.name)}</span> ${s.on ? "connected" : "dropped"}${s.bot ? " · bot" : ""}</span>${btn}`;
  }).join("");
  return `<div class="netstrip">${me}${list}${app.net.status ? `<span class="muted small">${esc(app.net.status)}</span>` : ""}</div>`;
}

function fxText(v, sector) {
  const custom = {
    extraZone: "An extra corner (The Turf) opens this round; up to 4 cards.",
    muggedCorner: "The corner won with the highest total goes to its runner-up.",
    challengerTies: "Challengers win ties against holders this round.",
    bleedingRep: "Every crew that lost a contest loses 1 Rep.",
    noHeal: "The Vein doesn't feed the holder this round.",
    holderBlkDown: "The holder's BLK counts 2 less this round.",
  };
  return custom[v.fx] || sector.text;
}

function playerBox(app, v, p, track, hot) {
  const r = v.revealed ? v.res[p.id] : null;
  const pend = v.pending;
  const deciding = pend && pend.who.includes(p.id);
  const done = deciding && pend.done.includes(p.id);
  const holds = v.zones.filter((z) => z.holder === p.id);
  const mine = hot ? hot.items.filter((i) => i.pid === p.id) : [];
  const delta = mine.find((i) => i.kind === track);
  const shown = app.revealing ? resOf(v)?.[p.id] : null;
  const rank = v.ranks?.atk.includes(p.id) ? ` · rank A${v.ranks.atk.indexOf(p.id) + 1}/B${v.ranks.blk.indexOf(p.id) + 1}` : "";
  const isMe = p.id === v.you;
  return `<div class="pbox ${isMe ? "me" : ""} ${mine.length ? "changed" : ""} ${deciding && !done ? "thinking" : ""}" style="--c:${p.color}">
    ${delta ? `<span class="delta ${delta.delta > 0 === (track === "damage") ? "bad" : "good"}">${delta.delta > 0 ? "+" : "−"}${Math.abs(delta.delta)}</span>` : ""}
    <img class="standee" src="${p.img}" alt="">
    <div class="pinfo">
      <div class="pname">${esc(p.name)}${p.kind === "bot" ? ' <small class="muted">bot</small>' : ""}</div>
      <div class="score"><b>${p.tracks[track]}</b> <span class="muted">${unitOf(track)}</span></div>
      <div class="small">${dots(p.thumbs, v.mode.params.thumbs)} <span class="muted">Thumbs</span>${isMe ? "" : ` ${backs(Math.min(p.handCount, 8))}`}</div>
      ${p.at != null && v.mode.zones.castInto === "chosen" ? `<div class="small">At <b>${esc(v.zones[p.at]?.name)}</b></div>` : ""}
      ${holds.length ? `<div class="small holds">Holds ${holds.map((z) => esc(z.name)).join(", ")}</div>` : ""}
      ${r && !shown ? `<div class="small totals">ATK <b>${r.atk}</b> · BLK <b>${r.blk}</b> · ${r.len}f${r.rolls.length ? " · 🎲 " + r.rolls.map((x) => x.r).join(",") : ""}${rank}</div>` : ""}
      ${shown ? `<div class="pline">${flipCards(app, shown.lines.flatMap((l) => l.cards), p.id * 3)}<small class="muted">A${shown.atk} · B${shown.blk}</small></div>` : ""}
      ${deciding ? `<div class="state ${done ? "done" : ""}">${done ? "✔ locked in" : `${esc(stepName(pend.step))}<span class="dots3"><i>.</i><i>.</i><i>.</i></span>`}</div>` : ""}
    </div></div>`;
}

function zoneBox(app, v, z, hot) {
  const holder = z.holder != null ? v.players[z.holder] : null;
  const res = resOf(v);
  const past = !v.revealed && !app.revealing; // last round's lines, dimmed once the reveal moment is over
  const taken = hot?.items.some((i) => i.kind === "take" && i.zone === z.name);
  const lines = res ? v.players.map((p) => ({ p, ln: res[p.id]?.lines.find((l) => l.zone === z.i) })).filter((x) => x.ln) : [];
  const posted = v.mode.zones.castInto === "chosen" ? v.players.filter((p) => p.at === z.i) : [];
  const opened = v.open ? v.players.filter((p) => v.open[p.id]?.zone === z.i) : [];
  const loc = z.loc ? LOCATIONS[z.loc] : null;
  return `<div class="zone ${z.rich ? "rich" : ""} ${z.extra ? "extra" : ""} ${taken ? "taken" : ""} ${lines.length >= 4 ? "crowded" : ""}" style="${holder ? `--h:${holder.color}` : ""}">
    <div class="zhead"><b>${esc(z.name)}</b>${z.rich ? ' <span class="badge">★ rich</span>' : ""}
      ${v.mode.id === "classic" ? "" : `<span class="holder">${holder ? chip(holder) : '<span class="muted">unclaimed</span>'}</span>`}</div>
    ${loc ? `<div class="loc" title="${esc(loc.text)}"><b>${esc(loc.name)}</b> ${esc(loc.text)}</div>` : ""}
    ${posted.length && !v.revealed ? `<div class="posted">${posted.map(chip).join(" ")}</div>` : ""}
    ${opened.length && !v.revealed ? `<div class="opened">${opened.map((p) => `<span class="zline">${chip(p)} ${card(app.data.cardMap[v.open[p.id].card], { cls: "mini", tag: "span" })}<small class="muted">opened</small></span>`).join("")}</div>` : ""}
    <div class="zlines">${lines.map(({ p, ln }) => `<div class="zline ${past ? "past" : ""}" style="--c:${p.color}">
        <span class="chip" style="--c:${p.color}">${esc(p.name)}</span>
        <span class="mini">${flipCards(app, ln.cards, p.id * 3)}</span>
        <span class="zstat">A <b>${ln.atk}</b> B <b>${ln.blk}</b> ${ln.len}f</span></div>`).join("")}</div>
  </div>`;
}

function actionPanel(app, v) {
  const c = v.choice;
  const err = app.error ? `<p class="err">${esc(app.error)}</p>` : "";
  if (!c) {
    const pend = v.pending;
    if (!pend) return `<div class="panel muted">…</div>`;
    const waiting = pend.who.filter((id) => !pend.done.includes(id)).map((id) => v.players[id]);
    return `<div class="panel waiting"><span class="muted">${esc(stepName(pend.step))}:</span> waiting for ${waiting.map(chip).join(" ")}<span class="dots3"><i>.</i><i>.</i><i>.</i></span>${err}</div>`;
  }
  if (c.type === "option") {
    return `<div class="panel choice"><p class="prompt">${esc(c.prompt)}</p>
      <div class="opts">${c.options.map((o, i) => `<button class="opt" data-act="opt" data-i="${i}"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</button>`).join("")}</div>${err}</div>`;
  }
  if (c.type === "pickCards") {
    const n = app.draft.pick.length;
    return `<div class="panel choice"><p class="prompt">${esc(c.prompt)}</p>
      <p>Picked <b>${n}</b>/${c.count}: click cards in your hand.</p>
      <button class="primary big" data-act="pickDone" ${n !== c.count ? "disabled" : ""}>Pass them</button>${err}</div>`;
  }
  if (c.type === "cast") return castPanel(app, v, c, err);
  return "";
}

function castPanel(app, v, c, err) {
  const d = app.draft;
  const zones = app.allowedZones;
  const slots = zones.map((zi) => {
    const z = v.zones.find((x) => x.i === zi);
    const ids = d.lines[zi] || [];
    const s = lineStats(ids.map((id) => app.data.cardMap[id]));
    const th = d.thumbs.filter((t) => t === zi).length;
    return `<div class="slot ${d.zone === zi ? "active" : ""}" data-act="zone" data-zone="${zi}">
      <div class="slot-head"><b>${esc(z.name)}</b>${z.rich ? ' <span class="badge">★</span>' : ""}${th ? ` <span class="thumbs-on">${"●".repeat(th)}</span>` : ""}</div>
      <div class="slot-cards">${ids.length ? ids.map((id) => card(app.data.cardMap[id], { cls: "in-line" })).join("") : '<span class="muted small">click cards to add</span>'}</div>
      <div class="slot-stats">A <b>${s.atk}</b> · B <b>${s.blk}</b> · ${s.len}f${s.seams.length ? ` · ${s.seams.length} seam${s.seams.length > 1 ? "s" : ""}` : ""}</div>
    </div>`;
  }).join("");
  const used = Object.values(d.lines).flat();
  const fingers = Object.values(d.lines).reduce((a, ids) => a + lineStats(ids.map((id) => app.data.cardMap[id])).len, 0);
  const me = v.players[v.you];
  const pct = Math.min(100, (fingers / c.limits.line) * 100);
  return `<div class="panel choice cast"><p class="prompt">${esc(c.prompt)} ${zones.length > 1 ? '<span class="muted">Pick a zone, then click cards.</span>' : ""}</p>
    <div class="castrow">
      <div class="slots">${slots}</div>
      <div class="meter">
        <div class="fingers ${fingers > c.limits.line ? "bad" : ""}"><span>Fingers <b>${fingers}</b>/${c.limits.line}</span><i style="width:${pct}%"></i></div>
        <span>Cards <b class="${used.length > c.limits.maxCards ? "bad" : ""}">${used.length}</b>/${c.limits.maxCards}</span>
        ${c.noThumbs ? "" : `<span class="thumbctl">Thumbs <button data-act="thumbDel" ${!d.thumbs.length ? "disabled" : ""}>−</button><b>${d.thumbs.length}</b><button data-act="thumbAdd" ${d.thumbs.length >= Math.min(2, me.thumbs) ? "disabled" : ""}>+</button><small class="muted">${me.thumbs} left</small></span>`}
        <div class="row"><button data-act="clear">Clear</button><button class="primary big" data-act="lock" ${app.castProblem ? "disabled" : ""}>${c.step === "openCard" ? "Open it" : "Cast"}</button></div>
      </div>
    </div>
    ${app.castProblem && used.length ? `<p class="muted small hint">${esc(app.castProblem)}</p>` : ""}${err}
  </div>`;
}

function handRow(app, v, me) {
  const c = v.choice;
  const used = c?.type === "cast" ? Object.values(app.draft.lines).flat() : [];
  const picked = c?.type === "pickCards" ? app.draft.pick : [];
  const n = me.hand.length;
  const cards = me.hand.map((id, i) => card(app.data.cardMap[id], { cls: `${used.includes(id) ? "used" : ""} ${picked.includes(id) ? "picked" : ""}`, style: `--i:${i};--n:${n}` }));
  return `<div class="hand ${c ? "active" : ""}"><div class="hand-title">Your hand <span class="muted">${esc(me.name)}</span></div><div class="hand-cards" data-act="hand">${cards.join("")}</div></div>`;
}

function coverScreen(app, v, sum) {
  const p = v.players[app.cover];
  return `<div class="cover" style="--c:${p.color}"><div class="cover-box">
    <img src="${p.img}" alt=""><h2>Pass the device to ${esc(p.name)}</h2>
    <p class="muted">${esc(stepName(v.pending?.step))}</p>
    ${sum ? `<p class="small">${esc(sum.text)}</p>` : ""}
    <button class="primary big" data-act="unlock" data-pid="${p.id}">I'm ${esc(p.name)}: show my hand</button></div></div>`;
}

const STEP_NAMES = { cast: "casting", swapMeet: "Swap Meet", flipScript: "Flip the Script", postUp: "posting up", stayBail: "stay or bail", callOut: "call-outs", passTab: "the Tab", openCard: "opening a card", runItUp: "Run It Up" };
export const stepName = (s) => STEP_NAMES[s] || s;

function endPanel(app, v) {
  const track = v.result.track;
  const w = v.players[v.result.order[0]];
  const rows = v.result.order.map((id, i) => {
    const p = v.players[id];
    return `<tr style="--c:${p.color}"><td class="place">${i + 1}</td><td><img src="${p.img}" alt=""> <b>${esc(p.name)}</b> <small class="muted">${esc(p.crew)}</small></td><td><b class="big-num">${p.tracks[track]}</b> ${unitOf(track)}</td><td class="small muted">${p.hist.map((h) => (track === "rep" ? h.rep : h.dmg)).join(" · ")}</td></tr>`;
  }).join("");
  const s = app.survey;
  return `<div class="panel end" style="--c:${w.color}">
    <div class="end-head"><img src="${w.img}" alt=""><div><small class="muted">The Vein closes</small><h2>${esc(w.name)} takes it</h2></div></div>
    <table class="standings">${rows}</table>
    <div class="end-grid">
      <div class="survey"><h3>Quick survey <small class="muted">saved into the log file</small></h3>
        <label class="q">Best moment of the game<textarea data-act="survey" data-k="best" rows="1">${esc(s.best)}</textarea></label>
        <label class="q">A round where the choice was obvious<textarea data-act="survey" data-k="obvious" rows="1">${esc(s.obvious)}</textarea></label>
        <label class="q">Did you change a cast because of another crew?<textarea data-act="survey" data-k="reads" rows="1">${esc(s.reads)}</textarea></label>
        <label class="q">Fun, 1–5 <input data-act="survey" data-k="fun" value="${esc(s.fun)}" size="3"></label>
      </div>
      <div class="end-actions">
        <button class="primary big" data-act="stats">Game stats</button>
        ${app.role !== "client" ? `<button class="big" data-act="replay" data-i="cur">Replay</button>` : ""}
        <button data-act="download">Download log (.json)</button>
        <button data-act="leave">Back to lobby</button>
      </div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ replay (A4)
export function replayPanel(app, v, rp) {
  const last = rp.stops.length - 1;
  const b = (to, label, title, off) => `<button data-act="replayGo" data-to="${to}" title="${title}" ${off ? "disabled" : ""}>${label}</button>`;
  const news = v.replayNew.filter((e) => e.k !== "round");
  return `<div class="panel replay">
    <div class="row">
      ${b("start", "⏮", "Start", !rp.at)}${b("prevRound", "◀◀", "Previous round (shift + ←)", !rp.at)}${b("prev", "◀", "Previous step (←)", !rp.at)}
      <button class="primary" data-act="replayPlay" title="Play / pause (space)">${rp.playing ? "⏸ Pause" : "▶ Play"}</button>
      ${b("next", "▶", "Next step (→)", rp.at === last)}${b("nextRound", "▶▶", "Next round (shift + →)", rp.at === last)}${b("end", "⏭", "End", rp.at === last)}
      <span class="muted small">Step ${rp.at}/${last} · round ${v.round}${v.over ? " · game over" : v.pending ? ` · next: ${esc(stepName(v.pending.step))}` : ""}</span>
    </div>
    <input type="range" class="seek" min="0" max="${last}" value="${rp.at}" data-act="replaySeek" aria-label="Replay position">
    ${rp.diverged ? `<p class="err small">This replay ends differently from the saved result: the rules changed since the game was played.</p>` : ""}
    <div class="replay-new">${rp.at ? (news.length ? news.map((e) => `<div class="lg ${e.k}">${esc(e.text)}</div>`).join("") : '<span class="muted">Answers locked in (hidden until everyone has answered).</span>') : '<span class="muted">Start of the game. Step forward with ▶ or the arrow keys.</span>'}</div>
  </div>`;
}

export function replayHands(app, v) {
  return `<div class="rhands"><h3>Hands</h3>${v.players.map((p) => `<div class="rhand"><span class="chip" style="--c:${p.color}">${esc(p.name)}</span>
    <span class="mini">${(p.hand || []).map((id) => card(app.data.cardMap[id], { cls: "mini", tag: "span" })).join("")}</span></div>`).join("")}</div>`;
}

export function logHtml(v) {
  let r = -1;
  return v.log.map((e) => {
    const h = e.r !== r ? `<h4>${e.r ? "Round " + e.r : "Setup"}</h4>` : "";
    r = e.r;
    return `${h}<div class="lg ${e.k}">${esc(e.text)}</div>`;
  }).join("");
}

export function rulesModal(app, html) {
  return `<div class="modal" data-act="closeModal"><div class="modal-box" data-stop>
    <button class="close" data-act="closeModal">×</button>${html}</div></div>`;
}
