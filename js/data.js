'use strict';
/* ==========================================================
   DADOS DO JOGO: constantes, ataques e personagens
   ========================================================== */
const W = 960, H = 540, GROUND = 488;
const ROUND_TIME = 60;        // segundos por round
const ROUNDS_TO_WIN = 2;      // melhor de 3
const MAX_ROUNDS = 5;
const GRAV = 0.85, SPEED = 3.4, JUMP_V = 16, STEP = 1000 / 60;
const PCOL = ['#ff3d6e', '#29d3ff', '#4dff9a', '#ffd23f'];   // cor de cada jogador
const ST = ['idle', 'walk', 'jump', 'block', 'punch', 'kick', 'special', 'hit', 'ko', 'win'];

// su = startup, ac = frames ativos, rc = recuperação (60 frames = 1s)
const ATK = {
  punch:   { su: 5,  ac: 4, rc: 11, reach: 58, dmg: 6,  hs: 15, kb: 4, y1: 135, y2: 88 },
  kick:    { su: 9,  ac: 5, rc: 17, reach: 82, dmg: 11, hs: 22, kb: 8, y1: 125, y2: 30 },
  special: { su: 16, ac: 2, rc: 28 }
};

const CHARS = [
  { id: 'mike', name: 'MIKE', title: 'Punho de Fogo',
    skin: '#e6b087', hair: '#241610', hs: 'band', band: '#d62828',
    gi: '#f4f4f4', upper: '#f4f4f4', fore: '#e6b087', fist: '#e6b087',
    pants: '#f4f4f4', shin: '#f4f4f4', belt: '#c81e1e', shoe: '#b3202a',
    spd: 1, pow: 1, hp: 100, jump: 1, reach: 1, scale: 1,
    proj: { col: '#ff6a2b', col2: '#ffe08a', r: 17, v: 9, dmg: 1 } },

  { id: 'lee', name: 'LEE', title: 'Mestre do Trovão',
    skin: '#f0c8a0', hair: '#12151c', hs: 'spiky',
    gi: '#fbfbfb', upper: '#fbfbfb', fore: '#f0c8a0', fist: '#f0c8a0',
    pants: '#fbfbfb', shin: '#fbfbfb', belt: '#2a4fd0', shoe: '#1c1c24',
    spd: 1.1, pow: 0.95, hp: 96, jump: 1.05, reach: 1, scale: 1,
    proj: { col: '#47a8ff', col2: '#e8f6ff', r: 16, v: 10, dmg: 1 } },

  { id: 'kira', name: 'KIRA', title: 'Chute Relâmpago',
    skin: '#eebf9d', hair: '#7a2cc9', hs: 'pony',
    gi: '#8e3be0', upper: '#8e3be0', fore: '#eebf9d', fist: '#ffd34d',
    pants: '#2d1b4d', shin: '#2d1b4d', belt: '#ffd34d', shoe: '#ffd34d',
    spd: 1.2, pow: 0.85, hp: 90, jump: 1.12, reach: 1.1, scale: 0.96,
    proj: { col: '#c25bff', col2: '#f5dcff', r: 14, v: 11, dmg: 1 } },

  { id: 'bruno', name: 'BRUNO', title: 'Muralha de Aço',
    skin: '#b97a50', hair: '#2b1a10', hs: 'bald', beard: '#2b1a10',
    gi: '#2f8f3f', upper: '#b97a50', fore: '#b97a50', fist: '#a31d1d', gloveR: 9,
    pants: '#4a3a2a', shin: '#4a3a2a', belt: '#1b1b1b', shoe: '#2a2a2a',
    spd: 0.82, pow: 1.3, hp: 120, jump: 0.9, reach: 1, scale: 1.12,
    proj: { col: '#59e05f', col2: '#e5ffe0', r: 23, v: 7, dmg: 1.05 } },

  { id: 'yuki', name: 'YUKI', title: 'Sombra Ninja',
    skin: '#f1d0b0', hair: '#101018', hs: 'ninja', band: '#00e5ff',
    gi: '#1c1f2e', upper: '#1c1f2e', fore: '#1c1f2e', fist: '#00bcd4',
    pants: '#1c1f2e', shin: '#1c1f2e', belt: '#00e5ff', shoe: '#0f111a',
    spd: 1.25, pow: 0.8, hp: 88, jump: 1.22, reach: 0.95, scale: 0.95,
    proj: { col: '#19e6ff', col2: '#e0fcff', r: 11, v: 13, dmg: 1 } },

  { id: 'rex', name: 'REX', title: 'Rei do Ringue',
    skin: '#d49a63', hair: '#161616', hs: 'mohawk',
    gi: '#d49a63', upper: '#d49a63', fore: '#d49a63', fist: '#d62d2d', gloveR: 8,
    pants: '#f2c40f', shin: '#d49a63', belt: '#161616', shoe: '#161616',
    spd: 1.05, pow: 1.1, hp: 104, jump: 1, reach: 1.12, scale: 1.04,
    proj: { col: '#ffd23f', col2: '#fff4c2', r: 18, v: 9.5, dmg: 1 } }
];

// Esquemas de teclado (usa e.code, então funciona em qualquer layout)
const SCHEMES = [
  { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', p: 'KeyF', k: 'KeyG', s: 'KeyH' },
  { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', p: 'Comma', k: 'Period', s: 'Slash' },
  { l: 'KeyJ', r: 'KeyL', u: 'KeyI', d: 'KeyK', p: 'KeyU', k: 'KeyO', s: 'KeyP' },
  { l: 'Numpad4', r: 'Numpad6', u: 'Numpad8', d: 'Numpad5', p: 'Numpad7', k: 'Numpad9', s: 'Numpad0' }
];
const KEYHELP = [
  'A / D mover · W pular · S defender · F soco · G chute · H especial',
  '← / → mover · ↑ pular · ↓ defender · , soco · . chute · ; especial',
  'J / L mover · I pular · K defender · U soco · O chute · P especial',
  'Numpad 4 / 6 mover · 8 pular · 5 defender · 7 soco · 9 chute · 0 especial'
];
