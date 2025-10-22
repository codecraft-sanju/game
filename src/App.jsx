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
} from "./utils/gameUtils";

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
    parallax: makeParallax(80),
    startedAt: 0,
  });

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const loop = () => {
      const s = sRef.current;
      const vw = WORLD_W;
      const vh = WORLD_H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Draw background
      const g = ctx.createLinearGradient(0, 0, vw, vh);
      g.addColorStop(0, COLORS.bgA);
      g.addColorStop(1, COLORS.bgB);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);

      tickParallax(s.parallax, vw, vh);

      if (running) {
        const now = performance.now();
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

        updatePlayer(s.players.pulkit, controls.current.pulkit, now);
        updatePlayer(s.players.harshil, controls.current.harshil, now);
        collideWorldAndObstacles(s.players.pulkit, s.obstacles);
        collideWorldAndObstacles(s.players.harshil, s.obstacles);
        resolvePlayersBounce(s.players.pulkit, s.players.harshil);
        collectItems(s.players.pulkit, s.stars, 10);
        collectItems(s.players.harshil, s.stars, 10);
        takePowerups(s.players.pulkit, s.powers);
        takePowerups(s.players.harshil, s.powers);
      }

      // Draw players
      drawPlayer(ctx, s.players.pulkit, COLORS.p1);
      drawPlayer(ctx, s.players.harshil, COLORS.p2);

      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const drawPlayer = (ctx, p, color) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;
  };

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
    setWinner(null);
    setCountdown(ROUND_TIME);
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

  return (
    <div style={styles.app}>
      <Background />
      <canvas ref={canvasRef} width={WORLD_W} height={WORLD_H} style={styles.canvas} />
      <Hud players={sRef.current.players} countdown={countdown} winner={winner} />

      {showTutorial && (
        <div style={styles.tutorial}>
          <h2>How to Play</h2>
          <ul>
            <li>⭐ Collect stars to score points</li>
            <li>⚡ Tap dash to boost speed</li>
            <li>🎮 Use joysticks to move both players</li>
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
            <Joystick label="H" onChange={(x, y) => (controls.current.harshil = { vx: x, vy: y })} />
            <button style={styles.dashBtn} onClick={() => onDash("harshil")}>
              ⚡
            </button>
          </div>
          <div style={styles.bottomControls}>
            <Joystick label="P" onChange={(x, y) => (controls.current.pulkit = { vx: x, vy: y })} />
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
  app: { position: "fixed", inset: 0, overflow: "hidden", background: COLORS.bgA },
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
};
