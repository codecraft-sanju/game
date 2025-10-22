import React, { useEffect, useRef, useState } from "react";
import Joystick from "./components/Joystick";
import Hud from "./components/Hud";
import Background from "./components/Background";
import {
  WORLD_W,
  WORLD_H,
  OBSTACLE_COUNT,
  DASH_COOLDOWN,
  DASH_TIME,
  makeParallax,
  randPower,
  randStar,
  initPlayer,
  updatePlayer,
  collectItems,
  collideWorldAndObstacles,
  resolvePlayersBounce,
  takePowerups,
  tickParallax,
  COLORS,
  ROUND_TIME,
  WIN_SCORE,
  MAX_STARS,
  STAR_RESPAWN_MS,
  POWER_CHANCE_MS,
  POWER_PROBABILITY,
  PLAYER_R,
  STAR_R,
  POWER_R,
} from "./utils/gameUtils";

export default function App() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [countdown, setCountdown] = useState(ROUND_TIME);
  const [showTutorial, setShowTutorial] = useState(true);
  const [uiTick, setUiTick] = useState(0); // force HUD repaint when scores change

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
    parallax: makeParallax(80),
    startedAt: 0,
    lastStarAt: 0,
    lastPowerCheck: 0,
  });

  // Optional: fullscreen on first tap (mobile vibes)
  useEffect(() => {
    const enableFullscreen = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      document.removeEventListener("click", enableFullscreen);
    };
    document.addEventListener("click", enableFullscreen, { once: true });
    return () => document.removeEventListener("click", enableFullscreen);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const drawParallax = (ctx, p) => {
      for (const px of p) {
        ctx.globalAlpha = px.a;
        ctx.beginPath();
        ctx.arc(px.x, px.y, px.r, 0, Math.PI * 2);
        ctx.fillStyle = px.c;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawStar = (ctx, s, t) => {
      const pulse = 0.6 + 0.4 * Math.sin((t + s.x * 7 + s.y * 5) * 0.006);
      const r = STAR_R * pulse;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#facc15";
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const drawPower = (ctx, p, t) => {
      const pulse = 0.85 + 0.15 * Math.sin((t + p.x * 3) * 0.01);
      const r = POWER_R * pulse;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#22c55e";
      ctx.fillStyle = "#22c55e";
      ctx.fill();
      ctx.shadowBlur = 0;
      // small inner core
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const drawObstacle = (ctx, o) => {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    };

    const drawPlayer = (ctx, p, color, t) => {
      const hitTint = (p.hitTintUntil || 0) > performance.now();
      const r = PLAYER_R * (hitTint ? 1.12 : 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // direction hint / little nose
      const ang = Math.atan2(p.vy, p.vx) || 0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, r + 6, ang - 0.15, ang + 0.15);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    const loop = () => {
      const s = sRef.current;
      const now = performance.now();

      // bg
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
      g.addColorStop(0, COLORS.bgA);
      g.addColorStop(1, COLORS.bgB);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      // starfield drift
      tickParallax(s.parallax, WORLD_W, WORLD_H);
      drawParallax(ctx, s.parallax);

      if (running) {
        // timer
        const elapsed = (now - s.startedAt) / 1000;
        const remain = Math.max(0, ROUND_TIME - Math.floor(elapsed));
        if (remain !== countdown) setCountdown(remain);
        if (remain <= 0) {
          setRunning(false);
          const { pulkit, harshil } = s.players;
          setWinner(
            pulkit.score > harshil.score
              ? "Pulkit"
              : harshil.score > pulkit.score
              ? "Harshil"
              : "Draw"
          );
        }

        // spawn stars
        if (s.stars.length < MAX_STARS && now - s.lastStarAt > STAR_RESPAWN_MS) {
          s.stars.push(randStar());
          s.lastStarAt = now;
        }

        // random chance to spawn power
        if (now - s.lastPowerCheck > POWER_CHANCE_MS) {
          s.lastPowerCheck = now;
          if (Math.random() < POWER_PROBABILITY) {
            s.powers.push(randPower());
          }
        }

        // move obstacles + wall bounce
        for (const o of s.obstacles) {
          o.x += o.vx;
          o.y += o.vy;
          if (o.x < o.r || o.x > WORLD_W - o.r) o.vx *= -1;
          if (o.y < o.r || o.y > WORLD_H - o.r) o.vy *= -1;
        }

        // physics
        updatePlayer(s.players.pulkit, controls.current.pulkit, now);
        updatePlayer(s.players.harshil, controls.current.harshil, now);

        collideWorldAndObstacles(s.players.pulkit, s.obstacles);
        collideWorldAndObstacles(s.players.harshil, s.obstacles);
        resolvePlayersBounce(s.players.pulkit, s.players.harshil);

        // collections → bump uiTick if score changed so HUD updates right away
        const p1Before = s.players.pulkit.score;
        const p2Before = s.players.harshil.score;

        collectItems(s.players.pulkit, s.stars, STAR_R);
        collectItems(s.players.harshil, s.stars, STAR_R);
        takePowerups(s.players.pulkit, s.powers);
        takePowerups(s.players.harshil, s.powers);

        if (
          s.players.pulkit.score !== p1Before ||
          s.players.harshil.score !== p2Before
        ) {
          setUiTick((v) => v + 1);
        }

        // instant win by score cap
        if (
          s.players.pulkit.score >= WIN_SCORE ||
          s.players.harshil.score >= WIN_SCORE
        ) {
          setRunning(false);
          setWinner(
            s.players.pulkit.score > s.players.harshil.score ? "Pulkit" : "Harshil"
          );
        }
      }

      // render order: obstacles (back), stars, powers, players (front)
      for (const o of sRef.current.obstacles) drawObstacle(ctx, o);
      const t = performance.now();
      for (const st of sRef.current.stars) drawStar(ctx, st, t);
      for (const pw of sRef.current.powers) drawPower(ctx, pw, t);

      drawPlayer(ctx, sRef.current.players.pulkit, COLORS.p1, t);
      drawPlayer(ctx, sRef.current.players.harshil, COLORS.p2, t);

      rafRef.current = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, countdown, uiTick]); // uiTick ensures HUD refresh too

  const startGame = () => {
    const s = sRef.current;
    s.players.pulkit = initPlayer(WORLD_W * 0.25, WORLD_H * 0.78);
    s.players.harshil = initPlayer(WORLD_W * 0.75, WORLD_H * 0.22);
    s.stars = [];
    s.powers = [];
    s.obstacles = [];
    for (let i = 0; i < OBSTACLE_COUNT; i++) {
      s.obstacles.push({
        x: 60 + Math.random() * (WORLD_W - 120),
        y: 60 + Math.random() * (WORLD_H - 120),
        r: 18,
        vx: (Math.random() * 2 - 1) * 1.4,
        vy: (Math.random() * 2 - 1) * 1.2,
      });
    }
    s.startedAt = performance.now();
    s.lastStarAt = 0;
    s.lastPowerCheck = 0;
    setWinner(null);
    setCountdown(ROUND_TIME);
    setShowTutorial(false);
    setUiTick((v) => v + 1);
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

  return (
    <div style={styles.app}>
      <Background />
      <canvas
        ref={canvasRef}
        width={WORLD_W}
        height={WORLD_H}
        style={styles.canvas}
      />
      {/* uiTick in dep chain forces fresh HUD numbers */}
      <Hud
        key={uiTick}
        players={sRef.current.players}
        countdown={countdown}
        winner={winner}
      />

      {showTutorial && (
        <div style={styles.tutorial}>
          <h2>How to Play</h2>
          <ul>
            <li>⭐ Collect stars to score points</li>
            <li>🟢 Grab boosts for speed</li>
            <li>🪨 Dodge obstacles</li>
            <li>🎮 Use joysticks to move both players</li>
            <li>⚡ Tap dash for burst speed</li>
            <li>🥇 First to {WIN_SCORE} stars wins!</li>
          </ul>
          <button onClick={startGame} style={styles.startBtn}>
            Start Game
          </button>
        </div>
      )}

      {running && (
        <>
          <div style={styles.topControls}>
            <Joystick
              label="H"
              onChange={(x, y) => (controls.current.harshil = { vx: x, vy: y })}
            />
            <button style={styles.dashBtn} onClick={() => onDash("harshil")}>
              ⚡
            </button>
          </div>
          <div style={styles.bottomControls}>
            <Joystick
              label="P"
              onChange={(x, y) => (controls.current.pulkit = { vx: x, vy: y })}
            />
            <button style={styles.dashBtn} onClick={() => onDash("pulkit")}>
              ⚡
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  app: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    background: COLORS.bgA,
    touchAction: "none",
    userSelect: "none",
  },
  canvas: { position: "absolute", inset: 0 },
  tutorial: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "rgba(0,0,0,0.8)",
    color: "#fff",
    zIndex: 20,
    textAlign: "center",
    padding: 16,
  },
  startBtn: {
    marginTop: 16,
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    border: "none",
    padding: "10px 20px",
    borderRadius: 999,
    color: "#fff",
    fontWeight: 700,
    boxShadow: "0 10px 30px rgba(124,58,237,0.35)",
  },
  topControls: {
    position: "absolute",
    top: 10,
    right: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
  },
  bottomControls: {
    position: "absolute",
    bottom: 10,
    left: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
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
};
