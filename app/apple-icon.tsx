import { ImageResponse } from "next/og";

// Apple touch icon (home-screen / bookmark). iOS rounds the corners itself.
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#7a1f1f",
          color: "#f5f2ea",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 112, fontWeight: 700, lineHeight: 1 }}>G</div>
        <div style={{ width: 74, height: 4, background: "#f5f2ea", marginTop: 8, opacity: 0.85 }} />
      </div>
    ),
    { ...size }
  );
}
