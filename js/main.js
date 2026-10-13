'use strict';
/* ==========================================================
   MAIN: telas, entrada (teclado/toque), loop e modos Local/Online
   ========================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const cv = $('#cv'), ctx = cv.getContext('2d');
let BG = buildBg(1), CS = 1;      // CS = escala de resolução do canvas (nítido em telas retina)

let game = null, mode = null;          // mode: 'local' | 'host' | 'client'
let paused = false, endShown = false, curScreen = 'menu';
let ctrl = [];                          // local: índice do esquema de teclado de cada lutador
let lastLocalList = null;
let lobbyList = [], lobbyMe = 0, myCh = 0, frameN = 0;
const localCfg = [
  { type: 'human', ch: 0 }, { type: 'human', ch: 1 },
  { type: 'off', ch: 2 }, { type: 'off', ch: 3 }
];
const previewsLocal = [], previewsLobby = [];

/* ---------- utilidades de UI ---------- */
function show(id) {
  curScreen = id;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3000);
}
function showOverlay(title, sub, buttons) {
  $('#ovTitle').textContent = title;
  $('#ovSub').textContent = sub || '';
  const box = $('#ovBtns'); box.innerHTML = '';
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.onclick = b.fn;
    box.appendChild(el);
  });
  $('#overlay').classList.remove('hidden');
}
function hideOverlay() { $('#overlay').classList.add('hidden'); }
function statBars(ch) {
  const row = (n, v) => `<div class="stat"><span>${n}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`;
  return row('Velocidade', ch.spd / 1.3) + row('Força', ch.pow / 1.3) + row('Vida', ch.hp / 120);
}

/* ---------- menu ---------- */
$('#btnLocal').onclick = () => { audioInit(); renderLocal(); show('local'); };
$('#btnOnline').onclick = () => {
  audioInit();
  $('#onlineMsg').textContent = Net.available() ? '' : 'Não foi possível carregar a biblioteca online (PeerJS). Verifique sua internet.';
  $('#onlineMsg').className = 'msg' + (Net.available() ? '' : ' err');
  show('online');
};
$('#btnHow').onclick = () => $('#how').classList.toggle('hidden');
$('#howTable').innerHTML = KEYHELP.map((k, i) => `<tr><td style="color:${PCOL[i]}">Jogador ${i + 1}</td><td>${k}</td></tr>`).join('');

/* ---------- modo local ---------- */
function renderLocal() {
  previewsLocal.length = 0;
  const box = $('#slots');
  box.innerHTML = '';
  localCfg.forEach((c, i) => {
    const ch = CHARS[c.ch];
    const d = document.createElement('div');
    d.className = 'slot' + (c.type === 'off' ? ' off' : '');
    d.style.borderColor = c.type === 'off' ? '' : PCOL[i];
    d.innerHTML = `
      <div class="slot-h"><b style="color:${PCOL[i]}">P${i + 1}</b>
        <select data-i="${i}" aria-label="Tipo da vaga P${i + 1}">
          <option value="human"${c.type === 'human' ? ' selected' : ''}>Jogador</option>
          <option value="cpu"${c.type === 'cpu' ? ' selected' : ''}>CPU</option>
          <option value="off"${c.type === 'off' ? ' selected' : ''}>Desligado</option>
        </select></div>
      <canvas width="150" height="190" data-ch="${c.ch}"></canvas>
      <div class="pick"><button data-i="${i}" data-d="-1" aria-label="Anterior">◀</button><span>${ch.name}</span><button data-i="${i}" data-d="1" aria-label="Próximo">▶</button></div>
      <div class="role">${ch.title}</div>
      <div class="stats">${statBars(ch)}</div>
      <div class="keys">${c.type === 'human' ? KEYHELP[i] : c.type === 'cpu' ? 'Controlado pelo computador' : ''}</div>`;
    box.appendChild(d);
    previewsLocal.push({ cv: d.querySelector('canvas'), ch: c.ch });
  });
}
$('#slots').addEventListener('change', e => {
  if (e.target.tagName !== 'SELECT') return;
  localCfg[+e.target.dataset.i].type = e.target.value;
  renderLocal();
});
$('#slots').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]');
  if (!b) return;
  const c = localCfg[+b.dataset.i];
  c.ch = (c.ch + +b.dataset.d + CHARS.length) % CHARS.length;
  renderLocal();
});
$('#localBack').onclick = () => show('menu');
$('#localStart').onclick = () => {
  const act = localCfg.map((c, i) => ({ ...c, slot: i })).filter(c => c.type !== 'off');
  if (act.length < 2) { toast('Ligue pelo menos 2 vagas.'); return; }
  ctrl = act.map(c => c.slot);
  lastLocalList = act.map(c => ({ name: CHARS[c.ch].name, ch: c.ch, ai: c.type === 'cpu' }));
  newGame(lastLocalList, 'local');
};

/* ---------- modo online ---------- */
const savedName = (() => { try { return localStorage.getItem('luta_name') || ''; } catch (e) { return ''; } })();
$('#inName').value = savedName;
function myName() {
  const n = $('#inName').value.trim() || 'JOGADOR';
  try { localStorage.setItem('luta_name', n); } catch (e) { /* ignora */ }
  return n;
}
function onlineMsg(t, err) { const m = $('#onlineMsg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }
$('#onlineBack').onclick = () => { Net.leave(); show('menu'); };
$('#btnCreate').onclick = () => {
  if (!Net.available()) { onlineMsg('Biblioteca online não carregada.', true); return; }
  audioInit(); onlineMsg('Criando sala...');
  Net.createRoom(myName(), myCh);
};
$('#btnJoin').onclick = () => {
  if (!Net.available()) { onlineMsg('Biblioteca online não carregada.', true); return; }
  const code = $('#inCode').value.trim().toUpperCase();
  if (code.length !== 5) { onlineMsg('O código tem 5 caracteres.', true); return; }
  audioInit(); onlineMsg('Conectando...');
  Net.joinRoom(code, myName(), myCh);
};
$('#inCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

Net.on.created = code => { $('#roomCode').textContent = code; onlineMsg(''); show('lobby'); };
Net.on.lobby = (list, me) => {
  lobbyList = list; lobbyMe = me;
  $('#roomCode').textContent = Net.code;
  if (game && mode !== 'local') { game = null; mode = null; hideOverlay(); }
  if (curScreen !== 'lobby') show('lobby');
  renderLobby();
};
Net.on.error = msg => {
  if (curScreen === 'online') onlineMsg(msg, true);
  else { toast(msg); game = null; mode = null; show('online'); onlineMsg(msg, true); }
};
Net.on.closed = () => {
  game = null; mode = null; hideOverlay();
  toast('A conexão com a sala foi encerrada.');
  show('menu');
};
Net.on.drop = (idx, name) => {
  toast(name + ' saiu da partida.');
  if (!game) return;
  const f = game.fighters[idx];
  if (!f) return;
  f.left = true;
  if (f.hp > 0) { f.hp = 0; f.st = 'ko'; f.sf = 0; f.vy = -6; f.onGround = false; }
};
Net.on.input = (idx, m, a) => {
  if (mode !== 'host' || !game) return;
  const f = game.fighters[idx];
  if (!f || f.left) return;
  f.inp = { l: !!(m & 1), r: !!(m & 2), u: !!(m & 4), d: !!(m & 8) };
  if (a & 1) f.press('punch');
  if (a & 2) f.press('kick');
  if (a & 4) f.press('special');
};
Net.on.start = (list, me) => {
  lobbyMe = me;
  newGame(list.map(p => ({ name: p.name, ch: p.ch })), 'client');
};
Net.on.state = msg => { if (mode === 'client' && game) game.apply(msg); };

function buildLobbyGrid() {
  const g = $('#charGrid');
  g.innerHTML = '';
  CHARS.forEach((ch, i) => {
    const b = document.createElement('button');
    b.className = 'card'; b.dataset.i = i;
    b.innerHTML = `<canvas width="120" height="150"></canvas><b>${ch.name}</b><small>${ch.title}</small><div class="dots"></div>`;
    g.appendChild(b);
    previewsLobby.push({ cv: b.querySelector('canvas'), ch: i });
  });
}
$('#charGrid').addEventListener('click', e => {
  const b = e.target.closest('.card');
  if (!b) return;
  myCh = +b.dataset.i;
  if (Net.host) { Net.players[0].ch = myCh; Net.sendLobby(); }
  else { Net.sendPick(myCh); lobbyList[lobbyMe] && (lobbyList[lobbyMe].ch = myCh); renderLobby(); }
});
function renderLobby() {
  $('#plCount').textContent = lobbyList.length;
  $('#plList').innerHTML = lobbyList.map((p, i) =>
    `<li><span class="tag" style="background:${PCOL[i]}">P${i + 1}</span>
      <span class="who">${i === 0 ? '👑 ' : ''}${p.name}${i === lobbyMe ? ' (você)' : ''}</span>
      <span class="ch">${CHARS[p.ch].name}</span></li>`).join('');
  $$('#charGrid .card').forEach((card, i) => {
    const mine = lobbyList[lobbyMe] && lobbyList[lobbyMe].ch === i;
    card.classList.toggle('sel', !!mine);
    card.style.setProperty('--me', PCOL[lobbyMe] || '#f0c24b');
    card.querySelector('.dots').innerHTML = lobbyList.map((p, k) => p.ch === i ? `<i style="background:${PCOL[k]}">P${k + 1}</i>` : '').join('');
  });
  const start = $('#lobbyStart');
  start.classList.toggle('hidden', !Net.host);
  start.disabled = lobbyList.length < 2;
  $('#lobbyMsg').textContent = Net.host
    ? (lobbyList.length < 2 ? 'Aguardando pelo menos mais 1 jogador. Passe o código ou o link da sala.' : 'Quando todos escolherem, inicie a luta.')
    : 'Aguardando o anfitrião iniciar a luta...';
}
$('#lobbyLeave').onclick = () => { Net.leave(); show('online'); onlineMsg(''); };
$('#lobbyStart').onclick = () => {
  if (!Net.host || lobbyList.length < 2) return;
  const list = Net.startGame();
  newGame(list, 'host');
};
$('#btnCopy').onclick = () => {
  const url = location.origin + location.pathname + '?sala=' + Net.code;
  const msg = 'Entre na minha sala de luta! Código: ' + Net.code;
  if (navigator.share && location.protocol !== 'file:') { navigator.share({ title: 'Jogo de Luta 2D', text: msg, url }).catch(() => {}); return; }
  if (navigator.clipboard && location.protocol !== 'file:') navigator.clipboard.writeText(url).then(() => toast('Link copiado! Código: ' + Net.code), () => toast('Código da sala: ' + Net.code));
  else toast('Código da sala: ' + Net.code);
};

/* ---------- teclado e toque ---------- */
const keys = new Set();
const latch = SCHEMES.map(() => ({ p: false, k: false, s: false }));
const CODEMAP = {};
SCHEMES.forEach((s, si) => {
  for (const a of ['l', 'r', 'u', 'd', 'p', 'k', 's']) (CODEMAP[s[a]] = CODEMAP[s[a]] || []).push([si, a]);
});
const virt = { l: false, r: false, u: false, d: false };
const virtLatch = { p: false, k: false, s: false };

addEventListener('keydown', e => {
  if (e.code === 'Escape' && curScreen === 'game' && game) { e.preventDefault(); toggleMenu(); return; }
  if (curScreen !== 'game' || !game) return;
  const m = CODEMAP[e.code];
  if (!m) return;
  e.preventDefault();
  keys.add(e.code);
  if (!e.repeat) for (const [si, a] of m) if ('pks'.includes(a)) latch[si][a] = true;
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function getInput(list, withTouch) {
  const o = { l: 0, r: 0, u: 0, d: 0 }, a = { p: 0, k: 0, s: 0 };
  for (const si of list) {
    const S = SCHEMES[si];
    for (const d of 'lrud') if (keys.has(S[d])) o[d] = 1;
    for (const k of 'pks') if (latch[si][k]) { a[k] = 1; latch[si][k] = false; }
  }
  if (withTouch) {
    for (const d of 'lrud') if (virt[d]) o[d] = 1;
    for (const k of 'pks') if (virtLatch[k]) { a[k] = 1; virtLatch[k] = false; }
  }
  return { o, a };
}
function applyInput(f, inp) {
  f.inp = { l: !!inp.o.l, r: !!inp.o.r, u: !!inp.o.u, d: !!inp.o.d };
  if (inp.a.p) f.press('punch');
  if (inp.a.k) f.press('kick');
  if (inp.a.s) f.press('special');
}

/* direcional analógico: arraste o dedo; funciona com deslizes entre direções */
(() => {
  const pad = $('#pad'), knob = $('#knob');
  let pid = null;
  const setDir = (l, r, u, d) => { virt.l = l; virt.r = r; virt.u = u; virt.d = d; };
  const upd = e => {
    const r = pad.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    knob.style.transform = `translate(${dx * 55}%, ${dy * 55}%)`;
    setDir(dx < -0.28, dx > 0.28, dy < -0.45, dy > 0.45);
  };
  const end = e => {
    if (e && pid !== null && e.pointerId !== pid) return;
    pid = null; setDir(false, false, false, false); knob.style.transform = '';
  };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; try { pad.setPointerCapture(pid); } catch (x) { /* ignora */ } upd(e); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === pid) upd(e); });
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  pad.addEventListener('lostpointercapture', end);
})();
$$('#touch [data-a]').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); virtLatch[b.dataset.a] = true; b.classList.add('on'); if (navigator.vibrate) navigator.vibrate(12); });
  const off = () => b.classList.remove('on');
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
});
// controles na tela: ligados por padrão em aparelhos de toque (pode alternar no botão da partida)
let touchOn = matchMedia('(pointer: coarse)').matches || (('ontouchstart' in window) && !matchMedia('(hover: hover) and (pointer: fine)').matches);
function applyTouch() { $('#touch').classList.toggle('hidden', !touchOn); $('#btnTouch').style.opacity = touchOn ? 1 : .45; setTimeout(fit, 0); }
$('#btnTouch').onclick = () => { touchOn = !touchOn; applyTouch(); };
addEventListener('contextmenu', e => { if (curScreen === 'game') e.preventDefault(); });

/* tela cheia (não existe no iPhone; o botão some se não houver suporte) */
(() => {
  const el = document.documentElement, b = $('#btnFs');
  const can = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!can) { b.classList.add('hidden'); return; }
  b.onclick = () => {
    const on = document.fullscreenElement || document.webkitFullscreenElement;
    if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (x) { /* ignora */ }
      if (p && p.catch) p.catch(() => {});
    }
  };
})();

/* resolução do canvas acompanha o tamanho real na tela (nítido e leve) */
function fit() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let S = Math.round(Math.max(0.6, Math.min(2, r.width * dpr / W)) * 4) / 4;
  if (S !== CS) { CS = S; cv.width = Math.round(W * S); cv.height = Math.round(H * S); BG = buildBg(S); }
  HUD_K = Math.max(1, Math.min(1.7, 760 / r.width));
}
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 250));
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });

/* ---------- partida ---------- */
function newGame(list, m) {
  audioInit();
  game = new Game(list);
  mode = m; paused = false; endShown = false; frameN = 0;
  FX.parts.length = 0; FX.flashes.length = 0; FX.shake = 0;
  hideOverlay();
  show('game');
  applyTouch();
  fit();
  acc = 0;
  if (touchOn && matchMedia('(orientation: portrait)').matches && !newGame.warned) { newGame.warned = true; toast('Dica: gire o aparelho para a horizontal para uma tela maior.'); }
}

function toggleMenu() {
  if (!game || (mode === 'local' && game.phase === 'match')) return;
  if (!$('#overlay').classList.contains('hidden')) { closeMenu(); return; }
  if (game.phase === 'match') return;
  if (mode === 'local') paused = true;
  const btns = [{ label: 'Continuar', primary: true, fn: closeMenu }];
  if (mode === 'local') btns.push({ label: 'Reiniciar', fn: () => newGame(lastLocalList, 'local') });
  btns.push({ label: mode === 'local' ? 'Menu principal' : 'Sair da sala', fn: leaveGame });
  showOverlay(mode === 'local' ? 'Pausado' : 'Menu', mode === 'local' ? '' : 'A partida continua para os outros jogadores.', btns);
}
function closeMenu() { paused = false; hideOverlay(); }
function leaveGame() {
  const wasOnline = mode !== 'local';
  game = null; mode = null; paused = false; hideOverlay();
  if (wasOnline) Net.leave();
  show('menu');
}
$('#btnPause').onclick = toggleMenu;
$('#btnMute').onclick = () => { FX.muted = !FX.muted; $('#btnMute').style.opacity = FX.muted ? .4 : 1; };

function showEnd() {
  endShown = true;
  const w = game.fighters[game.matchWinner];
  const title = w ? w.name + ' venceu!' : 'Empate!';
  const sub = game.fighters.map(f => `${f.tag} ${f.name}: ${f.wins} round${f.wins === 1 ? '' : 's'}`).join('   |   ');
  const btns = [];
  if (mode === 'local') {
    btns.push({ label: 'Jogar de novo', primary: true, fn: () => newGame(lastLocalList, 'local') });
    btns.push({ label: 'Menu principal', fn: leaveGame });
  } else if (mode === 'host') {
    btns.push({ label: 'Voltar à sala', primary: true, fn: () => { game = null; mode = null; hideOverlay(); Net.backToLobby(); show('lobby'); } });
    btns.push({ label: 'Sair', fn: leaveGame });
  } else {
    btns.push({ label: 'Sair da sala', fn: leaveGame });
    setTimeout(() => { if ($('#ovSub') && game) $('#ovSub').textContent = sub + '  (aguardando o anfitrião)'; }, 0);
  }
  showOverlay(title, sub, btns);
}

/* ---------- loop ---------- */
let last = performance.now(), acc = 0, lastSent = 0, lastM = -1;

function clientInput() {
  const { o, a } = getInput([0, 1], true);
  const m = (o.l ? 1 : 0) | (o.r ? 2 : 0) | (o.u ? 4 : 0) | (o.d ? 8 : 0);
  const ab = (a.p ? 1 : 0) | (a.k ? 2 : 0) | (a.s ? 4 : 0);
  const now = performance.now();
  if (m !== lastM || ab || now - lastSent > 120) { Net.sendInput(m, ab); lastM = m; lastSent = now; }
}

function pollLocal() {
  if (mode === 'local') {
    let touchUsed = false;
    game.fighters.forEach((f, i) => {
      if (f.ai) return;
      const useTouch = !touchUsed; touchUsed = true;
      applyInput(f, getInput([ctrl[i] != null ? ctrl[i] : i], useTouch));
    });
  } else if (mode === 'host') {
    applyInput(game.fighters[0], getInput([0, 1], true));
  }
}

function stepOnce() {
  if (mode === 'client') {
    clientInput();
    game.clientStep();
  } else {
    if (paused) return;
    pollLocal();
    game.update();
    if (mode === 'host') {
      frameN++;
      if (frameN % 2 === 0) {
        const snap = game.snapshot();
        if (Net.players.length > 1) Net.broadcast(snap);
      }
    } else game.netEvents.length = 0;
  }
  for (const e of game.events) fxEvent(e);
  game.events.length = 0;
  fxStep();
  if (game.phase === 'match' && !endShown && game.phT > 40) showEnd();
}

function drawPreview(c, w, h, chIdx, t) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath(); c.ellipse(w / 2 - 4, h - 12, 34, 7, 0, 0, 7); c.fill();
  drawFighter(c, { ch: CHARS[chIdx], st: 'idle', sf: t / 16, face: 1, vx: 0, i: 0 }, w / 2 - 6, h - 16, Math.min(h / 205, 1));
}
function previewTick(t) {
  const list = curScreen === 'local' ? previewsLocal : curScreen === 'lobby' ? previewsLobby : [];
  for (const p of list) drawPreview(p.cv.getContext('2d'), p.cv.width, p.cv.height, p.ch, t);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(100, now - last); last = now;
  if (game && curScreen === 'game') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { acc -= STEP; n++; stepOnce(); if (!game) break; }
    if (game) { ctx.setTransform(CS, 0, 0, CS, 0, 0); renderGame(ctx, game, BG); }
  } else previewTick(now);
}

buildLobbyGrid();
renderLocal();
requestAnimationFrame(loop);

// entrada por link: ?sala=CODIGO
(() => {
  const code = new URLSearchParams(location.search).get('sala');
  if (code) {
    $('#inCode').value = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    show('online');
    onlineMsg('Digite seu apelido e toque em Entrar.');
  }
})();
