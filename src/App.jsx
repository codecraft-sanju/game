import React, { useRef, useState, useEffect } from "react";
import Joystick from "./components/Joystick";
import Hud from "./components/Hud";
import Background from "./components/Background";
import { initPlayer, updatePlayer, WORLD_W, WORLD_H } from "./utils/gameUtils";

export default function App() {
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [time, setTime] = useState("01:00");
  const [p1, setP1] = useState(initPlayer(WORLD_W * 0.25, WORLD_H * 0.8));
  const [p2, setP2] = useState(initPlayer(WORLD_W * 0.75, WORLD_H * 0.2));

  const p1Ctrl = useRef({ vx: 0, vy: 0 });
  const p2Ctrl = useRef({ vx: 0, vy: 0 });

  useEffect(() => {
    let raf;
    const loop = () => {
      const now = performance.now();
      updatePlayer(p1, p1Ctrl.current, now);
      updatePlayer(p2, p2Ctrl.current, now);
      setP1({ ...p1 });
      setP2({ ...p2 });
      raf = requestAnimationFrame(loop);
    };
    if (running) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  return (
    <div style={styles.app}>
      <Background />
      <Hud p1Score={p1.score} p2Score={p2.score} time={time} winner={winner} />
      {!running && (
        <button style={styles.startBtn} onClick={() => setRunning(true)}>
          Start Game
        </button>
      )}
      {running && (
        <>
          <div style={styles.topControls}>
            <Joystick label="H" onChange={(x, y) => (p2Ctrl.current = { vx: x, vy: y })} />
          </div>
          <div style={styles.bottomControls}>
            <Joystick label="P" onChange={(x, y) => (p1Ctrl.current = { vx: x, vy: y })} />
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  app: { position: "fixed", inset: 0, overflow: "hidden", background: "#0b1220" },
  topControls: { position: "absolute", top: 10, right: 10 },
  bottomControls: { position: "absolute", bottom: 10, left: 10 },
  startBtn: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    background: "linear-gradient(135deg, #2563eb, #7c3aed)", border: "none",
    color: "#fff", padding: "12px 26px", borderRadius: 999, fontWeight: 700,
  },
};
