// The wanted system and the Solmar PD. Wanted 0-5 stars; cops spawn at the
// edge of the camera and chase on foot or in cruisers, ramming cars and
// beating the player down. Wanted cools off when the player stays unseen,
// and the Pit Stop Garage clears it for cash.
import { WORLD_W, WORLD_H } from './config.js';
import { createVehicle, updateVehicle } from './vehicles.js';
import { collideCircleBuildings } from './entities.js';

export function createCop(x, y, inCar) {
  return {
    x, y, angle: 0, radius: 13, health: 60, speed: 0,
    inCar: inCar || null, dead: false, punchTimer: 0, stuck: 0,
  };
}

export function wantedStars(game) {
  return game.wanted;
}

export function copsWanted(game) {
  // How many cops the current wanted level calls for.
  return [0, 2, 3, 4, 6, 8][game.wanted] || 0;
}

export function updatePolice(game, dt, rng) {
  const want = copsWanted(game);
  const p = game.player;
  // Spawn cops at the edge of the view until the quota is met. They arrive on
  // a ring 750-950 px from the player — always outside the 520 px sight
  // radius, so a player who breaks line of sight can actually cool off.
  if (game.cops.length < want) {
    let x = p.x;
    let y = p.y;
    for (let tries = 0; tries < 8; tries++) {
      const ang = rng.range(0, Math.PI * 2);
      const dist = rng.range(750, 950);
      const cx = Math.max(20, Math.min(WORLD_W - 20, p.x + Math.cos(ang) * dist));
      const cy = Math.max(20, Math.min(WORLD_H - 20, p.y + Math.sin(ang) * dist));
      x = cx;
      y = cy;
      if (Math.hypot(cx - p.x, cy - p.y) >= 600) break;
    }
    // Corner fallback: if every try clamped too close, mirror across the player.
    if (Math.hypot(x - p.x, y - p.y) < 600) {
      x = Math.max(20, Math.min(WORLD_W - 20, 2 * p.x - x));
      y = Math.max(20, Math.min(WORLD_H - 20, 2 * p.y - y));
    }
    const inCar = game.wanted >= 2 && rng.chance(0.6) ? createVehicle('police', x, y, 0) : null;
    const cop = createCop(x, y, inCar);
    if (inCar) game.vehicles.push(inCar);
    game.cops.push(cop);
  }
  for (const cop of game.cops) {
    if (cop.dead) continue;
    cop.punchTimer = Math.max(0, cop.punchTimer - dt);
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const d = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    cop.angle = ang;
    if (cop.inCar) {
      const car = cop.inCar;
      if (car.dead) {
        cop.inCar = null;
        cop.x = car.x;
        cop.y = car.y;
      } else {
        // Ram the player's car (or the player).
        const tx = p.inCar ? p.inCar : p;
        const tdx = tx.x - car.x;
        const tdy = tx.y - car.y;
        const td = Math.hypot(tdx, tdy) || 1;
        const wantAngle = Math.atan2(tdy, tdx);
        let diff = wantAngle - car.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.abs(diff) > 0.1 ? Math.sign(diff) : 0;
        updateVehicle(car, { forward: true, back: false, left: steer < 0, right: steer > 0, brake: false }, dt, game.world, game.vehicles);
        cop.x = car.x;
        cop.y = car.y;
        cop.angle = car.angle;
        if (td < 40 && p.inCar) {
          p.inCar.health -= 14 * dt;
          if (p.inCar.health <= 0) {
            p.inCar.dead = true;
            game.audio.crash();
          }
        }
        continue;
      }
    }
    // On foot: run at the player and beat them down.
    const sp = 165 + game.wanted * 12;
    const nx = cop.x + Math.cos(ang) * sp * dt;
    const ny = cop.y + Math.sin(ang) * sp * dt;
    const c = collideCircleBuildings(nx, ny, cop.radius, game.world);
    cop.x = c.x;
    cop.y = c.y;
    if (d < 30 && cop.punchTimer <= 0) {
      cop.punchTimer = 0.7;
      damagePlayer(game, 9 + game.wanted * 2);
    }
  }
  game.cops = game.cops.filter((c) => !c.dead || c.inCar);
  game.cops = game.cops.filter((c) => {
    if (c.dead) return false;
    return Math.hypot(c.x - p.x, c.y - p.y) < 2400;
  });

  // Heat cools off when the player is out of every cop's sight.
  const seen = game.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 520);
  if (!seen && game.wanted > 0) {
    game.heat = Math.max(0, game.heat - dt * 0.05);
    if (game.heat <= 0) {
      game.wanted = Math.max(0, game.wanted - 1);
      game.heat = game.wanted > 0 ? 1 : 0;
    }
  } else if (seen) {
    game.heat = 1;
  }
}

export function damagePlayer(game, amount) {
  const p = game.player;
  if (p.dead) return;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.health -= rest;
  game.audio.hurt();
  game.particles.push({ x: p.x, y: p.y, life: 0.4, color: '#c0392b', n: 6 });
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    game.audio.fail();
  }
}

export function clearWantedAtGarage(game) {
  const cost = 150 + game.wanted * 100;
  if (game.wanted === 0) return { ok: false, reason: 'already clean' };
  if (game.money < cost) return { ok: false, reason: 'not enough cash' };
  game.money -= cost;
  game.wanted = 0;
  game.heat = 0;
  game.cops = [];
  game.audio.cash();
  return { ok: true, reason: '' };
}
