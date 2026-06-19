"use client";
import Link from "next/link";
import { ZionHome } from "@/components/zion/ZionHome";

export default function FieldNotesPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#050810",
      color: "#fff",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 24px",
        borderBottom: "1px solid rgba(100,150,255,0.1)"
      }}>
        <Link href="/" style={{ 
          color: "#4a9eff", fontSize: "12px", 
          letterSpacing: "1px", textDecoration: "none" 
        }}>
          ← OBSERVATORY
        </Link>
        <span style={{ 
          color: "#4a9eff", fontSize: "12px", 
          letterSpacing: "2px" 
        }}>FIELD NOTES</span>
      </div>
      <ZionHome activeTab="chat" standalone />
    </div>
  );
}
