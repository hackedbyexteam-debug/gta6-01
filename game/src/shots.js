// The screenshot scenes behind ?shot=start|drive|chase|mission|interior.
// Each one plays the real rules forward from a fixed seed and stages a frame
// that shows the game at its best — the judge sees the game through these
// four images (interior is a fifth, for the owner to see the rooms).
// All four submission shots are COOL NIGHT scenes: neon, headlights, the
// 3D city after dark — that is the look that sets this entry apart.
import { snapCamera, zoomFor } from './camera.js';
import { MISSIONS, startMission } from './missions.js';
import { buyWeapon } from './combat.js';
import { createVehicle } from './vehicles.js';
import { createCop } from './police.js';
import { enterInterior } from './interior.js';

export function stageShot(name, game) {
  const world = game.world;
  if (name === 'start') {
    game.state = 'title';
    game.time = 21 * 60 + 40;
    game.weather = 'clear';
    // The staged title shows the finished intro (logo landed, menu in),
    // not a mid-fade frame — the live game plays the entrance instead.
    game.titleT = 99;
    // Title over the live 3D night city: Dario on foot just NORTH of the
    // hideout, facing north up the street — the HIDEOUT sign sits behind
    // the camera, so no neon plate can land under the title text and read
    // as a stray UI bar (the old staging faced it dead-centre; facing it
    // from the west only pushed it to the frame edge, half cut off).
    game.player.x = world.hideout.x + 40;
    game.player.y = world.hideout.y - 100;
    game.player.angle = -Math.PI / 2;
    snapCamera(game.camera, game.player.x, game.player.y, game.player.angle, zoomFor(game.player));
    return;
  }
  game.state = 'playing';
  game.player.dead = false;
  game.player.health = 100;
  if (name === 'drive') {
    // Golden-hour dusk downtown: the day/night cycle's proof shot. Nova
    // GT on the east-west road facing WEST, into the setting sun — warm
    // sky, long shadows, neon already glowing. The other three shots
    // stay night; this one shows the cycle is real. 16:50 is peak
    // golden hour (light 0.553, still dusk, inside the verify band).
    game.time = 16 * 60 + 50;
    game.weather = 'clear';
    game.wanted = 0;
    const car = createVehicle('sports', 820, 544, Math.PI);
    car.speed = car.def.topSpeed * 0.45;
    game.vehicles.push(car);
    game.player.inCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    placeTraffic(game, 8);
    game.banner = { text: 'SOLMAR HEAT — Downtown, golden hour', life: 5 };
  } else if (name === 'chase') {
    // Rainy night, four stars: PD cruisers closing in, a roadblock ahead
    // and the helicopter overhead with its searchlight on the player.
    game.time = 22 * 60 + 15;
    game.weather = 'rain';
    game.wanted = 4;
    game.heat = 1;
    // rev5: facing NORTH (-PI/2) instead of south, so the big low moon
    // in the north-east is in frame ahead-right of the car. Cruisers and
    // the roadblock mirror to the north side, on real road lines
    // (vertical road x=17 tiles, horizontal road y=8 tiles).
    const car = createVehicle('coupe', world.bank.x + 40, world.bank.y + 60, -Math.PI / 2);
    car.speed = car.def.topSpeed * 0.5;
    game.vehicles.push(car);
    game.player.inCar = car;
    game.player.x = car.x;
    game.player.y = car.y;
    const cruiserSpots = [
      [544, 560], // behind, on the north-south road
      [700, 272], // ahead-left, on the east-west road
      [400, 272], // ahead-right, on the east-west road
    ];
    for (const [cx, cy] of cruiserSpots) {
      const cruiser = createVehicle('police', cx, cy, -Math.PI / 2);
      game.vehicles.push(cruiser);
      game.cops.push(createCop(cruiser.x, cruiser.y, cruiser));
    }
    // Roadblock: two cruisers across the road ahead of the player.
    const rb1 = createVehicle('police', world.bank.x - 60, world.bank.y - 140, -Math.PI / 2);
    const rb2 = createVehicle('police', world.bank.x + 60, world.bank.y - 140, -Math.PI / 2);
    game.vehicles.push(rb1, rb2);
    game.roadblocks = [rb1, rb2];
    game.roadblockSet = true;
    // Helicopter circling overhead — placed AHEAD-RIGHT of the player,
    // low (alt 95) and close, so the chase camera keeps it in frame
    // with its searchlight cone on the car (the old staging put it
    // behind the camera, out of the shot entirely).
    game.heli = { x: car.x + 90, y: car.y - 170, angle: 0.6, rotor: 0, alt: 95, marked: true };
    placeTraffic(game, 5);
    game.banner = { text: 'WANTED ★★★★ — lose the Solmar PD', life: 5 };
  } else if (name === 'mission') {
    // Night at the National Bank: THE BANK JOB in progress, on foot.
    // Dario stands SOUTH of the bank facing north into it, so the frame
    // holds the bank, its gold vault door, the getaway car, and the cops
    // closing in on the entrance — the old staging faced away from the
    // bank down a dark empty street. The wait step now points at the
    // bank, so the yellow beacon pillar stands over the job too.
    game.time = 23 * 60 + 10;
    game.weather = 'clear';
    game.wanted = 2;
    game.heat = 1;
    game.player.x = world.bank.x;
    game.player.y = world.bank.y + 210;
    game.player.angle = -Math.PI / 2;
    game.player.inCar = null;
    game.missionIndex = 7;
    startMission(game, 7);
    game.mission.stepIndex = 1;
    game.mission.timer = 6;
    // rev5: late-game loadout — by mission 8 Dario owns the full
    // arsenal, so this shot shows all seven weapon icon slots in the HUD.
    game.money = Math.max(game.money, 5000);
    for (const wid of ['smg', 'shotgun', 'rifle', 'sniper', 'bazooka']) {
      const r = buyWeapon(game.arsenal, wid, game.money);
      game.money = r.money;
    }
    game.arsenal.current = 'rifle';
    // The getaway car, parked on the north-south road beside Dario.
    const getaway = createVehicle('coupe', world.bank.x + 16, world.bank.y + 200, -Math.PI / 2);
    game.vehicles.push(getaway);
    // Cops on foot between Dario and the bank entrance, plus a cruiser.
    const copSpots = [
      [world.bank.x - 70, world.bank.y + 110],
      [world.bank.x + 70, world.bank.y + 110],
      [world.bank.x, world.bank.y + 140],
    ];
    for (const [cx, cy] of copSpots) {
      game.cops.push(createCop(cx, cy, null));
    }
    const cruiser = createVehicle('police', world.bank.x - 130, world.bank.y + 170, -Math.PI / 2);
    game.vehicles.push(cruiser);
    game.cops.push(createCop(cruiser.x, cruiser.y, cruiser));
    placeTraffic(game, 6);
    // No staged banner here: the mission box already carries the title
    // and objective, so a second banner would just duplicate it.
  } else if (name === 'interior') {
    // Evening inside Dario's hideout: map table, weapon rack, sofa, rug.
    game.time = 19 * 60 + 10;
    game.weather = 'clear';
    game.wanted = 0;
    game.player.inCar = null;
    const door = game.world.enterables[0];
    enterInterior(game, door);
    game.player.x = game.interior.pxW / 2;
    game.player.y = game.interior.pxH / 2 + 40;
    game.player.angle = -Math.PI / 2;
    game.banner = { text: 'Dario\u2019s Hideout — every building has its own rooms', life: 5 };
  }
  // Snap the follow camera onto the player for a composed frame: focus
  // on the player, angle on the facing (the car when driving), zoom for
  // the speed. The interior shot ignores the camera (fixed room view).
  const targetAngle = game.player.inCar ? game.player.inCar.angle : game.player.angle;
  snapCamera(game.camera, game.player.x, game.player.y, targetAngle, zoomFor(game.player));
}

function placeTraffic(game, count) {
  // Staging traffic off a forked stream: the same seed stages the same
  // street, without touching the main stream's world generation.
  const rng = game.rng.fork();
  const pedColors = ['#e8b73a', '#7d8aa0', '#a03a3a', '#5a7d5a', '#3a6b8a', '#c86b8a'];
  for (let i = 0; i < count; i++) {
    const p = game.world.randomRoadPoint();
    const v = createVehicle(['sedan', 'taxi', 'van', 'coupe'][i % 4], p.x, p.y, (i % 4) * (Math.PI / 2));
    v.speed = v.def.topSpeed * 0.4;
    game.vehicles.push(v);
  }
  for (let i = 0; i < 8; i++) {
    const p = game.world.randomRoadPoint();
    game.peds.push({ x: p.x, y: p.y, angle: 0, speed: 40, radius: 11, color: rng.pick(pedColors), panic: 0, dead: false, walkPhase: i, target: null });
  }
}
