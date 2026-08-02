import { useMemo } from "react";

export type ScoreResult = {
  score: number;
  hook: { ok: boolean; label: string };
  readability: { ok: boolean; label: string };
  cta: { ok: boolean; label: string };
  tip: string;
};

export function analyzePost(text: string): ScoreResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      score: 0,
      hook: { ok: false, label: "Needs a hook" },
      readability: { ok: false, label: "No content yet" },
      cta: { ok: false, label: "Missing call to action" },
      tip: "Start typing or generate a post from the AI Writer.",
    };
  }

  const lines = trimmed.split("\n");
  const firstLine = lines[0] ?? "";
  const firstLen = firstLine.length;
  const hookOk =
    firstLen >= 30 &&
    firstLen <= 140 &&
    (/[?!]|\d/.test(firstLine) || firstLine.split(" ").length >= 6);

  const blankLineCount = lines.filter((l) => l.trim() === "").length;
  const paragraphs = trimmed.split(/\n\s*\n/);
  const avgParaLen =
    paragraphs.reduce((a, p) => a + p.length, 0) / Math.max(paragraphs.length, 1);
  const readOk = blankLineCount >= 2 && avgParaLen < 240 && trimmed.length >= 200;

  // Dynamic CTA detection: scan the WHOLE post (hashtags stripped) for a question
  // mark or any common engagement phrase — not just the closing paragraph.
  const body = trimmed.replace(/#[\w]+/g, " ");
  const lastPara = (paragraphs[paragraphs.length - 1] ?? "").replace(/#[\w]+/g, "").trim();
  const CTA_RE =
    /\?|what do you think|your take|thoughts|drop a|comment below|share your|let me know|tell me|agree\b|curious|dm me|follow (me|for)|save this|repost|tag someone|who else|how do you|what would you/i;
  const ctaOk = CTA_RE.test(body);
  const ctaAtEnd = /\?\s*$/.test(lastPara) || CTA_RE.test(lastPara);

  let score = 0;
  score += hookOk ? 40 : Math.min(25, Math.round((firstLen / 140) * 25));
  score += readOk ? 30 : blankLineCount >= 1 ? 16 : 6;
  score += ctaOk ? (ctaAtEnd ? 22 : 14) : 2;
  if (/#\w+/.test(trimmed)) score += 8; // 3–4 hashtags help discovery
  score = Math.max(3, Math.min(99, score));


  let tip = "Nice work — try A/B testing two hooks to squeeze out more reach.";
  if (!hookOk) tip = "Rewrite the first line — aim for a bold, specific hook under 140 chars with a number or question.";
  else if (!readOk) tip = "Break your text into short 1–2 sentence paragraphs separated by blank lines for scannability.";
  else if (!ctaOk) tip = "End with a direct question to your reader — questions can double comment rates.";

  return {
    score,
    hook: {
      ok: hookOk,
      label: hookOk ? "Strong opening hook" : "Hook needs improvement",
    },
    readability: {
      ok: readOk,
      label: readOk ? "Excellent layout & whitespace" : "Add whitespace & shorter paragraphs",
    },
    cta: {
      ok: ctaOk,
      label: ctaOk ? "Clear call to action" : "Missing a clear question at the end",
    },
    tip,
  };
}

export function ViralScoreCard({ text }: { text: string }) {
  const result = useMemo(() => analyzePost(text), [text]);
  const { score, hook, readability, cta, tip } = result;

  const color =
    score >= 75
      ? "text-emerald-400"
      : score >= 50
        ? "text-amber-400"
        : "text-rose-400";
  const stroke =
    score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#fb7185";

  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Viral Score Predictor</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          AI Analysis
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="var(--border)"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-2xl font-bold tabular-nums ${color}`}>
              {score}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Viral
            </div>
          </div>
        </div>

        <ul className="flex-1 space-y-2 text-sm">
          <ChecklistItem ok={hook.ok} title="Hook Strength" detail={hook.label} />
          <ChecklistItem
            ok={readability.ok}
            title="Readability & Whitespace"
            detail={readability.label}
          />
          <ChecklistItem ok={cta.ok} title="Call to Action" detail={cta.label} />
        </ul>
      </div>

      <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
        <span className="font-semibold text-primary">Tip: </span>
        {tip}
      </div>
    </div>
  );
}

function ChecklistItem({
  ok,
  title,
  detail,
}: {
  ok: boolean;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          ok
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-rose-500/20 text-rose-400"
        }`}
      >
        {ok ? "✓" : "!"}
      </span>
      <div className="leading-tight">
        <div className="text-xs font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{detail}</div>
      </div>
    </li>
  );
}

// ------------- Hashtag Optimizer -------------

type HashtagSuggestion = { tag: string; volume: "High Volume" | "Trending" | "Niche" };

const TOPIC_MAP: { keywords: RegExp; tags: HashtagSuggestion[] }[] = [
  {
    keywords: /\b(data|analytics|analysis|dataset|sql|tableau|powerbi|regression|statistic)/i,
    tags: [
      { tag: "#DataScience", volume: "High Volume" },
      { tag: "#Analytics", volume: "High Volume" },
      { tag: "#DataAnalysis", volume: "Trending" },
    ],
  },
  {
    keywords: /\b(python|pandas|numpy|scikit|jupyter)\b/i,
    tags: [
      { tag: "#Python", volume: "High Volume" },
      { tag: "#Coding", volume: "High Volume" },
    ],
  },
  {
    keywords: /\b(ai|artificial intelligence|llm|gpt|openai|gemini|claude|machine learning|ml|neural)/i,
    tags: [
      { tag: "#AI", volume: "High Volume" },
      { tag: "#MachineLearning", volume: "Trending" },
      { tag: "#GenerativeAI", volume: "Trending" },
    ],
  },
  {
    keywords: /\b(startup|founder|entrepreneur|bootstrap|saas|product)/i,
    tags: [
      { tag: "#Startup", volume: "High Volume" },
      { tag: "#Entrepreneurship", volume: "High Volume" },
      { tag: "#BuildInPublic", volume: "Trending" },
    ],
  },
  {
    keywords: /\b(job|hiring|recruit|interview|career|resume|cv|offer)/i,
    tags: [
      { tag: "#Hiring", volume: "High Volume" },
      { tag: "#CareerGrowth", volume: "Trending" },
      { tag: "#JobSearch", volume: "High Volume" },
    ],
  },
  {
    keywords: /\b(design|figma|ux|ui|user experience)/i,
    tags: [
      { tag: "#UXDesign", volume: "Trending" },
      { tag: "#ProductDesign", volume: "Trending" },
    ],
  },
  {
    keywords: /\b(marketing|content|brand|copywriting|seo)/i,
    tags: [
      { tag: "#Marketing", volume: "High Volume" },
      { tag: "#ContentStrategy", volume: "Trending" },
    ],
  },
  {
    keywords: /\b(leader|leadership|manager|team|culture)/i,
    tags: [
      { tag: "#Leadership", volume: "High Volume" },
      { tag: "#TeamCulture", volume: "Niche" },
    ],
  },
];

const FALLBACK: HashtagSuggestion[] = [
  { tag: "#LinkedInTips", volume: "Trending" },
  { tag: "#PersonalBranding", volume: "High Volume" },
  { tag: "#CareerGrowth", volume: "Trending" },
  { tag: "#ThoughtLeadership", volume: "Niche" },
];

export function suggestHashtags(text: string): HashtagSuggestion[] {
  const out: HashtagSuggestion[] = [];
  const seen = new Set<string>();

  for (const topic of TOPIC_MAP) {
    if (topic.keywords.test(text)) {
      for (const t of topic.tags) {
        if (!seen.has(t.tag.toLowerCase())) {
          seen.add(t.tag.toLowerCase());
          out.push(t);
        }
      }
    }
  }
  for (const t of FALLBACK) {
    if (out.length >= 5) break;
    if (!seen.has(t.tag.toLowerCase())) {
      seen.add(t.tag.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, 5);
}

export function HashtagOptimizer({
  text,
  onInsert,
}: {
  text: string;
  onInsert: (tags: string) => void;
}) {
  const suggestions = useMemo(() => suggestHashtags(text || ""), [text]);
  const joined = suggestions.map((s) => s.tag).join(" ");

  const volumeStyles: Record<HashtagSuggestion["volume"], string> = {
    "High Volume": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    Trending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    Niche: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Hashtag Optimizer</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {suggestions.length} suggestions
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {suggestions.map((s) => (
          <div
            key={s.tag}
            className="rounded-lg border border-border bg-background p-3 text-center"
          >
            <div className="text-sm font-semibold text-foreground">{s.tag}</div>
            <div
              className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${volumeStyles[s.volume]}`}
            >
              {s.volume}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              navigator.clipboard.writeText(joined);
            }
          }}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          Copy Hashtags Only
        </button>
        <button
          onClick={() => onInsert(joined)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Insert into Post
        </button>
      </div>
    </div>
  );
}
