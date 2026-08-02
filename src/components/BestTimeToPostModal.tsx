import { useEffect, useMemo, useState } from "react";
import { Clock, Sparkles, X, TrendingUp, CalendarDays } from "lucide-react";

type Country = {
  code: string;
  name: string;
  timezones: string[];
};

const COUNTRIES: Country[] = [
  { code: "US", name: "United States", timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"] },
  { code: "CA", name: "Canada", timezones: ["America/Toronto", "America/Vancouver", "America/Edmonton"] },
  { code: "GB", name: "United Kingdom", timezones: ["Europe/London"] },
  { code: "IE", name: "Ireland", timezones: ["Europe/Dublin"] },
  { code: "DE", name: "Germany", timezones: ["Europe/Berlin"] },
  { code: "FR", name: "France", timezones: ["Europe/Paris"] },
  { code: "ES", name: "Spain", timezones: ["Europe/Madrid"] },
  { code: "IT", name: "Italy", timezones: ["Europe/Rome"] },
  { code: "NL", name: "Netherlands", timezones: ["Europe/Amsterdam"] },
  { code: "SE", name: "Sweden", timezones: ["Europe/Stockholm"] },
  { code: "AE", name: "United Arab Emirates", timezones: ["Asia/Dubai"] },
  { code: "IN", name: "India", timezones: ["Asia/Kolkata"] },
  { code: "PK", name: "Pakistan", timezones: ["Asia/Karachi"] },
  { code: "SG", name: "Singapore", timezones: ["Asia/Singapore"] },
  { code: "JP", name: "Japan", timezones: ["Asia/Tokyo"] },
  { code: "CN", name: "China", timezones: ["Asia/Shanghai"] },
  { code: "AU", name: "Australia", timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Perth"] },
  { code: "NZ", name: "New Zealand", timezones: ["Pacific/Auckland"] },
  { code: "BR", name: "Brazil", timezones: ["America/Sao_Paulo"] },
  { code: "MX", name: "Mexico", timezones: ["America/Mexico_City"] },
  { code: "ZA", name: "South Africa", timezones: ["Africa/Johannesburg"] },
];

type Recommendation = {
  peakDay: string;
  peakWindow: string;
  localNow: string;
  score: number;
  headline: string;
  tips: string[];
};

// LinkedIn engagement heuristics: Tue-Thu, 9am-12pm and 5-6pm local time perform best.
function computeRecommendation(timezone: string): Recommendation {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Monday";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = Number(hourStr);
  const localNow = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  const isPeakDay = ["Tuesday", "Wednesday", "Thursday"].includes(weekday);
  const isMorningPeak = hour >= 9 && hour < 12;
  const isEveningPeak = hour >= 17 && hour < 18;

  let score = 45;
  if (isPeakDay) score += 25;
  if (isMorningPeak) score += 25;
  else if (isEveningPeak) score += 15;
  else if (hour >= 8 && hour < 20) score += 5;
  score = Math.min(score, 98);

  let headline: string;
  if (isPeakDay && isMorningPeak) headline = "Post now — you're in the top engagement window! 🚀";
  else if (isPeakDay && isEveningPeak) headline = "Solid slot right now. Ship it. ✨";
  else if (isPeakDay) headline = "Great day — best window is 9:00–12:00 local time.";
  else headline = "Schedule for Tuesday–Thursday, 9:00–11:00 AM for a 30–40% lift.";

  return {
    peakDay: "Tuesday – Thursday",
    peakWindow: "9:00 AM – 12:00 PM (local)",
    localNow,
    score,
    headline,
    tips: [
      "Tue/Wed/Thu 9–11 AM: peak professional scroll time.",
      "Avoid Fri after 3 PM and weekends — engagement drops ~50%.",
      "Reply to comments in the first 60 min to boost distribution.",
      "One post per day max; consistency beats volume.",
    ],
  };
}

export function BestTimeToPostModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const browserTz = useMemo(
    () => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"),
    [],
  );
  const [countryCode, setCountryCode] = useState<string>("US");
  const country = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];
  const [timezone, setTimezone] = useState<string>(country.timezones[0]);
  const [result, setResult] = useState<Recommendation | null>(null);

  useEffect(() => {
    // Try to preselect based on browser timezone
    const match = COUNTRIES.find((c) => c.timezones.includes(browserTz));
    if (match) {
      setCountryCode(match.code);
      setTimezone(browserTz);
    }
  }, [browserTz]);

  useEffect(() => {
    if (!country.timezones.includes(timezone)) {
      setTimezone(country.timezones[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Best Time to Post"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-black/60 backdrop-blur-md"
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden animate-fade-in-up rounded-2xl border border-border/60 bg-card text-card-foreground shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <div className="relative flex items-start justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/15 p-2 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Best Time to Post</h3>
              <p className="text-xs text-muted-foreground">Find your local LinkedIn peak window.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative space-y-5 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Country</label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Time Zone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {country.timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => setResult(computeRecommendation(timezone))}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Sparkles className="h-4 w-4" />
            Find Best Time
          </button>

          {result && (
            <div className="rounded-xl border border-border/60 bg-background/60 p-4 shadow-inner backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Local time · {result.localNow}
                </div>
                <div className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  <TrendingUp className="h-3 w-3" />
                  {result.score}/100
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{result.headline}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border/60 bg-card/70 p-2.5">
                  <div className="text-muted-foreground">Peak days</div>
                  <div className="mt-0.5 font-medium text-foreground">{result.peakDay}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/70 p-2.5">
                  <div className="text-muted-foreground">Peak window</div>
                  <div className="mt-0.5 font-medium text-foreground">{result.peakWindow}</div>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-foreground/90">
                {result.tips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
