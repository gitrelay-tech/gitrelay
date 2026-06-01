import { ImageResponse } from "next/og";

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
          alignItems: "center",
          justifyContent: "center",
          background: "#fffdf8",
          position: "relative",
        }}
      >
        {/* Decorative shadow block */}
        <div
          style={{
            position: "absolute",
            top: 180,
            left: "50%",
            transform: "translateX(-50%) translateX(8px) translateY(8px)",
            width: 720,
            height: 200,
            background: "#18181b",
            borderRadius: 20,
          }}
        />
        {/* Main card */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "#fff4da",
            border: "4px solid #18181b",
            borderRadius: 20,
            padding: "40px 64px",
            width: 720,
            height: 200,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: "#18181b",
              letterSpacing: "-2px",
              lineHeight: 1.1,
              textAlign: "center",
            }}
          >
            GitRelay
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#52525b",
              textAlign: "center",
              maxWidth: 560,
            }}
          >
            Reverse engineer any GitHub repo into a coding agent prompt
          </div>
        </div>
        {/* URL badge */}
        <div
          style={{
            marginTop: 40,
            fontSize: 18,
            color: "#a1a1aa",
            letterSpacing: "0.5px",
          }}
        >
          gitrelay.xyz
        </div>
      </div>
    ),
    { ...size }
  );
}
