import React, { useEffect, useRef, useState } from "react";

/**
 * 📱 Two-Player Mobile Arena — Pulkit vs Harshil
 * - Landscape-first. Shows rotate overlay if device is in portrait.
 * - On-screen split controls (bottom = Pulkit, top = Harshil).
 * - Smooth 60fps loop with requestAnimationFrame.
 * - Collect stars to score. First to 10 or highest score when timer ends wins.
 * - No external libraries, pure React + Canvas.
 *
 * Controls:
 *   Pulkit (BOTTOM):  ⬅️  ➡️  ⚡ (dash)
 *   Harshil (TOP):    ⬅️  ➡️  ⚡ (dash)
 *
 * Tips:
 *  - Keep the phone rotated to landscape for comfy play.
 *  - Multi-touch enabled (you can hold left+dash, etc.).
 */

const TARGET_FPS = 60;
const WORLD_W = 900;  // logical canvas width (landscape)
const WORLD_H = 540;  // logical canvas height
const DPR = Math.max(1, Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));

// Player presets
const P1 = {
  id: "pulkit",
  color: "#3b82f6",
  baseSpeed: 3.2,
  dashSpeed: 6.0,
};

const P2 = {
  id: "harshil",
  color: "#ef4444",
  baseSpeed: 3.2,
  dashSpeed: 6.0,
};

const STAR_COLOR = "#facc15";
const STAR_SIZE = 10;
const PLAYER_RADIUS = 16;
const FRICTION = 0.9;
const DASH_TIME = 180; // ms
const DASH_COOLDOWN = 900; // ms
const ROUND_TIME = 60; // seconds
const WIN_SCORE = 10;

function useLandscape() {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= window.innerHeight;
  });
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

  // UI/game state
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(ROUND_TIME);
  const [winner, setWinner] = useState(null); // "pulkit" | "harshil" | "draw" | null

  // Controls state (held/tapping)
  const controls = useRef({
    pulkit: { left: false, right: false, dash: false, lastDash: -Infinity, dashActiveUntil: 0 },
    harshil: { left: false, right: false, dash: false, lastDash: -Infinity, dashActiveUntil: 0 },
  });

  // Physics state
  const stateRef = useRef({
    players: {
      pulkit: {
        x: WORLD_W * 0.25,
        y: WORLD_H * 0.75,
        vx: 0,
        vy: 0,
        score: 0,
      },
      harshil: {
        x: WORLD_W * 0.75,
        y: WORLD_H * 0.25,
        vx: 0,
        vy: 0,
        score: 0,
      },
    },
    stars: [],
    lastSpawn: 0,
    startedAt: 0,
  });

  // Responsive canvas sizing
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      // Fit WORLD_W x WORLD_H inside wrap while preserving aspect ratio
      const worldRatio = WORLD_W / WORLD_H;
      let drawW = w, drawH = Math.round(w / worldRatio);
      if (drawH > h) {
        drawH = h;
        drawW = Math.round(h * worldRatio);
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

  // Game Loop
  useEffect(() => {
    const loop = (t) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Scale for DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      // Clear
      ctx.clearRect(0, 0, canvas.width / DPR, canvas.height / DPR);

      // Draw arena background
      drawArena(ctx);

      const s = stateRef.current;
      if (running) {
        // Timer
        const now = performance.now();
        const elapsed = (now - s.startedAt) / 1000;
        const remain = Math.max(0, ROUND_TIME - Math.floor(elapsed));
        if (remain !== countdown) setCountdown(remain);

        // End round conditions
        if (remain <= 0) {
          setRunning(false);
          const { pulkit, harshil } = s.players;
          if (pulkit.score > harshil.score) setWinner("pulkit");
          else if (harshil.score > pulkit.score) setWinner("harshil");
          else setWinner("draw");
        }

        // Spawn stars
        if (now - s.lastSpawn > 900 && s.stars.length < 5) {
          s.lastSpawn = now;
          s.stars.push(randomStar());
        }

        // Update players
        updatePlayer(s.players.pulkit, controls.current.pulkit, P1);
        updatePlayer(s.players.harshil, controls.current.harshil, P2);

        // Collide with walls
        clampToBounds(s.players.pulkit);
        clampToBounds(s.players.harshil);

        // Check star collection
        checkStars(s.players.pulkit, s.stars);
        checkStars(s.players.harshil, s.stars);
      }

      // Draw stars
      drawStars(ctx, stateRef.current.stars);

      // Draw players + HUD
      drawPlayer(ctx, s.players.pulkit, P1.color);
      drawPlayer(ctx, s.players.harshil, P2.color);

      drawHud(ctx, s.players, countdown, running, winner);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, countdown, winner]);

  const startGame = () => {
    // reset
    const s = stateRef.current;
    s.players.pulkit = { x: WORLD_W * 0.25, y: WORLD_H * 0.75, vx: 0, vy: 0, score: 0 };
    s.players.harshil = { x: WORLD_W * 0.75, y: WORLD_H * 0.25, vx: 0, vy: 0, score: 0 };
    s.stars = [];
    s.lastSpawn = 0;
    s.startedAt = performance.now();
    setWinner(null);
    setCountdown(ROUND_TIME);
    setRunning(true);
  };

  const isLandscape = useLandscape();

  // Touch helpers — map buttons to controls
  const bindTouch = (player, key, pressed) => (e) => {
    e.preventDefault();
    const c = controls.current[player];
    if (!c) return;
    if (key === "dash") {
      if (pressed) {
        const now = performance.now();
        if (now > c.lastDash + DASH_COOLDOWN) {
          c.lastDash = now;
          c.dash = true;
          c.dashActiveUntil = now + DASH_TIME;
        }
      }
    } else {
      c[key] = pressed;
    }
  };

  // Multi-touch: ensure releasing one finger doesn't kill all buttons.
  const bindTouchStart = (player, key) => bindTouch(player, key, true);
  const bindTouchEnd = (player, key) => bindTouch(player, key, false);

  return (
    <div style={styles.app}>
      {/* Rotate overlay if portrait */}
      {!isLandscape && (
        <div style={styles.rotateOverlay}>
          <div style={styles.rotateCard}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Rotate to Play</div>
            <div style={{ opacity: 0.8, fontSize: 14 }}>
              Please rotate your phone to landscape for the best two-player experience.
            </div>
          </div>
        </div>
      )}

      <div ref={wrapRef} style={styles.gameWrap}>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          width={Math.round(WORLD_W * DPR)}
          height={Math.round(WORLD_H * DPR)}
        />

        {/* Center Start/Reset */}
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

        {/* Top Controls — Harshil */}
        <div style={styles.topControls} onContextMenu={(e) => e.preventDefault()}>
          <TouchBtn
            label="⟵"
            onStart={bindTouchStart("harshil", "left")}
            onEnd={bindTouchEnd("harshil", "left")}
          />
          <TouchBtn
            label="⚡"
            onStart={bindTouchStart("harshil", "dash")}
            onEnd={bindTouchEnd("harshil", "dash")}
          />
          <TouchBtn
            label="⟶"
            onStart={bindTouchStart("harshil", "right")}
            onEnd={bindTouchEnd("harshil", "right")}
          />
        </div>

        {/* Bottom Controls — Pulkit */}
        <div style={styles.bottomControls} onContextMenu={(e) => e.preventDefault()}>
          <TouchBtn
            label="⟵"
            onStart={bindTouchStart("pulkit", "left")}
            onEnd={bindTouchEnd("pulkit", "left")}
          />
          <TouchBtn
            label="⚡"
            onStart={bindTouchStart("pulkit", "dash")}
            onEnd={bindTouchEnd("pulkit", "dash")}
          />
          <TouchBtn
            label="⟶"
            onStart={bindTouchStart("pulkit", "right")}
            onEnd={bindTouchEnd("pulkit", "right")}
          />
        </div>
      </div>
    </div>
  );
}

/* =======================
   Components & Helpers
   ======================= */

function TouchBtn({ label, onStart, onEnd }) {
  // Bind both touch and mouse so it also runs on desktop emulators if needed
  return (
    <button
      style={styles.controlBtn}
      onMouseDown={onStart}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      onTouchStart={onStart}
      onTouchEnd={onEnd}
    >
      {label}
    </button>
  );
}

function drawArena(ctx) {
  // background
  const w = ctx.canvas.width / DPR;
  const h = ctx.canvas.height / DPR;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0b1220");
  grad.addColorStop(1, "#111827");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // borders
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  // midline
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPlayer(ctx, p, color) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // subtle outline
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.stroke();
}

function drawStars(ctx, stars) {
  for (const s of stars) {
    drawStar(ctx, s.x, s.y, STAR_SIZE, 5);
  }
}

function drawStar(ctx, x, y, r, spikes) {
  const step = Math.PI / spikes;
  let rot = Math.PI / 2 * 3;
  let outer = r, inner = r * 0.5;

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
  ctx.lineTo(x, y - outer);
  ctx.closePath();
  ctx.fillStyle = STAR_COLOR;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawHud(ctx, players, countdown, running, winner) {
  const w = ctx.canvas.width / DPR;
  const pad = 16;

  ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "white";

  // Scores
  const left = `Pulkit: ${players.pulkit.score}`;
  const right = `Harshil: ${players.harshil.score}`;
  ctx.fillText(left, pad, pad + 18);
  const textW = ctx.measureText(right).width;
  ctx.fillText(right, w - pad - textW, pad + 18);

  // Timer (center top)
  const timer = formatTime(countdown);
  const timerW = ctx.measureText(timer).width;
  ctx.fillText(timer, (w - timerW) / 2, pad + 18);

  // Footer hint when not running
  if (!running && !winner) {
    const hint = "Tap START, collect ⭐ stars. First to 10 wins!";
    const hintW = ctx.measureText(hint).width;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(hint, (w - hintW) / 2, 40);
  }
}

function formatTime(s) {
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function clampToBounds(p) {
  p.x = Math.max(8 + PLAYER_RADIUS, Math.min(WORLD_W - 8 - PLAYER_RADIUS, p.x));
  p.y = Math.max(8 + PLAYER_RADIUS, Math.min(WORLD_H - 8 - PLAYER_RADIUS, p.y));
}

function randomStar() {
  // keep stars off walls a bit
  const margin = 40;
  return {
    x: margin + Math.random() * (WORLD_W - margin * 2),
    y: margin + Math.random() * (WORLD_H - margin * 2),
  };
}

function updatePlayer(p, ctrl, preset) {
  // dash active?
  const now = performance.now();
  const dashActive = now < (ctrl.dashActiveUntil || 0);

  const speed = dashActive ? preset.dashSpeed : preset.baseSpeed;

  // horizontal
  if (ctrl.left && !ctrl.right) p.vx -= speed * 0.4;
  if (ctrl.right && !ctrl.left) p.vx += speed * 0.4;

  // apply friction
  p.vx *= FRICTION;
  p.vy *= FRICTION; // (no gravity; top-down feel)

  // integrate
  p.x += p.vx;
  p.y += p.vy;

  // stop dash when time ends
  if (dashActive && now >= ctrl.dashActiveUntil) {
    ctrl.dash = false;
  }
}

function checkStars(player, stars) {
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= (PLAYER_RADIUS + STAR_SIZE * 0.6) ** 2) {
      stars.splice(i, 1);
      player.score += 1;
    }
  }
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* =======================
   Styles (inline, no libs)
   ======================= */
const styles = {
  app: {
    position: "fixed",
    inset: 0,
    background: "#0b1220",
    color: "white",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
  },
  gameWrap: {
    position: "absolute",
    inset: 0,
    display: "grid",
    gridTemplateRows: "1fr auto",
    alignItems: "stretch",
    justifyItems: "stretch",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    margin: "auto",
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: 16,
    boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
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
    bottom: 24,
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.2)",
    padding: "8px 14px",
    borderRadius: 999,
    fontWeight: 700,
    letterSpacing: 0.3,
    backdropFilter: "blur(6px)",
  },

  topControls: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "0 16px",
    pointerEvents: "auto",
  },
  bottomControls: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "0 16px",
    pointerEvents: "auto",
  },
  controlBtn: {
    flex: "0 0 30%",
    padding: "12px 0",
    borderRadius: 14,
    fontSize: 20,
    fontWeight: 700,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    backdropFilter: "blur(8px)",
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
