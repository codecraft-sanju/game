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
  const stageRef = useRef(null);        // scaled game world container
  const rafRef = useRef(0);

  // orientation + scaling
  const [isLandscape, setIsLandscape] = useState(window.innerWidth >= window.innerHeight);
  const [scale, setScale] = useState(1);
  const [vh, setVh] = useState(window.innerHeight); // visual viewport height fix

  // game ui state
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [countdown, setCountdown] = useState(ROUND_TIME);
  const [showTutorial, setShowTutorial] = useState(true);
  const [uiTick, setUiTick] = useState(0);

  // inputs
  const controls = useRef({
    pulkit: { vx: 0, vy: 0, dash: false, lastDash: -Infinity, dashUntil: 0 },
    harshil: { vx: 0, vy: 0, dash: false, lastDash: -Infinity, dashUntil: 0 },
  });

  // sim state
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

  // ===== Layout: scale stage to fit, but keep UI layer fixed to viewport =====
  const recomputeLayout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const landscape = w >= h;
    setIsLandscape(landscape);

    const fitScale = Math.min(w / WORLD_W, h / WORLD_H);
    setScale(fitScale);

    if (stageRef.current) {
      stageRef.current.style.transform = `translate(-50%, -50%) scale(${fitScale})`;
    }
  };

  // visualViewport height (mobile address bar shrink/expand) fix
  const bindViewport = () => {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    setVh(h);
    recomputeLayout();
  };

  useEffect(() => {
    bindViewport();

    window.addEventListener("resize", bindViewport);
    window.addEventListener("orientationchange", bindViewport);
    window.addEventListener("scroll", bindViewport, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", bindViewport);
      window.visualViewport.addEventListener("scroll", bindViewport);
    }

    return () => {
      window.removeEventListener("resize", bindViewport);
      window.removeEventListener("orientationchange", bindViewport);
      window.removeEventListener("scroll", bindViewport);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", bindViewport);
        window.visualViewport.removeEventListener("scroll", bindViewport);
      }
    };
  }, []);

  // Optional: fullscreen on first tap (feel like an app)
  useEffect(() => {
    const enableFullscreen = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      document.removeEventListener("click", enableFullscreen);
    };
    document.addEventListener("click", enableFullscreen, { once: true });
    return () => document.removeEventListener("click", enableFullscreen);
  }, []);

  // ===== RENDER/LOOP =====
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
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    };

    const drawPlayer = (ctx, p, color) => {
      const hitTint = (p.hitTintUntil || 0) > performance.now();
      const r = PLAYER_R * (hitTint ? 1.12 : 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur = 0;

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

      // BG
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

        if (s.stars.length < MAX_STARS && now - s.lastStarAt > STAR_RESPAWN_MS) {
          s.stars.push(randStar());
          s.lastStarAt = now;
        }

        if (now - s.lastPowerCheck > POWER_CHANCE_MS) {
          s.lastPowerCheck = now;
          if (Math.random() < POWER_PROBABILITY) s.powers.push(randPower());
        }

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

        const p1Before = s.players.pulkit.score;
        const p2Before = s.players.harshil.score;

        collectItems(s.players.pulkit, s.stars, STAR_R);
        collectItems(s.players.harshil, s.stars, STAR_R);
        takePowerups(s.players.pulkit, s.powers);
        takePowerups(s.players.harshil, s.powers);

        if (s.players.pulkit.score !== p1Before || s.players.harshil.score !== p2Before) {
          setUiTick((v) => v + 1);
        }

        if (s.players.pulkit.score >= WIN_SCORE || s.players.harshil.score >= WIN_SCORE) {
          setRunning(false);
          setWinner(s.players.pulkit.score > s.players.harshil.score ? "Pulkit" : "Harshil");
        }
      }

      for (const o of sRef.current.obstacles) drawObstacle(ctx, o);
      const t = performance.now();
      for (const st of sRef.current.stars) drawStar(ctx, st, t);
      for (const pw of sRef.current.powers) drawPower(ctx, pw, t);
      drawPlayer(ctx, sRef.current.players.pulkit, COLORS.p1);
      drawPlayer(ctx, sRef.current.players.harshil, COLORS.p2);

      rafRef.current = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, countdown, uiTick]);

  // ===== Game controls =====
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

  // ===== Render =====
  return (
    <div
      style={{
        ...styles.root,
        // visualViewport height fix to truly fullscreen (esp. mobile)
        minHeight: vh,
        height: vh,
      }}
    >
      {/* Letterboxed background fill */}
      <div style={styles.backFill} />

      {/* Scaled game stage (fixed WORLD size, centered, fits any screen) */}
      <div ref={stageRef} style={styles.stage}>
        <Background />
        <canvas
          ref={canvasRef}
          width={WORLD_W}
          height={WORLD_H}
          style={styles.canvas}
        />
        <Hud
          key={uiTick}
          players={sRef.current.players}
          countdown={countdown}
          winner={winner}
        />

        {showTutorial && (
          <div style={styles.tutorial}>
            <h2 style={{ margin: 0 }}>How to Play</h2>
            <ul style={{ marginTop: 12, lineHeight: 1.6 }}>
              <li>⭐ Collect stars to score points</li>
              <li>🟢 Grab boosts for speed</li>
              <li>🪨 Dodge obstacles</li>
              <li>🎮 Move with joysticks (bottom-left & top-right)</li>
              <li>⚡ Tap dash for burst speed</li>
              <li>🥇 First to {WIN_SCORE} stars wins!</li>
            </ul>
            <button onClick={startGame} style={styles.startBtn}>
              Start Game
            </button>
          </div>
        )}
      </div>

      {/* Viewport-fixed Controls Layer (never scales, never goes off-screen) */}
      {isLandscape && running && (
        <div style={styles.controlsLayer}>
          {/* Bottom-left: Pulkit joystick + dash */}
          <div style={styles.controlDockBL}>
            <Joystick
              label="P"
              size={110}                  // Joystick component can ignore if not used; safe
              onChange={(x, y) => (controls.current.pulkit = { vx: x, vy: y })}
            />
            <button style={styles.dashBtn} onClick={() => onDash("pulkit")} aria-label="Pulkit Dash">
              ⚡
            </button>
          </div>

          {/* Top-right: Harshil joystick + dash */}
          <div style={styles.controlDockTR}>
            <button style={styles.dashBtn} onClick={() => onDash("harshil")} aria-label="Harshil Dash">
              ⚡
            </button>
            <Joystick
              label="H"
              size={110}
              onChange={(x, y) => (controls.current.harshil = { vx: x, vy: y })}
            />
          </div>
        </div>
      )}

      {/* Portrait lock overlay */}
      {!isLandscape && (
        <div style={styles.rotateOverlay}>
          <div style={styles.rotateCard}>
            <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 6 }}>
              Rotate your phone
            </div>
            <div style={{ opacity: 0.9 }}>
              This game runs in landscape only. Turn your device sideways to play.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SA = {
  t: "env(safe-area-inset-top)",
  r: "env(safe-area-inset-right)",
  b: "env(safe-area-inset-bottom)",
  l: "env(safe-area-inset-left)",
};

const styles = {
  root: {
    position: "fixed",
    inset: 0,
    background: `linear-gradient(135deg, ${COLORS.bgA}, ${COLORS.bgB})`,
    overflow: "hidden",
    touchAction: "none",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  backFill: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(1200px 800px at 50% 50%, rgba(255,255,255,0.06), transparent 60%)",
    pointerEvents: "none",
  },
  // Fixed world, centered — scaled via inline style
  stage: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: `${WORLD_W}px`,
    height: `${WORLD_H}px`,
    transform: "translate(-50%, -50%) scale(1)", // updated dynamically
    transformOrigin: "top left",
    willChange: "transform",
    overflow: "hidden",
    borderRadius: 16,
  },
  canvas: {
    position: "absolute",
    inset: 0,
  },
  tutorial: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "rgba(0,0,0,0.78)",
    color: "#fff",
    zIndex: 20,
    textAlign: "center",
    padding: 16,
  },
  startBtn: {
    marginTop: 16,
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    border: "none",
    padding: "12px 22px",
    borderRadius: 999,
    color: "#fff",
    fontWeight: 700,
    boxShadow: "0 10px 30px rgba(124,58,237,0.35)",
    cursor: "pointer",
  },

  // ===== Controls Layer (fixed to viewport, safe-area aware) =====
  controlsLayer: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none", // allow touches to pass except on our controls
    zIndex: 50,
  },

  controlDockBL: {
    position: "fixed",
    left: `calc(12px + ${SA.l})`,
    bottom: `calc(12px + ${SA.b})`,
    display: "flex",
    alignItems: "center",
    gap: 10,
    pointerEvents: "auto",
  },

  controlDockTR: {
    position: "fixed",
    right: `calc(12px + ${SA.r})`,
    top: `calc(12px + ${SA.t})`,
    display: "flex",
    alignItems: "center",
    gap: 10,
    pointerEvents: "auto",
  },

  dashBtn: {
    fontSize: 22,
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.28)",
    borderRadius: 999,
    width: 56,
    height: 56,
    color: "white",
    textShadow: "0 0 4px #fff",
    backdropFilter: "blur(8px)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },

  // Portrait lock overlay
  rotateOverlay: {
    position: "fixed",
    inset: 0,
    background: "#0b1220",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 9999,
  },
  rotateCard: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 16,
    padding: "18px 20px",
    color: "#fff",
    textAlign: "center",
    maxWidth: 380,
    width: "100%",
    backdropFilter: "blur(8px)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
};
