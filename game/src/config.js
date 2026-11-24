// SOLMAR HEAT — shared tuning, districts, vehicles and weapons.
// One place for every number the rest of the game reads, so balancing is a
// single edit here instead of a hunt through the modules.
// All names here are our own originals: Solmar City, its people and its
// cars were invented for this game — nothing is borrowed from another game.

export const TILE = 32;
export const MAP_W = 64;
export const MAP_H = 64;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

// 3D scale: one 2D world pixel is 0.1 three.js units, and the 3D origin
// sits at the centre of the map (world px 1024,1024 -> 0,0).
export const SCALE3D = 0.1;
export const HALF3D = (WORLD_W * SCALE3D) / 2;
export function pxTo3X(px) { return px * SCALE3D - HALF3D; }
export function pxTo3Z(py) { return py * SCALE3D - HALF3D; }

// Tile kinds in world.tiles
export const T = { BLOCK: 0, ROAD: 1, WALK: 2, PARK: 3, BEACH: 4, WATER: 5 };

// City districts, laid out west to east, north to south (64x64 map).
export const DISTRICTS = [
  { id: 'downtown', name: 'Downtown Solmar', x0: 4, y0: 4, x1: 30, y1: 26, palette: ['#3a4a6b', '#4a5a7d', '#2f3d5c', '#55648a'], skyline: true },
  { id: 'ironworks', name: 'Ironworks', x0: 34, y0: 4, x1: 60, y1: 26, palette: ['#5c4a3a', '#6b5644', '#4a3d33', '#7a6550'], skyline: false },
  { id: 'central', name: 'Central Park', x0: 4, y0: 30, x1: 30, y1: 42, palette: ['#2f5c3a', '#3a6b45', '#27512f', '#4a7d55'], skyline: false },
  { id: 'harbor', name: 'Harbor District', x0: 34, y0: 30, x1: 60, y1: 42, palette: ['#3a5c6b', '#446b7d', '#2f4a5c', '#557a8a'], skyline: false },
  { id: 'beach', name: 'Solmar Beach', x0: 4, y0: 46, x1: 60, y1: 58, palette: ['#c2a878', '#d4bc8a', '#b39a6b', '#e0c896'], skyline: false },
];

// District standing: -100 (hated) .. +100 (respected). Earned by finishing
// jobs and fares in a district, lost by hurting bystanders there.
export function districtAtPoint(x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  for (const d of DISTRICTS) {
    if (tx >= d.x0 && tx <= d.x1 && ty >= d.y0 && ty <= d.y1) return d;
  }
  return DISTRICTS[0];
}

export const VEHICLES = [
  { id: 'sedan', name: 'Meridian Sedan', color: '#7d8aa0', topSpeed: 340, accel: 210, grip: 2.6, health: 100 },
  { id: 'taxi', name: 'Solmar Taxi', color: '#e8b73a', topSpeed: 330, accel: 200, grip: 2.6, health: 100 },
  { id: 'coupe', name: 'Vortex Coupe', color: '#a03a3a', topSpeed: 380, accel: 250, grip: 2.9, health: 90 },
  { id: 'van', name: 'Harbor Van', color: '#5a7d5a', topSpeed: 290, accel: 170, grip: 2.2, health: 140 },
  { id: 'truck', name: 'Atlas Hauler', color: '#8a7d5a', topSpeed: 270, accel: 150, grip: 2.0, health: 180 },
  { id: 'sports', name: 'Nova GT', color: '#d4a03a', topSpeed: 430, accel: 300, grip: 3.4, health: 80 },
  { id: 'police', name: 'Solmar PD Cruiser', color: '#2f4a7d', topSpeed: 400, accel: 280, grip: 3.1, health: 130 },
];

// Gunsmith prices are early-game prices on purpose: the whole arsenal
// costs $1,200 — affordable on legitimate mission income (jobs 1-4 pay
// $300 + $450 + $600 + $800), so a real playthrough can buy and test
// every weapon without a cheat. The pistol stays $350 as the starter gun.
export const WEAPONS = [
  { id: 'fists', name: 'Fists', damage: 12, rate: 0.35, range: 46, mag: Infinity, price: 0, auto: false },
  { id: 'pistol', name: 'Pistol', damage: 22, rate: 0.28, range: 340, mag: 12, price: 350, auto: false },
  { id: 'smg', name: 'SMG', damage: 14, rate: 0.09, range: 300, mag: 30, price: 250, auto: true },
  { id: 'shotgun', name: 'Shotgun', damage: 16, rate: 0.8, range: 220, mag: 6, price: 200, auto: false, pellets: 5 },
  { id: 'rifle', name: 'Rifle', damage: 55, rate: 0.7, range: 520, mag: 8, price: 300, auto: false, scope: true },
  { id: 'sniper', name: 'Sniper', damage: 120, rate: 1.1, range: 800, mag: 5, price: 200, auto: false, scope: true },
  { id: 'bazooka', name: 'Bazooka', damage: 150, rate: 1.4, range: 400, mag: 1, price: 250, auto: false, explosive: true, aoe: 110 },
];

export const SHOPS = {
  gunsmith: { name: 'Ironworks Gunsmith', district: 'ironworks' },
  garage: { name: 'Pit Stop Garage', district: 'harbor' },
  clinic: { name: 'Sunshine Clinic', district: 'beach' },
};

export const WANTED_NAMES = ['Clean', 'Suspect', 'Fugitive', 'Most Wanted', 'Manhunt', 'Lockdown'];
export const MAX_WANTED = 5;

// The crew: three original characters with one ability each (see crew.js).
export const CREW = [
  { id: 'nia', key: 'Q', name: 'Nia Solano', role: 'Mechanic', ability: 'Field Repair', desc: 'Repairs your car to full, or +50 armor on foot', cooldown: 45 },
  { id: 'ivy', key: 'F', name: 'Ivy Quinn', role: 'Lookout', ability: 'Ghost', desc: 'Drops your wanted level by 1 star', cooldown: 90 },
  { id: 'rook', key: 'C', name: 'Tessa "Rook" Vane', role: 'Getaway Driver', ability: 'Slipstream', desc: 'Police lose your trail: heat resets, +speed for 8s', cooldown: 60 },
];

// Street race: start at the beachfront, 4 checkpoints across the city.
export const RACE = {
  start: { x: 32 * TILE + 16, y: 56 * TILE + 16 },
  checkpoints: [
    { x: 48 * TILE + 16, y: 48 * TILE + 16 },
    { x: 56 * TILE + 16, y: 24 * TILE + 16 },
    { x: 24 * TILE + 16, y: 8 * TILE + 16 },
    { x: 8 * TILE + 16, y: 40 * TILE + 16 },
  ],
  reward: 800,
  parSeconds: 150,
};

// Day length in real seconds for a full 24h cycle.
export const DAY_LENGTH = 360;
// SOLMAR HEAT is a cool-night game: the day/night cycle is night-dominant
// and the story opens at 21:40, under neon and headlights.
export const START_MINUTES = 21 * 60 + 40; // 21:40, cool night
