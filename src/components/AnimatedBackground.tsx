import { useEffect, useState } from "react";

export type BgTheme = "aurora" | "mesh" | "grid" | "sunset" | "plain";

const THEMES: { id: BgTheme; label: string; swatch: string }[] = [
  { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg,#0f172a,#1e3a8a,#7c3aed,#22d3ee)" },
  { id: "mesh", label: "Mesh", swatch: "linear-gradient(135deg,#ec4899,#8b5cf6,#3b82f6)" },
  { id: "sunset", label: "Sunset", swatch: "linear-gradient(135deg,#f97316,#db2777,#7c2d12)" },
  { id: "grid", label: "Grid", swatch: "linear-gradient(135deg,#020617,#0f172a)" },
  { id: "plain", label: "Plain", swatch: "#ffffff" },
];

const STORAGE_KEY = "dashboard-bg-theme";

export function useBgTheme() {
  const [theme, setTheme] = useState<BgTheme>("plain");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as BgTheme | null;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

export function BgThemePicker({
  theme,
  onChange,
}: {
  theme: BgTheme;
  onChange: (t: BgTheme) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/70 p-1 backdrop-blur">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          title={t.label}
          aria-label={`Theme ${t.label}`}
          className={`h-6 w-6 rounded-full border transition-all ${
            theme === t.id ? "scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border/60 hover:scale-105"
          }`}
          style={{ background: t.swatch }}
        />
      ))}
    </div>
  );
}

export function AnimatedBackground({ theme }: { theme: BgTheme }) {
  if (theme === "plain") return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {theme === "aurora" && (
        <>
          <div className="absolute inset-0 bg-[#050816]" />
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,8,22,0.6)_80%)]" />
        </>
      )}
      {theme === "mesh" && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-200 via-violet-200 to-sky-200 dark:from-fuchsia-950 dark:via-violet-950 dark:to-sky-950" />
          <div className="mesh-blob mesh-blob-1" />
          <div className="mesh-blob mesh-blob-2" />
          <div className="mesh-blob mesh-blob-3" />
        </>
      )}
      {theme === "sunset" && (
        <>
          <div className="absolute inset-0 animated-sunset" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.15),transparent_60%)]" />
        </>
      )}
      {theme === "grid" && (
        <>
          <div className="absolute inset-0 bg-[#020617]" />
          <div className="absolute inset-0 grid-pan opacity-40" />
          <div className="grid-pulse grid-pulse-1" />
          <div className="grid-pulse grid-pulse-2" />
        </>
      )}

      <style>{`
        @keyframes float-slow {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(8vw,-6vh) scale(1.15); }
          66% { transform: translate(-6vw,8vh) scale(0.9); }
        }
        @keyframes hue-shift {
          0%,100% { filter: hue-rotate(0deg); }
          50% { filter: hue-rotate(60deg); }
        }
        @keyframes grid-pan-kf {
          0% { background-position: 0 0; }
          100% { background-position: 60px 60px; }
        }
        @keyframes sunset-shift {
          0%,100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .aurora-blob {
          position: absolute;
          width: 55vw;
          height: 55vw;
          border-radius: 9999px;
          filter: blur(80px);
          opacity: 0.55;
          mix-blend-mode: screen;
          animation: float-slow 22s ease-in-out infinite, hue-shift 18s linear infinite;
        }
        .aurora-blob-1 { top: -10%; left: -10%; background: radial-gradient(circle, #7c3aed 0%, transparent 60%); }
        .aurora-blob-2 { top: 20%; right: -15%; background: radial-gradient(circle, #22d3ee 0%, transparent 60%); animation-delay: -8s; }
        .aurora-blob-3 { bottom: -15%; left: 20%; background: radial-gradient(circle, #ec4899 0%, transparent 60%); animation-delay: -15s; }

        .mesh-blob {
          position: absolute;
          width: 45vw;
          height: 45vw;
          border-radius: 9999px;
          filter: blur(90px);
          opacity: 0.6;
          animation: float-slow 26s ease-in-out infinite;
        }
        .mesh-blob-1 { top: -10%; left: 10%; background: #f472b6; }
        .mesh-blob-2 { top: 30%; right: -5%; background: #a78bfa; animation-delay: -10s; }
        .mesh-blob-3 { bottom: -10%; left: 30%; background: #60a5fa; animation-delay: -18s; }

        .animated-sunset {
          background: linear-gradient(120deg,#fb923c,#e11d48,#7c2d12,#f59e0b,#be185d);
          background-size: 300% 300%;
          animation: sunset-shift 16s ease-in-out infinite;
        }

        .grid-pan {
          background-image:
            linear-gradient(rgba(59,130,246,0.35) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.35) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: grid-pan-kf 8s linear infinite;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
        }
        .grid-pulse {
          position: absolute;
          width: 40vw; height: 40vw;
          border-radius: 9999px;
          filter: blur(100px);
          opacity: 0.5;
          animation: float-slow 28s ease-in-out infinite;
        }
        .grid-pulse-1 { top: 10%; left: 10%; background: #3b82f6; }
        .grid-pulse-2 { bottom: 10%; right: 5%; background: #06b6d4; animation-delay: -12s; }
      `}</style>
    </div>
  );
}
