import React, { useEffect, useRef } from "react";
import { COLORS, WORLD_W, WORLD_H } from "../utils/gameUtils";

export default function Background() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const stars = Array.from({ length: 100 }, () => ({
      x: Math.random() * WORLD_W,
      y: Math.random() * WORLD_H,
      r: Math.random() * 1.6 + 0.3,
      a: Math.random() * 0.8 + 0.2,
      vx: (Math.random() * 2 - 1) * 0.05,
      vy: (Math.random() * 2 - 1) * 0.05,
    }));

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
      g.addColorStop(0, COLORS.bgA);
      g.addColorStop(1, COLORS.bgB);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      stars.forEach((s) => {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0) s.x = WORLD_W;
        if (s.x > WORLD_W) s.x = 0;
        if (s.y < 0) s.y = WORLD_H;
        if (s.y > WORLD_H) s.y = 0;
        ctx.globalAlpha = s.a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    draw();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={WORLD_W}
      height={WORLD_H}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
      }}
    />
  );
}
