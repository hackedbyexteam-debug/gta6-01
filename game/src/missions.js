// The story of SOLMAR HEAT: Rico Vega, a wheelman fresh out of a bad deal,
// owes Sal Moretti $40,000 and works it off one job at a time. Twelve
// missions in three acts, each with steps the game tracks — drive somewhere,
// pick something up, lose the cops, or clear a room.
import { addWanted } from './combat.js';

export const CONTACTS = {
  maya: { name: 'Maya Cruz', role: 'Garage owner, your oldest friend', portrait: 'assets/maya.jpg' },
  sal: { name: 'Sal Moretti', role: 'The man you owe $40,000', portrait: 'assets/sal.jpg' },
  lena: { name: 'Lena Voss', role: 'Fixer — jobs, no questions', portrait: 'assets/lena.jpg' },
  eddie: { name: 'Big Eddie', role: 'Arms dealer at the Gunsmith', portrait: 'assets/eddie.jpg' },
};

export const MISSIONS = [
  {
    id: 'first-wheels', act: 1, title: 'FIRST WHEELS', contact: 'maya', reward: 300,
    brief: 'Rico, you need wheels. There is a sedan waiting at the Pit Stop Garage. Bring it to the hideout — and try not to scratch it.',
    steps: [
      { type: 'goto', at: 'garage', text: 'Pick up the sedan at Pit Stop Garage' },
      { type: 'deliver', at: 'hideout', text: 'Drive the sedan to your hideout', needCar: true },
    ],
  },
  {
    id: 'slice-run', act: 1, title: 'SLICE RUN', contact: 'maya', reward: 450,
    brief: 'Slice House is slammed and their driver quit. Pick up the pizzas and get them to the customers before they go cold. Two stops.',
    steps: [
      { type: 'goto', at: 'pizza', text: 'Pick up the pizzas at Slice House' },
      { type: 'deliver', at: 'clinic', text: 'Deliver to the clinic staff' },
      { type: 'deliver', at: 'beach', text: 'Deliver to the beach party', time: 150 },
    ],
  },
  {
    id: 'courier-job', act: 1, title: 'COURIER JOB', contact: 'lena', reward: 600,
    brief: 'A package. No questions, no peeking, no cops. Pick it up at the harbor and take it to the beach house. Keep it quiet.',
    steps: [
      { type: 'goto', at: 'garage', text: 'Pick up the package at the harbor garage' },
      { type: 'deliver', at: 'beach', text: 'Deliver the package to the beach house', time: 120 },
    ],
  },
  {
    id: 'hot-pursuit', act: 1, title: 'HOT PURSUIT', contact: 'sal', reward: 800,
    brief: 'You were seen, Rico. The PD is on you. Lose them — all of them — and get back to the hideout. Sal is watching.',
    steps: [
      { type: 'escape', text: 'Lose the police and reach the hideout', wantedAtStart: 2 },
      { type: 'deliver', at: 'hideout', text: 'Reach your hideout' },
    ],
  },
  {
    id: 'the-wheelman', act: 2, title: 'THE WHEELMAN', contact: 'sal', reward: 1200,
    brief: 'Drive Maya to the National Bank. She does the talking, you do the driving. When the alarm goes off — and it will — get her out.',
    steps: [
      { type: 'goto', at: 'garage', text: 'Pick up Maya at her garage' },
      { type: 'deliver', at: 'bank', text: 'Drive Maya to Solmar National Bank' },
      { type: 'wait', seconds: 12, text: 'Wait while Maya works the vault' },
      { type: 'escape', text: 'Escape the police and reach the hideout', wantedAtStart: 3 },
    ],
  },
  {
    id: 'ironworks-run', act: 2, title: 'IRONWORKS RUN', contact: 'eddie', reward: 1000,
    brief: 'A crate of hardware is sitting at Ironworks and the guards there do not like visitors. Take the crate to the harbor. Loud is fine.',
    steps: [
      { type: 'goto', at: 'gunsmith', text: 'Reach the Ironworks yard' },
      { type: 'kill', count: 4, kind: 'guard', at: 'gunsmith', text: 'Clear the guards at the yard' },
      { type: 'goto', at: 'gunsmith', text: 'Pick up the crate' },
      { type: 'deliver', at: 'garage', text: 'Deliver the crate to the harbor' },
    ],
  },
  {
    id: 'taxi-trouble', act: 2, title: 'TAXI TROUBLE', contact: 'maya', reward: 900,
    brief: 'Maya\u2019s cousin runs the taxi fleet and his drivers all called in sick. Three fares, downtown, no crashing the cab. Tips are yours.',
    steps: [
      { type: 'goto', at: 'garage', text: 'Pick up the taxi at the garage' },
      { type: 'deliver', at: 'bank', text: 'Fare 1: the bank', needCar: true },
      { type: 'deliver', at: 'pizza', text: 'Fare 2: Slice House', needCar: true },
      { type: 'deliver', at: 'beach', text: 'Fare 3: the beach', needCar: true },
    ],
  },
  {
    id: 'the-bank-job', act: 2, title: 'THE BANK JOB', contact: 'sal', reward: 2500,
    brief: 'The big one. The National Bank, midday, in and out. Grab the cash, lose the whole PD, and meet me at the hideout. This clears half your debt.',
    steps: [
      { type: 'deliver', at: 'bank', text: 'Get inside Solmar National Bank' },
      { type: 'wait', seconds: 15, text: 'Crack the vault — stay inside the bank' },
      { type: 'escape', text: 'Escape with the cash — 4 stars', wantedAtStart: 4 },
      { type: 'deliver', at: 'hideout', text: 'Reach the hideout with the cash' },
    ],
  },
  {
    id: 'harbor-heist', act: 3, title: 'HARBOR HEIST', contact: 'lena', reward: 1800,
    brief: 'A Mule truck full of cargo is parked at the harbor and its owner is about to notice. Take it to Ironworks. The PD will notice too.',
    steps: [
      { type: 'goto', at: 'garage', text: 'Reach the harbor truck' },
      { type: 'deliver', at: 'gunsmith', text: 'Drive the truck to Ironworks', needCar: true, wantedAtStart: 3 },
    ],
  },
  {
    id: 'beach-party', act: 3, title: 'BEACH PARTY', contact: 'maya', reward: 1500,
    brief: 'Somebody is crashing Maya\u2019s beach party with guns. Get down there and make them leave. She is counting on you, Rico.',
    steps: [
      { type: 'goto', at: 'beach', text: 'Reach the beach party' },
      { type: 'kill', count: 5, kind: 'attacker', at: 'beach', text: 'Clear the attackers at the beach' },
    ],
  },
  {
    id: 'the-last-score', act: 3, title: 'THE LAST SCORE', contact: 'sal', reward: 3000,
    brief: 'Sal set you up, Rico. His men are waiting at the bank to bury you with the job. Survive the ambush, then take the ledger from Ironworks.',
    steps: [
      { type: 'goto', at: 'bank', text: 'Walk into the ambush at the bank' },
      { type: 'kill', count: 6, kind: 'hitman', at: 'bank', text: 'Survive the ambush' },
      { type: 'goto', at: 'gunsmith', text: 'Take the ledger from Ironworks' },
      { type: 'kill', count: 4, kind: 'hitman', at: 'gunsmith', text: 'Clear Sal\u2019s men' },
    ],
  },
  {
    id: 'king-of-solmar', act: 3, title: 'KING OF SOLMAR', contact: 'lena', reward: 5000,
    brief: 'One last drive. The ledger goes to the harbor, the whole PD is coming for you, and Sal\u2019s debt dies with it. Make Solmar yours, Rico.',
    steps: [
      { type: 'deliver', at: 'garage', text: 'Drive the ledger to the harbor — 5 stars', wantedAtStart: 5 },
    ],
  },
];

export function locationPoint(world, at) {
  if (at === 'hideout') return world.hideout;
  if (at === 'bank') return world.bank;
  if (at === 'pizza') return world.pizza;
  if (at === 'beach') return world.beach;
  return world.shops[at] || world.hideout;
}

export function startMission(game, index) {
  const def = MISSIONS[index];
  if (!def) return null;
  const mission = {
    def, stepIndex: 0, timer: 0, kills: 0, spawned: [],
    startedAt: game.time,
  };
  game.mission = mission;
  game.audio.mission();
  return mission;
}

export function currentStep(game) {
  if (!game.mission) return null;
  return game.mission.def.steps[game.mission.stepIndex] || null;
}

export function objectivePoint(game) {
  const step = currentStep(game);
  if (!step) return null;
  if (step.at) return locationPoint(game.world, step.at);
  return null;
}

export function updateMission(game, dt) {
  const m = game.mission;
  if (!m) return;
  const step = currentStep(game);
  if (!step) {
    completeMission(game);
    return;
  }
  m.timer += dt;
  // wantedAtStart applies once, when the step begins.
  if (!m.stepInit) {
    m.stepInit = true;
    if (step.wantedAtStart) addWanted(game, step.wantedAtStart);
  }
  const p = game.player;
  const at = (loc, radius) => {
    const pt = locationPoint(game.world, loc);
    return Math.hypot(p.x - pt.x, p.y - pt.y) < (radius || 70);
  };
  if (step.type === 'goto' || step.type === 'deliver') {
    if (at(step.at, 80)) {
      if (step.needCar && !p.inCar) return;
      advanceStep(game);
    }
  } else if (step.type === 'wait') {
    const pt = step.at ? locationPoint(game.world, step.at) : null;
    const near = !pt || Math.hypot(p.x - pt.x, p.y - pt.y) < 160;
    if (near && m.timer >= step.seconds) advanceStep(game);
    else if (!near) m.timer = Math.max(0, m.timer - dt * 0.5);
  } else if (step.type === 'escape') {
    if (game.wanted === 0) advanceStep(game);
  } else if (step.type === 'kill') {
    if (m.spawned.length === 0 && m.kills === 0) {
      spawnEnemies(game, step);
    }
    // If every spawned enemy is gone but the count is not met, bring more.
    const anyLeft = game.cops.some((c) => c.enemy && !c.dead && c.kind === step.kind);
    if (!anyLeft && m.kills < step.count) {
      m.spawned = [];
      spawnEnemies(game, step);
    }
    if (m.kills >= step.count) advanceStep(game);
  }
  // Timed steps fail when the clock runs out.
  if (step.time && m.timer > step.time) {
    failMission(game, 'Out of time');
  }
}

function advanceStep(game) {
  const m = game.mission;
  m.stepIndex += 1;
  m.timer = 0;
  m.kills = 0;
  m.spawned = [];
  m.stepInit = false;
  game.audio.pickup();
  if (m.stepIndex >= m.def.steps.length) completeMission(game);
}

function spawnEnemies(game, step) {
  const pt = locationPoint(game.world, step.at);
  for (let i = 0; i < step.count + 1; i++) {
    const angle = (i / (step.count + 1)) * Math.PI * 2;
    const ex = pt.x + Math.cos(angle) * 140;
    const ey = pt.y + Math.sin(angle) * 140;
    const enemy = {
      x: ex, y: ey, angle, radius: 13, health: 50, speed: 0,
      inCar: null, dead: false, punchTimer: 0, enemy: true, kind: step.kind,
    };
    game.cops.push(enemy);
    m_spawned(game, enemy);
  }
}

function m_spawned(game, enemy) {
  if (game.mission) game.mission.spawned.push(enemy);
}

export function countEnemyKill(game, enemy) {
  const m = game.mission;
  if (!m) return;
  const step = currentStep(game);
  if (step && step.type === 'kill' && enemy && enemy.enemy && step.kind === enemy.kind) {
    m.kills += 1;
  }
}

export function completeMission(game) {
  const m = game.mission;
  if (!m) return;
  game.money += m.def.reward;
  game.stats.missionsDone = (game.stats.missionsDone || 0) + 1;
  game.completedMissions.push(m.def.id);
  game.mission = null;
  game.missionIndex = Math.min(game.missionIndex + 1, MISSIONS.length);
  game.audio.cash();
  game.banner = { text: `MISSION COMPLETE — ${m.def.title}  +$${m.def.reward}`, life: 3.5 };
}

export function failMission(game, reason) {
  const m = game.mission;
  if (!m) return;
  game.mission = null;
  game.audio.fail();
  game.banner = { text: `MISSION FAILED — ${reason}. Drive to the marker to retry.`, life: 4 };
}
