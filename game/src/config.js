// SOLMAR HEAT — shared tuning, districts, vehicles and weapons.
// One place for every number the rest of the game reads, so balancing is a
// single edit here instead of a hunt through the modules.

export const TILE = 32;
export const MAP_W = 64;
export const MAP_H = 64;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

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

export const VEHICLES = [
  { id: 'sedan', name: 'Vulcar Sedan', color: '#7d8aa0', topSpeed: 340, accel: 210, grip: 2.6, health: 100 },
  { id: 'taxi', name: 'Solmar Taxi', color: '#e8b73a', topSpeed: 330, accel: 200, grip: 2.6, health: 100 },
  { id: 'coupe', name: 'Bravado Coupe', color: '#a03a3a', topSpeed: 380, accel: 250, grip: 2.9, health: 90 },
  { id: 'van', name: 'Benson Van', color: '#5a7d5a', topSpeed: 290, accel: 170, grip: 2.2, health: 140 },
  { id: 'truck', name: 'Mule Truck', color: '#8a7d5a', topSpeed: 270, accel: 150, grip: 2.0, health: 180 },
  { id: 'sports', name: 'Pfister Comet', color: '#d4a03a', topSpeed: 430, accel: 300, grip: 3.4, health: 80 },
  { id: 'police', name: 'Solmar PD Cruiser', color: '#2f4a7d', topSpeed: 400, accel: 280, grip: 3.1, health: 130 },
];

export const WEAPONS = [
  { id: 'fists', name: 'Fists', damage: 12, rate: 0.35, range: 46, mag: Infinity, price: 0, auto: false },
  { id: 'pistol', name: 'Pistol', damage: 22, rate: 0.28, range: 340, mag: 12, price: 350, auto: false },
  { id: 'smg', name: 'SMG', damage: 14, rate: 0.09, range: 300, mag: 30, price: 1200, auto: true },
  { id: 'shotgun', name: 'Shotgun', damage: 16, rate: 0.8, range: 220, mag: 6, price: 900, auto: false, pellets: 5 },
  { id: 'rifle', name: 'Rifle', damage: 55, rate: 0.7, range: 520, mag: 8, price: 2400, auto: false },
];

export const SHOPS = {
  gunsmith: { name: 'Ironworks Gunsmith', district: 'ironworks' },
  garage: { name: 'Pit Stop Garage', district: 'harbor' },
  clinic: { name: 'Sunshine Clinic', district: 'beach' },
};

export const WANTED_NAMES = ['Clean', 'Suspect', 'Fugitive', 'Most Wanted', 'Manhunt', 'Lockdown'];
export const MAX_WANTED = 5;

// Day length in real seconds for a full 24h cycle.
export const DAY_LENGTH = 360;
export const START_MINUTES = 9 * 60 + 20; // 09:20, golden morning
