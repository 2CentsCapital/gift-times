import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "GIFT City Times — GIFT IFSC registry & daily updates";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#f5f2ea",
          color: "#1a1712",
          fontFamily: "Georgia, serif",
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#8a8272", textTransform: "uppercase" }}>
          GIFT City · Gandhinagar · IFSC
        </div>
        <div style={{ fontSize: 118, fontWeight: 700, marginTop: 12, lineHeight: 1 }}>GIFT City Times</div>
        <div style={{ width: 540, height: 6, background: "#7a1f1f", marginTop: 28 }} />
        <div style={{ fontSize: 32, marginTop: 30, color: "#4a453c" }}>
          The GIFT IFSC registry — circulars, tenders & daily updates
        </div>
        <div style={{ fontSize: 22, marginTop: 44, color: "#a0968a", letterSpacing: 2 }}>by valura.ai</div>
      </div>
    ),
    { ...size }
  );
}
