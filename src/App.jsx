import React, { useEffect, useRef, useState } from "react";

/**
 * Pulkit & Harshil — Mobile Arena (Ultimate Responsive Edition)
 * by Sanjay ⚡
 *
 * ✅ Portrait & landscape responsive
 * ✅ Auto unlock haptics/sound after first tap
 * ✅ Dual joystick / single control modes
 * ✅ Coins, obstacles, scoring, win modal
 */

const WORLD_W = 540;
const WORLD_H = 900;
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const P1 = { name: "Pulkit", color: "#3b82f6", keys: { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } };
const P2 = { name: "Harshil", color: "#ef4444", keys: { up: "w", down: "s", left: "a", right: "d" } };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

export default function App() {
  const appRef = useRef(null);
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const [vh, setVh] = useState(window.innerHeight);
  const [scale, setScale] = useState(1);
  const [running, setRunning] = useState(true);
  const [muted, setMuted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showHelp, setShowHelp] = useState(true);
  const [controlMode, setControlMode] = useState("both");
  const [scores, setScores] = useState({ pulkit: 0, harshil: 0 });
  const [vibrationAllowed, setVibrationAllowed] = useState(false);

  const worldRef = useRef(null);
  const keysRef = useRef({});
  const audioRef = useRef({ ctx: null });

  const [sticks, setSticks] = useState({
    left: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
    right: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 },
  });
  const JOY_MAX = 80;

  /* unlock haptics + audio on first tap */
  useEffect(() => {
    const unlock = () => setVibrationAllowed(true);
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  /* init world */
  useEffect(() => {
    resetWorld();
  }, []);

  function resetWorld() {
    const size = 30;
    worldRef.current = {
      p1: { x: WORLD_W / 2 - 100, y: WORLD_H - 120, r: size / 2, vx: 0, vy: 0, speed: 250 },
      p2: { x: WORLD_W / 2 + 100, y: WORLD_H - 120, r: size / 2, vx: 0, vy: 0, speed: 250 },
      coins: spawnCoins(7),
      obstacles: spawnVerticalObstacles(6),
      coinTimer: 0,
      time: 0,
    };
    setScores({ pulkit: 0, harshil: 0 });
    setWinner(null);
    setShowHelp(true);
    setRunning(true);
  }

  function spawnCoins(n) {
    return Array.from({ length: n }, () => ({
      x: rand(40, WORLD_W - 40),
      y: rand(80, WORLD_H - 200),
      r: 10,
      spin: rand(0, Math.PI * 2),
    }));
  }
  function spawnVerticalObstacles(n) {
    return Array.from({ length: n }, () => {
      const x = rand(40, WORLD_W - 80);
      const h = rand(180, 280);
      const y = rand(80, WORLD_H - 200 - h);
      return { x, y, w: 16, h, vx: rand(-120, 120), vy: 0 };
    });
  }

  /* resize */
  useEffect(() => {
    const onResize = () => {
      setVh(window.innerHeight);
      if (!boxRef.current) return;
      const bw = boxRef.current.clientWidth;
      const bh = boxRef.current.clientHeight;
      const s = Math.min(bw / WORLD_W, bh / WORLD_H);
      setScale(s > 0 ? s : 1);
    };
    onResize();
    window.addEventListener("resize", onResize);
    screen.orientation?.addEventListener?.("change", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      screen.orientation?.removeEventListener?.("change", onResize);
    };
  }, []);

  /* keyboard */
  useEffect(() => {
    const down = (e) => {
      keysRef.current[e.key] = true;
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.code === "Space") {
        e.preventDefault();
        setRunning((r) => !r);
      }
    };
    const up = (e) => {
      delete keysRef.current[e.key];
      delete keysRef.current[e.key.toLowerCase()];
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* game loop */
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let last = performance.now();

    const loop = (t) => {
      const dt = Math.min(32, t - last) / 1000;
      last = t;
      if (running && !winner) update(dt);
      draw(ctx);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, scale, winner, controlMode, sticks]);

  /* update */
  function update(dt) {
    const w = worldRef.current;
    if (!w) return;

    w.time += dt;
    w.coinTimer += dt;

    if (controlMode === "pulkit" || controlMode === "both") driveByKeys(w.p1, P1.keys);
    if (controlMode === "harshil" || controlMode === "both") driveByKeys(w.p2, P2.keys);
    driveBySticks(w);

    moveCircle(w.p1, dt);
    moveCircle(w.p2, dt);
    confine(w.p1);
    confine(w.p2);

    for (const o of w.obstacles) {
      o.x += o.vx * dt;
      if (o.x < 0 || o.x + o.w > WORLD_W) {
        o.vx *= -1;
        bump();
      }
    }

    collideCircleRects(w.p1, w.obstacles);
    collideCircleRects(w.p2, w.obstacles);

    if (w.coinTimer >= 1.2 && w.coins.length < 12) {
      w.coins.push(...spawnCoins(1));
      w.coinTimer = 0;
    }

    w.coins = w.coins.filter((c) => {
      const t1 = circleHit(w.p1, c);
      const t2 = circleHit(w.p2, c);
      if (t1 || t2) {
        addScore(t1 ? "pulkit" : "harshil");
        return false;
      }
      c.spin += dt * 3;
      return true;
    });
  }

  /* input + physics helpers */
  function driveByKeys(p, keys) {
    const k = keysRef.current;
    const ax = (k[keys.right] ? 1 : 0) - (k[keys.left] ? 1 : 0);
    const ay = (k[keys.down] ? 1 : 0) - (k[keys.up] ? 1 : 0);
    const m = Math.hypot(ax, ay);
    if (m > 0 && !isStickActiveFor(p)) {
      p.vx = (ax / m) * p.speed;
      p.vy = (ay / m) * p.speed;
    } else if (!isStickActiveFor(p)) {
      p.vx = 0; p.vy = 0;
    }
  }
  function isStickActiveFor(p) {
    const w = worldRef.current;
    if (!w) return false;
    if (p === w.p1) return sticks.right.active;
    if (p === w.p2) return sticks.left.active;
    return false;
  }
  function driveBySticks(w) {
    if (sticks.left.active && (controlMode === "harshil" || controlMode === "both")) {
      const v = stickVector(sticks.left);
      w.p2.vx = v.x * w.p2.speed;
      w.p2.vy = v.y * w.p2.speed;
    }
    if (sticks.right.active && (controlMode === "pulkit" || controlMode === "both")) {
      const v = stickVector(sticks.right);
      w.p1.vx = v.x * w.p1.speed;
      w.p1.vy = v.y * w.p1.speed;
    }
  }
  const stickVector = (s) => {
    const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy);
    if (m < 6) return { x: 0, y: 0 };
    return { x: dx / m, y: dy / m };
  };
  const moveCircle = (p, dt) => { p.x += p.vx * dt; p.y += p.vy * dt; };
  const confine = (p) => { p.x = clamp(p.x, p.r, WORLD_W - p.r); p.y = clamp(p.y, p.r, WORLD_H - p.r); };
  function collideCircleRects(c, rects) {
    for (const r of rects) {
      const cx = clamp(c.x, r.x, r.x + r.w);
      const cy = clamp(c.y, r.y, r.y + r.h);
      const dx = c.x - cx, dy = c.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < c.r * c.r) {
        const d = Math.sqrt(d2) || 0.0001;
        const nx = dx / d, ny = dy / d, overlap = c.r - d;
        c.x += nx * overlap; c.y += ny * overlap;
        bump();
      }
    }
  }
  const circleHit = (a, b) => dist(a.x, a.y, b.x, b.y) <= a.r + b.r;

  /* feedback */
  function addScore(who) {
    vibrate(20);
    ping();
    setScores((s) => {
      const n = { ...s, [who]: s[who] + 1 };
      if (n.pulkit >= 10 || n.harshil >= 10) {
        setWinner(n.pulkit >= 10 ? "Pulkit" : "Harshil");
        setRunning(false);
      }
      return n;
    });
  }
  const vibrate = (ms) => { if (vibrationAllowed) try { navigator.vibrate?.(ms); } catch {} };
  const bump = () => vibrate(10);
  const ensureAudio = () => {
    if (muted) return null;
    if (audioRef.current.ctx) return audioRef.current.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    audioRef.current.ctx = ctx;
    return ctx;
  };
  const ping = () => {
    const ctx = ensureAudio();
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = 880; g.gain.value = 0.0015;
    o.connect(g).connect(ctx.destination);
    o.start(); o.frequency.linearRampToValueAtTime(1320, ctx.currentTime + 0.06);
    g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.08);
    o.stop(ctx.currentTime + 0.09);
  };

  /* draw */
  function draw(ctx) {
    const c = canvasRef.current;
    const cssW = Math.floor(WORLD_W * scale);
    const cssH = Math.floor(WORLD_H * scale);
    c.width = cssW * DPR;
    c.height = cssH * DPR;
    c.style.width = cssW + "px";
    c.style.height = cssH + "px";

    ctx.save(); ctx.scale(DPR * scale, DPR * scale);
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, "#0b1220"); grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const wld = worldRef.current;
    for (const o of wld.obstacles) {
      ctx.fillStyle = "#22c55e22"; ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect?.(o.x, o.y, o.w, o.h, 6);
      ctx.fill(); ctx.stroke();
    }
    for (const coin of wld.coins) drawCoin(ctx, coin.x, coin.y, coin.r, coin.spin);
    drawPlayer(ctx, wld.p1, P1);
    drawPlayer(ctx, wld.p2, P2);
    hud(ctx);
    ctx.restore();
  }
  function drawCoin(ctx, x, y, r, spin) {
    ctx.save(); ctx.translate(x, y);
    ctx.shadowBlur = 16; ctx.shadowColor = "#f59e0b"; ctx.fillStyle = "#f59e0b";
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.85 + Math.cos(spin) * r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62 + Math.sin(spin) * r * 0.08, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawPlayer(ctx, p, cfg) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = cfg.color; ctx.strokeStyle = "white"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(-6, -4, 3, 0, Math.PI * 2); ctx.arc(6, -4, 3, 0, Math.PI * 2); ctx.fill();
    const tag = cfg.name;
    ctx.font = "bold 14px system-ui"; const w = ctx.measureText(tag).width + 14;
    ctx.fillStyle = "#0b1220"; ctx.strokeStyle = "#334155aa";
    ctx.roundRect?.(-w / 2, -p.r - 26, w, 20, 8);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e5e7eb"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tag, 0, -p.r - 16);
    ctx.restore();
  }
  function hud(ctx) {
    const box = (x, y, label, val, color) => {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = "#0b1220cc"; ctx.strokeStyle = color + "aa"; ctx.lineWidth = 2;
      ctx.roundRect?.(0, 0, 180, 52, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#94a3b8"; ctx.font = "600 12px system-ui"; ctx.fillText(label, 12, 16);
      ctx.fillStyle = "white"; ctx.font = "700 22px system-ui"; ctx.fillText(val.toString().padStart(2, "0"), 12, 36);
      ctx.restore();
    };
    box(14, 12, "Pulkit", scores.pulkit, P1.color);
    box(WORLD_W - 194, 12, "Harshil", scores.harshil, P2.color);
    if (!running && !winner) overlayText(ctx, "Paused — tap ▶ to resume");
    if (winner) overlayText(ctx, `${winner} wins!`);
  }
  const overlayText = (ctx, t) => {
    ctx.save(); ctx.fillStyle = "#0008"; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "800 28px system-ui"; ctx.fillText(t, WORLD_W / 2, WORLD_H / 2); ctx.restore();
  };

  /* touch controls */
  function onTouchStart(e) {
    const rect = boxRef.current.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    const next = { ...sticks };
    for (const t of e.changedTouches) {
      const side =
        controlMode === "pulkit" ? "right" :
        controlMode === "harshil" ? "left" :
        t.clientX < mid ? "left" : "right";
      if (next[side].active) continue;
      const p = toBox(t.clientX, t.clientY);
      next[side] = { active: true, id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
    setSticks(next);
    setShowHelp(false);
  }
  function onTouchMove(e) {
    const next = { ...sticks };
    for (const t of e.changedTouches) {
      const side = matchSide(t.identifier);
      if (!side) continue;
      const p = toBox(t.clientX, t.clientY);
      let dx = p.x - next[side].ox, dy = p.y - next[side].oy;
      const m = Math.hypot(dx, dy);
      if (m > JOY_MAX) { dx = (dx / m) * JOY_MAX; dy = (dy / m) * JOY_MAX; }
      next[side].x = next[side].ox + dx;
      next[side].y = next[side].oy + dy;
    }
    setSticks(next);
  }
  function onTouchEnd(e) {
    const next = { ...sticks };
    for (const t of e.changedTouches) {
      const side = matchSide(t.identifier);
      if (!side) continue;
      next[side].active = false;
      next[side].x = next[side].ox;
      next[side].y = next[side].oy;
    }
    setSticks(next);
  }
  const matchSide = (id) => (sticks.left.id === id ? "left" : sticks.right.id === id ? "right" : null);
  const toBox = (cx, cy) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  };

  /* ui */
  const uiBtn = (variant) => ({
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid transparent",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    ...(variant === "primary"
      ? { background: "#3b82f6", color: "white" }
      : variant === "danger"
      ? { background: "#ef4444", color: "white" }
      : { background: "transparent", color: "white", border: "1px solid #334155" }),
  });

  return (
    <div
      ref={appRef}
      style={{
        height: vh + "px",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg,#0b1220 0%,#0f172a 100%)",
        color: "white",
        fontFamily: "system-ui, sans-serif",
        padding: 12,
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800 }}>Pulkit & Harshil Arena</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Select who this phone controls → Pulkit / Harshil / Both
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button style={uiBtn(running ? "secondary" : "primary")} onClick={() => setRunning(!running)}>
            {running ? "Pause" : "Resume"}
          </button>
          <button style={uiBtn("danger")} onClick={resetWorld}>Reset</button>
          <button style={uiBtn("ghost")} onClick={() => setMuted(!muted)}>{muted ? "Unmute" : "Mute"}</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {["pulkit", "harshil", "both"].map((m) => (
          <button
            key={m}
            style={{
              ...uiBtn(),
              flex: 1,
              background: controlMode === m ? "#3b82f6" : "transparent",
            }}
            onClick={() => setControlMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div
        ref={boxRef}
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          position: "relative",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 22px 60px rgba(0,0,0,0.45)",
          touchAction: "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} />
        {winner && (
          <div style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)"
          }}>
            <div style={{
              background: "rgba(15,23,42,0.9)", padding: 16, borderRadius: 12, border: "1px solid #334155",
              textAlign: "center", maxWidth: "90vw"
            }}>
              <h2 style={{ marginBottom: 8 }}>{winner} wins! 🎉</h2>
              <button style={uiBtn("primary")} onClick={resetWorld}>Play Again</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", opacity: 0.5, fontSize: 12 }}>
        Made with 💙 for Pulkit & Harshil by sanjay 
      </div>
    </div>
  );
}
