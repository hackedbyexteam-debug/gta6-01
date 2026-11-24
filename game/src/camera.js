// Third-person chase camera for SOLMAR HEAT (3D): the camera rides behind
// the player or their car, low and close, swinging smoothly onto the facing
// so the road ahead is always up-screen — the GTA follow feel, now in 3D.
// The camera only steers the RENDER — world logic (movement, combat,
// police, missions, traffic) never sees it, and the minimap stays north-up.
//
// Angles are world angles: 0 = east (+x), -PI/2 = north (-y in 2D, -z in 3D).
// The 3D renderer (render.js) converts this state into a perspective
// camera: position = target - forward * dist + up * height, looking a few
// metres ahead of the target.
import { WORLD_W, WORLD_H } from './config.js';

// The canvas main.js draws into (its internal size, not the CSS size).
const VW = 1280;
const VH = 720;

// Where the player sits on screen, as a fraction of the view height:
// below centre, so more of the screen shows the road ahead than behind.
export const PLAYER_SCREEN_Y = 0.62;

// Chase distances (three.js units): on foot the camera is close and low;
// in a car it pulls back and rises as speed grows. Kept close and high
// enough to see over the low rooftops that line the roads — and high
// enough that the view tilts down into the street, so the buildings read
// as tall 3D volume with real depth, never a flat top-down map.
export const CAM_FOOT_DIST = 7;
export const CAM_FOOT_HEIGHT = 5.2;
export const CAM_CAR_DIST_SLOW = 9.5;
export const CAM_CAR_DIST_FAST = 13;
export const CAM_CAR_HEIGHT = 7;

export function createCamera(x, y) {
  return {
    x, y, angle: -Math.PI / 2,
    // Smoothed 3D chase state: the renderer reads dist/height each frame.
    dist: CAM_FOOT_DIST, height: CAM_FOOT_HEIGHT,
    // Smoothed camera eye (three.js units, world-centred) so the chase
    // never snaps: render.js lerps the real camera toward these.
    eyeX: 0, eyeY: 6, eyeZ: 0, lookX: 0, lookY: 1, lookZ: 0,
    zoom: 1,
  };
}

// Shortest signed arc from a to b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Lerp along the shortest arc, so the camera never spins the long way
// around when the facing crosses the -PI/PI seam.
export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * Math.min(1, Math.max(0, t));
}

// Chase distance for the current state: foot vs car, speed-stretched.
export function zoomFor(player) {
  if (!player.inCar) return 1;
  const car = player.inCar;
  return Math.min(1, Math.abs(car.speed) / car.def.topSpeed);
}

export function chaseDist(player, settings) {
  const far = settings && settings.camera === 'far';
  if (!player.inCar) return far ? CAM_FOOT_DIST + 2.5 : CAM_FOOT_DIST;
  const f = Math.min(1, Math.abs(player.inCar.speed) / player.inCar.def.topSpeed);
  const base = CAM_CAR_DIST_SLOW + (CAM_CAR_DIST_FAST - CAM_CAR_DIST_SLOW) * f;
  return far ? base + 3 : base;
}

export function chaseHeight(player, settings) {
  const far = settings && settings.camera === 'far';
  if (!player.inCar) return far ? CAM_FOOT_HEIGHT + 1.5 : CAM_FOOT_HEIGHT;
  return far ? CAM_CAR_HEIGHT + 1.5 : CAM_CAR_HEIGHT;
}

// Ease the camera onto its target: position fast, angle smooth (a slower
// turn reads as a camera swinging around, never a snap).
export function updateCamera(cam, focusX, focusY, targetAngle, targetZoom, dt) {
  const k = Math.min(1, dt * 5);
  cam.x += (focusX - cam.x) * k;
  cam.y += (focusY - cam.y) * k;
  cam.angle = angleLerp(cam.angle, targetAngle, Math.min(1, dt * 4.5));
  cam.x = Math.max(0, Math.min(WORLD_W, cam.x));
  cam.y = Math.max(0, Math.min(WORLD_H, cam.y));
}

// Put the camera exactly on its target (boot, and the staged ?shot= frames).
export function snapCamera(cam, focusX, focusY, angle, zoom) {
  cam.x = focusX;
  cam.y = focusY;
  cam.angle = angle;
  cam.zoom = zoom || 1;
  // Tell the 3D renderer to snap its smoothed eye on the next frame,
  // so the first rendered frame is already composed.
  cam._snap = true;
}

// Screen px (canvas coords) of a world point under this camera — kept for
// the 2D overlay math (HUD markers). The 3D projection lives in render.js
// (projectToScreen) and is the one the live game uses.
export function worldToScreen(cam, wx, wy, viewW = VW, viewH = VH) {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const c = Math.cos(-(cam.angle + Math.PI / 2));
  const s = Math.sin(-(cam.angle + Math.PI / 2));
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  return { x: viewW / 2 + rx * cam.zoom, y: viewH * PLAYER_SCREEN_Y + ry * cam.zoom };
}

// The inverse: which world point sits under a screen point (mouse aim).
export function screenToWorld(cam, sx, sy, viewW = VW, viewH = VH) {
  const rx = (sx - viewW / 2) / cam.zoom;
  const ry = (sy - viewH * PLAYER_SCREEN_Y) / cam.zoom;
  const c = Math.cos(cam.angle + Math.PI / 2);
  const s = Math.sin(cam.angle + Math.PI / 2);
  const dx = rx * c - ry * s;
  const dy = rx * s + ry * c;
  return { x: cam.x + dx, y: cam.y + dy };
}

// World-space AABB of the visible view (plus a margin, in world px).
export function viewBounds(cam, viewW = VW, viewH = VH, margin = 96) {
  const corners = [
    screenToWorld(cam, 0, 0, viewW, viewH),
    screenToWorld(cam, viewW, 0, viewW, viewH),
    screenToWorld(cam, 0, viewH, viewW, viewH),
    screenToWorld(cam, viewW, viewH, viewW, viewH),
  ];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of corners) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0: x0 - margin, y0: y0 - margin, x1: x1 + margin, y1: y1 + margin };
}

// WASD (screen-intuitive) -> world-space move vector, relative to facing:
// W = forward along the facing, S = back, A/D = strafe left/right.
// With the camera turning facing up-screen, W always moves up-screen.
export function relativeMove(facing, up, down, left, right) {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  // Right-hand perpendicular in world coords (y down): facing east, right is south.
  const rx = -fy;
  const ry = fx;
  const fwd = (up ? 1 : 0) - (down ? 1 : 0);
  const strafe = (right ? 1 : 0) - (left ? 1 : 0);
  return { mx: fx * fwd + rx * strafe, my: fy * fwd + ry * strafe };
}
