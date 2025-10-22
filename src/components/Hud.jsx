import React from "react";

export default function Hud({ p1Score, p2Score, time, winner }) {
  return (
    <div style={styles.hud}>
      <span>🟦 Pulkit: {p1Score}</span>
      <span style={{ fontWeight: 700 }}>{time}</span>
      <span>🔴 Harshil: {p2Score}</span>
      {winner && <div style={styles.winner}>{winner} Wins!</div>}
    </div>
  );
}

const styles = {
  hud: {
    position: "absolute", top: 10, left: 0, right: 0,
    display: "flex", justifyContent: "space-between", padding: "0 16px",
    color: "#fff", fontWeight: 600,
  },
  winner: {
    position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)",
    background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "6px 14px",
  }
};
