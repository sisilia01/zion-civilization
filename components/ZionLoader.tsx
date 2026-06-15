"use client";
import { useEffect, useState } from "react";

export function ZionLoader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (document.readyState === "complete") {
      setTimeout(() => setVisible(false), 500);
    } else {
      const handler = () => setTimeout(() => setVisible(false), 500);
      window.addEventListener("load", handler);
      return () => window.removeEventListener("load", handler);
    }
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 99999,
      background: "#000000",
    }}>
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
        <source src="/videos/loader_bg.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
