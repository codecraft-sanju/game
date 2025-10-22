import React, { useEffect, useRef, useState } from "react";

/**
 * ⚡ Pulkit vs Harshil — Ultimate Edition (Responsive + Fullscreen)
 *
 * ✅ Dual joysticks + dash buttons (touch + mouse)
 * ✅ Score, timer, winner overlay
 * ✅ Auto fullscreen (mobile Chrome UI hide)
 * ✅ Tutorial overlay for first-time play
 * ✅ Smooth responsive scaling
 */

const WORLD_W = 960;
const WORLD_H = 540;
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const PLAYER_R = 16;
const STAR_R = 10;
const OBSTACLE_R = 18;
const POWER_R = 14;

const BASE_SPEED = 2.6;
const BOOST_SPEED = 4.2;
const DASH_BOOST = 7.0;
const DASH_TIME = 180;
const DASH_COOLDOWN = 900;
const BOOST_DURATION = 5000;
const FRICTION = 0.88;
const MAX_STARS = 6;
const STAR_RESPAWN_MS = 1000;
const OBSTACLE_COUNT = 5;
const POWER_CHANCE_MS = 5000;
const POWER_PROBABILITY = 0.35;
const ROUND_TIME = 75;
const WIN_SCORE = 12;

const COLORS = {
  bgA: "#0b1220",
  bgB: "#0f172a",
  line: "rgba(255,255,255,0.12)",
  hud: "white",
  star: "#facc15",
  power: "#22c55e",
  p1: "#3b82f6",
  p2: "#ef4444",
};

function useLandscape() {
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  useEffect(() => {
    const onResize = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
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
  const [winner, setWinner] = useState(null);
  const [countdown, setCountdown] = useState(ROUND_TIME);
  const [showTutorial, setShowTutorial] = useState(true);

  const controls = useRef({
    pulkit: { vx: 0, vy: 0, dash: false, lastDash: -Infinity, dashUntil: 0 },
    harshil: { vx: 0, vy: 0, dash: false, lastDash: -Infinity, dashUntil: 0 },
  });

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
    parallax: makeParallax(80),
  });

  const isLandscape = useLandscape();

  // Hide chrome top bar trick
  useEffect(() => {
    setTimeout(() => window.scrollTo(0, 1), 800);
  }, []);

  // Auto resize
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const ratio = WORLD_W / WORLD_H;
      let drawW = w,
        drawH = Math.round(w / ratio);
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

  // Fullscreen auto on first click
  useEffect(() => {
    const enableFullscreen = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      document.removeEventListener("click", enableFullscreen);
    };
    document.addEventListener("click", enableFullscreen);
    return () => document.removeEventListener("click", enableFullscreen);
  }, []);

  // Game loop
  useEffect(() => {
    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const vw = canvas.width / DPR,
        vh = canvas.height / DPR;

      drawBackground(ctx, vw, vh, sRef.current.parallax);
      const s = sRef.current;

      if (running) {
        const now = performance.now();
        const elapsed = (now - s.startedAt) / 1000;
        const remain = Math.max(0, ROUND_TIME - Math.floor(elapsed));
        if (remain !== countdown) setCountdown(remain);
        if (remain <= 0) {
          setRunning(false);
          const { pulkit, harshil } = s.players;
          setWinner(
            pulkit.score > harshil.score ? "Pulkit" : harshil.score > pulkit.score ? "Harshil" : "Draw"
          );
        }

        // spawn stars
        if (now - s.lastStarSpawn > STAR_RESPAWN_MS && s.stars.length < MAX_STARS) {
          s.lastStarSpawn = now;
          s.stars.push(randStar());
        }

        // spawn powers
        if (now - s.lastPowerTry > POWER_CHANCE_MS) {
          s.lastPowerTry = now;
          if (Math.random() < POWER_PROBABILITY && s.powers.length < 2) {
            s.powers.push(randPower());
          }
        }

        tickParallax(s.parallax, vw, vh);

        for (const o of s.obstacles) {
          o.x += o.vx;
          o.y += o.vy;
          if (o.x < o.r || o.x > WORLD_W - o.r) o.vx *= -1;
          if (o.y < o.r || o.y > WORLD_H - o.r) o.vy *= -1;
        }

        updatePlayer(s.players.pulkit, controls.current.pulkit, now);
        updatePlayer(s.players.harshil, controls.current.harshil, now);
        collideWorldAndObstacles(s.players.pulkit, s.obstacles);
        collideWorldAndObstacles(s.players.harshil, s.obstacles);
        resolvePlayersBounce(s.players.pulkit, s.players.harshil);
        collectItems(s.players.pulkit, s.stars, STAR_R);
        collectItems(s.players.harshil, s.stars, STAR_R);
        takePowerups(s.players.pulkit, s.powers);
        takePowerups(s.players.harshil, s.powers);
      }

      drawArenaLines(ctx, vw, vh);
      drawStars(ctx, s.stars);
      drawPowers(ctx, s.powers);
      s.obstacles.forEach((o) => drawObstacle(ctx, o));
      drawPlayer(ctx, s.players.pulkit, COLORS.p1);
      drawPlayer(ctx, s.players.harshil, COLORS.p2);
      drawHud(ctx, s.players, countdown, running, winner);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, countdown, winner]);

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
    setShowTutorial(false);
    setRunning(true);
  };

  const onDash = (id) => {
    const c = controls.current[id];
    const now = performance.now();
    if (now > c.lastDash + DASH_COOLDOWN) {
      c.lastDash = now;
      c.dash = true;
      c.dashUntil = now + DASH_TIME;
    }
  };

  const onJoyPulkit = (vx, vy) => {
    controls.current.pulkit.vx = vx;
    controls.current.pulkit.vy = vy;
  };
  const onJoyHarshil = (vx, vy) => {
    controls.current.harshil.vx = vx;
    controls.current.harshil.vy = vy;
  };

  return (
    <div style={styles.app}>
      {!isLandscape && (
        <div style={styles.rotateOverlay}>
          <div style={styles.rotateCard}>
            <h3>Rotate your phone 📱</h3>
            <p>Landscape mode gives best view for 2-player mode!</p>
          </div>
        </div>
      )}

      {showTutorial && (
        <div style={styles.tutorial}>
          <h2>How to Play</h2>
          <ul>
            <li>⭐ Collect stars to score points.</li>
            <li>⚡ Tap dash to boost speed.</li>
            <li>🎮 Use joysticks to move both players.</li>
            <li>🥇 First to {WIN_SCORE} stars wins!</li>
          </ul>
          <button onClick={startGame} style={styles.startBtn}>
            Start Game
          </button>
        </div>
      )}

      <div ref={wrapRef} style={styles.wrap}>
        <canvas ref={canvasRef} style={styles.canvas} />

        {/* Controls */}
        {running && (
          <>
            <div style={styles.topControls}>
              <Joystick label="H" onChange={onJoyHarshil} />
              <button style={styles.dashBtn} onClick={() => onDash("harshil")}>
                ⚡
              </button>
            </div>
            <div style={styles.bottomControls}>
              <Joystick label="P" onChange={onJoyPulkit} />
              <button style={styles.dashBtn} onClick={() => onDash("pulkit")}>
                ⚡
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ======= HELPER + DRAW FUNCTIONS ======= */
// same as before (initPlayer, updatePlayer, collide, stars, powers, drawStar, etc.)
// ——— [TOO LONG — I’ll send next message for part 2 👇]
// ================== JOYSTICK COMPONENT ==================
function Joystick({ label, onChange }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleStart = (e) => {
      setActive(true);
      update(e);
    };
    const handleMove = (e) => active && update(e);
    const handleEnd = () => {
      setActive(false);
      setPos({ x: 0, y: 0 });
      onChange(0, 0);
    };

    const update = (e) => {
      const rect = el.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = t.clientX - (rect.left + cx);
      const dy = t.clientY - (rect.top + cy);
      const dist = Math.min(Math.hypot(dx, dy), 40);
      const angle = Math.atan2(dy, dx);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      setPos({ x, y });
      onChange(x / 40, y / 40);
    };

    el.addEventListener("touchstart", handleStart);
    el.addEventListener("touchmove", handleMove);
    el.addEventListener("touchend", handleEnd);
    el.addEventListener("mousedown", handleStart);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);

    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchmove", handleMove);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("mousedown", handleStart);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
    };
  }, [active]);

  return (
    <div ref={ref} style={styles.joyOuter}>
      <div style={styles.joyBase}>
        <div
          style={{
            ...styles.joyStick,
            transform: `translate(${pos.x}px, ${pos.y}px)`,
          }}
        />
      </div>
      <div style={styles.joyLabel}>{label}</div>
    </div>
  );
}

// ================== GAME LOGIC HELPERS ==================
function initPlayer(x, y) {
  return { x, y, vx: 0, vy: 0, score: 0, boostUntil: 0, hitTintUntil: 0 };
}
function updatePlayer(p, ctrl, now) {
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
function collideWorldAndObstacles(p, obstacles) {
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
function resolvePlayersBounce(a, b) {
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
function collectItems(player, stars, r) {
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
function takePowerups(player, powers) {
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
function randStar() {
  const m = 40;
  return { x: m + Math.random() * (WORLD_W - m * 2), y: m + Math.random() * (WORLD_H - m * 2) };
}
function randPower() {
  const m = 50;
  return { type: "boost", x: m + Math.random() * (WORLD_W - m * 2), y: m + Math.random() * (WORLD_H - m * 2) };
}
function makeParallax(n) {
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
function tickParallax(p, vw, vh) {
  for (const px of p) {
    px.x += px.vx;
    px.y += px.vy;
    if (px.x < 0) px.x = vw;
    if (px.x > vw) px.x = 0;
    if (px.y < 0) px.y = vh;
    if (px.y > vh) px.y = 0;
  }
}

// ================== DRAW FUNCTIONS ==================
function drawBackground(ctx, vw, vh, p) {
  const g = ctx.createLinearGradient(0, 0, vw, vh);
  g.addColorStop(0, COLORS.bgA);
  g.addColorStop(1, COLORS.bgB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  for (const px of p) {
    ctx.globalAlpha = px.a;
    ctx.beginPath();
    ctx.arc(px.x, px.y, px.r, 0, Math.PI * 2);
    ctx.fillStyle = px.c;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawArenaLines(ctx, vw, vh) {
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, vw - 16, vh - 16);
}
function drawStars(ctx, stars) {
  stars.forEach((s) => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, STAR_R, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.star;
    ctx.fill();
  });
}
function drawObstacle(ctx, o) {
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.r);
  g.addColorStop(0, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g;
  ctx.fill();
}
function drawPowers(ctx, powers) {
  powers.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, POWER_R, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.power;
    ctx.fill();
  });
}
function drawPlayer(ctx, p, color) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function drawHud(ctx, players, countdown, running, winner) {
  const vw = ctx.canvas.width / DPR;
  const pad = 16;
  ctx.font = "600 18px system-ui";
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(`Pulkit: ${players.pulkit.score}`, pad, pad + 18);
  const rightText = `Harshil: ${players.harshil.score}`;
  const wR = ctx.measureText(rightText).width;
  ctx.fillText(rightText, vw - pad - wR, pad + 18);
  const t = formatTime(countdown);
  const tW = ctx.measureText(t).width;
  ctx.fillText(t, (vw - tW) / 2, pad + 18);

  if (!running && winner)
    ctx.fillText(`${winner} Wins!`, vw / 2 - 60, pad + 60);
}
function formatTime(s) {
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

// ================== STYLES ==================
const styles = {
  app: {
    position: "fixed",
    inset: 0,
    background: COLORS.bgA,
    overflow: "hidden",
    color: "white",
    fontFamily: "system-ui, sans-serif",
  },
  wrap: { position: "absolute", inset: 0 },
  canvas: { position: "absolute", inset: 0, borderRadius: 16 },
  topControls: {
    position: "absolute",
    top: 10,
    right: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  bottomControls: {
    position: "absolute",
    bottom: 10,
    left: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dashBtn: {
    fontSize: 22,
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "50%",
    width: 50,
    height: 50,
    color: "white",
    textShadow: "0 0 4px #fff",
  },
  joyOuter: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  joyBase: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.2)",
    position: "relative",
    touchAction: "none",
  },
  joyStick: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.5)",
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    transition: "transform 0.05s linear",
  },
  joyLabel: { fontSize: 12, opacity: 0.8 },
  tutorial: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "rgba(0,0,0,0.85)",
    color: "white",
    zIndex: 20,
    textAlign: "center",
    padding: 20,
  },
  startBtn: {
    marginTop: 16,
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    border: "none",
    padding: "10px 20px",
    borderRadius: 999,
    color: "#fff",
    fontWeight: 700,
  },
  rotateOverlay: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(0,0,0,0.85)",
    zIndex: 30,
  },
  rotateCard: {
    background: "rgba(17,24,39,0.85)",
    padding: 20,
    borderRadius: 16,
    textAlign: "center",
  },
};
