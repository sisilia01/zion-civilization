"use client";

import { useEffect } from "react";

export default function AuthCallback() {
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get("id_token");
    if (idToken) {
      localStorage.setItem("zklogin_jwt", idToken);
    }
    window.location.href = "/";
  }, []);

  return (
    <div
      style={{
        background: "#000",
        color: "#00ff41",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "monospace",
        fontSize: "1.2rem",
      }}
    >
      ⚡ Connecting to ZION...
    </div>
  );
}
