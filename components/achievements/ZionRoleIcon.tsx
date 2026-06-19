"use client";

export function ZionRoleIcon({ roleId, size = 40 }: { roleId: string; size?: number }) {
  const cyan = "#00b4d8";
  const purple = "#7b2fff";
  const bg = "#0a0a1a";
  const common = { width: size, height: size, viewBox: "0 0 40 40", fill: "none" as const };

  switch (roleId) {
    case "night_wolf":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M8 28 L14 14 L20 22 L26 14 L32 28 Z" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.15)" />
          <path d="M12 18 L10 10 M28 18 L30 10" stroke={cyan} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="16" cy="22" r="2" fill={cyan} />
          <circle cx="24" cy="22" r="2" fill={cyan} />
          <path d="M18 26 Q20 28 22 26" stroke={cyan} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
      );
    case "fire_fox":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M10 26 Q14 18 20 16 Q26 14 28 20 Q30 26 24 28 Q20 30 14 28 Z" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.12)" />
          <path d="M28 20 Q34 14 32 26 Q30 32 24 28" stroke={cyan} strokeWidth="1.2" fill="rgba(0,180,216,0.1)" />
          <circle cx="22" cy="22" r="1.5" fill={cyan} />
          <path d="M24 24 L26 26" stroke={cyan} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
      );
    case "void_dragon":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M8 30 Q12 10 20 14 Q28 10 32 30" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.15)" />
          <path d="M14 20 L20 16 L26 20 L22 24 Z" stroke={cyan} strokeWidth="1" fill="rgba(0,180,216,0.12)" />
          <path d="M10 26 L6 22 M30 26 L34 22" stroke={purple} strokeWidth="1" strokeLinecap="round" />
          <circle cx="20" cy="19" r="1.5" fill={cyan} />
        </svg>
      );
    case "storm_hawk":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M8 22 L20 12 L32 22 L26 22 L30 30 L20 24 L10 30 L14 22 Z" stroke={cyan} strokeWidth="1.2" fill="rgba(0,180,216,0.1)" />
          <path d="M18 8 L20 14 M24 6 L22 12" stroke={cyan} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M6 16 L10 18 L8 20" stroke={purple} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "crystal_mind":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M20 8 L28 16 L24 32 L16 32 L12 16 Z" stroke={cyan} strokeWidth="1.2" fill="rgba(0,180,216,0.08)" />
          <path d="M20 8 L20 32 M12 16 L28 16 M16 32 L24 16 M24 32 L16 16" stroke={cyan} strokeWidth="0.6" opacity="0.5" />
          <circle cx="17" cy="20" r="1.2" fill={cyan} />
          <circle cx="23" cy="20" r="1.2" fill={cyan} />
          <path d="M18 26 L22 26" stroke={cyan} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
      );
    case "shadow_ninja":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <ellipse cx="20" cy="30" rx="10" ry="3" fill="rgba(123,47,255,0.2)" />
          <path d="M20 10 Q26 14 24 22 Q22 28 20 28 Q18 28 16 22 Q14 14 20 10" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.12)" />
          <path d="M12 18 Q8 20 10 24 M28 18 Q32 20 30 24" stroke={purple} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
          <path d="M16 20 L24 20" stroke={cyan} strokeWidth="0.8" opacity="0.4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
        </svg>
      );
  }
}
