import { ImageResponse } from "next/og";

// Favicon — a serif "G" in newsprint on oxblood, echoing the masthead.
export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7a1f1f",
          color: "#f5f2ea",
          fontSize: 24,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
        }}
      >
        G
      </div>
    ),
    { ...size }
  );
}
