// GTA-style follow camera for SOLMAR HEAT: zoomed in close, rotating so the
// player's facing is always up-screen, the player sitting below centre so
// the road ahead reads wider than what's behind. The camera only steers
// the RENDER — world logic (movement, combat, police, missions, traffic)
// never sees it, and the minimap stays north-up. Pure math, no DOM, so the
// harness drives it directly.
//
// Angles are world angles: 0 = east (+x), -PI/2 = north (-y). On screen,
// up is -y, so a facing angle of theta is drawn with a rotation of
// -(theta + PI/2): north faces up with no rotation at all.
import { WORLD_W, WORLD_H } from './config.js';

// The canvas main.js draws into (its internal size, not the CSS size).
const VW = 1280;
const VH = 720;

// Where the player sits on screen, as a fraction of the view height:
// below centre, so more of the screen shows the road ahead than behind.
export const PLAYER_SCREEN_Y = 0.62;

// Zoom: on foot the world is close and readable; in a car the camera
// pulls back as speed rises, so the road ahead stays visible.
export const ZOOM_FOOT = 2.0;
export const ZOOM_CAR_SLOW = 1.9;
export const ZOOM_CAR_FAST = 1.3;

export function createCamera(x, y) {
  return { x, y, angle: -Math.PI / 2, zoom: ZOOM_FOOT };
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

export function zoomFor(player) {
  if (!player.inCar) return ZOOM_FOOT;
  const car = player.inCar;
  const f = Math.min(1, Math.abs(car.speed) / car.def.topSpeed);
  return ZOOM_CAR_SLOW - (ZOOM_CAR_SLOW - ZOOM_CAR_FAST) * f;
}

// Ease the camera onto its target: position fast, angle smooth (a slower
// turn reads as a camera swinging around, never a snap), zoom slowest.
export function updateCamera(cam, focusX, focusY, targetAngle, targetZoom, dt) {
  const k = Math.min(1, dt * 5);
  cam.x += (focusX - cam.x) * k;
  cam.y += (focusY - cam.y) * k;
  cam.angle = angleLerp(cam.angle, targetAngle, Math.min(1, dt * 4.5));
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 2.5);
  cam.x = Math.max(0, Math.min(WORLD_W, cam.x));
  cam.y = Math.max(0, Math.min(WORLD_H, cam.y));
}

// Put the camera exactly on its target (boot, and the staged ?shot= frames).
export function snapCamera(cam, focusX, focusY, angle, zoom) {
  cam.x = focusX;
  cam.y = focusY;
  cam.angle = angle;
  cam.zoom = zoom;
}

// Screen px (canvas coords) of a world point under this camera.
// The canvas transform in render() is the same math:
// translate(VW/2, VH*PLAYER_SCREEN_Y) -> scale(zoom) ->
// rotate(-(angle + PI/2)) -> translate(-cam.x, -cam.y).
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

// World-space AABB of the visible view (plus a margin, in world px):
// the four screen corners back-projected, so culling stays correct while
// the view rotates. Renderers cull against this, never against screen px.
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
