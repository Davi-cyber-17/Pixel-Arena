'use strict';
/* ==========================================================
   RENDER: lutadores desenhados por esqueleto (sem imagens),
   cenário em templo, HUD no estilo arcade e banners.
   ========================================================== */
const D2R = Math.PI / 180;
const OUT = '#17120f';
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ângulos em graus a partir da vertical (positivo = para frente) */
const POSES = {
  idle:   { lean: 6,   hd: 0,   fa: [55, 75],  ba: [38, 95],  fl: [28, 22], bl: [-24, 30] },
  block:  { lean: 10,  hd: 6,   fa: [78, 125], ba: [66, 128], fl: [44, 64], bl: [-28, 52] },
  hit:    { lean: -16, hd: -14, fa: [-20, 35], ba: [-35, 45], fl: [8, 26],  bl: [-14, 30] },
  jumpUp: { lean: 4,   hd: 0,   fa: [85, 100], ba: [60, 100], fl: [55, 75], bl: [-8, 70] },
  jumpDn: { lean: 6,   hd: 0,   fa: [70, 90],  ba: [50, 95],  fl: [28, 32], bl: [-18, 28] },
  win:    { lean: -6,  hd: -8,  fa: [165, 15], ba: [30, 95],  fl: [18, 16], bl: [-18, 20] },
  pWind:  { lean: -2,  hd: 0,   fa: [30, 115], ba: [40, 100], fl: [30, 26], bl: [-28, 34] },
  pHit:   { lean: 20,  hd: 2,   fa: [92, 4],   ba: [45, 100], fl: [40, 35], bl: [-34, 22] },
  kWind:  { lean: -4,  hd: 0,   fa: [40, 95],  ba: [20, 100], fl: [80, 105], bl: [-6, 14] },
  kHit:   { lean: -14, hd: -2,  fa: [28, 100], ba: [-15, 85], fl: [93, 2],  bl: [-4, 10] },
  sWind:  { lean: 10,  hd: 4,   fa: [-25, 105], ba: [-30, 110], fl: [46, 70], bl: [-36, 70] },
  sHit:   { lean: 20,  hd: 2,   fa: [90, 2],   ba: [86, 4],   fl: [48, 60], bl: [-36, 50] }
};

function mixPose(A, B, t) {
  return {
    lean: lerp(A.lean, B.lean, t), hd: lerp(A.hd, B.hd, t),
    fa: [lerp(A.fa[0], B.fa[0], t), lerp(A.fa[1], B.fa[1], t)],
    ba: [lerp(A.ba[0], B.ba[0], t), lerp(A.ba[1], B.ba[1], t)],
    fl: [lerp(A.fl[0], B.fl[0], t), lerp(A.fl[1], B.fl[1], t)],
    bl: [lerp(A.bl[0], B.bl[0], t), lerp(A.bl[1], B.bl[1], t)]
  };
}

function attackPose(st, sf) {
  const a = ATK[st];
  const [w, h] = st === 'punch' ? [POSES.pWind, POSES.pHit] : st === 'kick' ? [POSES.kWind, POSES.kHit] : [POSES.sWind, POSES.sHit];
  if (sf < a.su) return mixPose(POSES.idle, w, sf / a.su);
  if (sf < a.su + a.ac) return h;
  return mixPose(h, POSES.idle, clamp((sf - a.su - a.ac) / a.rc, 0, 1));
}

function poseFor(f) {
  const sf = f.sf;
  switch (f.st) {
    case 'walk': {
      const dm = (f.vx * f.face) < -0.1 ? -1 : 1;
      const ph = sf * 0.24 * dm, s = Math.sin(ph), c = Math.cos(ph);
      return { lean: 7, hd: 0, fa: [55, 75], ba: [38, 95],
        fl: [12 + 32 * s, 16 + 24 * Math.max(0, c)], bl: [-12 - 32 * s, 16 + 24 * Math.max(0, -c)] };
    }
    case 'jump': return mixPose(POSES.jumpUp, POSES.jumpDn, clamp((sf - 8) / 12, 0, 1));
    case 'block': return POSES.block;
    case 'hit': case 'ko': return POSES.hit;
    case 'win': return mixPose(POSES.idle, POSES.win, Math.min(1, sf / 10));
    case 'punch': case 'kick': case 'special': return attackPose(f.st, sf);
  }
  const b = Math.sin(sf * 0.09);
  return { lean: 6 + b * 1.2, hd: 0, fa: [55 + b * 3, 75 - b * 3], ba: [38 + b * 2, 95],
    fl: [28, 22 + b * 2], bl: [-24, 30 - b * 2] };
}

function limb(c, x0, y0, x1, y1, w, col) {
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
  c.strokeStyle = OUT; c.lineWidth = w + 4; c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.stroke();
}

function hairCap(c, x, y, r, cut, col) {
  const rr = r + 1.5, a = Math.asin(cut / rr);
  c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, rr, Math.PI + a, 2 * Math.PI - a); c.closePath(); c.fill(); c.stroke();
}

function spikes(c, x, y, k, list, col) {
  c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 2; c.lineJoin = 'round';
  for (const s of list) {
    c.beginPath();
    c.moveTo(x + s[0] * k, y + s[1] * k); c.lineTo(x + s[2] * k, y + s[3] * k); c.lineTo(x + s[4] * k, y + s[5] * k);
    c.closePath(); c.fill(); c.stroke();
  }
}

function drawHead(c, ch, x, y, r, expr) {
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  const k = r / 17;
  // cabelo / faixas que ficam atrás
  if (ch.hs === 'pony') {
    c.beginPath(); c.moveTo(x - r + 3, y - 8); c.quadraticCurveTo(x - r - 16 * k, y - 6, x - r - 18 * k, y + 12 * k);
    c.strokeStyle = OUT; c.lineWidth = 11 * k; c.stroke(); c.strokeStyle = ch.hair; c.lineWidth = 7 * k; c.stroke();
  }
  if (ch.hs === 'band' || ch.hs === 'ninja') {
    limb(c, x - r + 2, y - 8 * k, x - r - 15 * k, y - 2 * k, 5 * k, ch.band);
    limb(c, x - r + 2, y - 8 * k, x - r - 12 * k, y + 8 * k, 5 * k, ch.band);
  }
  // rosto
  c.fillStyle = ch.hs === 'ninja' ? ch.gi : ch.skin;
  c.strokeStyle = OUT; c.lineWidth = 2.5;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
  // cabelo / acessórios da frente
  switch (ch.hs) {
    case 'spiky':
      hairCap(c, x, y, r, 6 * k, ch.hair);
      spikes(c, x, y, k, [[-14, -8, -22, -22, -6, -16], [-8, -14, -6, -32, 2, -16], [0, -15, 8, -32, 12, -12], [8, -12, 22, -24, 16, -6]], ch.hair);
      break;
    case 'band':
      hairCap(c, x, y, r, 8 * k, ch.hair);
      limb(c, x - r + 1, y - 8 * k, x + r - 1, y - 8 * k, 6 * k, ch.band);
      break;
    case 'pony':
      hairCap(c, x, y, r, 8 * k, ch.hair);
      break;
    case 'bald':
      c.fillStyle = ch.beard; c.beginPath(); c.ellipse(x + 3 * k, y + 9 * k, 11 * k, 7 * k, 0, 0, Math.PI * 2); c.fill();
      break;
    case 'ninja':
      c.fillStyle = ch.skin; c.fillRect(x - 1, y - 7 * k, 14 * k, 7 * k);
      limb(c, x - r + 1, y - 10 * k, x + r - 2, y - 10 * k, 5 * k, ch.band);
      break;
    case 'mohawk':
      spikes(c, x, y, k, [[-10, -12, -9, -26, -3, -16], [-4, -15, 0, -30, 5, -15], [3, -15, 9, -27, 11, -11]], ch.hair);
      break;
  }
  // olhos
  if (ch.hs !== 'ninja') {
    c.strokeStyle = OUT; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(x + 2 * k, y - 8 * k); c.lineTo(x + 12 * k, y - 5 * k); c.stroke();
  }
  const ex = x + 7 * k, ey = y - 2 * k;
  if (expr === 'hurt') {
    c.strokeStyle = OUT; c.lineWidth = 2;
    c.beginPath(); c.moveTo(ex - 3, ey - 3); c.lineTo(ex + 3, ey); c.lineTo(ex - 3, ey + 3); c.stroke();
  } else {
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, 3.4 * k, 3 * k, 0, 0, 7); c.fill();
    c.fillStyle = OUT; c.beginPath(); c.arc(ex + 1.2 * k, ey, 1.7 * k, 0, 7); c.fill();
  }
  if (expr === 'yell') {
    c.fillStyle = '#3a0d0d'; c.beginPath(); c.ellipse(x + 8 * k, y + 8 * k, 3.5 * k, 4.5 * k, 0, 0, 7); c.fill();
  }
  c.restore();
}

function drawShadow(c, f) {
  const lift = clamp(-f.y / 260, 0, 0.6), s = f.ch.scale;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.ellipse(f.x, GROUND + 4, 40 * s * (1 - lift), 9 * (1 - lift * 0.5), 0, 0, Math.PI * 2); c.fill();
}

/* desenha um lutador com os pés em (gx, gy). k = escala extra (para previews) */
function drawFighter(c, f, gx, gy, k) {
  k = k || 1;
  const ch = f.ch, s = ch.scale * k;
  const P = poseFor(f);
  const T = 54, TH = 40, SH = 38, UA = 27, FAL = 26;
  const R = a => a * D2R;
  const leg = (a, b) => {
    const kx = Math.sin(R(a)) * TH, ky = Math.cos(R(a)) * TH, an = R(a - b);
    return { kx, ky, ax: kx + Math.sin(an) * SH, ay: ky + Math.cos(an) * SH, an };
  };
  const FL = leg(P.fl[0], P.fl[1]), BL = leg(P.bl[0], P.bl[1]);
  const hx = 0, hy = -Math.max(FL.ay, BL.ay) - 6;
  const L = R(P.lean);
  const sx = hx + Math.sin(L) * T, sy = hy - Math.cos(L) * T;
  const hd = R(P.lean + P.hd);
  const headx = sx + Math.sin(hd) * 22, heady = sy - Math.cos(hd) * 22;
  const arm = (a, e) => {
    const ex = sx + Math.sin(R(a)) * UA, ey = sy + 2 + Math.cos(R(a)) * UA, fa = R(a + e);
    return { ex, ey, wx: ex + Math.sin(fa) * FAL, wy: ey + Math.cos(fa) * FAL };
  };
  const FA = arm(P.fa[0], P.fa[1]), BA = arm(P.ba[0], P.ba[1]);

  c.save();
  c.translate(gx, gy);
  c.scale(f.face * s, s);
  if (f.st === 'ko') c.rotate(-Math.min(1, f.sf / 14) * 88 * D2R);

  const drawLeg = Lg => {
    limb(c, hx, hy, hx + Lg.kx, hy + Lg.ky, 19, ch.pants);
    limb(c, hx + Lg.kx, hy + Lg.ky, hx + Lg.ax, hy + Lg.ay, 16, ch.shin);
    const fx = hx + Lg.ax, fy = hy + Lg.ay;
    limb(c, fx, fy, fx + Math.cos(Lg.an) * 13, fy - Math.sin(Lg.an) * 13 + 1, 10, ch.shoe);
  };
  const drawArm = A => {
    limb(c, sx, sy + 2, A.ex, A.ey, 13, ch.upper);
    limb(c, A.ex, A.ey, A.wx, A.wy, 11, ch.fore);
    c.fillStyle = ch.fist; c.strokeStyle = OUT; c.lineWidth = 2;
    c.beginPath(); c.arc(A.wx, A.wy, ch.gloveR || 7, 0, 7); c.fill(); c.stroke();
  };

  drawArm(BA);
  drawLeg(BL);
  limb(c, hx, hy, sx, sy, 30, ch.gi);
  limb(c, hx, hy, hx + (sx - hx) * 0.16, hy + (sy - hy) * 0.16, 31, ch.belt);
  const expr = f.st === 'hit' || f.st === 'ko' ? 'hurt' : (f.st === 'punch' || f.st === 'kick' || f.st === 'special') ? 'yell' : 'normal';
  drawHead(c, ch, headx, heady, 17, expr);
  drawLeg(FL);
  drawArm(FA);

  // energia se formando nas mãos durante o especial
  if (f.st === 'special' && f.sf < ATK.special.su + 3) {
    const t = Math.min(1, f.sf / ATK.special.su), r = 6 + 20 * t;
    const g = c.createRadialGradient(FA.wx, FA.wy, 1, FA.wx, FA.wy, r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, ch.proj.col2); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = g;
    c.beginPath(); c.arc(FA.wx, FA.wy, r, 0, 7); c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();

  // etiqueta P1/P2/CPU acima da cabeça
  if (f.tag && f.st !== 'ko') {
    const tx = gx, ty = gy - 176 * s - 14;
    c.font = 'bold 12px Arial, sans-serif';
    const tw = c.measureText(f.tag).width + 12;
    c.fillStyle = PCOL[f.i];
    c.fillRect(tx - tw / 2, ty - 9, tw, 16);
    c.beginPath(); c.moveTo(tx - 4, ty + 7); c.lineTo(tx + 4, ty + 7); c.lineTo(tx, ty + 12); c.fill();
    c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(f.tag, tx, ty - 1);
  }
}

function drawProj(c, p, ch) {
  const col = ch.proj.col, col2 = ch.proj.col2, r = ch.proj.r, dir = Math.sign(p.vx) || 1;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let k = 1; k <= 5; k++) {
    c.globalAlpha = 0.5 / k; c.fillStyle = col;
    c.beginPath(); c.ellipse(p.x - dir * k * 11, p.y, r * (1 - k * 0.1) * 1.3, r * (1 - k * 0.12) * 0.8, 0, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  const g = c.createRadialGradient(p.x, p.y, 1, p.x, p.y, r * 1.8);
  g.addColorStop(0, '#fff'); g.addColorStop(0.35, col2); g.addColorStop(0.7, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath(); c.arc(p.x, p.y, r * 1.8, 0, 7); c.fill();
  c.restore();
}

/* ---------- cenário ciberpunk (pré-renderizado; S = escala de nitidez) ---------- */
let HUD_K = 1;                       // escala do HUD (maior em telas pequenas)
const HUD_FONT = '"Orbitron", "Arial Black", Impact, sans-serif';

function buildBg(S) {
  S = S || 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * S); cv.height = Math.round(H * S);
  const c = cv.getContext('2d');
  c.scale(S, S);
  // céu
  let g = c.createLinearGradient(0, 0, 0, 420);
  g.addColorStop(0, '#05030f'); g.addColorStop(0.55, '#1a0b3a'); g.addColorStop(1, '#5a1457');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // estrelas
  for (let i = 0; i < 70; i++) {
    c.fillStyle = 'rgba(255,255,255,' + (0.25 + (i % 5) * 0.12) + ')';
    c.fillRect((i * 97) % W, (i * 53) % 230, 1.5, 1.5);
  }
  // sol neon listrado
  const sx = 480, sy = 250, sr = 120;
  g = c.createLinearGradient(0, sy - sr, 0, sy + sr);
  g.addColorStop(0, '#ffe66b'); g.addColorStop(0.5, '#ff4fa3'); g.addColorStop(1, '#7a2cff');
  c.save(); c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.clip();
  c.fillStyle = g; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  c.fillStyle = '#1a0b3a';
  for (let k = 0; k < 7; k++) { const y = sy + 10 + k * 18; c.fillRect(sx - sr, y, sr * 2, 2 + k * 1.6); }
  c.restore();
  g = c.createRadialGradient(sx, sy, sr, sx, sy, sr * 2.2);
  g.addColorStop(0, 'rgba(255,79,163,.35)'); g.addColorStop(1, 'rgba(255,79,163,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, 440);
  // skyline distante
  const bld = (x, w, h, col, win) => {
    c.fillStyle = col; c.fillRect(x, 446 - h, w, h);
    if (win) {
      for (let yy = 446 - h + 8; yy < 436; yy += 12) for (let xx = x + 5; xx < x + w - 6; xx += 10) {
        if (((xx * 7 + yy * 13) % 5) < 2) { c.fillStyle = (xx + yy) % 3 ? 'rgba(25,230,255,.75)' : 'rgba(255,47,208,.75)'; c.fillRect(xx, yy, 4, 5); }
      }
    }
  };
  let x = -10, i = 0;
  while (x < W) { const w = 38 + (i * 23) % 50, h = 110 + (i * 61) % 170; bld(x, w, h, '#120a2a', true); x += w + 3; i++; }
  x = -20; i = 3;
  while (x < W) { const w = 50 + (i * 31) % 60, h = 60 + (i * 41) % 110; bld(x, w, h, '#0a0620', false); x += w + 8; i++; }
  // antenas / letreiros neon
  const sign = (x0, y0, w, h, col, txt) => {
    c.save(); c.shadowColor = col; c.shadowBlur = 18;
    c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(x0, y0, w, h);
    c.fillStyle = col; c.font = '700 ' + Math.round(h * 0.55) + 'px ' + HUD_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(txt, x0 + w / 2, y0 + h / 2 + 1);
    c.restore();
  };
  sign(70, 190, 130, 34, '#19e6ff', 'FIGHT');
  sign(740, 170, 150, 38, '#ff2fd0', 'ARENA 2D');
  sign(560, 230, 90, 26, '#b6ff3b', 'KO');
  // plataforma da arena
  g = c.createLinearGradient(0, 430, 0, 470);
  g.addColorStop(0, '#1b1840'); g.addColorStop(1, '#0a0820');
  c.fillStyle = g; c.fillRect(0, 430, W, 40);
  c.fillStyle = '#19e6ff'; c.shadowColor = '#19e6ff'; c.shadowBlur = 14; c.fillRect(0, 428, W, 3); c.shadowBlur = 0;
  // pilares de luz holográficos
  [60, 260, 480, 700, 900].forEach((px, k) => {
    const col = k % 2 ? '255,47,208' : '25,230,255';
    const lg = c.createLinearGradient(px - 24, 0, px + 24, 0);
    lg.addColorStop(0, 'rgba(' + col + ',0)'); lg.addColorStop(0.5, 'rgba(' + col + ',.22)'); lg.addColorStop(1, 'rgba(' + col + ',0)');
    c.fillStyle = lg; c.fillRect(px - 24, 90, 48, 340);
    c.fillStyle = 'rgba(' + col + ',.9)'; c.fillRect(px - 2, 90, 4, 340);
  });
  // chão com grade em perspectiva
  g = c.createLinearGradient(0, 446, 0, H);
  g.addColorStop(0, '#120c2e'); g.addColorStop(1, '#05030f');
  c.fillStyle = g; c.fillRect(0, 446, W, H - 446);
  c.save(); c.shadowColor = '#19e6ff'; c.shadowBlur = 8;
  c.strokeStyle = 'rgba(25,230,255,.55)'; c.lineWidth = 1.5;
  for (let k = -14; k <= 14; k++) { c.beginPath(); c.moveTo(480 + k * 36, 446); c.lineTo(480 + k * 120, H); c.stroke(); }
  c.strokeStyle = 'rgba(255,47,208,.5)';
  for (let k = 0; k < 7; k++) { const y = 446 + k * k * 2.1 + k * 3; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.restore();
  // linhas de cena no chão
  c.strokeStyle = 'rgba(182,255,59,.55)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(60, 506); c.lineTo(W - 60, 506); c.stroke();
  // neblina e vinheta
  g = c.createLinearGradient(0, 380, 0, 470);
  g.addColorStop(0, 'rgba(90,20,87,0)'); g.addColorStop(1, 'rgba(90,20,87,.35)');
  c.fillStyle = g; c.fillRect(0, 380, W, 90);
  g = c.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 640);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  return cv;
}

/* ---------- HUD tecnológico ---------- */
function cut(c, x, y, w, h, k, dir) {          // retângulo com cantos chanfrados
  c.beginPath();
  if (dir > 0) { c.moveTo(x + k, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x, y + h); c.lineTo(x, y + k); }
  else { c.moveTo(x, y); c.lineTo(x + w - k, y); c.lineTo(x + w, y + k); c.lineTo(x + w, y + h); c.lineTo(x + k, y + h); c.lineTo(x, y + h - k); }
  c.closePath();
}

function drawHUD(c, g) {
  const k = HUD_K, Wk = W / k;
  c.save();
  c.scale(k, k);
  const PW = Math.min(366, (Wk - 96) / 2 - 8);
  g.fighters.forEach((f, i) => {
    const side = i % 2, row = i >> 1;
    const px = side === 0 ? 10 : Wk - 10 - PW, py = 8 + row * 54;
    const col = PCOL[i];
    // retrato
    const pxp = side === 0 ? px : px + PW - 46;
    c.fillStyle = 'rgba(4,8,20,.85)'; cut(c, pxp, py, 46, 46, 9, side === 0 ? 1 : -1); c.fill();
    c.save(); c.shadowColor = col; c.shadowBlur = 10; c.strokeStyle = col; c.lineWidth = 2.5; cut(c, pxp, py, 46, 46, 9, side === 0 ? 1 : -1); c.stroke(); c.restore();
    c.save();
    cut(c, pxp + 2, py + 2, 42, 42, 8, side === 0 ? 1 : -1); c.clip();
    c.translate(pxp + 23, py + 28); c.scale(side === 0 ? 1.3 : -1.3, 1.3);
    drawHead(c, f.ch, 0, 0, 17, f.hp <= 0 ? 'hurt' : 'normal');
    c.restore();
    // barra
    const bx = side === 0 ? px + 54 : px, bw = PW - 54, by = py + 22, bh = 16, dir = side === 0 ? 1 : -1;
    c.fillStyle = 'rgba(4,8,20,.88)'; cut(c, bx, by, bw, bh, 6, dir); c.fill();
    const rShown = clamp(f.shown / f.maxHp, 0, 1), rHp = clamp(f.hp / f.maxHp, 0, 1);
    const fr = r => side === 0 ? [bx + bw - bw * r, by, bw * r, bh] : [bx, by, bw * r, bh];
    c.save(); cut(c, bx, by, bw, bh, 6, dir); c.clip();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(...fr(rShown));
    const low = rHp < 0.3;
    const gr = c.createLinearGradient(side === 0 ? bx : bx + bw, 0, side === 0 ? bx + bw : bx, 0);
    if (low) { gr.addColorStop(0, '#ff2d55'); gr.addColorStop(1, '#ff8a3d'); }
    else { gr.addColorStop(0, '#19e6ff'); gr.addColorStop(0.6, '#4dffb0'); gr.addColorStop(1, '#b6ff3b'); }
    c.fillStyle = gr; c.fillRect(...fr(rHp));
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(bx, by, bw, bh * 0.35);
    c.fillStyle = 'rgba(4,8,20,.55)';                       // divisões de segmentos
    for (let sgm = 1; sgm < 20; sgm++) c.fillRect(bx + (bw / 20) * sgm - 0.75, by, 1.5, bh);
    c.restore();
    c.save(); c.shadowColor = col; c.shadowBlur = 8; c.strokeStyle = col; c.lineWidth = 2; cut(c, bx, by, bw, bh, 6, dir); c.stroke(); c.restore();
    // nome e pontuação
    c.lineJoin = 'round'; c.textBaseline = 'alphabetic';
    c.font = '800 15px ' + HUD_FONT;
    c.textAlign = side === 0 ? 'left' : 'right';
    c.lineWidth = 4; c.strokeStyle = '#000'; c.fillStyle = '#fff';
    const nx = side === 0 ? bx + 2 : bx + bw - 2;
    c.strokeText(f.name, nx, by - 4); c.fillText(f.name, nx, by - 4);
    c.font = '700 15px "Share Tech Mono", "Courier New", monospace';
    c.textAlign = side === 0 ? 'right' : 'left';
    const sx = side === 0 ? bx + bw - 2 : bx + 2, sc = String(Math.min(9999999, f.score)).padStart(7, '0');
    c.strokeText(sc, sx, by - 4); c.fillStyle = '#7df3ff'; c.fillText(sc, sx, by - 4);
    // rounds vencidos (losangos)
    for (let n = 0; n < ROUNDS_TO_WIN; n++) {
      const cx = side === 0 ? bx + bw - 10 - n * 18 : bx + 10 + n * 18, cy = by + bh + 11;
      c.beginPath(); c.moveTo(cx, cy - 6); c.lineTo(cx + 6, cy); c.lineTo(cx, cy + 6); c.lineTo(cx - 6, cy); c.closePath();
      c.fillStyle = f.wins > n ? '#ffd23f' : 'rgba(4,8,20,.9)'; c.fill();
      c.strokeStyle = f.wins > n ? '#fff2a8' : col; c.lineWidth = 1.5; c.stroke();
    }
    if (f.left) { c.fillStyle = '#fff'; c.font = '700 11px Arial'; c.textAlign = 'center'; c.fillText('SAIU', bx + bw / 2, by + 12); }
  });

  // cronômetro hexagonal
  const cx = Wk / 2, cy = 36, Rr = 31, secs = Math.ceil(g.time / 60);
  const hex = (r) => { c.beginPath(); for (let n = 0; n < 6; n++) { const a = n * Math.PI / 3 + Math.PI / 6; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); };
  hex(Rr); c.fillStyle = 'rgba(4,8,20,.92)'; c.fill();
  const low = secs <= 10 && g.phase === 'fight';
  const tcol = low ? '#ff2d55' : '#19e6ff';
  c.save(); c.shadowColor = tcol; c.shadowBlur = 14; c.strokeStyle = tcol; c.lineWidth = 3; hex(Rr); c.stroke(); c.restore();
  c.strokeStyle = 'rgba(25,230,255,.35)'; c.lineWidth = 1; hex(Rr - 6); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '900 28px ' + HUD_FONT;
  c.fillStyle = low && (g.phT % 30 < 15) ? '#ff6b86' : '#fff';
  c.fillText(String(secs), cx, cy + 2);
  c.restore();
}

function drawBanner(c, g) {
  let text = '', sub = '', t = g.phT;
  if (g.phase === 'intro') { if (t < 62) text = 'ROUND ' + g.round; else { text = 'FIGHT!'; t -= 62; } }
  else if (g.phase === 'fight' && g.phT < 30) text = 'FIGHT!';
  else if (g.phase === 'roundend') {
    text = g.endReason === 'TIME' ? 'TEMPO!' : 'K.O.';
    const w = g.fighters[g.roundWinner];
    sub = w ? w.name + ' VENCEU O ROUND' : 'EMPATE';
  } else if (g.phase === 'match') {
    const w = g.fighters[g.matchWinner];
    text = w ? 'VITÓRIA!' : 'EMPATE';
    sub = w ? w.name : '';
  }
  if (!text) return;
  const k = clamp(t / 10, 0, 1), sc = 1 + (1 - k) * 1.2 + Math.sin(k * Math.PI) * 0.08;
  c.save();
  c.translate(W / 2, 260); c.scale(sc, sc);
  c.globalAlpha = k;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.font = '900 80px ' + HUD_FONT;
  // efeito "glitch" ciano/magenta
  c.fillStyle = 'rgba(255,47,208,.85)'; c.fillText(text, -4, 2);
  c.fillStyle = 'rgba(25,230,255,.85)'; c.fillText(text, 4, -2);
  c.lineWidth = 8; c.strokeStyle = '#04060d'; c.strokeText(text, 0, 0);
  c.fillStyle = '#fff'; c.fillText(text, 0, 0);
  if (sub) {
    c.font = '800 24px ' + HUD_FONT;
    c.lineWidth = 6; c.strokeStyle = '#000'; c.strokeText(sub, 0, 62);
    c.fillStyle = '#7df3ff'; c.fillText(sub, 0, 62);
  }
  c.restore();
}

/* ---------- frame completo ---------- */
function renderGame(c, g, bg) {
  c.save();
  if (FX.shake > 0) c.translate((Math.random() - 0.5) * FX.shake, (Math.random() - 0.5) * FX.shake);
  c.drawImage(bg, 0, 0, W, H);
  for (const f of g.fighters) drawShadow(c, f);
  const order = g.fighters.slice().sort((a, b) => (a.st === 'ko' ? 0 : 1) - (b.st === 'ko' ? 0 : 1));
  for (const f of order) drawFighter(c, f, f.x, GROUND + f.y);
  for (const p of g.projs) drawProj(c, p, g.fighters[p.o].ch);
  drawFx(c);
  c.restore();
  drawHUD(c, g);
  drawBanner(c, g);
}
