"use client";

export function BlackHole() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#000000",
      }}
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      >
        <source src="/videos/blackhole.mp4" type="video/mp4" />
        <source src="/videos/blackhole.webm" type="video/webm" />
      </video>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)",
        }}
      />
    </div>
  );
}
