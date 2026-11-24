// Combat: the five weapons, hitscan shooting with tracers, and pickups
// (health, ammo, cash) dropped by the world and by fallen enemies.
import { WEAPONS } from './config.js';
import { damageVehicle } from './vehicles.js';

// Per-weapon held shapes the renderer draws in the shooter's hands:
// length/width in px plus the details that tell them apart at a glance.
export const WEAPON_SHAPES = {
  fists: { len: 0, wid: 0, kind: 'melee' },
  pistol: { len: 15, wid: 5, kind: 'pistol' },
  smg: { len: 22, wid: 6, kind: 'smg', mag: true },
  shotgun: { len: 28, wid: 7, kind: 'shotgun', pump: true },
  rifle: { len: 30, wid: 6, kind: 'rifle', scope: true },
  sniper: { len: 34, wid: 5, kind: 'sniper', scope: true },
  bazooka: { len: 34, wid: 9, kind: 'bazooka', tube: true },
};

// --- Particle pool -------------------------------------------------------
// game.particles is a fixed pool (preallocated by main.js at boot): each
// slot is one spark with a velocity, alive while life > 0. Spawning reuses
// a dead slot instead of allocating an object, and nothing ever splices
// the pool — dead slots are simply skipped. Bullets are hitscan (no
// bullet objects exist), and skid marks are a per-car flag, so particles
// are the only pooled effect; tracers are capped below instead.
export function spawnParticles(game, x, y, life, color, count) {
  const pool = game.particles;
  let made = 0;
  for (let i = 0; i < pool.length && made < count; i++) {
    const pt = pool[i];
    if (pt.life > 0) continue;
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    pt.x = x + (Math.random() - 0.5) * 14;
    pt.y = y + (Math.random() - 0.5) * 14;
    pt.vx = Math.cos(a) * sp;
    pt.vy = Math.sin(a) * sp;
    pt.life = life * (0.7 + Math.random() * 0.6);
    pt.maxLife = pt.life;
    pt.color = color;
    made++;
  }
  return made;
}

export function weaponShape(id) {
  return WEAPON_SHAPES[id] || WEAPON_SHAPES.fists;
}

export function weaponDef(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

export function createArsenal() {
  return {
    owned: ['fists', 'pistol'],
    current: 'pistol',
    ammo: { pistol: 48, smg: 0, shotgun: 0, rifle: 0, sniper: 0, bazooka: 0 },
    reserve: { pistol: 48, smg: 0, shotgun: 0, rifle: 0, sniper: 0, bazooka: 0 },
  };
}

export function buyWeapon(arsenal, id, money) {
  const def = weaponDef(id);
  if (arsenal.owned.includes(id)) return { ok: false, money, reason: 'already owned' };
  if (money < def.price) return { ok: false, money, reason: 'not enough cash' };
  arsenal.owned.push(id);
  arsenal.ammo[id] = def.mag * 2;
  arsenal.reserve[id] = def.mag * 2;
  arsenal.current = id;
  return { ok: true, money: money - def.price, reason: '' };
}

export function shoot(game, fromX, fromY, angle) {
  const arsenal = game.arsenal;
  const def = weaponDef(arsenal.current);
  if (game.player.shootTimer > 0) return false;
  if (def.id !== 'fists' && (arsenal.ammo[def.id] ?? 0) <= 0) {
    game.audio.shot('dry');
    game.player.shootTimer = 0.25;
    return false;
  }
  game.player.shootTimer = def.rate;
  if (def.id !== 'fists') arsenal.ammo[def.id] -= 1;
  // The bazooka is not hitscan: it lobs a real rocket that flies, trails
  // smoke, and detonates on impact or at max range (see updateProjectiles).
  if (def.id === 'bazooka') {
    game.projectiles = game.projectiles || [];
    game.projectiles.push({ x: fromX, y: fromY, angle, speed: 620, traveled: 0, range: def.range, px: fromX, py: fromY });
    game.audio.shot('bazooka');
    game.stats.shotsFired = (game.stats.shotsFired || 0) + 1;
    const shape = weaponShape(def.id);
    game.muzzle = {
      x: fromX + Math.cos(angle) * (shape.len + 12),
      y: fromY + Math.sin(angle) * (shape.len + 12),
      angle, life: 0.07,
    };
    return true;
  }
  const pellets = def.pellets || 1;
  let hitAnything = false;
  for (let i = 0; i < pellets; i++) {
    // A scoped rifle/sniper shot has no spread: the scope is what makes
    // the long shot land (see game.scoped in main.js).
    const spread = game.scoped ? 0 : (Math.random() - 0.5) * (def.id === 'shotgun' ? 0.22 : 0.05);
    const a = angle + spread;
    const ex = fromX + Math.cos(a) * def.range;
    const ey = fromY + Math.sin(a) * def.range;
    // Tracers are capped: a full-auto spray never grows the array past
    // 64 segments (the renderer reuses one preallocated line buffer).
    if (game.tracers.length < 64) game.tracers.push({ x1: fromX, y1: fromY, x2: ex, y2: ey, life: 0.08 });
    const target = nearestTarget(game, fromX, fromY, a, def.range);
    if (target) {
      hitAnything = true;
      applyHit(game, target, def);
    }
  }
  game.audio.shot(def.id);
  game.stats.shotsFired = (game.stats.shotsFired || 0) + 1;
  // Muzzle flash at the tip of the held weapon (drawn by drawEffects).
  const shape = weaponShape(def.id);
  if (shape.len > 0) {
    game.muzzle = {
      x: fromX + Math.cos(angle) * (shape.len + 12),
      y: fromY + Math.sin(angle) * (shape.len + 12),
      angle, life: 0.07,
    };
  }
  return hitAnything;
}

// --- Bazooka rockets -------------------------------------------------------
// A rocket flies straight at 620 px/s, leaves a smoke trail (one tracer
// segment + a particle per frame), and detonates on impact — a building,
// a car, a person — or at max range. The detonation is real AoE damage,
// not a hitscan with a fireball pasted on.
export function updateProjectiles(game, dt) {
  if (!game.projectiles || game.projectiles.length === 0) return;
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const r = game.projectiles[i];
    const nx = r.x + Math.cos(r.angle) * r.speed * dt;
    const ny = r.y + Math.sin(r.angle) * r.speed * dt;
    r.traveled += r.speed * dt;
    if (game.tracers.length < 64) game.tracers.push({ x1: r.px, y1: r.py, x2: nx, y2: ny, life: 0.12 });
    spawnParticles(game, nx, ny, 0.4, '#8a8f96', 1);
    r.px = nx; r.py = ny;
    r.x = nx; r.y = ny;
    let boom = r.traveled >= r.range;
    if (!boom && game.world.buildingAt(nx, ny)) boom = true;
    if (!boom) {
      for (const v of game.vehicles) {
        if (!v.dead && v !== game.player.inCar && Math.hypot(v.x - nx, v.y - ny) < 24) { boom = true; break; }
      }
    }
    if (!boom) {
      for (const ped of game.peds) {
        if (!ped.dead && Math.hypot(ped.x - nx, ped.y - ny) < 20) { boom = true; break; }
      }
    }
    if (!boom) {
      for (const cop of game.cops) {
        if (!cop.dead && Math.hypot(cop.x - nx, cop.y - ny) < 20) { boom = true; break; }
      }
    }
    if (boom) {
      explodeBazooka(game, nx, ny);
      game.projectiles[i] = game.projectiles[game.projectiles.length - 1];
      game.projectiles.pop();
    }
  }
}

export function explodeBazooka(game, x, y) {
  const def = weaponDef('bazooka');
  const radius = def.aoe || 110;
  const damage = def.damage;
  game.explosions.push({ x, y, life: 1 });
  spawnParticles(game, x, y, 0.9, '#e8762a', 16);
  spawnParticles(game, x, y, 0.6, '#3a3a3a', 8);
  game.audio.crash();
  const p = game.player;
  for (const ped of game.peds) {
    if (!ped.dead && Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.dead = true;
      game.stats.kills = (game.stats.kills || 0) + 1;
      addWanted(game, 1);
      dropPickup(game, ped.x, ped.y, 'cash', 25);
    }
  }
  for (const cop of game.cops) {
    if (!cop.dead && Math.hypot(cop.x - x, cop.y - y) < radius) {
      cop.health -= damage;
      game.audio.hit();
      if (cop.health <= 0) {
        cop.dead = true;
        game.stats.kills = (game.stats.kills || 0) + 1;
        addWanted(game, 1);
        const m = game.mission;
        if (cop.enemy && m && m.def.steps[m.stepIndex] && m.def.steps[m.stepIndex].type === 'kill' && m.def.steps[m.stepIndex].kind === cop.kind) {
          m.kills += 1;
        }
        dropPickup(game, cop.x, cop.y, 'ammo', 12);
      }
    }
  }
  for (const v of game.vehicles) {
    if (!v.dead && v !== p.inCar && Math.hypot(v.x - x, v.y - y) < radius) {
      const wasDead = v.dead;
      damageVehicle(v, damage);
      game.audio.hit();
      if (v.dead && !wasDead) addWanted(game, 1);
    }
  }
  // Close-range backblast hurts the shooter too — a bazooka is not a toy.
  // (Inline armor/health math, not damagePlayer(): that lives in
  // police.js, which imports this module — a cross-import would cycle.)
  if (!p.inCar && Math.hypot(p.x - x, p.y - y) < 70) {
    let rest = 20;
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
}

function nearestTarget(game, x, y, angle, range) {
  let best = null;
  let bestD = range;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  function consider(tx, ty, radius, kind, ref) {
    const dx = tx - x;
    const dy = ty - y;
    const along = dx * ux + dy * uy;
    if (along < 0 || along > bestD) return;
    const perp = Math.abs(-dx * uy + dy * ux);
    if (perp < radius + 8) {
      best = { kind, ref, dist: along };
      bestD = along;
    }
  }
  for (const ped of game.peds) {
    if (!ped.dead) consider(ped.x, ped.y, ped.radius, 'ped', ped);
  }
  for (const cop of game.cops) {
    if (!cop.dead) consider(cop.x, cop.y, cop.radius, 'cop', cop);
  }
  for (const v of game.vehicles) {
    if (!v.dead && v !== game.player.inCar) consider(v.x, v.y, 20, 'car', v);
  }
  return best;
}

function applyHit(game, target, def) {
  if (target.kind === 'ped') {
    target.ref.dead = true;
    spawnParticles(game, target.ref.x, target.ref.y, 0.6, '#a03a3a', 8);
    game.stats.kills = (game.stats.kills || 0) + 1;
    addWanted(game, 1);
    dropPickup(game, target.ref.x, target.ref.y, 'cash', 25);
  } else if (target.kind === 'cop') {
    target.ref.health -= def.damage;
    game.audio.hit();
    if (target.ref.health <= 0) {
      target.ref.dead = true;
      game.stats.kills = (game.stats.kills || 0) + 1;
      addWanted(game, 1);
      // Mission kill steps count only enemies of the right kind.
      const m = game.mission;
      if (target.ref.enemy && m && m.def.steps[m.stepIndex] && m.def.steps[m.stepIndex].type === 'kill' && m.def.steps[m.stepIndex].kind === target.ref.kind) {
        m.kills += 1;
      }
      dropPickup(game, target.ref.x, target.ref.y, 'ammo', 12);
    }
  } else if (target.kind === 'car') {
    const wasDead = target.ref.dead;
    damageVehicle(target.ref, def.damage);
    game.audio.hit();
    if (target.ref.dead && !wasDead) {
      spawnParticles(game, target.ref.x, target.ref.y, 0.9, '#e8762a', 16);
      game.audio.crash();
      addWanted(game, 1);
    }
  }
}

export function addWanted(game, amount) {
  game.wanted = Math.min(5, game.wanted + amount);
  game.heat = 1;
  // A fresh crime at 4+ stars calls the air unit straight back, even if
  // it had just lost the trail (see updateHeli).
  if (game.wanted >= 4) game.heliReturnIn = 0;
}

export function dropPickup(game, x, y, kind, value) {
  game.pickups.push({ x, y, kind, value, life: 25, bob: Math.random() * 6 });
}

export function updatePickups(game, dt) {
  const p = game.player;
  // In-place swap-with-last removal: no filter() allocation per frame,
  // no splice() shifting the tail on every pickup.
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const pk = game.pickups[i];
    pk.life -= dt;
    const d = Math.hypot(pk.x - p.x, pk.y - p.y);
    if (d < 30) {
      pk.life = 0;
      if (pk.kind === 'cash') {
        game.money += pk.value;
        game.audio.cash();
      } else if (pk.kind === 'health') {
        p.health = Math.min(100, p.health + pk.value);
        game.audio.pickup();
      } else if (pk.kind === 'ammo') {
        const def = weaponDef(game.arsenal.current);
        if (def.id !== 'fists') {
          game.arsenal.ammo[def.id] = (game.arsenal.ammo[def.id] || 0) + pk.value;
          game.audio.pickup();
        }
      }
    }
    if (pk.life <= 0) {
      game.pickups[i] = game.pickups[game.pickups.length - 1];
      game.pickups.pop();
    }
  }
}

export function reloadWeapon(game) {
  const arsenal = game.arsenal;
  const def = weaponDef(arsenal.current);
  if (def.id === 'fists') return;
  const need = def.mag - (arsenal.ammo[def.id] || 0);
  if (need <= 0) return;
  const take = Math.min(need, arsenal.reserve[def.id] || 0);
  if (take <= 0) return;
  arsenal.ammo[def.id] = (arsenal.ammo[def.id] || 0) + take;
  arsenal.reserve[def.id] -= take;
  game.player.shootTimer = Math.max(game.player.shootTimer, 0.6);
  game.audio.ui();
}
