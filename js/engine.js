'use strict';
/* ==========================================================
   MOTOR: simulação de lutadores, golpes, projéteis e rounds.
   No online, quem cria a sala (host) roda isto e envia snapshots.
   ========================================================== */
class Fighter {
  constructor(i, p) {
    this.i = i;
    this.name = p.name;
    this.chId = p.ch;
    this.ch = CHARS[p.ch];
    this.ai = !!p.ai;
    this.tag = this.ai ? 'CPU' : 'P' + (i + 1);
    this.maxHp = this.ch.hp;
    this.score = 0;
    this.wins = 0;
    this.left = false;
    this.inp = { l: false, r: false, u: false, d: false };
    this.aiS = { t: 0, dir: 0, d: false, u: false };
    this.init = false;
    this.reset(300, 1);
  }
  reset(x, face) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.face = face;
    this.hp = this.maxHp; this.shown = this.maxHp;
    this.st = 'idle'; this.sf = 0; this.onGround = true;
    this.buf = null; this.stun = 0; this.inv = 0; this.cool = 0;
    this.hits = new Set();
    this.tx = x; this.ty = 0;
    if (this.left) { this.hp = 0; this.shown = 0; this.st = 'ko'; this.sf = 99; }
  }
  press(t) { this.buf = { type: t, ttl: 9 }; }
}

class Game {
  constructor(list) {
    this.fighters = list.map((p, i) => new Fighter(i, p));
    this.projs = [];
    this.events = [];
    this.netEvents = [];
    this.round = 1;
    this.matchWinner = -2;     // -2 = partida em andamento, -1 = empate
    this.resetRound();
  }

  emit(t, x, y, v) {
    const e = [t, Math.round(x), Math.round(y), v || 0];
    this.events.push(e);
    this.netEvents.push(e);
  }

  resetRound() {
    const n = this.fighters.length;
    const xs = n === 2 ? [300, 660] : n === 3 ? [200, 760, 480] : [160, 800, 340, 620];
    this.fighters.forEach((f, i) => f.reset(xs[i], xs[i] < W / 2 ? 1 : -1));
    this.projs = [];
    this.phase = 'intro';
    this.phT = 0;
    this.time = ROUND_TIME * 60;
    this.roundWinner = -1;
    this.endReason = 'KO';
  }

  /* ---------- loop principal (60 Hz) ---------- */
  update() {
    this.phT++;
    if (this.phase === 'intro') {
      if (this.phT === 1) this.emit('r', W / 2, 200);
      if (this.phT >= 95) { this.phase = 'fight'; this.phT = 0; this.emit('f', W / 2, 200); }
    } else if (this.phase === 'fight') {
      if (this.time > 0) this.time--;
    } else if (this.phase === 'roundend') {
      if (this.phT >= 170) this.afterRound();
    }

    for (const f of this.fighters) {
      if (this.phase === 'fight' && f.ai && f.hp > 0) this.think(f);
      this.tickFighter(f);
    }
    this.separate();
    this.updateProjs();

    for (const f of this.fighters) {
      if (f.shown > f.hp) f.shown = Math.max(f.hp, f.shown - 0.25); else f.shown = f.hp;
    }
    if (this.phase === 'fight') this.checkEnd();
  }

  setSt(f, s) { if (f.st !== s) { f.st = s; f.sf = 0; } }

  autoFace(f) {
    let best = 1e9, tx = null;
    for (const o of this.fighters) {
      if (o === f || o.hp <= 0) continue;
      const d = Math.abs(o.x - f.x);
      if (d < best) { best = d; tx = o.x; }
    }
    if (tx !== null && Math.abs(tx - f.x) > 4) f.face = tx > f.x ? 1 : -1;
  }

  tickFighter(f) {
    f.sf++;
    if (f.cool > 0) f.cool--;
    if (f.inv > 0) f.inv--;
    if (f.buf && --f.buf.ttl <= 0) f.buf = null;
    const st = f.st;

    if (st === 'ko') {
      // caído
    } else if (st === 'hit') {
      if (f.sf >= f.stun) { this.setSt(f, f.onGround ? 'idle' : 'jump'); f.inv = 10; }
    } else if (st === 'punch' || st === 'kick' || st === 'special') {
      this.tickAttack(f);
    } else if (this.phase === 'roundend' || this.phase === 'match') {
      if (this.roundWinner === f.i && f.onGround && f.hp > 0) { this.setSt(f, 'win'); f.vx = 0; }
      else if (st !== 'win') { this.setSt(f, f.onGround ? 'idle' : 'jump'); if (f.onGround) f.vx *= 0.7; }
    } else if (this.phase === 'fight') {
      this.autoFace(f);
      this.control(f);
    } else {
      this.autoFace(f);
      this.setSt(f, f.onGround ? 'idle' : 'jump');
      f.vx = 0;
    }

    // física
    f.x += f.vx;
    if (f.x < 34) { f.x = 34; f.vx = 0; }
    if (f.x > W - 34) { f.x = W - 34; f.vx = 0; }
    if (!f.onGround) {
      f.vy += GRAV;
      f.y += f.vy;
      if (f.y >= 0) {
        const hard = f.vy;
        f.y = 0; f.vy = 0; f.onGround = true;
        if (hard > 9) this.emit('l', f.x, GROUND, 0);
        if (f.st === 'jump') this.setSt(f, 'idle');
      }
    }
    if (f.onGround && (f.st === 'hit' || f.st === 'ko' || f.st === 'punch' || f.st === 'kick' || f.st === 'special' || f.st === 'win')) {
      f.vx *= 0.86;
    }
  }

  control(f) {
    const inp = f.inp;
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (f.buf) {
      const t = f.buf.type;
      if (t === 'special') {
        if (f.onGround && f.cool === 0) { this.startAtk(f, 'special'); return; }
      } else { this.startAtk(f, t); return; }
    }
    if (f.onGround) {
      if (inp.u) {
        f.vy = -JUMP_V * f.ch.jump;
        f.vx = dir * SPEED * f.ch.spd * 1.1;
        f.onGround = false;
        this.setSt(f, 'jump');
      } else if (inp.d) {
        this.setSt(f, 'block'); f.vx = 0;
      } else if (dir) {
        this.setSt(f, 'walk');
        f.vx = dir * SPEED * f.ch.spd * (dir === f.face ? 1 : 0.8);
      } else {
        this.setSt(f, 'idle'); f.vx = 0;
      }
    } else {
      this.setSt(f, 'jump');
      f.vx += dir * 0.25;
      const m = SPEED * f.ch.spd * 1.4;
      if (f.vx > m) f.vx = m;
      if (f.vx < -m) f.vx = -m;
    }
  }

  startAtk(f, type) {
    f.st = type; f.sf = 0; f.buf = null; f.hits.clear();
    if (f.onGround) f.vx = 0;
  }

  tickAttack(f) {
    const a = ATK[f.st];
    if (f.st === 'special') {
      if (f.sf === a.su) this.fireball(f);
    } else if (f.sf >= a.su && f.sf < a.su + a.ac) {
      if (f.sf === a.su) this.emit(f.st === 'punch' ? 'p' : 'k', f.x, GROUND + f.y - 100);
      this.melee(f, a);
    }
    if (f.sf >= a.su + a.ac + a.rc) this.setSt(f, f.onGround ? 'idle' : 'jump');
  }

  fireball(f) {
    const p = f.ch.proj, s = f.ch.scale;
    this.projs.push({
      x: f.x + f.face * 44 * s, y: GROUND + f.y - 100 * s, vx: f.face * p.v,
      o: f.i, dmg: 13 * f.ch.pow * p.dmg, r: p.r, life: 130
    });
    f.cool = 75;
    this.emit('s', f.x, GROUND + f.y - 100);
  }

  melee(f, a) {
    const sc = f.ch.scale;
    const reach = a.reach * f.ch.reach * sc;
    const x1 = f.face > 0 ? f.x + 12 : f.x - 12 - reach, x2 = x1 + reach;
    const top = GROUND + f.y - a.y1 * sc, bot = GROUND + f.y - a.y2 * sc;
    for (const v of this.fighters) {
      if (v === f || v.hp <= 0 || v.inv > 0 || f.hits.has(v.i)) continue;
      const vs = v.ch.scale;
      const hx1 = v.x - 22 * vs, hx2 = v.x + 22 * vs;
      const hy1 = GROUND + v.y - 160 * vs, hy2 = GROUND + v.y;
      if (x2 > hx1 && x1 < hx2 && bot > hy1 && top < hy2) {
        f.hits.add(v.i);
        this.damage(f, v, a.dmg * f.ch.pow, a.hs, a.kb, (f.x + v.x) / 2, GROUND + v.y - 100 * vs);
      }
    }
  }

  damage(att, vic, dmg, hs, kb, x, y) {
    if (vic.hp <= 0) return;
    const front = (att.x >= vic.x ? 1 : -1) === vic.face;
    const dir = att.x >= vic.x ? -1 : 1;
    if (vic.onGround && vic.st === 'block' && front) {
      vic.hp = Math.max(1, vic.hp - Math.max(0.5, dmg * 0.1));
      vic.vx = dir * 3.2;
      att.score += 15;
      this.emit('b', x, y, 0);
      return;
    }
    vic.hp -= dmg;
    att.score += Math.round(dmg * 100);
    vic.buf = null; vic.vx = dir * kb; vic.stun = hs;
    vic.st = 'hit'; vic.sf = 0;
    if (!vic.onGround) vic.vy = Math.min(vic.vy, -3);
    if (vic.hp <= 0) {
      vic.hp = 0; vic.st = 'ko'; vic.sf = 0;
      vic.vy = -9; vic.vx = dir * 6; vic.onGround = false;
      att.score += 1000;
      this.emit('ko', x, y, 0);
    } else {
      this.emit('h', x, y, Math.round(dmg));
    }
  }

  separate() {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j];
      if (a.st === 'ko' || b.st === 'ko') continue;
      const dx = b.x - a.x, min = 44;
      if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 90) {
        const push = (min - Math.abs(dx)) / 2 * (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx));
        a.x = Math.max(34, Math.min(W - 34, a.x - push));
        b.x = Math.max(34, Math.min(W - 34, b.x + push));
      }
    }
  }

  updateProjs() {
    for (const p of this.projs) {
      p.x += p.vx; p.life--;
      if (this.phase === 'fight') {
        for (const v of this.fighters) {
          if (v.i === p.o || v.hp <= 0 || v.inv > 0) continue;
          const vs = v.ch.scale, gy = GROUND + v.y;
          if (Math.abs(p.x - v.x) < 22 * vs + p.r * 0.6 && p.y > gy - 165 * vs && p.y < gy + 6) {
            this.damage(this.fighters[p.o], v, p.dmg, 20, 7, p.x, p.y);
            p.life = 0;
            break;
          }
        }
      }
      if (p.x < -50 || p.x > W + 50) p.life = 0;
    }
    for (let i = 0; i < this.projs.length; i++) for (let j = i + 1; j < this.projs.length; j++) {
      const a = this.projs[i], b = this.projs[j];
      if (a.life > 0 && b.life > 0 && a.o !== b.o && Math.abs(a.x - b.x) < 30 && Math.abs(a.y - b.y) < 30) {
        a.life = 0; b.life = 0;
        this.emit('b', (a.x + b.x) / 2, a.y, 1);
      }
    }
    this.projs = this.projs.filter(p => p.life > 0);
  }

  /* ---------- fim de round / partida ---------- */
  checkEnd() {
    const alive = this.fighters.filter(f => f.hp > 0);
    if (alive.length > 1 && this.time > 0) return;
    let w = -1, reason = 'KO';
    if (alive.length === 1) w = alive[0].i;
    else if (alive.length > 1) {
      reason = 'TIME';
      const s = alive.slice().sort((a, b) => b.hp - a.hp);
      if (s[0].hp - s[1].hp > 0.5) w = s[0].i;
    }
    this.endReason = reason;
    this.roundWinner = w;
    if (w >= 0) this.fighters[w].wins++;
    this.phase = 'roundend';
    this.phT = 0;
  }

  afterRound() {
    const f = this.fighters;
    let mw = -2;
    const top = f.find(x => x.wins >= ROUNDS_TO_WIN);
    const present = f.filter(x => !x.left);
    if (top) mw = top.i;
    else if (present.length <= 1 && f.length > 1) mw = present[0] ? present[0].i : -1;
    else if (this.round >= MAX_ROUNDS) {
      const mx = Math.max(...f.map(x => x.wins));
      const c = f.filter(x => x.wins === mx);
      mw = c.length === 1 ? c[0].i : -1;
    }
    if (mw !== -2) { this.matchWinner = mw; this.phase = 'match'; this.phT = 0; return; }
    this.round++;
    this.resetRound();
  }

  /* ---------- CPU ---------- */
  think(f) {
    const s = f.aiS, inp = f.inp;
    if (f.st === 'hit' || f.st === 'ko') return;
    if (s.t > 0) s.t--;
    else {
      s.t = 8 + (Math.random() * 14 | 0);
      s.dir = 0; s.d = false; s.u = false;
      let e = null, best = 1e9;
      for (const o of this.fighters) {
        if (o === f || o.hp <= 0) continue;
        const d = Math.abs(o.x - f.x);
        if (d < best) { best = d; e = o; }
      }
      if (e) {
        const toward = Math.sign(e.x - f.x) || 1;
        const inc = this.projs.some(p => p.o !== f.i && Math.abs(p.x - f.x) < 260 && Math.sign(f.x - p.x) === Math.sign(p.vx));
        if (inc && f.onGround && Math.random() < 0.55) {
          if (Math.random() < 0.6) s.d = true; else { s.u = true; s.dir = toward; }
        } else if (best > 230) {
          s.dir = toward;
          if (f.cool === 0 && best > 300 && Math.random() < 0.25) f.press('special');
          else if (Math.random() < 0.08) s.u = true;
        } else if (best > 105) {
          s.dir = toward;
          if (Math.random() < 0.35) f.press(Math.random() < 0.5 ? 'kick' : 'punch');
          if (Math.random() < 0.05) s.u = true;
        } else {
          const r = Math.random();
          if (r < 0.38) f.press('punch');
          else if (r < 0.62) f.press('kick');
          else if (r < 0.75) { s.d = true; s.t = 14; }
          else if (r < 0.9) s.dir = -toward;
          else s.u = true;
        }
      }
    }
    inp.l = s.dir < 0; inp.r = s.dir > 0; inp.d = s.d; inp.u = s.u;
    s.u = false;
  }

  /* ---------- rede ---------- */
  snapshot() {
    return {
      t: 's', ph: this.phase, pt: this.phT, tm: this.time, rn: this.round,
      rw: this.roundWinner, mw: this.matchWinner, er: this.endReason,
      f: this.fighters.map(f => [
        +f.x.toFixed(1), +f.y.toFixed(1), +f.hp.toFixed(1), ST.indexOf(f.st), f.sf,
        f.face, f.score, f.wins, f.cool, f.onGround ? 1 : 0, f.left ? 1 : 0
      ]),
      p: this.projs.map(p => [Math.round(p.x), Math.round(p.y), p.vx, p.o]),
      ev: this.netEvents.splice(0)
    };
  }

  apply(m) {
    this.phase = m.ph; this.phT = m.pt; this.time = m.tm; this.round = m.rn;
    this.roundWinner = m.rw; this.matchWinner = m.mw; this.endReason = m.er;
    m.f.forEach((a, i) => {
      const f = this.fighters[i];
      if (!f) return;
      const ox = f.tx;
      f.tx = a[0]; f.ty = a[1]; f.hp = a[2];
      f.vx = f.init ? (f.tx - ox) / 2 : 0;
      f.st = ST[a[3]]; f.sf = a[4]; f.face = a[5]; f.score = a[6]; f.wins = a[7];
      f.cool = a[8]; f.onGround = !!a[9]; f.left = !!a[10];
      if (!f.init) { f.x = f.tx; f.y = f.ty; f.shown = f.hp; f.init = true; }
    });
    this.projs = m.p.map(a => ({ x: a[0], y: a[1], vx: a[2], o: a[3] }));
    for (const e of m.ev) this.events.push(e);
  }

  clientStep() {
    this.phT++;
    for (const f of this.fighters) {
      f.sf++;
      const dx = f.tx - f.x;
      if (!f.init || Math.abs(dx) > 150) f.x = f.tx; else f.x += dx * 0.45;
      f.y += (f.ty - f.y) * 0.5;
      if (f.shown > f.hp) f.shown = Math.max(f.hp, f.shown - 0.25); else f.shown = f.hp;
    }
    for (const p of this.projs) p.x += p.vx;
  }
}
