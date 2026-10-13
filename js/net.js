'use strict';
/* ==========================================================
   ONLINE: salas P2P com PeerJS (WebRTC), sem servidor próprio.
   - Quem cria a sala é o host: roda a simulação e envia snapshots.
   - Os outros jogadores enviam só seus comandos.
   - Código da sala = 5 caracteres (ex.: K7M2Q).
   ========================================================== */
const Net = {
  PREFIX: 'luta2d-',
  peer: null, host: false, code: '', conn: null,
  players: [],        // só no host: [{name, ch, conn, dead}]
  inGame: false,
  on: {},             // callbacks definidos pelo main.js

  _code() {
    const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 5; i++) c += s[Math.random() * s.length | 0];
    return c;
  },

  _clean(n) {
    return String(n || '').replace(/[^\wÀ-ÿ ]/g, '').trim().slice(0, 10).toUpperCase() || 'JOGADOR';
  },

  available() { return typeof Peer !== 'undefined'; },

  // STUN + TURN (retransmissão) para conectar aparelhos em redes diferentes, como celular 4G x PC no Wi-Fi.
  // O TURN abaixo é um serviço público gratuito e pode ficar lento ou indisponível; para uso sério, troque pelo seu.
  _opts() {
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
        ],
        iceCandidatePoolSize: 4
      }
    };
  },

  /* ---------- host ---------- */
  createRoom(name, ch, tries) {
    tries = tries || 0;
    this.leave(true);
    this.host = true;
    this.code = this._code();
    const peer = this.peer = new Peer(this.PREFIX + this.code, this._opts());
    peer.on('open', () => {
      this.players = [{ name: this._clean(name), ch, conn: null }];
      this.inGame = false;
      this.on.created && this.on.created(this.code);
      this.sendLobby();
    });
    peer.on('connection', conn => this._hostConn(conn));
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && tries < 5) { this.createRoom(name, ch, tries + 1); return; }
      this.on.error && this.on.error(this._msg(err));
    });
  },

  _hostConn(conn) {
    conn.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'join') {
        if (conn.__p) return;
        if (this.inGame) { conn.send({ t: 'deny', why: 'A partida já começou.' }); setTimeout(() => conn.close(), 400); return; }
        if (this.players.length >= 4) { conn.send({ t: 'deny', why: 'A sala está cheia (máx. 4).' }); setTimeout(() => conn.close(), 400); return; }
        const p = { name: this._clean(d.name), ch: this._ch(d.ch), conn };
        conn.__p = p;
        this.players.push(p);
        this.sendLobby();
      } else if (d.t === 'pick' && conn.__p) {
        conn.__p.ch = this._ch(d.ch);
        this.sendLobby();
      } else if (d.t === 'i' && conn.__p) {
        const idx = this.players.indexOf(conn.__p);
        if (idx >= 0) this.on.input && this.on.input(idx, d.m | 0, d.a | 0);
      }
    });
    const gone = () => {
      const p = conn.__p;
      if (!p || p.dead) return;
      const idx = this.players.indexOf(p);
      if (this.inGame) { p.dead = true; this.on.drop && this.on.drop(idx, p.name); }
      else { this.players.splice(idx, 1); this.sendLobby(); }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  },

  _ch(v) { v = v | 0; return v >= 0 && v < CHARS.length ? v : 0; },

  sendLobby() {
    const list = this.players.map(p => ({ name: p.name, ch: p.ch }));
    this.players.forEach((p, i) => {
      if (p.conn && p.conn.open && !p.dead) p.conn.send({ t: 'lobby', list, me: i });
    });
    this.on.lobby && this.on.lobby(list, 0);
  },

  startGame() {
    this.players = this.players.filter(p => !p.dead);
    const list = this.players.map(p => ({ name: p.name, ch: p.ch }));
    this.inGame = true;
    this.players.forEach((p, i) => { if (p.conn && p.conn.open) p.conn.send({ t: 'start', list, me: i }); });
    return list;
  },

  backToLobby() {
    this.inGame = false;
    this.players = this.players.filter(p => !p.dead);
    this.sendLobby();
  },

  broadcast(msg) {
    for (const p of this.players) if (p.conn && p.conn.open && !p.dead) p.conn.send(msg);
  },

  /* ---------- cliente ---------- */
  joinRoom(code, name, ch) {
    this.leave(true);
    this.host = false;
    this.code = String(code || '').toUpperCase().trim();
    const peer = this.peer = new Peer(undefined, this._opts());
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened) { this.leave(true); this.on.error && this.on.error('Não foi possível conectar. Confira o código e a internet.'); }
    }, 15000);
    peer.on('open', () => {
      const conn = this.conn = peer.connect(this.PREFIX + this.code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        opened = true; clearTimeout(timer);
        conn.send({ t: 'join', name, ch });
      });
      conn.on('data', d => {
        if (!d) return;
        if (d.t === 'lobby') this.on.lobby && this.on.lobby(d.list, d.me);
        else if (d.t === 'start') this.on.start && this.on.start(d.list, d.me);
        else if (d.t === 's') this.on.state && this.on.state(d);
        else if (d.t === 'deny') { this.leave(true); this.on.error && this.on.error(d.why); }
      });
      conn.on('close', () => { if (this.conn === conn) { this.leave(true); this.on.closed && this.on.closed(); } });
      conn.on('error', () => { if (this.conn === conn) { this.leave(true); this.on.closed && this.on.closed(); } });
    });
    peer.on('error', err => {
      clearTimeout(timer);
      this.leave(true);
      this.on.error && this.on.error(this._msg(err));
    });
  },

  sendPick(ch) { if (this.conn && this.conn.open) this.conn.send({ t: 'pick', ch }); },
  sendInput(m, a) { if (this.conn && this.conn.open) this.conn.send({ t: 'i', m, a }); },

  _msg(err) {
    switch (err.type) {
      case 'peer-unavailable': return 'Sala não encontrada. Confira o código.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
        return 'Sem conexão com o servidor de salas. Verifique sua internet.';
      case 'browser-incompatible': return 'Seu navegador não suporta conexão online (WebRTC).';
      default: return 'Erro de conexão: ' + (err.type || 'desconhecido');
    }
  },

  leave(silent) {
    const peer = this.peer, conn = this.conn;
    this.peer = null; this.conn = null; this.players = []; this.inGame = false; this.host = false;
    try { if (conn) conn.close(); } catch (e) { /* ignora */ }
    try { if (peer) peer.destroy(); } catch (e) { /* ignora */ }
  }
};
