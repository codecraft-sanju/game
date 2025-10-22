export const WORLD_W = 960;
export const WORLD_H = 540;
export const PLAYER_R = 16;
export const STAR_R = 10;
export const OBSTACLE_R = 18;
export const POWER_R = 14;

export const BASE_SPEED = 2.6;
export const BOOST_SPEED = 4.2;
export const DASH_BOOST = 7.0;
export const FRICTION = 0.88;
export const BOOST_DURATION = 5000;
export const COLORS = {
  bgA: "#0b1220",
  bgB: "#0f172a",
  star: "#facc15",
  p1: "#3b82f6",
  p2: "#ef4444",
  power: "#22c55e",
};

export function initPlayer(x, y) {
  return { x, y, vx: 0, vy: 0, score: 0, boostUntil: 0 };
}

export function updatePlayer(p, ctrl, now) {
  const boosted = now < (p.boostUntil || 0);
  const speed = boosted ? BOOST_SPEED : BASE_SPEED;
  p.vx += ctrl.vx * speed * 0.55;
  p.vy += ctrl.vy * speed * 0.55;
  p.vx *= FRICTION;
  p.vy *= FRICTION;
  p.x += p.vx;
  p.y += p.vy;
}
