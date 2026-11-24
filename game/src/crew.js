// Crew abilities: Dario Kane's three original crew members, each with one
// ability on a cooldown. Triggered with Q / F / C. Pure logic — the HUD
// (hud.js) draws the cooldowns, the 3D renderer shows the effect.
import { CREW } from './config.js';
import { repairVehicle } from './vehicles.js';

export function createCrewState() {
  const state = { cooldowns: {}, boostUntil: 0, now: 0 };
  for (const c of CREW) state.cooldowns[c.id] = 0;
  return state;
}

export function crewReady(game, id) {
  return (game.crew.cooldowns[id] || 0) <= 0;
}

export function crewCooldownLeft(game, id) {
  return Math.max(0, game.crew.cooldowns[id] || 0);
}

export function updateCrew(game, dt) {
  game.crew.now += dt;
  for (const id of Object.keys(game.crew.cooldowns)) {
    game.crew.cooldowns[id] = Math.max(0, game.crew.cooldowns[id] - dt);
  }
}

// Fire one crew ability. Returns a banner line, or null when on cooldown.
export function triggerCrew(game, id) {
  const def = CREW.find((c) => c.id === id);
  if (!def) return null;
  if (!crewReady(game, id)) {
    return `${def.ability} recharging — ${Math.ceil(crewCooldownLeft(game, id))}s`;
  }
  game.crew.cooldowns[id] = def.cooldown;
  const p = game.player;
  if (id === 'nia') {
    // Mechanic: field repair. In a car the car is fixed; on foot Dario
    // gets +50 armor from Nia's kit.
    if (p.inCar) {
      repairVehicle(p.inCar);
      return 'NIA — Field Repair: car fixed';
    }
    p.armor = Math.min(100, p.armor + 50);
    return 'NIA — Field Repair: +50 armor';
  }
  if (id === 'ivy') {
    // Lookout: Ghost — one wanted star melts away.
    if (game.wanted <= 0) return 'IVY — Ghost: already clean, no stars to drop';
    game.wanted = Math.max(0, game.wanted - 1);
    game.heat = 0;
    return 'IVY — Ghost: wanted down 1 star';
  }
  // Rook: Slipstream — the PD loses the trail and the car gets a boost.
  game.heat = 0;
  game.crew.boostUntil = game.crew.now + 8;
  if (p.inCar) p.inCar.speed *= 1.25;
  return 'ROOK — Slipstream: heat reset, speed boost 8s';
}

export function slipstreamActive(game) {
  return game.crew.now < game.crew.boostUntil;
}
