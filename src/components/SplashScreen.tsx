import { useEffect, useState } from "react";
import logo from "@/assets/lps-symbol.png.asset.json";

/**
 * Startup splash: centered logo symbol + "By ANZ" attribution.
 * Runs once per page load (open / reload / sign-in), ~1.6s total.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("out"), 1200);
    const t2 = setTimeout(() => setPhase("gone"), 1650);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-[400ms] ${
        phase === "out" ? "opacity-0" : "opacity-100"
      }`}
    >
      <img
        src={logo.url}
        alt=""
        className="h-28 w-28 animate-[splash-logo_600ms_cubic-bezier(0.16,1,0.3,1)_both] object-contain"
      />
      <span className="mt-4 animate-[splash-text_400ms_ease-out_500ms_both] text-xs uppercase tracking-widest text-slate-400">
        By ANZ
      </span>
    </div>
  );
}
