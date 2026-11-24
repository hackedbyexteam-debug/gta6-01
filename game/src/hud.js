// HUD and menus: health and armor, money, wanted stars, weapon slots with
// ammo, crew abilities with cooldowns, car damage, speed, district standing,
// the minimap, the mission objective with its stage number, the clock, and
// every screen — title (Continue / New Game / Load Game / Settings),
// briefing, phone, pause, busted, wasted and the story ending.
// Drawn on the 2D overlay canvas above the 3D WebGL view.
import { TILE, MAP_W, MAP_H, WANTED_NAMES, CREW, districtAtPoint } from './config.js';
import { weaponDef } from './combat.js';
import { CONTACTS, MISSIONS, currentStep } from './missions.js';
import { projectToScreen, phaseAt } from './render.js';
import { crewCooldownLeft, crewReady } from './crew.js';
import { RACE } from './config.js';

// Cached text measurements: the banner width and the title gradient are
// computed once per distinct text / canvas size, never per frame.
let _bannerCache = { text: '', w: 0 };
let _titleGrad = null;
let _titleGradH = 0;
let _titleWarmth = null;
let _titleWarmthW = 0;
let _titleWarmthH = 0;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(5, 8, 14, 0.55)';
  ctx.fillRect(x, y, w, h);
}

function bar(ctx, x, y, w, h, ratio, color, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, ratio)), h - 2);
}

export function drawHUD(ctx, game) {
  const vw = ctx.canvas.width;
  const p = game.player;
  const district = districtAtPoint(p.x, p.y);
  const standing = game.standing ? (game.standing[district.id] || 0) : 0;
  // Health + armor, bottom left — on a dark panel so the bars and
  // labels read over any bright window or headlight behind them.
  panel(ctx, 8, ctx.canvas.height - 80, 380, 72);
  bar(ctx, 16, ctx.canvas.height - 34, 220, 14, p.health / 100, '#e84a4a');
  if (p.armor > 0) bar(ctx, 16, ctx.canvas.height - 52, 220, 8, p.armor / 100, '#7db8e8');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.health)}${p.armor > 0 ? `  ARMOR ${Math.ceil(p.armor)}` : ''}`, 244, ctx.canvas.height - 22);
  // Car damage, under the health bar while driving.
  if (p.inCar) {
    const car = p.inCar;
    const dmg = Math.max(0, Math.round((1 - car.health / car.def.health) * 100));
    bar(ctx, 16, ctx.canvas.height - 70, 220, 8, car.health / car.def.health, dmg > 60 ? '#e84a4a' : '#e8762a');
    ctx.fillStyle = dmg > 60 ? '#ff8a7a' : '#fff';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.fillText(`${car.def.name} — DAMAGE ${dmg}%`, 244, ctx.canvas.height - 62);
  }
  // Money + district standing, top left.
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#3ecf6e';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, 16, 30);
  ctx.fillStyle = '#fff';
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText(WANTED_NAMES[game.wanted], 16, 50);
  ctx.fillStyle = standing >= 0 ? '#7dd8a8' : '#ff8a7a';
  ctx.fillText(`${district.name} — standing ${standing >= 0 ? '+' : ''}${standing}`, 16, 68);
  // Wanted stars, top center.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < game.wanted ? '#ffd94a' : 'rgba(255,255,255,0.25)';
    drawStar(ctx, vw / 2 - 60 + i * 26, 22, 10, i < game.wanted);
  }
  if (game.heli) {
    // Under the mission box when one is showing (it occupies y 48-92),
    // otherwise just under the stars — never on top of either.
    const hy = game.mission ? 140 : 42;
    ctx.fillStyle = '#ff5a3c';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HELICOPTER OVERHEAD', vw / 2, hy);
    ctx.textAlign = 'left';
  }
  // Mission box: title + STAGE n/m + objective line, top center.
  const step = currentStep(game);
  if (game.mission) {
    const m = game.mission;
    const total = m.def.steps.length;
    ctx.fillStyle = 'rgba(5, 8, 14, 0.72)';
    ctx.fillRect(vw / 2 - 260, 48, 520, 44);
    ctx.strokeStyle = 'rgba(255, 217, 74, 0.6)';
    ctx.strokeRect(vw / 2 - 260, 48, 520, 44);
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffd94a';
    ctx.textAlign = 'center';
    ctx.fillText(`MISSION ${game.missionIndex + 1} — ${m.def.title}   STAGE ${m.stepIndex + 1}/${total}`, vw / 2, 66);
    ctx.fillStyle = '#fff';
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillText(step ? step.text : '', vw / 2, 84);
    ctx.textAlign = 'left';
    if (step && step.time) {
      const left = Math.max(0, step.time - game.mission.timer);
      ctx.fillStyle = left < 20 ? '#e84a4a' : '#fff';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(left)}s`, vw / 2, 108);
      ctx.textAlign = 'left';
    }
  } else if (game.race && game.race.active) {
    const r = game.race;
    ctx.fillStyle = 'rgba(5, 8, 14, 0.72)';
    ctx.fillRect(vw / 2 - 260, 48, 520, 44);
    ctx.strokeStyle = 'rgba(53, 224, 255, 0.6)';
    ctx.strokeRect(vw / 2 - 260, 48, 520, 44);
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.fillStyle = '#35e0ff';
    ctx.textAlign = 'center';
    ctx.fillText(`STREET RACE — CHECKPOINT ${r.checkpoint + 1}/${RACE.checkpoints.length}`, vw / 2, 66);
    ctx.fillStyle = '#fff';
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillText(`Time ${Math.round(r.timer)}s — par ${RACE.parSeconds}s for double payout`, vw / 2, 84);
    ctx.textAlign = 'left';
  } else if (game.missionIndex < MISSIONS.length) {
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillStyle = '#cfd8e8';
    ctx.textAlign = 'center';
    ctx.fillText(`Next job: ${MISSIONS[game.missionIndex].title} — drive to the yellow beacon`, vw / 2, 62);
    ctx.textAlign = 'left';
  }
  // Clock + weather + day/night phase, top right under the minimap.
  // The phase name comes from the live cycle (night / dawn / day / dusk).
  const hh = Math.floor(game.time / 60) % 24;
  const mm = Math.floor(game.time % 60);
  panel(ctx, vw - 268, 176, 260, p.inCar ? 52 : 26);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${phaseAt(game.time).toUpperCase()}  ${game.weather === 'rain' ? 'RAIN' : 'CLEAR'}`, vw - 16, 190);
  ctx.textAlign = 'left';
  // Speed when driving — under the minimap, clear of the weapon slots.
  if (p.inCar) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(p.inCar.speed) * 0.36)} km/h`, vw - 16, 216);
    ctx.textAlign = 'left';
  }
  // Weapon slots with ammo, bottom right: a DRAWN silhouette icon per
  // weapon (no names as text — the slots read like a gun rack, the way
  // the top entries do), slot number left, ammo right, current lit gold.
  const ROW_H = 22;
  const nOwned = game.arsenal.owned.length;
  panel(ctx, vw - 320, ctx.canvas.height - 40 - nOwned * ROW_H, 312, 32 + nOwned * ROW_H);
  const def = weaponDef(game.arsenal.current);
  game.arsenal.owned.forEach((id, i) => {
    const wdef = weaponDef(id);
    const y = ctx.canvas.height - 22 - i * ROW_H;
    const cur = id === def.id;
    const ammo = wdef.id === 'fists' ? '∞' : `${game.arsenal.ammo[wdef.id] ?? 0} / ${game.arsenal.reserve[wdef.id] ?? 0}`;
    const color = cur ? '#ffd94a' : '#cfd8e8';
    if (cur) {
      ctx.fillStyle = 'rgba(255, 217, 74, 0.14)';
      ctx.fillRect(vw - 320, y - 15, 312, ROW_H);
    }
    ctx.font = (cur ? 'bold ' : '') + '13px "Segoe UI", sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}`, vw - 312, y);
    drawWeaponIcon(ctx, wdef.id, vw - 296, y - 14, color);
    ctx.textAlign = 'right';
    ctx.fillText(ammo, vw - 16, y);
  });
  ctx.textAlign = 'left';
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillStyle = '#9fb0c8';
  // The E hint is live: it names the action E will actually do right
  // now (mission / car / shop), from game.interact — never a stale label.
  // rev5 fix: the line sits FULLY ABOVE the weapon panel (panel top is
  // height-40-nOwned*ROW_H), right-aligned at vw-16. It used to be drawn
  // at the panel's top-row height with textAlign 'left', so it ran off
  // the right edge of the canvas and only "1-7" peeked out, the rest
  // hidden behind the panel.
  const eHint = game.interact ? game.interact.label : 'E enter car';
  ctx.font = 'bold 12px "Segoe UI", sans-serif';
  ctx.fillStyle = game.interact ? '#ffd94a' : '#9fb0c8';
  ctx.textAlign = 'right';
  ctx.fillText(`1-7 weapon · R reload · Right-click scope (rifle/sniper) · Tab phone · ${eHint}`, vw - 16, ctx.canvas.height - 48 - game.arsenal.owned.length * ROW_H);
  ctx.textAlign = 'left';
  // Crew abilities with cooldowns, bottom centre.
  CREW.forEach((c, i) => {
    const x = vw / 2 - 150 + i * 105;
    const y = ctx.canvas.height - 58;
    const ready = crewReady(game, c.id);
    const left = crewCooldownLeft(game, c.id);
    ctx.fillStyle = ready ? 'rgba(42, 157, 143, 0.85)' : 'rgba(20, 26, 36, 0.85)';
    ctx.fillRect(x, y, 98, 34);
    ctx.strokeStyle = ready ? '#2a9d8f' : 'rgba(255,255,255,0.25)';
    ctx.strokeRect(x, y, 98, 34);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`[${c.key}] ${c.ability}`, x + 49, y + 14);
    ctx.fillStyle = ready ? '#bfe8e2' : '#9fb0c8';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillText(ready ? c.name : `${Math.ceil(left)}s`, x + 49, y + 28);
    ctx.textAlign = 'left';
  });
  // Scope overlay: aiming a rifle/sniper darkens everything outside a
  // circle around the crosshair — the zoom is visible on screen, not
  // just a FOV number in the render readout.
  if (game.scoped) {
    const ch = ctx.canvas.height;
    const cx = vw / 2;
    const cy = ch / 2;
    const r = 200;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, vw, ch);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(3, 5, 10, 0.55)';
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 217, 74, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy); ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy + 26);
    ctx.stroke();
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${def.name.toUpperCase()} — SCOPED`, cx, cy + r + 24);
    ctx.restore();
  }
  // Banner (mission complete / failed). Width measured once per text.
  if (game.banner && game.banner.life > 0) {
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    if (_bannerCache.text !== game.banner.text) {
      _bannerCache = { text: game.banner.text, w: Math.min(vw - 40, ctx.measureText(game.banner.text).width + 40) };
    }
    const w = _bannerCache.w;
    ctx.fillRect(vw / 2 - w / 2, 100, w, 34);
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(game.banner.text, vw / 2, 122);
    ctx.textAlign = 'left';
  }
  drawObjectiveArrow(ctx, game);
  drawMinimap(ctx, game);
}

function drawObjectiveArrow(ctx, game) {
  // Screen-space edge arrow toward the objective (mission, race, fare):
  // the 3D beacon shows the spot itself; this arrow always points the way.
  let pt = null;
  if (game.race && game.race.active) {
    pt = RACE.checkpoints[game.race.checkpoint];
  } else if (game.objectivePoint) {
    pt = game.objectivePoint();
  }
  if (game.fare) pt = game.fare.at;
  if (!pt) return;
  const s = projectToScreen(game, pt.x, pt.y);
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  if (!s.behind && s.x > 30 && s.x < vw - 30 && s.y > 30 && s.y < vh - 30) return;
  // The arrow lives in a safe band: below the mission box / banner when
  // one is showing, above the crew chips and weapon slots — never on top
  // of another HUD element (the old clamp parked it on the ammo list).
  const topSafe = (game.mission || (game.race && game.race.active)) ? 140 : 40;
  const cx = Math.max(40, Math.min(vw - 40, s.x));
  const cy = Math.max(topSafe, Math.min(vh - 150, s.y));
  const ang = Math.atan2(cy - vh / 2, cx - vw / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWeaponIcon(ctx, id, x, y, color) {
  // One drawn silhouette per weapon, inside a 36x18 box at (x, y),
  // barrel pointing right. Each silhouette is deliberately different —
  // two fists, a short pistol, a boxy SMG, a long double-barrel shotgun,
  // a scoped rifle, a long thin sniper with a big scope, a fat bazooka
  // tube with a warhead cone — so the slot reads at a glance with no
  // name text beside it. All shapes are plain canvas rects/paths in the
  // one passed colour, matching the flat HUD style.
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  const r = (rx, ry, w, h) => ctx.fillRect(x + rx, y + ry, w, h);
  if (id === 'fists') {
    // Two clenched fists, one slightly raised.
    ctx.beginPath(); ctx.arc(x + 11, y + 11, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 25, y + 8, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(5, 8, 14, 0.55)';
    r(7, 9, 8, 1.4); r(21, 6, 8, 1.4);
  } else if (id === 'pistol') {
    // Short barrel, slide, angled grip, trigger guard.
    r(8, 4, 22, 4.5);
    r(8, 8.5, 22, 2);
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 10); ctx.lineTo(x + 16, y + 10);
    ctx.lineTo(x + 13, y + 18); ctx.lineTo(x + 7, y + 18);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 20, y + 11, 2.5, 0, Math.PI * 2); ctx.stroke();
  } else if (id === 'smg') {
    // Boxy body, long mag hanging down, short barrel, stock nub.
    r(6, 5, 20, 6);
    r(26, 6.5, 8, 3);
    r(2, 6.5, 4, 4);
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 11); ctx.lineTo(x + 17, y + 11);
    ctx.lineTo(x + 15, y + 18); ctx.lineTo(x + 10, y + 18);
    ctx.closePath(); ctx.fill();
    r(10, 2.5, 8, 2.5);
  } else if (id === 'shotgun') {
    // Long twin barrels over a pump, wooden stock at the back.
    r(6, 3, 28, 3);
    r(6, 7, 28, 3);
    r(14, 11, 10, 3.5);
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 3); ctx.lineTo(x + 6, y + 14);
    ctx.lineTo(x, y + 16); ctx.lineTo(x, y + 6);
    ctx.closePath(); ctx.fill();
  } else if (id === 'rifle') {
    // Long barrel, body, drop mag, stock, scope hump on top.
    r(16, 7, 18, 2.5);
    r(4, 6, 14, 5);
    r(8, 2.5, 9, 3);
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 11); ctx.lineTo(x + 14, y + 11);
    ctx.lineTo(x + 12, y + 17); ctx.lineTo(x + 8, y + 17);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 4, y + 13);
    ctx.lineTo(x, y + 14); ctx.lineTo(x, y + 8);
    ctx.closePath(); ctx.fill();
  } else if (id === 'sniper') {
    // Very long thin barrel, big round scope, slim body, stock.
    r(18, 8, 17, 2);
    r(6, 7, 12, 4);
    ctx.beginPath(); ctx.arc(x + 12, y + 4.5, 3.5, 0, Math.PI * 2); ctx.fill();
    r(9, 3, 6, 1.5);
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 7); ctx.lineTo(x + 6, y + 13);
    ctx.lineTo(x + 1, y + 14); ctx.lineTo(x + 1, y + 8);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 22, y + 11); ctx.lineTo(x + 20, y + 17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 26, y + 11); ctx.lineTo(x + 28, y + 17); ctx.stroke();
  } else if (id === 'bazooka') {
    // Fat launch tube, cone warhead at the front, rear sight, grip.
    r(2, 6, 26, 7);
    ctx.beginPath();
    ctx.moveTo(x + 28, y + 4); ctx.lineTo(x + 36, y + 9.5);
    ctx.lineTo(x + 28, y + 15); ctx.closePath(); ctx.fill();
    r(6, 3, 3, 3);
    r(12, 13, 4, 4);
    r(0, 7, 2, 5);
  }
  ctx.restore();
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
  if (game.mode === 'interior' && game.interior) {
    const it = game.interior;
    const scale = size / Math.max(it.pxW, it.pxH);
    const w = it.pxW * scale;
    const h = it.pxH * scale;
    const ox = x + (size - w) / 2;
    const oy = y + (size - h) / 2;
    ctx.fillStyle = 'rgba(8, 12, 18, 0.85)';
    ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(ox, oy, w, h);
    ctx.fillStyle = '#8a7a5a';
    for (const f of it.furniture) {
      if (!f.solid) continue;
      ctx.fillRect(ox + f.x * scale, oy + f.y * scale, Math.max(2, f.w * scale), Math.max(2, f.h * scale));
    }
    ctx.fillStyle = '#3ecf6e';
    ctx.fillRect(ox + it.exit.x * scale - 2, oy + it.exit.y * scale - 2, 4, 4);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ox + game.player.x * scale, oy + game.player.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
    return;
  }
  // Static base (roads, park, beach, water, shops, bank, race start),
  // rendered ONCE per world into an offscreen canvas; dynamic overlays
  // (mission marker, cops, heli, player) redrawn at 30 Hz into a cache
  // canvas that is blitted every frame. The old code redrew the whole
  // 32x32 tile map with 60+ vector calls on every frame.
  const scale = size / (MAP_W * TILE);
  if (!_minimapBase || _minimapBaseWorld !== game.world) {
    _minimapBase = document.createElement('canvas');
    _minimapBase.width = size;
    _minimapBase.height = size;
    const b = _minimapBase.getContext('2d');
    const { world } = game;
    for (let ty = 0; ty < MAP_H; ty += 2) {
      for (let tx = 0; tx < MAP_W; tx += 2) {
        const t = world.tileAt(tx, ty);
        b.fillStyle = t === 1 ? '#5a6270' : t === 3 ? '#2f5c3a' : t === 4 ? '#c2a878' : t === 5 ? '#2a5a7a' : '#1c2027';
        b.fillRect(tx * TILE * scale, ty * TILE * scale, 2, 2);
      }
    }
    b.fillStyle = '#3ecf6e';
    for (const key of Object.keys(world.shops)) {
      const s = world.shops[key];
      b.fillRect(s.x * scale - 2, s.y * scale - 2, 4, 4);
    }
    b.fillStyle = '#e84a4a';
    b.fillRect(world.bank.x * scale - 2, world.bank.y * scale - 2, 4, 4);
    b.fillStyle = '#35e0ff';
    b.fillRect(RACE.start.x * scale - 2, RACE.start.y * scale - 2, 4, 4);
    _minimapBaseWorld = game.world;
    _minimapCache = null;
  }
  if (!_minimapCache) {
    _minimapCache = document.createElement('canvas');
    _minimapCache.width = size + 8;
    _minimapCache.height = size + 8;
  }
  if (game._frame % 2 === 0 || _minimapCacheDirty) {
    _minimapCacheDirty = false;
    const c = _minimapCache.getContext('2d');
    c.clearRect(0, 0, size + 8, size + 8);
    c.fillStyle = 'rgba(8, 12, 18, 0.85)';
    c.fillRect(0, 0, size + 8, size + 8);
    c.drawImage(_minimapBase, 4, 4);
    // Mission marker.
    const pt = game.objectivePoint ? game.objectivePoint() : null;
    if (pt) {
      c.fillStyle = '#ffd94a';
      c.beginPath();
      c.arc(4 + pt.x * scale, 4 + pt.y * scale, 5, 0, Math.PI * 2);
      c.fill();
    }
    // Cops red, heli orange, player white.
    c.fillStyle = '#ff4a4a';
    for (const cp of game.cops) {
      if (!cp.dead) c.fillRect(4 + cp.x * scale - 1, 4 + cp.y * scale - 1, 3, 3);
    }
    if (game.heli) {
      c.fillStyle = '#ff7a2a';
      c.fillRect(4 + game.heli.x * scale - 2, 4 + game.heli.y * scale - 2, 5, 5);
    }
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(4 + game.player.x * scale, 4 + game.player.y * scale, 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.strokeRect(0, 0, size + 8, size + 8);
  }
  ctx.drawImage(_minimapCache, x - 4, y - 4);
}

// Minimap caches (module-level, rebuilt when the world changes).
let _minimapBase = null;
let _minimapBaseWorld = null;
let _minimapCache = null;
let _minimapCacheDirty = true;

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
  // The 3D night city renders behind the title (main.js renders the scene
  // first); this overlay is a dark gradient so the menu reads. The
  // gradient is built once per canvas height, not every frame.
  if (!_titleGrad || _titleGradH !== vh) {
    _titleGrad = ctx.createLinearGradient(0, 0, 0, vh);
    _titleGrad.addColorStop(0, 'rgba(5, 9, 20, 0.15)');
    _titleGrad.addColorStop(0.55, 'rgba(5, 9, 20, 0.40)');
    _titleGrad.addColorStop(1, 'rgba(5, 9, 20, 0.68)');
    _titleGradH = vh;
  }
  ctx.fillStyle = _titleGrad;
  ctx.fillRect(0, 0, vw, vh);
  // Title intro: the logo slides up and fades in over the first 1.2 s,
  // the gold rule draws itself out, and the subtitle + menu fade in
  // after — a designed entrance over the live city, not plain text on
  // black. Staged ?shot= frames skip straight to the finished title.
  const introT = game.shotFrozen ? 99 : (game.titleT || 0);
  const p1 = Math.min(1, introT / 1.2);
  const p1e = p1 * (2 - p1); // ease-out
  const p2 = Math.max(0, Math.min(1, (introT - 0.7) / 0.8));
  // Title warmth: a soft gold radial bloom behind the title (alpha 0.20
  // at the centre, fading to nothing) plus a wide sunset band across the
  // upper third (peak alpha 0.10) — the cover reads golden-hour warm
  // instead of flat dark. Both gradients are cached per canvas size,
  // like the overlay gradient above. Soft fades only, no hard-edged
  // plates, so the title, gold rule, subtitle and menu stay perfectly
  // readable.
  if (!_titleWarmth || _titleWarmthW !== vw || _titleWarmthH !== vh) {
    const bloom = ctx.createRadialGradient(vw / 2, vh / 2 - 110, 0, vw / 2, vh / 2 - 110, 340);
    bloom.addColorStop(0, 'rgba(255, 196, 107, 0.20)');
    bloom.addColorStop(0.6, 'rgba(255, 180, 90, 0.07)');
    bloom.addColorStop(1, 'rgba(255, 180, 90, 0)');
    const band = ctx.createLinearGradient(0, 0, 0, vh / 3);
    band.addColorStop(0, 'rgba(255, 178, 92, 0.06)');
    band.addColorStop(0.5, 'rgba(255, 178, 92, 0.10)');
    band.addColorStop(1, 'rgba(255, 178, 92, 0)');
    _titleWarmth = { bloom, band };
    _titleWarmthW = vw;
    _titleWarmthH = vh;
  }
  ctx.fillStyle = _titleWarmth.band;
  ctx.fillRect(0, 0, vw, vh / 3);
  ctx.fillStyle = _titleWarmth.bloom;
  ctx.fillRect(vw / 2 - 340, vh / 2 - 450, 680, 680);
  // Title with a soft drop shadow so it lifts off the night city, and a
  // gold rule under it — the cover's identity, not just big yellow text.
  // The whole logo rides the intro: fades in while sliding up into place.
  ctx.save();
  ctx.globalAlpha = p1;
  ctx.translate(0, (1 - p1e) * 36);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 72px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SOLMAR HEAT', vw / 2, vh / 2 - 110);
  ctx.restore();
  ctx.restore();
  // Everything below the logo fades in after it lands.
  ctx.save();
  ctx.globalAlpha = p2;
  // Alignment must be set AFTER the restore: restore() reverts textAlign
  // to whatever it was before save() (left, from the previous frame's
  // HUD draws), which left every line below the title — subtitle, story
  // line, menu, footers, tagline — left-aligned at vw/2 and visibly
  // right-shifted against the centred title. Set it once here and every
  // title-screen line shares the title's exact centre.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.fillRect(vw / 2 - 170 * p1e, vh / 2 - 98, 340 * p1e, 3);
  ctx.fillStyle = '#35e0ff';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillText('A COOL-NIGHT OPEN WORLD — SOLMAR CITY AFTER DARK', vw / 2, vh / 2 - 76);
  ctx.fillStyle = '#fff';
  ctx.font = '20px "Segoe UI", sans-serif';
  ctx.fillText('An open-world crime story in Solmar City', vw / 2, vh / 2 - 40);
  if (game.settingsOpen) {
    const items = [
      `Music: ${game.settings.music ? 'ON' : 'OFF'}  (M toggles)`,
      `Camera: ${game.settings.camera === 'far' ? 'FAR' : 'CLOSE'}  (V toggles)`,
      'Back',
    ];
    ctx.font = '18px "Segoe UI", sans-serif';
    items.forEach((line, i) => {
      const sel = game.titleSel === i;
      const y = vh / 2 + 20 + i * 34;
      // Label centred on its own: the old '► '/spaces prefix was part of
      // the centred string, so the visible word sat right of centre and
      // the selected line disagreed with the rest. The marker is drawn
      // separately, a fixed gap left of the label's left edge.
      ctx.fillStyle = sel ? '#ffd94a' : '#dfe6f2';
      ctx.fillText(line, vw / 2, y);
      if (sel) {
        const w = ctx.measureText(line).width;
        ctx.fillStyle = '#ffd94a';
        ctx.fillText('►', vw / 2 - w / 2 - 24, y);
      }
    });
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillStyle = '#9fb0c8';
    ctx.fillText('W/S or arrows to choose · ENTER to confirm', vw / 2, vh / 2 + 150);
  } else {
    const items = game.saveExists
      ? ['Continue', 'New Game', 'Load Game', 'Settings']
      : ['New Game', 'Load Game', 'Settings'];
    ctx.font = '18px "Segoe UI", sans-serif';
    items.forEach((line, i) => {
      const sel = game.titleSel === i;
      const y = vh / 2 + 20 + i * 34;
      // Label centred on its own; the selection marker is drawn
      // separately, a fixed gap left of the label's left edge (see the
      // settings branch above — the old prefixed string pushed the
      // visible word right of centre).
      ctx.fillStyle = sel ? '#ffd94a' : '#dfe6f2';
      ctx.fillText(line, vw / 2, y);
      if (sel) {
        const w = ctx.measureText(line).width;
        ctx.fillStyle = '#ffd94a';
        ctx.fillText('►', vw / 2 - w / 2 - 24, y);
      }
    });
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillStyle = '#9fb0c8';
    ctx.fillText('W/S or arrows to choose · ENTER to confirm', vw / 2, vh / 2 + 170);
    ctx.fillText('WASD move / drive · E enter car · Click shoot · Tab phone · Q/F/C crew', vw / 2, vh / 2 + 196);
  }
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillStyle = '#9fb0c8';
  ctx.fillText('Dario Kane owes Viktor Hale $40,000. Twelve jobs to pay it off — or take the city.', vw / 2, vh - 24);
  if (introT < 2.5) {
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillStyle = `rgba(159, 176, 200, ${0.55 + 0.45 * Math.sin(introT * 4)})`;
    ctx.fillText('— press any key to skip —', vw / 2, vh - 48);
  }
  ctx.restore();
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
  ctx.fillText('PHONE — JOBS, CREW & MAP', vw / 2, 90);
  ctx.font = '15px "Segoe UI", sans-serif';
  ctx.fillStyle = '#dfe6f2';
  MISSIONS.forEach((m, i) => {
    const done = game.completedMissions.includes(m.id);
    const next = i === game.missionIndex;
    const y = 130 + i * 26;
    ctx.fillStyle = done ? '#3ecf6e' : next ? '#ffd94a' : '#8a97ab';
    ctx.fillText(`${done ? '✓' : next ? '►' : '·'}  ACT ${m.act} — ${m.title}   $${m.reward}`, vw / 2, y);
  });
  ctx.fillStyle = '#35e0ff';
  ctx.font = 'bold 15px "Segoe UI", sans-serif';
  ctx.fillText('CREW — Q Nia (repair) · F Ivy (drop a star) · C Rook (lose the heat)', vw / 2, 470);
  ctx.fillStyle = '#dfe6f2';
  ctx.font = '14px "Segoe UI", sans-serif';
  ctx.fillText('District standing: finish jobs and fares where you are — respect opens the city.', vw / 2, 496);
  ctx.fillText('Street race: beachfront start line (cyan on the map), 4 checkpoints, beat par for double pay.', vw / 2, 520);
  ctx.fillText('Shops: Ironworks Gunsmith (weapons) · Pit Stop Garage (clear wanted, repair) · Sunshine Clinic (heal)', vw / 2, 546);
  ctx.fillText('Side work: drive a taxi — steal one and fares find you. TAB or ESC to close.', vw / 2, 572);
  ctx.textAlign = 'left';
}

export function drawPaused(ctx) {
  menuBox(ctx, 'PAUSED', ['ESC — resume', 'M — music on/off', 'Progress saves automatically at each mission'], '#fff');
}

export function drawDead(ctx, game) {
  menuBox(ctx, 'WASTED', [`Dario went down with ${game.stats.missionsDone || 0} jobs done.`, 'ENTER — retry from the hideout', 'The city keeps your money and your weapons.'], '#e84a4a');
}

export function drawBusted(ctx, game) {
  menuBox(ctx, 'BUSTED', ['The Solmar PD took you in.', 'ENTER — pay $500 bail and walk free', 'Your wanted level is cleared.'], '#7db8e8');
}

export function drawComplete(ctx, game) {
  menuBox(ctx, 'KING OF SOLMAR', [
    'The ledger is at the harbor. Viktor\u2019s debt is dead.',
    `Jobs done: ${game.stats.missionsDone} · Kills: ${game.stats.kills || 0} · Cash: $${game.money.toLocaleString('en-US')}`,
    'Free roam continues — the city is yours now. ENTER to keep playing.',
  ]);
}
