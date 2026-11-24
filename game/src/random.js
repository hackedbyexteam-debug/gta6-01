// A small seeded random number generator (mulberry32): the same seed gives
// the same city, the same traffic and the same mission layouts, which is what
// makes the screenshot scenes repeatable.
export function createRandom(seed) {
  let a = (seed | 0) >>> 0;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
    // A child stream seeded from the current state: deterministic staging
    // (screenshot traffic, ped colours) that never disturbs the main
    // stream's world generation, so the city stays identical.
    fork() {
      return createRandom((a ^ 0x9e3779b9) >>> 0);
    },
    // Fisher-Yates, in place, on the caller's own array copy.
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
      return list;
    },
  };
}
