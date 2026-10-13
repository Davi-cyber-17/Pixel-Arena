'use strict';
/* ==========================================================
   EFEITOS: som (WebAudio sintetizado), faíscas e tremor
   ========================================================== */
const FX = { parts: [], flashes: [], shake: 0, muted: false };
let AC = null;

function audioInit() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC && AC.state === 'suspended') AC.resume();
  } catch (e) { AC = null; }
}

function tone(type, f0, f1, dur, vol) {
  if (!AC || FX.muted) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur);
}

function noise(dur, vol, freq) {
  if (!AC || FX.muted) return;
  const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = buf; fl.type = 'bandpass'; fl.frequency.value = freq; g.gain.value = vol;
  src.connect(fl); fl.connect(g); g.connect(AC.destination);
  src.start();
}

function sfx(n) {
  switch (n) {
    case 'whoosh': noise(0.12, 0.25, 1800); break;
    case 'whoosh2': noise(0.18, 0.3, 1100); break;
    case 'hit': tone('square', 160, 55, 0.12, 0.22); noise(0.08, 0.3, 900); break;
    case 'hit2': tone('square', 120, 40, 0.2, 0.3); noise(0.15, 0.4, 600); break;
    case 'block': tone('triangle', 900, 500, 0.08, 0.2); break;
    case 'special': tone('sawtooth', 280, 900, 0.3, 0.14); break;
    case 'ko': tone('sawtooth', 300, 40, 0.7, 0.28); noise(0.4, 0.4, 400); break;
    case 'round': tone('square', 440, 440, 0.15, 0.12); break;
    case 'fight': tone('square', 660, 880, 0.25, 0.15); noise(0.15, 0.2, 2000); break;
  }
}

function spark(x, y, n, cols, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = (Math.random() * 0.7 + 0.3) * spd;
    FX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, l: 20 + Math.random() * 14, m: 34, c: cols[i % cols.length], s: 2 + Math.random() * 3 });
  }
}

function fxEvent(e) {
  const t = e[0], x = e[1], y = e[2], v = e[3];
  switch (t) {
    case 'h':
      spark(x, y, 10 + v, ['#fff3b0', '#ffffff', '#ffb347'], 6);
      FX.flashes.push({ x, y, t: 0, m: 8, c: '#fff2a8', sz: 18 + v * 2 });
      sfx(v > 9 ? 'hit2' : 'hit');
      FX.shake = Math.max(FX.shake, v > 9 ? 9 : 4);
      break;
    case 'b':
      spark(x, y, 8, ['#8fd3ff', '#ffffff'], 4);
      FX.flashes.push({ x, y, t: 0, m: 6, c: '#8fd3ff', sz: 16 });
      sfx('block');
      break;
    case 'p': sfx('whoosh'); break;
    case 'k': sfx('whoosh2'); break;
    case 's': sfx('special'); break;
    case 'ko':
      spark(x, y, 36, ['#ffffff', '#ffd23f', '#ff5a2b'], 9);
      FX.flashes.push({ x, y, t: 0, m: 14, c: '#ffffff', sz: 60 });
      sfx('ko'); FX.shake = 16;
      break;
    case 'l': spark(x, y, 6, ['#b8ab92', '#8f846f'], 2.5); break;
    case 'r': sfx('round'); break;
    case 'f': sfx('fight'); break;
  }
}

function fxStep() {
  for (const p of FX.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.96; p.l--; }
  FX.parts = FX.parts.filter(p => p.l > 0);
  for (const f of FX.flashes) f.t++;
  FX.flashes = FX.flashes.filter(f => f.t < f.m);
  FX.shake *= 0.85;
  if (FX.shake < 0.4) FX.shake = 0;
}

function drawFx(c) {
  for (const p of FX.parts) {
    c.globalAlpha = Math.max(0, p.l / p.m);
    c.fillStyle = p.c;
    c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  c.globalAlpha = 1;
  for (const f of FX.flashes) {
    const k = f.t / f.m, r = f.sz * (0.5 + k), r2 = r * 0.45;
    c.globalAlpha = 1 - k;
    c.fillStyle = f.c;
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, rr = i % 2 ? r2 : r;
      c.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }
  c.globalAlpha = 1;
}
