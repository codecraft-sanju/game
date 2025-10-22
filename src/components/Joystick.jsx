import React, { useRef, useEffect, useState } from "react";

export default function Joystick({ label, onChange }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = (e) => {
      const rect = el.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      const cx = rect.width / 2,
        cy = rect.height / 2;
      const dx = t.clientX - (rect.left + cx);
      const dy = t.clientY - (rect.top + cy);
      const dist = Math.min(Math.hypot(dx, dy), 40);
      const angle = Math.atan2(dy, dx);
      const x = Math.cos(angle) * dist,
        y = Math.sin(angle) * dist;
      setPos({ x, y });
      onChange(x / 40, y / 40);
    };

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
            boxShadow: active ? "0 0 10px #fff" : "none",
            background: active
              ? "radial-gradient(circle, #fff, #a5f3fc)"
              : "rgba(255,255,255,0.6)",
          }}
        />
      </div>
      <div style={styles.joyLabel}>{label}</div>
    </div>
  );
}

const styles = {
  joyOuter: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  joyBase: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.2)",
    position: "relative",
    touchAction: "none",
    backdropFilter: "blur(6px)",
  },
  joyStick: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    transition: "transform 0.05s linear, background 0.2s ease",
  },
  joyLabel: { fontSize: 12, opacity: 0.8, color: "#fff" },
};
