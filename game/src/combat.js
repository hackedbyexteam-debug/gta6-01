// Combat: the five weapons, hitscan shooting with tracers, and pickups
// (health, ammo, cash) dropped by the world and by fallen enemies.
import { WEAPONS } from './config.js';
import { damageVehicle } from './vehicles.js';

export function weaponDef(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

export function createArsenal() {
  return {
    owned: ['fists', 'pistol'],
    current: 'pistol',
    ammo: { pistol: 48, smg: 0, shotgun: 0, rifle: 0 },
    reserve: { pistol: 48, smg: 0, shotgun: 0, rifle: 0 },
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
  const pellets = def.pellets || 1;
  let hitAnything = false;
  for (let i = 0; i < pellets; i++) {
    const spread = (Math.random() - 0.5) * (def.id === 'shotgun' ? 0.22 : 0.05);
    const a = angle + spread;
    const ex = fromX + Math.cos(a) * def.range;
    const ey = fromY + Math.sin(a) * def.range;
    game.tracers.push({ x1: fromX, y1: fromY, x2: ex, y2: ey, life: 0.08 });
    const target = nearestTarget(game, fromX, fromY, a, def.range);
    if (target) {
      hitAnything = true;
      applyHit(game, target, def);
    }
  }
  game.audio.shot(def.id);
  game.stats.shotsFired = (game.stats.shotsFired || 0) + 1;
  return hitAnything;
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
    game.particles.push({ x: target.ref.x, y: target.ref.y, life: 0.6, color: '#a03a3a', n: 8 });
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
      game.particles.push({ x: target.ref.x, y: target.ref.y, life: 0.9, color: '#e8762a', n: 16 });
      game.audio.crash();
      addWanted(game, 1);
    }
  }
}

export function addWanted(game, amount) {
  game.wanted = Math.min(5, game.wanted + amount);
  game.heat = 1;
}

export function dropPickup(game, x, y, kind, value) {
  game.pickups.push({ x, y, kind, value, life: 25, bob: Math.random() * 6 });
}

export function updatePickups(game, dt) {
  const p = game.player;
  for (const pk of game.pickups) {
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
  }
  game.pickups = game.pickups.filter((pk) => pk.life > 0);
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
