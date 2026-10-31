// HTML for every screen. Pure functions: (data, view/ui state) -> string. No game rules here:
// anything rule-shaped comes from the engine (view, castProblem, lineStats).
import { lineStats } from "../engine/line.js";
import { roundSummary } from "../engine/summary.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const el = (e) => `<img class="el" src="assets/elements/${e}.png" alt="${e}">`;
const dots = (n, max) => Array.from({ length: Math.max(n, max) }, (_, i) => `<span class="dot ${i < n ? "on" : ""}"></span>`).join("");
const chip = (p) => `<span class="chip" style="--c:${p.color}">${esc(p.name)}</span>`;

export function card(c, { cls = "", tag = "button" } = {}) {
  const title = `${c.name}: ${c.start} → ${c.end}, length ${c.len}, ATK ${c.atk}, BLK ${c.blk}`;
  const face = c.img
    ? `<img src="${c.img}" alt="${esc(c.name)}" loading="lazy">`
    : `<div class="card-text"><b>${esc(c.name)}</b>${el(c.start)}→${el(c.end)}<span>L${c.len} · A${c.atk} · B${c.blk}</span></div>`;
  return `<${tag} class="card ${cls}" data-card="${c.id}" title="${esc(title)}">${face}<span class="card-stats">${el(c.start)}${el(c.end)} L${c.len} <b class="a">${c.atk}</b>/<b class="b">${c.blk}</b></span></${tag}>`;
}

// ------------------------------------------------------------------ lobby
export function lobby(app) {
  const { modes, modifiers, data, lob, net } = app;
  const mode = modes[lob.modeId];
  const modeCards = Object.values(modes).map((m) => `
    <label class="mode ${m.id === lob.modeId ? "sel" : ""}">
      <input type="radio" name="mode" value="${m.id}" ${m.id === lob.modeId ? "checked" : ""} data-act="mode">
      <span class="mode-name">${esc(m.name)} <small>${esc(m.pathway)}</small></span>
      <span class="mode-blurb">${esc(m.blurb)}</span>
      <small class="muted">${m.players.join("/")} players</small>
    </label>`).join("");
  const mods = Object.values(modifiers).map((m) => {
    const why = app.modProblem(mode, m);
    return `<label class="mod ${why ? "off" : ""}" title="${esc(why || m.desc)}">
      <input type="checkbox" data-act="mod" value="${m.id}" ${lob.mods.includes(m.id) && !why ? "checked" : ""} ${why ? "disabled" : ""}>
      <b>${esc(m.name)}</b> <span class="muted">${esc(why || m.desc)}</span></label>`;
  }).join("");
  const seats = lob.seats.map((s, i) => {
    const crew = data.crews[i];
    const taken = net.seatNames?.[i];
    return `<div class="seat" style="--c:${crew.color}">
      <img src="${crew.img}" alt="">
      <div><b>${crew.seat} · ${crew.name}</b>
        <div class="row">
          <select data-act="seatKind" data-i="${i}">
            ${[["human", "Human (this device)"], ["bot", "Bot"], ["online", "Online player"]].map(([v, l]) => `<option value="${v}" ${s.kind === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
          ${s.kind === "online" ? `<span class="muted">${taken ? "✔ " + esc(taken) : net.code ? "waiting to join…" : "open a room below"}</span>` : `<input data-act="seatName" data-i="${i}" placeholder="${s.kind === "bot" ? "Bot" : "Name"}" value="${esc(s.name)}" maxlength="24">`}
        </div></div></div>`;
  }).join("");
  const online = lob.seats.some((s) => s.kind === "online");
  const missing = lob.seats.filter((s, i) => s.kind === "online" && !net.seatNames?.[i]).length;
  return `
  ${topbar(app, "Playtest lobby")}
  <main class="lobby">
    <section><h2>1 · Game mode</h2><div class="modes">${modeCards}</div></section>
    <section><h2>2 · Modifiers <small class="muted">optional, tick to combine</small></h2><div class="mods">${mods}</div></section>
    <section><h2>3 · Seats <small class="muted">${mode.players.join("/")} players</small></h2>
      <div class="seats">${seats}</div>
      <div class="row"><button data-act="seatAdd" ${lob.seats.length >= 4 ? "disabled" : ""}>+ seat</button><button data-act="seatDel" ${lob.seats.length <= 2 ? "disabled" : ""}>− seat</button></div>
    </section>
    <section><h2>4 · Play</h2>
      <div class="row"><label>Seed <input data-act="seed" value="${esc(lob.seed)}" size="12"></label><span class="muted">Same seed + same choices = same game.</span></div>
      ${app.lobbyError ? `<p class="err">${esc(app.lobbyError)}</p>` : ""}
      ${online
        ? `<div class="row">${net.code
            ? `<span class="code">Room code <b>${net.code}</b></span><button data-act="copyLink">Copy invite link</button><span class="muted">${missing ? `Share the code. Waiting for ${missing} player${missing > 1 ? "s" : ""}.` : "Everyone is in."}</span>`
            : `<button data-act="host">Open online room</button>`}
           <button class="primary" data-act="start" ${!net.code || missing ? "disabled" : ""}>Start game</button></div>`
        : `<div class="row"><button class="primary" data-act="start">Start on this device</button><span class="muted">Hot-seat: humans pass the device; bots play themselves.</span></div>`}
      <p class="muted small">${esc(net.status || "")}</p>
    </section>
    <section class="stats-load"><h2>Game stats <small class="muted">look at a finished game</small></h2>
      ${app.recentStats?.length ? `<div class="row"><span class="muted small">Recent on this browser:</span>${app.recentStats.map((s, i) => `<button data-act="recentStats" data-i="${i}" title="${esc(s.generated || "")}">${esc(s.mode.name)} · ${esc(s.winner || "?")} won</button>`).join("")}${app.recentStats.length > 1 ? `<button data-act="recentAll">All</button>` : ""}</div>` : ""}
      <div class="row"><label class="file">Load a stats report (.md) or game log (.json) <input type="file" accept=".md,.json,.txt" multiple data-act="statsFile"></label><span class="muted small">or drop the files on this page</span></div>
    </section>
    <section class="join"><h2>Join a friend's room</h2>
      <div class="row"><input data-act="joinName" placeholder="Your name" value="${esc(lob.joinName)}" maxlength="24"><input data-act="joinCode" placeholder="Room code" value="${esc(lob.joinCode)}" size="7"><button data-act="join">Join</button></div>
    </section>
  </main>`;
}

export function clientLobby(app) {
  const l = app.remoteLobby;
  return `${topbar(app, "Joined")}
  <main class="lobby"><section>
    <h2>Room ${esc(app.net.code || "")}</h2>
    <p>${app.seat == null ? "The table is full: you're watching." : `You are <b>${esc(app.data.crews[app.seat].seat)} · ${esc(app.data.crews[app.seat].name)}</b>.`}</p>
    ${l ? `<p>Mode: <b>${esc(app.modes[l.modeId]?.name)}</b>${l.mods.length ? " + " + l.mods.map((id) => esc(app.modifiers[id]?.name)).join(", ") : ""}</p>
      <ul>${l.seats.map((s, i) => `<li>${app.data.crews[i].seat}: ${esc(s)}</li>`).join("")}</ul>` : ""}
    <p class="muted">Waiting for the host to start…</p>
    ${app.net.lost ? `<button class="primary" data-act="reconnect">Reconnect</button>` : ""}
    <p class="muted small">${esc(app.net.status || "")}</p>
  </section></main>`;
}

export function statsScreen(app, panels, compareHtml) {
  return `${topbar(app, "Game stats")}
  <main class="lobby statsview">
    <div class="row"><button data-act="statsBack">← Back to lobby</button><span class="muted small">${app.statsList.length} game${app.statsList.length > 1 ? "s" : ""}</span></div>
    ${compareHtml ? `<section class="stats compare"><h2>${app.statsList.length} games compared</h2><div class="stats-md">${compareHtml}</div>
      <div class="row"><button data-act="compareMd">Comparison (.md)</button><button data-act="compareCsv">Comparison (.csv)</button><span class="muted small">Each game's own report follows below.</span></div></section>` : ""}
    ${panels}
  </main>`;
}

// Replay controls (A4): step through a recorded game; every hand is visible.
export function replayPanel(app, v, rp) {
  const last = rp.stops.length - 1;
  const b = (to, label, title, off) => `<button data-act="replayGo" data-to="${to}" title="${title}" ${off ? "disabled" : ""}>${label}</button>`;
  const news = v.replayNew.filter((e) => e.k !== "round");
  const hands = v.players.map((p) => `<div class="rhand"><span class="chip" style="--c:${p.color}">${esc(p.name)}</span>
    <span class="mini">${(p.hand || []).map((id) => card(app.data.cardMap[id], { cls: "mini", tag: "span" })).join("")}</span></div>`).join("");
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
    <h3>Hands</h3><div class="rhands">${hands}</div>
  </div>`;
}

export function topbar(app, sub) {
  return `<header class="top">
    <div class="brand"><b>Hood Sorcery</b> <span class="muted">${esc(sub)}</span></div>
    <nav>
      <button data-act="rules">Rules</button>
      ${app.screen === "game" ? `<button data-act="stats">Stats</button><button data-act="toggleLog">Log</button><button data-act="leave">Leave</button>` : ""}
      ${app.screen === "replay" ? `<button data-act="stats">Stats</button><button data-act="toggleLog">Log</button><button data-act="replayClose">Close replay</button>` : ""}
    </nav></header>`;
}

// ------------------------------------------------------------------ game
export function game(app, v, opts = {}) {
  const { data } = app;
  const pl = v.players;
  const me = v.you != null ? pl[v.you] : null;
  const track = v.mode.win.track;
  const sector = data.wheel.find((w) => w.id === v.wheel);
  const head = `
  <div class="status">
    <div class="round"><span class="muted">Round</span> <b>${v.round}</b><span class="muted">/${v.mode.params.rounds}</span></div>
    ${sector ? `<div class="wheel ${sector.type}"><img src="${sector.img}" alt=""><div><b>${esc(sector.name)}</b>${v.fx !== sector.effect ? ` <small class="muted">(${esc(v.mode.name)} reading)</small>` : ""}<br><small>${esc(fxText(v, sector))}</small></div></div>` : ""}
    <div class="limits"><span class="muted">Line</span> <b>${v.limits?.line}</b> <span class="muted">· cards</span> <b>${v.limits?.maxCards}</b> <span class="muted">· deck ${v.deckCount}</span></div>
  </div>`;
  const sum = roundSummary(v);
  const hot = app.revealing && sum?.round === app.revealing ? sum : null; // what changed in the round just flipped
  const players = `<div class="players">${pl.map((p) => playerBox(app, v, p, track, hot)).join("")}</div>`;
  const zones = `<div class="zones">${v.zones.map((z) => zoneBox(app, v, z, hot)).join("")}</div>`;
  const body = summaryStrip(v, sum, hot) + (opts.panel || (v.over ? endPanel(app, v) : actionPanel(app, v)));
  const hand = me && me.hand ? handRow(app, v, me) : app.cover == null && app.localCount > 1 && !v.over ? `<div class="hand hidden-hand muted">Hands are hidden between turns (pass-and-play).</div>` : "";
  const log = app.showLog ? `<aside class="log">${logHtml(v)}</aside>` : "";
  const cover = app.cover != null ? coverScreen(app, v, sum) : "";
  return `${topbar(app, `${v.mode.name}${v.mode.modifiers.length ? " + " + v.mode.modifiers.map((id) => app.modifiers[id]?.name || id).join(", ") : ""}`)}
  <main class="game ${app.showLog ? "with-log" : ""} ${app.revealing ? "revealing" : ""} ${app.revealing && app.reveal.fresh ? "fresh" : ""}">
    <div class="table">${head}${netStrip(app)}${zones}${players}${body}${hand}</div>${log}
  </main>${cover}`;
}

// The cards cast in a round, as small face-up cards that flip over on the first render of a reveal.
const resOf = (v) => (v.revealed ? v.res : v.lastRes);
const flipCards = (app, ids, start = 0) => ids.map((id, i) => `<span class="flip" style="--i:${start + i}">${card(app.data.cardMap[id], { cls: "mini", tag: "span" })}</span>`).join("");

function summaryStrip(v, sum, hot) {
  if (!sum) return "";
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
    return `<span class="conn ${s.on ? "on" : "off"}" style="--c:${p.color}"><span class="chip" style="--c:${p.color}">${esc(s.name)}</span> ${s.on ? "connected" : "dropped"}${s.bot ? " · bot playing" : ""}</span>${btn}`;
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
  const last = p.hist[p.hist.length - 1];
  const mine = hot ? hot.items.filter((i) => i.pid === p.id) : [];
  const delta = mine.find((i) => i.kind === track);
  const shown = app.revealing ? resOf(v)?.[p.id] : null;
  const rank = v.ranks ? ` · rank A${v.ranks.atk.indexOf(p.id) + 1}/B${v.ranks.blk.indexOf(p.id) + 1}` : "";
  return `<div class="pbox ${p.id === v.you ? "me" : ""} ${mine.length ? "changed" : ""}" style="--c:${p.color}">
    ${delta ? `<span class="delta ${delta.delta > 0 === (track === "damage") ? "bad" : "good"}">${delta.delta > 0 ? "+" : "−"}${Math.abs(delta.delta)}</span>` : ""}
    <img class="standee" src="${p.img}" alt="">
    <div class="pinfo">
      <div class="pname">${esc(p.name)} ${p.kind === "bot" ? '<small class="muted">bot</small>' : ""}</div>
      <div class="muted small">${p.seat} · ${esc(p.crew)}</div>
      <div class="score"><b>${p.tracks[track]}</b> <span class="muted">${track === "rep" ? "Rep" : "damage"}</span>${last && track === "damage" && last.r === v.round ? ` <small class="muted">(+${last.dmg})</small>` : ""}</div>
      <div class="small">Thumbs ${dots(p.thumbs, v.mode.params.thumbs)} · hand ${p.handCount}</div>
      ${p.at != null && v.mode.zones.castInto === "chosen" ? `<div class="small">At <b>${esc(v.zones[p.at]?.name)}</b></div>` : ""}
      ${holds.length ? `<div class="small">Holds ${holds.map((z) => esc(z.name)).join(", ")}</div>` : ""}
      ${r ? `<div class="small totals">ATK <b>${r.atk}</b> · BLK <b>${r.blk}</b> · ${r.len} fingers${r.rolls.length ? " · 🎲 " + r.rolls.map((x) => x.r).join(",") : ""}${rank}</div>` : ""}
      ${shown ? `<div class="pline">${flipCards(app, shown.lines.flatMap((l) => l.cards), p.id * 3)}<small class="muted">A${shown.atk} · B${shown.blk}</small></div>` : ""}
      ${deciding ? `<div class="small state">${done ? "✔ locked in" : "…deciding"}</div>` : ""}
    </div></div>`;
}

function zoneBox(app, v, z, hot) {
  const holder = z.holder != null ? v.players[z.holder] : null;
  const res = resOf(v);
  const past = !v.revealed && !app.revealing; // last round's lines, dimmed once the reveal moment is over
  const taken = hot?.items.some((i) => i.kind === "take" && i.zone === z.name);
  const lines = res
    ? v.players.map((p) => ({ p, ln: res[p.id]?.lines.find((l) => l.zone === z.i) })).filter((x) => x.ln)
    : [];
  const posted = v.mode.zones.castInto === "chosen" ? v.players.filter((p) => p.at === z.i) : [];
  return `<div class="zone ${z.rich ? "rich" : ""} ${z.extra ? "extra" : ""} ${taken ? "taken" : ""}">
    <div class="zhead"><b>${esc(z.name)}</b>${z.rich ? ' <span class="badge">★ rich</span>' : ""}
      ${v.mode.id === "classic" ? "" : `<span class="holder">${holder ? "held by " + chip(holder) : '<span class="muted">unclaimed</span>'}</span>`}</div>
    ${posted.length && !v.revealed ? `<div class="posted">${posted.map(chip).join(" ")}</div>` : ""}
    ${lines.length && !v.revealed ? `<div class="muted small">${past ? "last round:" : `round ${v.round - 1} revealed:`}</div>` : ""}
    ${lines.map(({ p, ln }) => `<div class="zline ${past ? "past" : ""}" style="--c:${p.color}">
        <span class="chip" style="--c:${p.color}">${esc(p.name)}</span>
        <span class="mini">${flipCards(app, ln.cards, p.id * 3)}</span>
        <span class="zstat">A <b>${ln.atk}</b> · B <b>${ln.blk}</b> · ${ln.len}f</span></div>`).join("")}
  </div>`;
}

function actionPanel(app, v) {
  const c = v.choice;
  if (!c) {
    const pend = v.pending;
    if (!pend) return `<div class="panel muted">…</div>`;
    const waiting = pend.who.filter((id) => !pend.done.includes(id)).map((id) => v.players[id].name);
    return `<div class="panel"><span class="muted">Waiting for</span> ${waiting.map(esc).join(", ")} <span class="muted">(${esc(stepName(pend.step))})</span>${app.error ? `<p class="err">${esc(app.error)}</p>` : ""}</div>`;
  }
  const err = app.error ? `<p class="err">${esc(app.error)}</p>` : "";
  if (c.type === "option") {
    return `<div class="panel choice"><p class="prompt">${esc(c.prompt)}</p>
      <div class="opts">${c.options.map((o, i) => `<button class="opt" data-act="opt" data-i="${i}"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</button>`).join("")}</div>${err}</div>`;
  }
  if (c.type === "pickCards") {
    const n = app.draft.pick.length;
    return `<div class="panel choice"><p class="prompt">${esc(c.prompt)}</p>
      <p>Picked ${n}/${c.count}. Click cards in your hand.</p>
      <button class="primary" data-act="pickDone" ${n !== c.count ? "disabled" : ""}>Pass them</button>${err}</div>`;
  }
  if (c.type === "cast") return castPanel(app, v, c) + err;
  return "";
}

function castPanel(app, v, c) {
  const d = app.draft;
  const zones = app.allowedZones;
  const slots = zones.map((zi) => {
    const z = v.zones.find((x) => x.i === zi);
    const ids = d.lines[zi] || [];
    const s = lineStats(ids.map((id) => app.data.cardMap[id]));
    const th = d.thumbs.filter((t) => t === zi).length;
    return `<div class="slot ${d.zone === zi ? "active" : ""}" data-act="zone" data-zone="${zi}">
      <div class="slot-head"><b>${esc(z.name)}</b>${z.holder != null ? ` <small>held by ${esc(v.players[z.holder].name)}</small>` : ""}${z.rich ? ' <span class="badge">★</span>' : ""}</div>
      <div class="slot-cards">${ids.length ? ids.map((id) => card(app.data.cardMap[id], { cls: "in-line" })).join("") : '<span class="muted small">click cards to add</span>'}</div>
      <div class="small">ATK <b>${s.atk}</b> · BLK <b>${s.blk}</b> · ${s.len} fingers${s.seams.length ? ` · ${s.seams.length} seam${s.seams.length > 1 ? "s" : ""}` : ""}${th ? ` · Thumbs ${"●".repeat(th)}` : ""}</div>
    </div>`;
  }).join("");
  const used = Object.values(d.lines).flat();
  const fingers = Object.values(d.lines).reduce((a, ids) => a + lineStats(ids.map((id) => app.data.cardMap[id])).len, 0);
  const me = v.players[v.you];
  return `<div class="panel choice cast"><p class="prompt">${esc(c.prompt)} ${zones.length > 1 ? "Pick a zone, then click cards." : ""}</p>
    <div class="slots">${slots}</div>
    <div class="row meter">
      <span>Fingers <b class="${fingers > c.limits.line ? "bad" : ""}">${fingers}</b>/${c.limits.line}</span>
      <span>Cards <b class="${used.length > c.limits.maxCards ? "bad" : ""}">${used.length}</b>/${c.limits.maxCards}</span>
      <span>Thumbs <button data-act="thumbDel" ${!d.thumbs.length ? "disabled" : ""}>−</button> ${d.thumbs.length} <button data-act="thumbAdd" ${d.thumbs.length >= Math.min(2, me.thumbs) ? "disabled" : ""}>+</button> <small class="muted">(${me.thumbs} left)</small></span>
      <button data-act="clear">Clear</button>
      <button class="primary" data-act="lock" ${app.castProblem ? "disabled" : ""}>Lock in</button>
    </div>
    ${app.castProblem && used.length ? `<p class="muted small">${esc(app.castProblem)}</p>` : ""}
  </div>`;
}

function handRow(app, v, me) {
  const c = v.choice;
  const used = c?.type === "cast" ? Object.values(app.draft.lines).flat() : [];
  const picked = c?.type === "pickCards" ? app.draft.pick : [];
  const cards = me.hand.map((id) => card(app.data.cardMap[id], { cls: `${used.includes(id) ? "used" : ""} ${picked.includes(id) ? "picked" : ""}` }));
  return `<div class="hand"><div class="hand-title">Your hand <span class="muted">(${esc(me.name)})</span></div><div class="hand-cards" data-act="hand">${cards.join("")}</div></div>`;
}

function coverScreen(app, v, sum) {
  const p = v.players[app.cover];
  return `<div class="cover" style="--c:${p.color}"><div class="cover-box">
    <img src="${p.img}" alt=""><h2>Pass the device to ${esc(p.name)}</h2>
    <p class="muted">${esc(stepName(v.pending?.step))}</p>
    ${sum ? `<p class="small">${esc(sum.text)}</p>` : ""}
    <button class="primary" data-act="unlock" data-pid="${p.id}">I'm ${esc(p.name)}: show my hand</button></div></div>`;
}

const STEP_NAMES = { cast: "casting", swapMeet: "Swap Meet", flipScript: "Flip the Script", postUp: "posting up", stayBail: "stay or bail", callOut: "call-outs", passTab: "the Tab" };
export const stepName = (s) => STEP_NAMES[s] || s;

function endPanel(app, v) {
  const track = v.result.track;
  const rows = v.result.order.map((id, i) => {
    const p = v.players[id];
    return `<tr style="--c:${p.color}"><td>${i + 1}</td><td><span class="chip" style="--c:${p.color}">${esc(p.name)}</span> <small class="muted">${esc(p.crew)}</small></td><td><b>${p.tracks[track]}</b> ${track === "rep" ? "Rep" : "damage"}</td><td class="small muted">${p.hist.map((h) => (track === "rep" ? h.rep : h.dmg)).join(" · ")}</td></tr>`;
  }).join("");
  const s = app.survey;
  return `<div class="panel end">
    <h2>The Vein closes: ${esc(v.players[v.result.order[0]].name)} takes it</h2>
    <table class="standings"><tr><th>#</th><th>Crew</th><th>Final</th><th>${track === "rep" ? "Rep after each round" : "Damage each round"}</th></tr>${rows}</table>
    <h3>Quick survey <small class="muted">(saved into the log file)</small></h3>
    <label class="q">Best moment of the game (Fiero)<textarea data-act="survey" data-k="best" rows="2">${esc(s.best)}</textarea></label>
    <label class="q">A round where the choice was obvious (Flow)<textarea data-act="survey" data-k="obvious" rows="2">${esc(s.obvious)}</textarea></label>
    <label class="q">Did you change a cast because of another crew? How often?<textarea data-act="survey" data-k="reads" rows="2">${esc(s.reads)}</textarea></label>
    <label class="q">Fun, 1–5 <input data-act="survey" data-k="fun" value="${esc(s.fun)}" size="3"></label>
    <div class="row"><button class="primary" data-act="download">Download game log (.json)</button><button class="primary" data-act="stats">Game stats</button>${app.role !== "client" ? `<button data-act="replay" data-i="cur">Replay</button>` : ""}<button data-act="leave">Back to lobby</button></div>
    <p class="muted small">Game stats: timing, economy and per-crew numbers, downloadable as a report (.md), a spreadsheet (.csv) or an image.</p>
  </div>`;
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
