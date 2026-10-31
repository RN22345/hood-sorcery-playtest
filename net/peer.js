// Network adapter: the ONLY file that talks to PeerJS (WebRTC, free public broker for signalling).
// It knows nothing about the rules: it moves small JSON messages between the host and clients.
// Star topology, host-authoritative (same pattern as hood-sorcery-prototype v2.10.00).
//
//   client -> host  { t:'hello', name }            join / rejoin (same name = same seat)
//   client -> host  { t:'act', value }             answer to the pending decision
//   host -> client  { t:'welcome', seat, code }    seat = player index, or null for spectators
//   host -> client  { t:'lobby', lobby }           seats + mode while the host is setting up
//   host -> client  { t:'view', view }             viewFor(state, seat): only what that seat may see
//   host -> client  { t:'error', text }
//
// To swap transport (Supabase Realtime, Firebase, Unity Relay), rewrite this file only.

const PREFIX = "hood-sorcery-pt-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PEERJS = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";

export function newCode(len = 5) {
  let s = "";
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  for (const x of a) s += CODE_CHARS[x % CODE_CHARS.length];
  return s;
}

function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = PEERJS;
    s.onload = ok;
    s.onerror = () => fail(new Error("Could not load PeerJS (offline or blocked)"));
    document.head.appendChild(s);
  });
}

export class Host {
  /** handlers: onHello(connId, name) -> seat|null, onAct(connId, value), onLeave(connId), onStatus(text) */
  constructor(handlers) {
    this.h = handlers;
    this.conns = new Map(); // connId -> { conn, name, seat }
  }

  async open(code = newCode()) {
    await loadPeerJs();
    this.code = code;
    return new Promise((ok, fail) => {
      this.peer = new window.Peer(PREFIX + code.toLowerCase());
      this.peer.on("open", () => { this.h.onStatus?.(`Room ${code} is open`); ok(code); });
      this.peer.on("error", (e) => {
        if (e.type === "unavailable-id") { this.peer.destroy(); this.open(newCode()).then(ok, fail); return; }
        this.h.onStatus?.(`Network: ${e.type || e.message}`);
        fail(e);
      });
      this.peer.on("disconnected", () => this.peer.reconnect());
      this.peer.on("connection", (conn) => {
        conn.on("data", (raw) => this._msg(conn, raw));
        conn.on("close", () => { this.conns.delete(conn.peer); this.h.onLeave?.(conn.peer); });
      });
    });
  }

  _msg(conn, raw) {
    const m = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (m.t === "hello") {
      const seat = this.h.onHello(conn.peer, String(m.name || "Guest").slice(0, 24));
      this.conns.set(conn.peer, { conn, name: m.name, seat });
      this.send(conn.peer, { t: "welcome", seat, code: this.code });
    } else if (m.t === "act") this.h.onAct(conn.peer, m.value);
  }

  send(connId, msg) {
    const c = this.conns.get(connId);
    if (c && c.conn.open) c.conn.send(msg);
  }

  each(fn) { for (const [id, c] of this.conns) fn(id, c); }

  close() { this.peer?.destroy(); }
}

export class Client {
  /** handlers: onMessage(msg), onStatus(text), onClose() */
  constructor(handlers) { this.h = handlers; }

  async join(code, name) {
    await loadPeerJs();
    return new Promise((ok, fail) => {
      this.peer = new window.Peer();
      this.peer.on("error", (e) => { this.h.onStatus?.(`Network: ${e.type || e.message}`); fail(e); });
      this.peer.on("open", () => {
        this.conn = this.peer.connect(PREFIX + code.trim().toLowerCase(), { reliable: true });
        this.conn.on("open", () => { this.conn.send({ t: "hello", name }); this.h.onStatus?.(`Joined room ${code.toUpperCase()}`); ok(); });
        this.conn.on("data", (raw) => this.h.onMessage(typeof raw === "string" ? JSON.parse(raw) : raw));
        this.conn.on("close", () => this.h.onClose?.());
      });
    });
  }

  act(value) { this.conn?.send({ t: "act", value }); }
  close() { this.peer?.destroy(); }
}
