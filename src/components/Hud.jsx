import React from "react";
import { COLORS } from "../utils/gameUtils";

export default function Hud({ players, countdown, winner }) {
  return (
    <div style={styles.hud}>
      <span style={{ color: COLORS.p1 }}>Pulkit: {players.pulkit.score}</span>
      <span style={{ fontWeight: 700 }}>{formatTime(countdown)}</span>
      <span style={{ color: COLORS.p2 }}>Harshil: {players.harshil.score}</span>
      {winner && <div style={styles.winner}>{winner} Wins!</div>}
    </div>
  );
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

const styles = {
  hud: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-between",
    padding: "0 16px",
    color: "#fff",
    fontWeight: 600,
    fontSize: 18,
    textShadow: "0 0 8px rgba(255,255,255,0.4)",
  },
  winner: {
    position: "absolute",
    top: 60,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: "6px 14px",
    fontWeight: 700,
    backdropFilter: "blur(6px)",
    animation: "fadeIn 1s ease",
  },
};
