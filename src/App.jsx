import React, { useEffect, useRef, useState, useMemo } from "react";

/**
 * 📱 Pulkit vs Harshil — Advanced (Mobile Landscape, 2 players / one device)
 *
 * ✅ Dual on-screen joysticks + Dash buttons (multi-touch safe)
 * ✅ Collect-the-stars scoring (first to WIN_SCORE or highest at time end)
 * ✅ Moving obstacles (bouncing), player collision knockback
 * ✅ Power-ups (⚡ speed boost) with duration + visual glow
 * ✅ Parallax background particles + clean HUD (timer, scores, power status)
 * ✅ Single Canvas, DPR aware, landscape overlay reminder
 *
 * How to play:
 *   Rotate phone to landscape.
 *   Top player = Harshil (red). Bottom player = Pulkit (blue).
 *   Use your joystick to move, hit ⚡ to dash. Collect ⭐, avoid obstacles.
 */

const WORLD_W = 960;
const WORLD_H = 540;
const DPR = Math.max(1, Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));

const PLAYER_R = 16;
const STAR_R = 10;
const OBSTACLE_R = 18;
const POWER_R = 14;

const BASE_SPEED = 2.6;
const BOOST_SPEED = 4.2;
const DASH_BOOST = 7.0;
const DASH_TIME = 180; // ms
const DASH_COOLDOWN = 900; // ms
const BOOST_DURATION = 5000; // ms
const FRICTION = 0.88;

const MAX_STARS = 6;
const STAR_RESPAWN_MS = 1000;

const OBSTACLE_COUNT = 5;
const POWER_CHANCE_MS = 5000; // try spawn every X ms (with probability)
const POWER_PROBABILITY = 0.35;

const ROUND_TIME = 75; // seconds
const WIN_SCORE = 12;

const COLORS = {
  bgA: "#0b1220",
  bgB: "#0f172a",
  line: "rgba(255,255,255,0.12)",
  hud: "white",
  star: "#facc15",
  power: "#22c55e",
  p1: "#3b82f6", // Pulkit
  p2: "#ef4444", // Harshil
};

function useLandscape() {
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= window.innerHeight
  );
  useEffect(() => {
    const onResize = () => setIsLandscape(window.innerWidth >= window.innerHeight);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return isLandscape;
}

export default function App() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const rafRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState(null); // "pulkit" | "harshil" | "draw" | null
  const [countdown, setCountdown] = useState(ROUND_TIME);

  // Controls state from joysticks + dashes
  const controls = useRef({
    pulkit: { vx: 0, vy: 0, dash: false, lastDash: -Infinity, dashUntil: 0 },
    harshil: { vx: 0, vy: 0, dash: false, lastDash: -Infinity, dashUntil: 0 },
  });

  // World state
  const sRef = useRef({
    players: {
      pulkit: initPlayer(WORLD_W * 0.25, WORLD_H * 0.78),
      harshil: initPlayer(WORLD_W * 0.75, WORLD_H * 0.22),
    },
    stars: [],
    obstacles: [],
    powers: [],
    lastStarSpawn: 0,
    lastPowerTry: 0,
    startedAt: 0,
    parallax: makeParallax(90),
  });

  // Responsive canvas fit
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const ratio = WORLD_W / WORLD_H;

      let drawW = w;
      let drawH = Math.round(w / ratio);
      if (drawH > h) {
        drawH = h;
        drawW = Math.round(h * ratio);
      }

      canvas.style.width = `${drawW}px`;
      canvas.style.height = `${drawH}px`;
      canvas.width = Math.round(drawW * DPR);
      canvas.height = Math.round(drawH * DPR);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Game loop
  useEffect(() => {
    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // normalize to DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const vw = canvas.width / DPR;
      const vh = canvas.height / DPR;

      // draw bg + parallax
      drawBackground(ctx, vw, vh, sRef.current.parallax);

      const s = sRef.current;
      if (running) {
        const now = performance.now();

        // Timer
        const elapsed = (now - s.startedAt) / 1000;
        const remain = Math.max(0, ROUND_TIME - Math.floor(elapsed));
        if (remain !== countdown) setCountdown(remain);
        if (remain <= 0) {
          setRunning(false);
          const { pulkit, harshil } = s.players;
          if (pulkit.score > harshil.score) setWinner("pulkit");
          else if (harshil.score > pulkit.score) setWinner("harshil");
          else setWinner("draw");
        }

        // Star spawns
        if (now - s.lastStarSpawn > STAR_RESPAWN_MS && s.stars.length < MAX_STARS) {
          s.lastStarSpawn = now;
          s.stars.push(randStar());
        }

        // Power-up spawn tries
        if (now - s.lastPowerTry > POWER_CHANCE_MS) {
          s.lastPowerTry = now;
          if (Math.random() < POWER_PROBABILITY && s.powers.length < 2) {
            s.powers.push(randPower());
          }
        }

        // Update parallax
        tickParallax(s.parallax, vw, vh);

        // Obstacles movement
        for (const o of s.obstacles) {
          o.x += o.vx;
          o.y += o.vy;
          if (o.x < o.r || o.x > WORLD_W - o.r) o.vx *= -1;
          if (o.y < o.r || o.y > WORLD_H - o.r) o.vy *= -1;
        }

        // Players update (joystick + dash + boost timer)
        updatePlayer(s.players.pulkit, controls.current.pulkit, now);
        updatePlayer(s.players.harshil, controls.current.harshil, now);

        // Clamp + handle obstacle collisions + player bounce
        collideWorldAndObstacles(s.players.pulkit, s.obstacles);
        collideWorldAndObstacles(s.players.harshil, s.obstacles);

        // Player-vs-player soft collision (bounce)
        resolvePlayersBounce(s.players.pulkit, s.players.harshil);

        // Collect stars
        collectItems(s.players.pulkit, s.stars, STAR_R);
        collectItems(s.players.harshil, s.stars, STAR_R);

        // Grab power-ups
        takePowerups(s.players.pulkit, s.powers);
        takePowerups(s.players.harshil, s.powers);
      }

      // Draw mid line + border
      drawArenaLines(ctx, vw, vh);

      // Draw items
      drawStars(ctx, sRef.current.stars);
      drawPowers(ctx, sRef.current.powers);

      // Draw obstacles
      for (const o of sRef.current.obstacles) drawObstacle(ctx, o);

      // Players
      drawPlayer(ctx, sRef.current.players.pulkit, COLORS.p1);
      drawPlayer(ctx, sRef.current.players.harshil, COLORS.p2);

      // HUD
      drawHud(ctx, sRef.current.players, countdown, running, winner);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, countdown, winner]);

  const isLandscape = useLandscape();

  const startGame = () => {
    const s = sRef.current;
    s.players.pulkit = initPlayer(WORLD_W * 0.25, WORLD_H * 0.78);
    s.players.harshil = initPlayer(WORLD_W * 0.75, WORLD_H * 0.22);
    s.stars = [];
    s.powers = [];
    s.lastStarSpawn = 0;
    s.lastPowerTry = 0;
    s.startedAt = performance.now();
    setWinner(null);
    setCountdown(ROUND_TIME);

    // (re)seed obstacles
    s.obstacles = [];
    for (let i = 0; i < OBSTACLE_COUNT; i++) {
      s.obstacles.push({
        x: 60 + Math.random() * (WORLD_W - 120),
        y: 60 + Math.random() * (WORLD_H - 120),
        r: OBSTACLE_R,
        vx: (Math.random() * 2 - 1) * 1.4,
        vy: (Math.random() * 2 - 1) * 1.2,
      });
    }

    setRunning(true);
  };

  // Dash handlers
  const onDash = (id) => {
    const c = controls.current[id];
    const now = performance.now();
    if (now > c.lastDash + DASH_COOLDOWN) {
      c.lastDash = now;
      c.dash = true;
      c.dashUntil = now + DASH_TIME;
    }
  };

  // Joystick change handlers
  const onJoyPulkit = (vx, vy) => {
    controls.current.pulkit.vx = vx;
    controls.current.pulkit.vy = vy;
  };
  const onJoyHarshil = (vx, vy) => {
    controls.current.harshil.vx = vx;
    controls.current.harshil.vy = vy;
  };

  return (
    <div style={styles.app} onContextMenu={(e) => e.preventDefault()}>
      {!isLandscape && (
        <div style={styles.rotateOverlay}>
          <div style={styles.rotateCard}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Rotate to Play</div>
            <div style={{ opacity: 0.8, fontSize: 14 }}>
              Turn your phone sideways (landscape) for the best two-player experience.
            </div>
          </div>
        </div>
      )}

      <div ref={wrapRef} style={styles.wrap}>
        <canvas ref={canvasRef} style={styles.canvas} />

        {/* Center UI */}
        <div style={styles.centerUi}>
          {!running && (
            <button style={styles.primaryBtn} onClick={startGame}>
              {winner ? "Play Again" : "Start"}
            </button>
          )}
          {winner && (
            <div style={styles.winnerBadge}>
              {winner === "draw" ? "Draw!" : `${cap(winner)} wins!`}
            </div>
          )}
        </div>

        {/* Top Player (Harshil) Controls */}
        <div style={styles.topRow}>
          <div style={styles.rowInner}>
            <Joystick label="H" onChange={onJoyHarshil} />
            <DashButton label="⚡" onPress={() => onDash("harshil")} />
          </div>
        </div>

        {/* Bottom Player (Pulkit) Controls */}
        <div style={styles.bottomRow}>
          <div style={styles.rowInner}>
            <Joystick label="P" onChange={onJoyPulkit} />
            <DashButton label="⚡" onPress={() => onDash("pulkit")} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Entities & World Helpers
   ========================= */
function initPlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    score: 0,
    boostUntil: 0, // timestamp
    hitTintUntil: 0,
  };
}

function updatePlayer(p, ctrl, now) {
  // dash active?
  const dashActive = now < (ctrl.dashUntil || 0);
  if (dashActive && now >= ctrl.dashUntil) ctrl.dash = false;

  const boosted = now < (p.boostUntil || 0);
  const speed = dashActive ? DASH_BOOST : boosted ? BOOST_SPEED : BASE_SPEED;

  // joystick vector input is normalized [-1..1], scale by speed
  p.vx += ctrl.vx * speed * 0.55;
  p.vy += ctrl.vy * speed * 0.55;

  // friction
  p.vx *= FRICTION;
  p.vy *= FRICTION;

  p.x += p.vx;
  p.y += p.vy;

  // clamp to world
  const pad = 8 + PLAYER_R;
  p.x = Math.max(pad, Math.min(WORLD_W - pad, p.x));
  p.y = Math.max(pad, Math.min(WORLD_H - pad, p.y));
}

function collideWorldAndObstacles(p, obstacles) {
  // world walls are already clamped in update; also check obstacle circles
  for (const o of obstacles) {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const dist = Math.hypot(dx, dy);
    const minDist = PLAYER_R + o.r;
    if (dist < minDist) {
      // push player out + apply knockback
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

function resolvePlayersBounce(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = PLAYER_R * 2;
  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const pen = minDist - dist + 0.01;
    // separate
    a.x -= nx * (pen / 2);
    a.y -= ny * (pen / 2);
    b.x += nx * (pen / 2);
    b.y += ny * (pen / 2);
    // bounce
    a.vx -= nx * 0.8;
    a.vy -= ny * 0.8;
    b.vx += nx * 0.8;
    b.vy += ny * 0.8;
  }
}

function collectItems(player, stars, r) {
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const dist2 = dx * dx + dy * dy;
    const min2 = (PLAYER_R + r * 0.7) ** 2;
    if (dist2 <= min2) {
      stars.splice(i, 1);
      player.score += 1;
    }
  }
}

function takePowerups(player, powers) {
  const now = performance.now();
  for (let i = powers.length - 1; i >= 0; i--) {
    const pw = powers[i];
    const dx = player.x - pw.x;
    const dy = player.y - pw.y;
    const dist2 = dx * dx + dy * dy;
    const min2 = (PLAYER_R + POWER_R * 0.7) ** 2;
    if (dist2 <= min2) {
      powers.splice(i, 1);
      if (pw.type === "boost") {
        player.boostUntil = now + BOOST_DURATION;
      }
    }
  }
}

function randStar() {
  const margin = 40;
  return {
    x: margin + Math.random() * (WORLD_W - margin * 2),
    y: margin + Math.random() * (WORLD_H - margin * 2),
  };
}

function randPower() {
  const margin = 50;
  return {
    type: "boost",
    x: margin + Math.random() * (WORLD_W - margin * 2),
    y: margin + Math.random() * (WORLD_H - margin * 2),
  };
}

/* =========================
   Drawing
   ========================= */
function drawBackground(ctx, vw, vh, parallax) {
  const grad = ctx.createLinearGradient(0, 0, vw, vh);
  grad.addColorStop(0, COLORS.bgA);
  grad.addColorStop(1, COLORS.bgB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);

  // parallax dots
  for (const p of parallax) {
    ctx.globalAlpha = p.a;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.c;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawArenaLines(ctx, vw, vh) {
  // border
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, vw - 16, vh - 16);

  // mid line
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.moveTo(0, vh / 2);
  ctx.lineTo(vw, vh / 2);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawStars(ctx, stars) {
  for (const s of stars) drawStar(ctx, s.x, s.y, STAR_R, 5, COLORS.star);
}

function drawStar(ctx, x, y, r, spikes, color) {
  const step = Math.PI / spikes;
  let rot = (Math.PI / 2) * 3;
  let outer = r;
  let inner = r * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y - outer);
  for (let i = 0; i < spikes; i++) {
    let x1 = x + Math.cos(rot) * outer;
    let y1 = y + Math.sin(rot) * outer;
    ctx.lineTo(x1, y1);
    rot += step;

    x1 = x + Math.cos(rot) * inner;
    y1 = y + Math.sin(rot) * inner;
    ctx.lineTo(x1, y1);
    rot += step;
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();
}

function drawObstacle(ctx, o) {
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r);
  g.addColorStop(0, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.stroke();
}

function drawPowers(ctx, powers) {
  powers.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, POWER_R, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.power;
    ctx.fill();
    // lightning glyph
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.moveTo(-3, -8);
    ctx.lineTo(0, -1);
    ctx.lineTo(-2, -1);
    ctx.lineTo(3, 8);
    ctx.lineTo(0, 1);
    ctx.lineTo(2, 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawPlayer(ctx, p, color) {
  const now = performance.now();
  const glow = now < (p.boostUntil || 0);

  if (glow) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R + 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(34,197,94,0.18)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // hit tint
  if (now < (p.hitTintUntil || 0)) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.stroke();
}

function drawHud(ctx, players, countdown, running, winner) {
  const vw = ctx.canvas.width / DPR;
  const pad = 16;

  ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = COLORS.hud;

  // Scores
  const left = `Pulkit: ${players.pulkit.score}`;
  const right = `Harshil: ${players.harshil.score}`;
  ctx.fillText(left, pad, pad + 18);
  const wRight = ctx.measureText(right).width;
  ctx.fillText(right, vw - pad - wRight, pad + 18);

  // Timer center
  const t = formatTime(countdown);
  const tW = ctx.measureText(t).width;
  ctx.fillText(t, (vw - tW) / 2, pad + 18);

  // footer hint
  if (!running && !winner) {
    const hint = `Collect ⭐. First to ${WIN_SCORE} wins. Use joystick + ⚡ dash!`;
    const w = ctx.measureText(hint).width;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(hint, (vw - w) / 2, 44);
  }
}

/* =========================
   Parallax
   ========================= */
function makeParallax(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: Math.random() * 1.8 + 0.5,
      a: Math.random() * 0.5 + 0.2,
      c: Math.random() < 0.5 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)",
      vx: (Math.random() * 2 - 1) * 0.08,
      vy: (Math.random() * 2 - 1) * 0.08,
    });
  }
  return arr;
}
function tickParallax(pxs, vw, vh) {
  for (const p of pxs) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = vw;
    if (p.x > vw) p.x = 0;
    if (p.y < 0) p.y = vh;
    if (p.y > vh) p.y = 0;
  }
}

/* =========================
   Small utils
   ========================= */
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatTime(s) {
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/* =========================
   Controls UI
   ========================= */
function Joystick({ label = "", onChange }) {
  const ref = useRef(null);
  const stickRef = useRef(null);
  const idRef = useRef(null);
  const center = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  // normalize vector to [-1..1]
  const emit = (dx, dy, radius) => {
    const mag = Math.hypot(dx, dy);
    const clamped = Math.min(radius, mag);
    const nx = (dx / (radius || 1)) * (clamped ? clamped / radius : 0);
    const ny = (dy / (radius || 1)) * (clamped ? clamped / radius : 0);
    onChange?.(nx, ny);
  };

  const reset = () => {
    onChange?.(0, 0);
    if (stickRef.current) {
      stickRef.current.style.transform = `translate(-50%, -50%)`;
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const radius = 48; // visual radius for clamp
    const start = (clientX, clientY, ident) => {
      idRef.current = ident;
      setActive(true);
      const rect = el.getBoundingClientRect();
      center.current.x = rect.left + rect.width / 2;
      center.current.y = rect.top + rect.height / 2;

      const dx = clientX - center.current.x;
      const dy = clientY - center.current.y;
      move(dx, dy, radius);
    };
    const move = (dx, dy, r) => {
      // clamp
      const mag = Math.hypot(dx, dy);
      const ratio = mag > r ? r / mag : 1;
      const cx = dx * ratio;
      const cy = dy * ratio;
      if (stickRef.current) {
        stickRef.current.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
      }
      emit(cx, cy, r);
    };
    const end = () => {
      setActive(false);
      idRef.current = null;
      reset();
    };

    const onTouchStart = (e) => {
      for (const t of e.changedTouches) {
        if (el.contains(document.elementFromPoint(t.clientX, t.clientY))) {
          start(t.clientX, t.clientY, t.identifier);
          break;
        }
      }
    };
    const onTouchMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === idRef.current) {
          const dx = t.clientX - center.current.x;
          const dy = t.clientY - center.current.y;
          move(dx, dy, radius);
          break;
        }
      }
    };
    const onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === idRef.current) {
          end();
          break;
        }
      }
    };

    const onMouseDown = (e) => {
      e.preventDefault();
      start(e.clientX, e.clientY, "mouse");
      window.addEventListener("mousemove", onMouseMove, { passive: false });
      window.addEventListener("mouseup", onMouseUp, { passive: true, once: true });
    };
    const onMouseMove = (e) => {
      const dx = e.clientX - center.current.x;
      const dy = e.clientY - center.current.y;
      move(dx, dy, radius);
    };
    const onMouseUp = () => {
      end();
      window.removeEventListener("mousemove", onMouseMove);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("mousedown", onMouseDown);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [onChange]);

  return (
    <div ref={ref} style={styles.joy}>
      <div style={styles.joyBase} className={active ? "active" : ""} />
      <div ref={stickRef} style={styles.joyStick} />
      <div style={styles.joyTag}>{label}</div>
    </div>
  );
}

function DashButton({ label = "⚡", onPress }) {
  return (
    <button
      style={styles.dashBtn}
      onTouchStart={(e) => {
        e.preventDefault();
        onPress?.();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        onPress?.();
      }}
    >
      {label}
    </button>
  );
}

/* =========================
   Styles
   ========================= */
const styles = {
  app: {
    position: "fixed",
    inset: 0,
    background: COLORS.bgA,
    color: "white",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
  },
  wrap: {
    position: "absolute",
    inset: 0,
  },
  canvas: {
    position: "absolute",
    inset: 0,
    margin: "auto",
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: 16,
    boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
  },
  centerUi: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  },
  primaryBtn: {
    pointerEvents: "auto",
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "white",
    padding: "12px 22px",
    borderRadius: 999,
    fontWeight: 700,
    letterSpacing: 0.3,
    boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
  },
  winnerBadge: {
    position: "absolute",
    bottom: 22,
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.2)",
    padding: "8px 14px",
    borderRadius: 999,
    fontWeight: 700,
    letterSpacing: 0.3,
    backdropFilter: "blur(6px)",
  },

  topRow: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    display: "grid",
    justifyContent: "center",
    pointerEvents: "none",
  },
  bottomRow: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    display: "grid",
    justifyContent: "center",
    pointerEvents: "none",
  },
  rowInner: {
    pointerEvents: "auto",
    display: "flex",
    gap: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  joy: {
    width: 120,
    height: 120,
    borderRadius: 16,
    position: "relative",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(8px)",
    touchAction: "none",
  },
  joyBase: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 96,
    height: 96,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(255,255,255,0.06)",
    border: "1px dashed rgba(255,255,255,0.2)",
  },
  joyStick: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 48,
    height: 48,
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(255,255,255,0.22)",
    border: "1px solid rgba(255,255,255,0.35)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
  },
  joyTag: {
    position: "absolute",
    left: 8,
    top: 8,
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 700,
    letterSpacing: 0.4,
  },

  dashBtn: {
    height: 120,
    minWidth: 120,
    borderRadius: 16,
    background: "linear-gradient(135deg, rgba(34,197,94,0.8), rgba(34,197,94,0.45))",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "white",
    fontWeight: 900,
    fontSize: 26,
    letterSpacing: 0.5,
    boxShadow: "0 8px 22px rgba(34,197,94,0.35)",
    touchAction: "none",
  },

  rotateOverlay: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(1200px 600px at center, rgba(0,0,0,0.65), rgba(0,0,0,0.9))",
    zIndex: 50,
  },
  rotateCard: {
    background: "rgba(17,24,39,0.8)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 16,
    padding: "14px 16px",
    maxWidth: 320,
    textAlign: "center",
    backdropFilter: "blur(6px)",
  },
};
