// ==========================
// ⚡ Pulkit vs Harshil — Game Engine Utils
// ==========================

export const WORLD_W = 960;
export const WORLD_H = 540;
export const PLAYER_R = 16;
export const STAR_R = 10;
export const OBSTACLE_R = 18;
export const POWER_R = 14;

export const BASE_SPEED = 2.6;
export const BOOST_SPEED = 4.2;
export const DASH_BOOST = 7.0;
export const DASH_TIME = 180;
export const DASH_COOLDOWN = 900;
export const BOOST_DURATION = 5000;
export const FRICTION = 0.88;

export const MAX_STARS = 6;
export const STAR_RESPAWN_MS = 1000;
export const OBSTACLE_COUNT = 5;
export const POWER_CHANCE_MS = 5000;
export const POWER_PROBABILITY = 0.35;
export const ROUND_TIME = 75;
export const WIN_SCORE = 12;

export const COLORS = {
  bgA: "#0b1220",
  bgB: "#0f172a",
  line: "rgba(255,255,255,0.12)",
  hud: "white",
  star: "#facc15",
  power: "#22c55e",
  p1: "#3b82f6",
  p2: "#ef4444",
};

// ==========================
// 🎮 PLAYER LOGIC
// ==========================
export function initPlayer(x, y) {
  return { x, y, vx: 0, vy: 0, score: 0, boostUntil: 0, hitTintUntil: 0 };
}

export function updatePlayer(p, ctrl, now) {
  const dashActive = now < (ctrl.dashUntil || 0);
  if (dashActive && now >= ctrl.dashUntil) ctrl.dash = false;
  const boosted = now < (p.boostUntil || 0);
  const speed = dashActive ? DASH_BOOST : boosted ? BOOST_SPEED : BASE_SPEED;
  p.vx += ctrl.vx * speed * 0.55;
  p.vy += ctrl.vy * speed * 0.55;
  p.vx *= FRICTION;
  p.vy *= FRICTION;
  p.x += p.vx;
  p.y += p.vy;

  const pad = 8 + PLAYER_R;
  p.x = Math.max(pad, Math.min(WORLD_W - pad, p.x));
  p.y = Math.max(pad, Math.min(WORLD_H - pad, p.y));
}

// ==========================
// 💥 COLLISIONS + INTERACTIONS
// ==========================
export function collideWorldAndObstacles(p, obstacles) {
  for (const o of obstacles) {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const dist = Math.hypot(dx, dy);
    const minDist = PLAYER_R + o.r;
    if (dist < minDist) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      const pen = minDist - dist + 0.01;
      p.x += nx * pen;
      p.y += ny * pen;
      p.vx += nx * 1.2;
      p.vy += ny * 1.2;
      p.hitTintUntil = performance.now() + 150;
    }
  }
}

export function resolvePlayersBounce(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = PLAYER_R * 2;
  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const pen = minDist - dist + 0.01;
    a.x -= nx * (pen / 2);
    a.y -= ny * (pen / 2);
    b.x += nx * (pen / 2);
    b.y += ny * (pen / 2);
    a.vx -= nx * 0.8;
    a.vy -= ny * 0.8;
    b.vx += nx * 0.8;
    b.vy += ny * 0.8;
  }
}

// ==========================
// ⭐ STARS + POWERUPS
// ==========================
export function collectItems(player, stars, r) {
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    const dx = player.x - s.x;
    const dy = player.y - s.y;
    if (dx * dx + dy * dy <= (PLAYER_R + r * 0.7) ** 2) {
      stars.splice(i, 1);
      player.score += 1;
    }
  }
}

export function takePowerups(player, powers) {
  const now = performance.now();
  for (let i = powers.length - 1; i >= 0; i--) {
    const pw = powers[i];
    const dx = player.x - pw.x;
    const dy = player.y - pw.y;
    if (dx * dx + dy * dy <= (PLAYER_R + POWER_R * 0.7) ** 2) {
      powers.splice(i, 1);
      if (pw.type === "boost") player.boostUntil = now + BOOST_DURATION;
    }
  }
}

// ==========================
// 🌟 GENERATORS
// ==========================
export function randStar() {
  const m = 40;
  return { x: m + Math.random() * (WORLD_W - m * 2), y: m + Math.random() * (WORLD_H - m * 2) };
}

export function randPower() {
  const m = 50;
  return { type: "boost", x: m + Math.random() * (WORLD_W - m * 2), y: m + Math.random() * (WORLD_H - m * 2) };
}

export function makeParallax(n) {
  const arr = [];
  for (let i = 0; i < n; i++)
    arr.push({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: Math.random() * 1.8 + 0.5,
      a: Math.random() * 0.5 + 0.2,
      c: Math.random() < 0.5 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)",
      vx: (Math.random() * 2 - 1) * 0.08,
      vy: (Math.random() * 2 - 1) * 0.08,
    });
  return arr;
}

export function tickParallax(p, vw, vh) {
  for (const px of p) {
    px.x += px.vx;
    px.y += px.vy;
    if (px.x < 0) px.x = vw;
    if (px.x > vw) px.x = 0;
    if (px.y < 0) px.y = vh;
    if (px.y > vh) px.y = 0;
  }
}

// ==========================
// 🧮 FORMATTERS
// ==========================
export function formatTime(s) {
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
