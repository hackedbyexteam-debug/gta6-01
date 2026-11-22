// HUD and menus: health and money, wanted stars, weapon and ammo, the
// minimap, the mission objective, the clock, and every screen — title,
// briefing, phone, pause, busted, wasted and the story ending.
import { TILE, MAP_W, MAP_H, WANTED_NAMES } from './config.js';
import { weaponDef } from './combat.js';
import { CONTACTS, MISSIONS, currentStep } from './missions.js';

function bar(ctx, x, y, w, h, ratio, color, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, ratio)), h - 2);
}

export function drawHUD(ctx, game) {
  const vw = ctx.canvas.width;
  const p = game.player;
  // Health + armor, bottom left.
  bar(ctx, 16, ctx.canvas.height - 34, 220, 14, p.health / 100, '#e84a4a');
  if (p.armor > 0) bar(ctx, 16, ctx.canvas.height - 52, 220, 8, p.armor / 100, '#7db8e8');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.health)}`, 244, ctx.canvas.height - 22);
  // Money, top left.
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#3ecf6e';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, 16, 30);
  ctx.fillStyle = '#fff';
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText(WANTED_NAMES[game.wanted], 16, 50);
  // Wanted stars, top center.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < game.wanted ? '#ffd94a' : 'rgba(255,255,255,0.25)';
    drawStar(ctx, vw / 2 - 60 + i * 26, 22, 10, i < game.wanted);
  }
  // Weapon + ammo, bottom right.
  const def = weaponDef(game.arsenal.current);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  const ammo = def.id === 'fists' ? '∞' : `${game.arsenal.ammo[def.id] ?? 0} / ${game.arsenal.reserve[def.id] ?? 0}`;
  ctx.fillText(`${def.name}  ${ammo}`, vw - 16, ctx.canvas.height - 22);
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText('1-5 weapon · R reload · E enter car · Tab phone', vw - 16, ctx.canvas.height - 42);
  ctx.textAlign = 'left';
  // Mission objective, top center under the stars.
  const step = currentStep(game);
  if (step) {
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffd94a';
    ctx.textAlign = 'center';
    ctx.fillText(step.text, vw / 2, 62);
    ctx.textAlign = 'left';
    if (step.time) {
      const left = Math.max(0, step.time - game.mission.timer);
      ctx.fillStyle = left < 20 ? '#e84a4a' : '#fff';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(left)}s`, vw / 2, 82);
      ctx.textAlign = 'left';
    }
  } else if (game.missionIndex < MISSIONS.length) {
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillStyle = '#cfd8e8';
    ctx.textAlign = 'center';
    ctx.fillText(`Next job: ${MISSIONS[game.missionIndex].title} — drive to the yellow marker`, vw / 2, 62);
    ctx.textAlign = 'left';
  }
  // Clock + weather, top right under the minimap.
  const hh = Math.floor(game.time / 60) % 24;
  const mm = Math.floor(game.time % 60);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${game.weather === 'rain' ? 'RAIN' : 'CLEAR'}`, vw - 16, 168);
  ctx.textAlign = 'left';
  // Speed when driving.
  if (p.inCar) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(p.inCar.speed) * 0.36)} km/h`, vw - 16, ctx.canvas.height - 64);
    ctx.textAlign = 'left';
  }
  // Banner (mission complete / failed).
  if (game.banner && game.banner.life > 0) {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    const w = ctx.measureText(game.banner.text).width + 40;
    ctx.fillRect(vw / 2 - w / 2, 96, w, 34);
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(game.banner.text, vw / 2, 118);
    ctx.textAlign = 'left';
  }
  drawMinimap(ctx, game);
}

function drawStar(ctx, x, y, r, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd94a' : 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.restore();
}

function drawMinimap(ctx, game) {
  const size = 150;
  const x = ctx.canvas.width - size - 16;
  const y = 16;
  const scale = size / (MAP_W * TILE);
  ctx.fillStyle = 'rgba(8, 12, 18, 0.85)';
  ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  const { world } = game;
  for (let ty = 0; ty < MAP_H; ty += 2) {
    for (let tx = 0; tx < MAP_W; tx += 2) {
      const t = world.tileAt(tx, ty);
      ctx.fillStyle = t === 1 ? '#5a6270' : t === 3 ? '#2f5c3a' : t === 4 ? '#c2a878' : t === 5 ? '#2a5a7a' : '#1c2027';
      ctx.fillRect(x + tx * TILE * scale, y + ty * TILE * scale, 2, 2);
    }
  }
  // Shops.
  ctx.fillStyle = '#3ecf6e';
  for (const key of Object.keys(world.shops)) {
    const s = world.shops[key];
    ctx.fillRect(x + s.x * scale - 2, y + s.y * scale - 2, 4, 4);
  }
  ctx.fillStyle = '#e84a4a';
  ctx.fillRect(x + world.bank.x * scale - 2, y + world.bank.y * scale - 2, 4, 4);
  // Mission marker.
  const pt = game.objectivePoint ? game.objectivePoint() : null;
  if (pt) {
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.arc(x + pt.x * scale, y + pt.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cops red, player white.
  ctx.fillStyle = '#ff4a4a';
  for (const c of game.cops) {
    if (!c.dead) ctx.fillRect(x + c.x * scale - 1, y + c.y * scale - 1, 3, 3);
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + game.player.x * scale, y + game.player.y * scale, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
}

function menuBox(ctx, title, lines, accent) {
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  ctx.fillStyle = 'rgba(5, 8, 14, 0.82)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.fillStyle = accent || '#ffd94a';
  ctx.font = 'bold 44px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, vw / 2, vh / 2 - 90);
  ctx.font = '16px "Segoe UI", sans-serif';
  ctx.fillStyle = '#dfe6f2';
  lines.forEach((line, i) => {
    ctx.fillText(line, vw / 2, vh / 2 - 40 + i * 26);
  });
  ctx.textAlign = 'left';
}

export function drawTitle(ctx, game) {
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const art = game.images.title;
  if (art && art.complete && art.naturalWidth > 0) {
    ctx.drawImage(art, 0, 0, vw, vh);
    ctx.fillStyle = 'rgba(5, 8, 14, 0.45)';
    ctx.fillRect(0, 0, vw, vh);
  } else {
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#e8762a';
    ctx.beginPath();
    ctx.arc(vw / 2, vh / 2 - 140, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a5a7a';
    ctx.fillRect(0, vh / 2 + 40, vw, vh / 2);
  }
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 72px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOLMAR HEAT', vw / 2, vh / 2 - 60);
  ctx.fillStyle = '#fff';
  ctx.font = '20px "Segoe UI", sans-serif';
  ctx.fillText('An open-world crime story in Solmar City', vw / 2, vh / 2 - 24);
  ctx.font = '16px "Segoe UI", sans-serif';
  ctx.fillStyle = '#dfe6f2';
  const lines = game.saveExists
    ? ['ENTER — Continue your story', 'R — New game', 'WASD move / drive · E enter car · Click shoot · Tab phone']
    : ['ENTER — New game', 'WASD move / drive · E enter car · Click shoot · Tab phone'];
  lines.forEach((line, i) => ctx.fillText(line, vw / 2, vh / 2 + 40 + i * 28));
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillStyle = '#9fb0c8';
  ctx.fillText('Rico Vega owes Sal Moretti $40,000. Twelve jobs to pay it off — or take the city.', vw / 2, vh - 24);
  ctx.textAlign = 'left';
}

export function drawBriefing(ctx, game) {
  const mission = game.pendingMission;
  if (!mission) return;
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const contact = CONTACTS[mission.contact];
  ctx.fillStyle = 'rgba(5, 8, 14, 0.88)';
  ctx.fillRect(0, 0, vw, vh);
  const art = game.images[mission.contact];
  if (art && art.complete && art.naturalWidth > 0) {
    ctx.drawImage(art, vw / 2 - 90, vh / 2 - 190, 180, 180);
  } else {
    ctx.fillStyle = '#3a4a6b';
    ctx.beginPath();
    ctx.arc(vw / 2, vh / 2 - 100, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(contact.name[0], vw / 2, vh / 2 - 86);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(mission.title, vw / 2, vh / 2 + 30);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillText(`${contact.name} — ${contact.role}`, vw / 2, vh / 2 + 58);
  ctx.font = '15px "Segoe UI", sans-serif';
  ctx.fillStyle = '#dfe6f2';
  wrapText(ctx, mission.brief, vw / 2, vh / 2 + 92, 640, 22);
  ctx.fillStyle = '#3ecf6e';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillText(`Reward: $${mission.reward}    ·    ENTER accept · ESC decline`, vw / 2, vh / 2 + 190);
  ctx.textAlign = 'left';
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [''];
  for (const w of words) {
    const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (ctx.measureText(test).width > maxW && lines[lines.length - 1]) lines.push(w);
    else lines[lines.length - 1] = test;
  }
  lines.forEach((line, i) => ctx.fillText(line, cx, y + i * lineH));
}

export function drawPhone(ctx, game) {
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  ctx.fillStyle = 'rgba(5, 8, 14, 0.85)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PHONE — JOBS & MAP', vw / 2, 90);
  ctx.font = '15px "Segoe UI", sans-serif';
  ctx.fillStyle = '#dfe6f2';
  MISSIONS.forEach((m, i) => {
    const done = game.completedMissions.includes(m.id);
    const next = i === game.missionIndex;
    const y = 130 + i * 30;
    ctx.fillStyle = done ? '#3ecf6e' : next ? '#ffd94a' : '#8a97ab';
    ctx.fillText(`${done ? '✓' : next ? '►' : '·'}  ACT ${m.act} — ${m.title}   $${m.reward}`, vw / 2, y);
  });
  ctx.fillStyle = '#dfe6f2';
  ctx.fillText('Shops: Ironworks Gunsmith (weapons) · Pit Stop Garage (clear wanted, repair) · Sunshine Clinic (heal)', vw / 2, 520);
  ctx.fillText('Side work: drive a taxi — steal one and fares find you. TAB or ESC to close.', vw / 2, 548);
  ctx.textAlign = 'left';
}

export function drawPaused(ctx) {
  menuBox(ctx, 'PAUSED', ['ESC — resume', 'M — music on/off', 'Progress saves automatically at each mission'], '#fff');
}

export function drawDead(ctx, game) {
  menuBox(ctx, 'WASTED', [`Rico went down in ${game.stats.missionsDone || 0} jobs done.`, 'ENTER — retry from the hideout', 'The city keeps your money and your weapons.'], '#e84a4a');
}

export function drawBusted(ctx, game) {
  menuBox(ctx, 'BUSTED', ['The Solmar PD took you in.', 'ENTER — pay $500 bail and walk free', 'Your wanted level is cleared.'], '#7db8e8');
}

export function drawComplete(ctx, game) {
  menuBox(ctx, 'KING OF SOLMAR', [
    'The ledger is at the harbor. Sal\u2019s debt is dead.',
    `Jobs done: ${game.stats.missionsDone} · Kills: ${game.stats.kills || 0} · Cash: $${game.money.toLocaleString('en-US')}`,
    'Free roam continues — the city is yours now. ENTER to keep playing.',
  ]);
}
