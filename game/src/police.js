// The wanted system and the Solmar PD. Wanted 0-5 stars; cops spawn at the
// edge of the camera and chase on foot or in cruisers, ramming cars and
// beating the player down. At 3 stars the PD sets roadblocks across the
// road ahead; at 4 stars a helicopter air unit joins with a searchlight.
// Wanted cools off when the player stays unseen, and the Pit Stop Garage
// clears it for cash.
import { WORLD_W, WORLD_H } from './config.js';
import { createVehicle, updateVehicle } from './vehicles.js';
import { collideCircleBuildings } from './entities.js';
import { spawnParticles } from './combat.js';

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
  // How many cops the current wanted level calls for. The helicopter adds
  // two more sets of eyes at 4+ stars.
  const base = [0, 2, 3, 4, 6, 8][game.wanted] || 0;
  return base + (game.heli ? 2 : 0);
}

export function updatePolice(game, dt, rng) {
  const want = copsWanted(game);
  const p = game.player;
  updateHeli(game, dt);
  updateRoadblocks(game, rng);
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
        // Ram the player's car (or the player). At 3+ stars a second
        // cruiser tries to flank: it aims 60 px to the player's side.
        const flank = game.wanted >= 3 && (cop.flank === undefined ? (cop.flank = rng.chance(0.5) ? 1 : -1) : cop.flank);
        const tx = p.inCar ? p.inCar : p;
        let tdx = tx.x - car.x;
        let tdy = tx.y - car.y;
        if (flank) {
          const px = -Math.sin(p.angle) * 60 * cop.flank;
          const py = Math.cos(p.angle) * 60 * cop.flank;
          tdx = tx.x + px - car.x;
          tdy = tx.y + py - car.y;
        }
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
    // On foot: run at the player and beat them down. With the helicopter
    // overhead marking the player, ground units close 25% faster — the
    // air unit is what makes 4 stars feel different from 3.
    const sp = (165 + game.wanted * 12) * (game.heli ? 1.25 : 1);
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
  // One in-place pass for dead / out-of-range cops: the old code ran two
  // filter() allocations every frame over the same list.
  for (let i = game.cops.length - 1; i >= 0; i--) {
    const c = game.cops[i];
    if (c.dead || Math.hypot(c.x - p.x, c.y - p.y) >= 2400) {
      game.cops[i] = game.cops[game.cops.length - 1];
      game.cops.pop();
    }
  }

  // Heat cools off when the player is out of every cop's sight — unless
  // the helicopter is actively marking them. A marked player is never
  // lost, but the air unit loses the trail after 25 s unseen (see
  // updateHeli): then the mark drops and the heat can cool again, so a
  // 4-star chase can be escaped by evasion, not only by paying the
  // garage or dying. Before that fix, 4+ stars could never cool at all
  // — the escape step of THE BANK JOB was only completable by an
  // undisclosed garage payment.
  const seen = game.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 520);
  if (!seen && game.wanted > 0 && (!game.heli || !game.heli.marked)) {
    game.heat = Math.max(0, game.heat - dt * 0.05);
    if (game.heat <= 0) {
      game.wanted = Math.max(0, game.wanted - 1);
      game.heat = game.wanted > 0 ? 1 : 0;
    }
  } else if (seen) {
    game.heat = 1;
  }
}

// --- Helicopter air unit (4+ stars) -------------------------------------
// One heli circles the player at altitude with a searchlight. It is a real
// presence now, not a label: it flies low and close enough to stay in the
// chase camera's frame (alt 120, orbit 190), its searchlight cone tracks
// the player, and while it marks them the heat never cools and ground
// units close 25% faster (see updatePolice). Lose the stars and it leaves.
// The air unit is not omniscient: if the player stays out of every ground
// cop's sight for 25 s it loses the mark (heat can cool again), and after
// 30 s unseen it departs — then it stays away for 45 s (heliReturnIn) so
// the escape can actually land. A fresh crime at 4+ stars calls it straight
// back (addWanted clears the timer).
function updateHeli(game, dt) {
  const p = game.player;
  if (game.heliReturnIn > 0) game.heliReturnIn -= dt;
  if (game.wanted >= 4) {
    const ahead = p.inCar ? p.inCar.angle : p.angle;
    if (!game.heli) {
      if (game.heliReturnIn > 0) return; // still searching elsewhere
      game.heli = { x: p.x + Math.cos(ahead) * 150, y: p.y + Math.sin(ahead) * 150, angle: 0, rotor: 0, alt: 120, marked: true, orbitT: 0, lostTimer: 0 };
      game.banner = { text: 'SOLMAR PD AIR UNIT — helicopter overhead', life: 3 };
    }
    const h = game.heli;
    if (h.lostTimer === undefined) h.lostTimer = 0; // staged helis lack it
    h.rotor += dt * 22;
    h.orbitT += dt * 0.25;
    // Work the player's forward arc, swinging side to side ahead of them,
    // instead of a full circle: a full circle spent a third of its orbit
    // behind the chase camera (invisible), while the air unit's job is to
    // keep eyes on the player — and the chase camera keeps it in frame.
    const sweep = Math.sin(h.orbitT) * 0.9; // +/- ~52 deg around facing
    const ang = ahead + sweep;
    const r = 150;
    h.x = p.x + Math.cos(ang) * r;
    h.y = p.y + Math.sin(ang) * r;
    h.angle = ang + Math.PI / 2;
    // Lost trail: unseen by every ground cop for 25 s and the mark drops
    // (banner tells the player the escape is working); 30 s and the air
    // unit departs for 45 s. Any sighting resets the clock.
    const seen = game.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 520);
    if (!seen) h.lostTimer += dt; else h.lostTimer = 0;
    if (h.marked && h.lostTimer > 25) {
      h.marked = false;
      game.banner = { text: 'SOLMAR PD AIR UNIT LOST YOU — stay out of sight', life: 3 };
    }
    if (h.lostTimer > 30) {
      game.heli = null;
      game.heliReturnIn = 45;
    }
  } else if (game.heli && game.wanted < 3) {
    game.heli = null;
    game.heliReturnIn = 0;
  }
}

// --- Roadblocks (3+ stars) -----------------------------------------------
// Two PD cruisers parked bumper to bumper across the road ahead of the
// player, with two officers on foot. They are real vehicles: ram through
// them or go around. A new block is set each time the wanted level climbs
// to 3+ after having been clear.
function updateRoadblocks(game, rng) {
  if (game.wanted >= 3 && !game.roadblockSet) {
    game.roadblockSet = true;
    const p = game.player;
    // 420 px ahead of the player's facing, on the road.
    const aheadX = p.x + Math.cos(p.angle) * 420;
    const aheadY = p.y + Math.sin(p.angle) * 420;
    const perp = p.angle + Math.PI / 2;
    const block = [];
    for (const off of [-34, 34]) {
      const cx = aheadX + Math.cos(perp) * off;
      const cy = aheadY + Math.sin(perp) * off;
      const car = createVehicle('police', cx, cy, perp);
      game.vehicles.push(car);
      block.push(car);
      const cop = createCop(cx + Math.cos(p.angle) * 30, cy + Math.sin(p.angle) * 30, null);
      game.cops.push(cop);
    }
    game.roadblocks = block;
    game.banner = { text: 'ROADBLOCK AHEAD — PD has sealed the street', life: 3 };
  } else if (game.wanted === 0) {
    game.roadblockSet = false;
    game.roadblocks = [];
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
  spawnParticles(game, p.x, p.y, 0.4, '#c0392b', 6);
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
  game.heli = null;
  game.roadblockSet = false;
  game.roadblocks = [];
  game.audio.cash();
  return { ok: true, reason: '' };
}
