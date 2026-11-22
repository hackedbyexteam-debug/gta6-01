// World and entity rendering: the city tiles, buildings with shaded roofs and
// lit windows, cars, people, particles, tracers and the day/night + rain
// lighting that makes Solmar feel alive.
import { TILE, T, WORLD_W, WORLD_H } from './config.js';

const TILE_COLORS = {
  [T.BLOCK]: '#23272e',
  [T.ROAD]: '#2e3238',
  [T.WALK]: '#3a3f46',
  [T.PARK]: '#2f5c3a',
  [T.BEACH]: '#c2a878',
  [T.WATER]: '#2a5a7a',
};

export function lightFactor(game) {
  // 0 = deep night, 1 = full day.
  const m = game.time % 1440;
  if (m >= 420 && m < 1020) return 1;
  if (m >= 1020 && m < 1140) return 1 - (m - 1020) / 120 * 0.55;
  if (m >= 1140 || m < 300) return 0.45;
  if (m >= 300 && m < 420) return 0.45 + (m - 300) / 120 * 0.55;
  return 1;
}

export function drawWorld(ctx, game, cam) {
  const { world } = game;
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(cam.x / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(95, Math.ceil((cam.x + vw) / TILE));
  const y1 = Math.min(95, Math.ceil((cam.y + vh) / TILE));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = world.tileAt(tx, ty);
      const px = tx * TILE - cam.x;
      const py = ty * TILE - cam.y;
      ctx.fillStyle = TILE_COLORS[t];
      ctx.fillRect(px, py, TILE, TILE);
      if (t === T.ROAD) {
        ctx.fillStyle = 'rgba(230, 200, 90, 0.55)';
        if (tx % 8 === 0 || tx % 8 === 1) ctx.fillRect(px + TILE / 2 - 1, py, 2, TILE);
        if (ty % 8 === 0 || ty % 8 === 1) ctx.fillRect(px, py + TILE / 2 - 1, TILE, 2);
      } else if (t === T.PARK) {
        // Trees as dark green blobs.
        if ((tx * 7 + ty * 13) % 5 === 0) {
          ctx.fillStyle = '#27512f';
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 11, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (t === T.BEACH) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px, py + ((tx * 3 + ty) % 4) * 8, TILE, 2);
      } else if (t === T.WATER) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(px, py + ((tx + ty * 2) % 3) * 10, TILE, 2);
      }
    }
  }

  // Buildings: side wall, roof, lit windows at night.
  const light = lightFactor(game);
  for (const b of world.buildings) {
    const px = b.x - cam.x;
    const py = b.y - cam.y;
    if (px > vw + 60 || py > vh + 60 || px + b.w < -60 || py + b.h < -60) continue;
    const hgt = b.floors * 5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px + hgt * 0.5, py + hgt * 0.5, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(px, py, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(px + 3, py + 3, b.w - 6, b.h - 6);
    if (light < 0.8) {
      ctx.fillStyle = 'rgba(255, 210, 110, 0.85)';
      const cols = Math.floor(b.w / 22);
      const rows = Math.floor(b.h / 22);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if ((i * 5 + j * 11 + b.floors) % 3 === 0) {
            ctx.fillRect(px + 7 + i * 22, py + 7 + j * 22, 9, 11);
          }
        }
      }
    }
  }

  // Landmarks: bank, shops, hideout — drawn as labelled plaques on the road.
  drawLabel(ctx, game, cam, world.bank, 'BANK');
  drawLabel(ctx, game, cam, world.shops.gunsmith, 'GUNSMITH');
  drawLabel(ctx, game, cam, world.shops.garage, 'GARAGE');
  drawLabel(ctx, game, cam, world.shops.clinic, 'CLINIC');
  drawLabel(ctx, game, cam, world.hideout, 'HIDEOUT');
  drawLabel(ctx, game, cam, world.pizza, 'PIZZA');
}

function drawLabel(ctx, game, cam, pt, text) {
  const px = pt.x - cam.x;
  const py = pt.y - cam.y;
  if (px < -80 || py < -80 || px > ctx.canvas.width + 80 || py > ctx.canvas.height + 80) return;
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = 'rgba(10, 14, 20, 0.8)';
  ctx.fillRect(px - w / 2, py - 26, w, 16);
  ctx.fillStyle = '#e8c85a';
  ctx.textAlign = 'center';
  ctx.fillText(text, px, py - 14);
  ctx.textAlign = 'left';
}

export function drawPickups(ctx, game, cam) {
  for (const pk of game.pickups) {
    const px = pk.x - cam.x;
    const py = pk.y - cam.y + Math.sin(pk.bob + performance.now() / 300) * 3;
    if (px < -20 || py < -20 || px > ctx.canvas.width + 20 || py > ctx.canvas.height + 20) continue;
    ctx.fillStyle = pk.kind === 'cash' ? '#3ecf6e' : pk.kind === 'health' ? '#e84a4a' : '#e8c85a';
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0e14';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'cash' ? '$' : pk.kind === 'health' ? '+' : 'A', px, py + 4);
    ctx.textAlign = 'left';
  }
}

export function drawVehicles(ctx, game, cam) {
  for (const v of game.vehicles) {
    if (v.dead) continue;
    drawCar(ctx, v.x - cam.x, v.y - cam.y, v.angle, v.color, v.def, v.speed);
    if (v.health < v.def.health * 0.5) {
      ctx.fillStyle = 'rgba(232, 118, 42, 0.7)';
      ctx.beginPath();
      ctx.arc(v.x - cam.x, v.y - cam.y - 8, 5 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCar(ctx, x, y, angle, color, def, speed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-20, -10, 44, 24);
  ctx.fillStyle = color;
  ctx.fillRect(-22, -12, 44, 24);
  ctx.fillStyle = '#1a2027';
  ctx.fillRect(-4, -11, 16, 22);
  ctx.fillStyle = '#dfe8f2';
  ctx.fillRect(14, -9, 5, 18);
  // Headlights when driving at night.
  ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
  ctx.fillRect(20, -10, 3, 4);
  ctx.fillRect(20, 6, 3, 4);
  if (def.id === 'police') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-2, -12, 6, 24);
    ctx.fillStyle = Math.floor(performance.now() / 200) % 2 === 0 ? '#ff2a2a' : '#2a6bff';
    ctx.fillRect(-8, -6, 5, 5);
    ctx.fillRect(-8, 1, 5, 5);
  }
  if (def.id === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export function drawPeople(ctx, game, cam) {
  for (const ped of game.peds) {
    if (ped.dead) continue;
    drawPerson(ctx, ped.x - cam.x, ped.y - cam.y, ped.angle, ped.color, ped.walkPhase, ped.panic > 0);
  }
  for (const cop of game.cops) {
    if (cop.dead) continue;
    if (cop.inCar) continue;
    drawPerson(ctx, cop.x - cam.x, cop.y - cam.y, cop.angle, '#2f4a7d', performance.now() / 120, true);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 8px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', cop.x - cam.x, cop.y - cam.y - 16);
    ctx.textAlign = 'left';
  }
  const p = game.player;
  if (!p.dead && !p.inCar) {
    drawPerson(ctx, p.x - cam.x, p.y - cam.y, p.angle, '#e8c85a', performance.now() / 120, false);
    // Aiming line toward the mouse.
    const mx = game.input.mouse.x;
    const my = game.input.mouse.y;
    const aim = Math.atan2(my - (p.y - cam.y), mx - (p.x - cam.x));
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(p.x - cam.x, p.y - cam.y);
    ctx.lineTo(p.x - cam.x + Math.cos(aim) * 46, p.y - cam.y + Math.sin(aim) * 46);
    ctx.stroke();
  }
}

function drawPerson(ctx, x, y, angle, color, phase, running) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const bob = Math.sin(phase) * (running ? 3 : 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8a878';
  ctx.beginPath();
  ctx.arc(4 + bob * 0.3, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawEffects(ctx, game, cam) {
  for (const t of game.tracers) {
    ctx.strokeStyle = `rgba(255, 220, 120, ${Math.max(0, t.life / 0.08)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1 - cam.x, t.y1 - cam.y);
    ctx.lineTo(t.x2 - cam.x, t.y2 - cam.y);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (const pt of game.particles) {
    const a = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = Math.min(1, a);
    for (let i = 0; i < pt.n; i++) {
      const ang = (i / pt.n) * Math.PI * 2 + pt.life * 3;
      const r = (1 - a) * 26;
      ctx.beginPath();
      ctx.arc(pt.x - cam.x + Math.cos(ang) * r, pt.y - cam.y + Math.sin(ang) * r, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawLighting(ctx, game) {
  const light = lightFactor(game);
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  if (light < 1) {
    const dark = (1 - light) * 0.55;
    ctx.fillStyle = `rgba(8, 12, 32, ${dark})`;
    ctx.fillRect(0, 0, vw, vh);
    // Warm dusk tint.
    if (light > 0.5 && light < 0.95) {
      ctx.fillStyle = 'rgba(232, 140, 60, 0.08)';
      ctx.fillRect(0, 0, vw, vh);
    }
  }
  if (game.weather === 'rain') {
    ctx.strokeStyle = 'rgba(180, 200, 230, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const t = performance.now() / 12;
    for (let i = 0; i < 70; i++) {
      const x = (i * 173 + t * 0.6) % (vw + 40) - 20;
      const y = (i * 97 + t) % (vh + 40) - 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
    }
    ctx.stroke();
  }
}

export function drawObjectiveMarker(ctx, game, cam) {
  const pt = game.objectivePoint ? game.objectivePoint() : null;
  if (!pt) return;
  const px = pt.x - cam.x;
  const py = pt.y - cam.y;
  const vw = ctx.canvas.width;
  const vh = ctx.canvas.height;
  const cx = Math.max(30, Math.min(vw - 30, px));
  const cy = Math.max(30, Math.min(vh - 30, py));
  const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 26 * pulse);
  ctx.lineTo(cx - 7, cy - 12);
  ctx.lineTo(cx + 7, cy - 12);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
}
