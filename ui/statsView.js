// Stats on screen and as a picture. One SVG "stats card" is both shown in the page and turned into a PNG
// (SVG -> <img> -> <canvas> -> toBlob), so there is no screenshot library. The tables below the card are the
// .md report rendered by md.js.
import { statsMarkdown } from "./stats.js";
import { md } from "./md.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const W = 1000;
const FONT = "Noto Sans, Segoe UI, Arial, sans-serif";

export function statsCard(s) {
  const n = s.players.length, R = s.roundsPlayed;
  const ranked = [...s.players].map((p, i) => ({ ...p, i })).sort((a, b) => a.place - b.place);
  const rowH = 46, top = 96, chartTop = top + n * rowH + 30, chartH = 250, boxTop = chartTop + chartH + 50;
  const H = boxTop + 96;
  const maxAbs = Math.max(1, ...s.players.map((p) => Math.abs(p.final)));
  const title = `${s.mode.name}${s.mode.modifiers.length ? " + " + s.mode.modifiers.join(", ") : ""}`;
  const sub = [s.over ? `${s.winner} wins` : `In progress · round ${R}/${s.roundsPlanned}`, `${s.best === "lowest" ? "least" : "most"} ${s.unit} wins`, s.seed != null ? `seed ${s.seed}` : "", s.time ? (s.time.durationSec < 60 ? `${Math.round(s.time.durationSec)} s` : `${Math.round(s.time.durationSec / 60)} min`) : ""].filter(Boolean).join("  ·  ");
  const rows = ranked.map((p, k) => {
    const y = top + k * rowH;
    const bw = Math.round((Math.abs(p.final) / maxAbs) * 330);
    return `<rect x="40" y="${y}" width="6" height="${rowH - 10}" fill="${p.color}"/>
      <text x="60" y="${y + 25}" font-size="22" font-weight="700" fill="#e8b64a">${p.place}</text>
      <text x="92" y="${y + 18}" font-size="17" font-weight="700">${esc(p.name)}${p.kind === "bot" ? ' <tspan fill="#b9aec0" font-weight="400" font-size="13">bot</tspan>' : ""}</text>
      <text x="92" y="${y + 35}" font-size="13" fill="#b9aec0">${esc(p.crew)}</text>
      <rect x="430" y="${y + 8}" width="${bw}" height="20" rx="4" fill="${p.color}" opacity=".75"/>
      <text x="${440 + bw}" y="${y + 24}" font-size="18" font-weight="700">${p.final} <tspan font-size="13" fill="#b9aec0">${s.unit}</tspan></text>`;
  }).join("");
  // cumulative score per round, from 0 at the start
  const vals = s.players.flatMap((p) => [0, ...p.totals, p.final]);
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  const end = s.players.some((p) => p.endAdjust) ? 1 : 0; // an extra "end" point for end-of-game payouts
  const cx = (r) => 70 + (r / Math.max(1, R + end)) * (W - 120);
  const cy = (v) => chartTop + chartH - ((v - lo) / (hi - lo)) * chartH;
  const grid = Array.from({ length: R + 1 + end }, (_, r) => `<line x1="${cx(r)}" y1="${chartTop}" x2="${cx(r)}" y2="${chartTop + chartH}" stroke="#3b3046"/><text x="${cx(r)}" y="${chartTop + chartH + 20}" font-size="12" fill="#b9aec0" text-anchor="middle">${r > R ? "end" : r ? "R" + r : "start"}</text>`).join("");
  const ticks = [lo, Math.round((lo + hi) / 2), hi].map((v) => `<text x="60" y="${cy(v) + 4}" font-size="12" fill="#b9aec0" text-anchor="end">${v}</text>`).join("");
  const lines = s.players.map((p) => `<polyline fill="none" stroke="${p.color}" stroke-width="3" stroke-linejoin="round" points="${[0, ...p.totals, ...(end ? [p.final] : [])].map((v, r) => `${cx(r).toFixed(1)},${cy(v).toFixed(1)}`).join(" ")}"/>`).join("");
  const e = s.economy, t = s.time;
  const boxes = [
    ["Lead changes", e.leadChanges], ["Final margin", `${e.finalMargin} ${s.unit}`], [`Table ${s.unit}`, e.tableTotal],
    ["Thumbs used", e.thumbsUsed], ["Per round", t?.avgRoundSec != null ? `${Math.round(t.avgRoundSec)} s` : "–"],
    ["Human decision", t?.avgHumanDecisionSec != null ? `${t.avgHumanDecisionSec} s` : "–"],
  ];
  const bw = (W - 80 - 5 * 12) / 6;
  const boxSvg = boxes.map(([k, v], i) => `<rect x="${40 + i * (bw + 12)}" y="${boxTop}" width="${bw}" height="72" rx="10" fill="#1f1926" stroke="#3b3046"/>
    <text x="${40 + i * (bw + 12) + bw / 2}" y="${boxTop + 32}" font-size="22" font-weight="700" text-anchor="middle" fill="#e8b64a">${esc(v)}</text>
    <text x="${40 + i * (bw + 12) + bw / 2}" y="${boxTop + 56}" font-size="13" text-anchor="middle" fill="#b9aec0">${esc(k)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="stats-card" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" fill="#f1e9dc">
    <rect width="${W}" height="${H}" fill="#15111a"/>
    <text x="40" y="44" font-size="28" font-weight="700" fill="#e8b64a" font-family="Gelasio, Georgia, serif">Hood Sorcery · ${esc(title)}</text>
    <text x="40" y="72" font-size="15" fill="#b9aec0">${esc(sub)}</text>
    ${rows}
    <text x="40" y="${chartTop - 8}" font-size="14" fill="#b9aec0">${s.unit} after each round</text>
    ${grid}${ticks}${lines}
    ${boxSvg}
  </svg>`;
}

/** HTML for one stats report: card, download buttons, then the readable tables. `i` indexes app.statsList. */
export function statsPanel(s, i) {
  const report = statsMarkdown(s).split("<!--")[0].replace(/^# .*\n/, "");
  return `<section class="stats" data-stats="${i}">
    <div class="stats-card-wrap">${statsCard(s)}</div>
    <div class="row">
      <button data-act="statsMd" data-i="${i}">Report (.md)</button>
      <button data-act="statsCsv" data-i="${i}">Spreadsheet (.csv)</button>
      <button data-act="statsImg" data-i="${i}" data-type="image/png">Image (.png)</button>
      <button data-act="statsImg" data-i="${i}" data-type="image/jpeg">(.jpg)</button>
      <span class="muted small">The .md report (or the game log .json) loads back in the lobby, in any tab.</span>
    </div>
    <details open><summary>Tables</summary><div class="stats-md">${md(report)}</div></details>
  </section>`;
}

/** Render the stats card into an image Blob (png / jpeg / webp). */
export function statsImage(s, type = "image/png", scale = 2) {
  const svg = statsCard(s);
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w * scale; c.height = h * scale;
      const g = c.getContext("2d");
      g.scale(scale, scale);
      g.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => (b ? ok(b) : fail(new Error("Image export failed"))), type, 0.92);
    };
    img.onerror = () => fail(new Error("Image export failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
