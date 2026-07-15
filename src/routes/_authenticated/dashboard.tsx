import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { listPosts, saveDraft, deletePost, updateMetrics } from "@/lib/posts.functions";
import { publishLinkedInPost } from "@/lib/linkedin.functions";
import { generateLinkedInPost } from "@/lib/ai-writer.functions";
import type { Tables } from "@/integrations/supabase/types";
import { AnimatedBackground, BgThemePicker, useBgTheme } from "@/components/AnimatedBackground";

const TONES = ["Professional", "Educational", "Casual", "Academic"] as const;
type Tone = (typeof TONES)[number];
const toneHint: Record<Tone, string> = {
  Professional: "great for recruiters",
  Educational: "teaching a concept",
  Casual: "friendly & conversational",
  Academic: "scholarly",
};

type Post = Tables<"posts">;

const postsQuery = () =>
  queryOptions({
    queryKey: ["posts"],
    queryFn: () => listPosts(),
  });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LinkedIn Post Studio" },
      {
        name: "description",
        content: "Draft, publish, and track engagement on your LinkedIn posts.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery()),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Failed to load dashboard: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Not found.</div>,
});

const MAX = 3000;
type Tab = "compose" | "history" | "analytics";

function Dashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("compose");

  async function onSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">LinkedIn Post Studio</h1>
            <p className="text-xs text-muted-foreground">Draft • Publish • Track</p>
          </div>
          <button
            onClick={onSignOut}
            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6">
          {(["compose", "history", "analytics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {tab === "compose" && <ComposeTab onGoHistory={() => setTab("history")} />}
        {tab === "history" && <HistoryTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </main>
    </div>
  );
}

// ---------- Compose ----------
function ComposeTab({ onGoHistory }: { onGoHistory: () => void }) {
  const qc = useQueryClient();
  const { data: posts } = useSuspenseQuery(postsQuery());
  const drafts = posts.filter((p) => p.status === "draft");

  const [draftId, setDraftId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  const save = useServerFn(saveDraft);
  const publish = useServerFn(publishLinkedInPost);

  const saveMutation = useMutation({
    mutationFn: (vars: { id?: string; content: string }) => save({ data: vars }),
    onSuccess: (row) => {
      setDraftId(row.id);
      setFlash({ kind: "ok", message: "Draft saved." });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e) => setFlash({ kind: "err", message: e instanceof Error ? e.message : "Save failed" }),
  });

  const publishMutation = useMutation({
    mutationFn: (vars: { text: string; draftId?: string }) => publish({ data: vars }),
    onSuccess: () => {
      setFlash({ kind: "ok", message: "Published to LinkedIn." });
      setText("");
      setDraftId(null);
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e) => setFlash({ kind: "err", message: e instanceof Error ? e.message : "Publish failed" }),
  });

  const trimmed = text.trim();
  const canPublish = trimmed.length > 0 && trimmed.length <= MAX && !publishMutation.isPending;

  function loadDraft(d: Post) {
    setDraftId(d.id);
    setText(d.content);
    setFlash(null);
  }
  function newDraft() {
    setDraftId(null);
    setText("");
    setFlash(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <AiWriterSidebar onUseText={(t) => { setText(t); setFlash({ kind: "ok", message: "AI draft moved to composer." }); }} />

      <section className="lg:col-span-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">{draftId ? "Editing draft" : "New draft"}</h2>
            <span
              className={`text-xs ${trimmed.length > MAX ? "text-destructive" : "text-muted-foreground"}`}
            >
              {trimmed.length}/{MAX}
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you want to share?"
            rows={12}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => publishMutation.mutate({ text: trimmed, draftId: draftId ?? undefined })}
              disabled={!canPublish}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishMutation.isPending ? "Publishing…" : "Publish to LinkedIn"}
            </button>
            <button
              onClick={() => saveMutation.mutate({ id: draftId ?? undefined, content: text })}
              disabled={!trimmed || saveMutation.isPending}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : draftId ? "Update draft" : "Save draft"}
            </button>
            <button
              onClick={newDraft}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              New
            </button>
            <button
              onClick={onGoHistory}
              className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              View history →
            </button>
          </div>

          {flash && (
            <div
              className={`mt-4 rounded-md border p-3 text-sm ${
                flash.kind === "ok"
                  ? "border-border bg-secondary"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {flash.message}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-medium">Preview</h2>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div>
                <div className="text-sm font-semibold">You</div>
                <div className="text-xs text-muted-foreground">Just now · 🌐</div>
              </div>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
              {trimmed ? trimmed : <span className="text-muted-foreground">Your post will appear here…</span>}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Drafts</h2>
            <span className="text-xs text-muted-foreground">{drafts.length}</span>
          </div>
          {drafts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No drafts yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {drafts.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => loadDraft(d)}
                    className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                      draftId === d.id ? "border-primary bg-accent" : "border-border hover:bg-accent"
                    }`}
                  >
                    <div className="line-clamp-2 text-foreground">{d.content || "(empty)"}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(d.updated_at).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------- AI Writer Sidebar ----------
function AiWriterSidebar({ onUseText }: { onUseText: (text: string) => void }) {
  const [details, setDetails] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [generated, setGenerated] = useState<string>("");

  const gen = useServerFn(generateLinkedInPost);
  const genMutation = useMutation({
    mutationFn: (vars: { details: string; tone: Tone }) => gen({ data: vars }),
    onSuccess: (res) => setGenerated(res.text),
  });

  const canGen = details.trim().length > 0 && !genMutation.isPending;

  return (
    <aside className="lg:col-span-2">
      <div className="sticky top-6 rounded-xl border border-border bg-gradient-to-b from-card to-card/60 p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-tight">AI Post Generator ✨</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Turn raw notes into a scroll-stopping LinkedIn post.
          </p>
        </div>

        <label className="mb-1 block text-xs font-medium">Enter your post details</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={6}
          placeholder="e.g., I just finished an unemployment data analysis project using Python. We used linear regression to predict trends..."
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <label className="mb-1 mt-4 block text-xs font-medium">Select Tone</label>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value as Tone)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {TONES.map((t) => (
            <option key={t} value={t}>
              {t} ({toneHint[t]})
            </option>
          ))}
        </select>

        <button
          onClick={() => genMutation.mutate({ details: details.trim(), tone })}
          disabled={!canGen}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {genMutation.isPending ? "Generating…" : "Generate Post 🚀"}
        </button>

        {genMutation.error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {genMutation.error instanceof Error ? genMutation.error.message : "Generation failed"}
          </p>
        )}

        {generated && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">AI Preview</h3>
              <button
                onClick={() => setGenerated("")}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm leading-relaxed whitespace-pre-wrap">
              {generated}
            </div>
            <button
              onClick={() => onUseText(generated)}
              className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-primary bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Move to Composer ➜
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ---------- History ----------
function HistoryTab() {
  const qc = useQueryClient();
  const { data: posts } = useSuspenseQuery(postsQuery());
  const del = useServerFn(deletePost);
  const delMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nothing yet. Head to Compose to write your first post.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <article key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                p.status === "published"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {p.status}
            </span>
            <span className="text-muted-foreground">
              {p.status === "published" && p.published_at
                ? `Published ${new Date(p.published_at).toLocaleString()}`
                : `Updated ${new Date(p.updated_at).toLocaleString()}`}
            </span>
            <button
              onClick={() => {
                if (confirm("Delete this post from your local history? (This does not delete it from LinkedIn.)")) {
                  delMutation.mutate(p.id);
                }
              }}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive"
            >
              Delete
            </button>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{p.content}</div>
          {p.status === "published" && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
              <MetricStat label="Impressions" value={p.impressions} />
              <MetricStat label="Likes" value={p.likes} />
              <MetricStat label="Comments" value={p.comments} />
              <MetricStat label="Reposts" value={p.reposts} />
            </div>
          )}
          {p.status === "published" && <MetricsEditor post={p} />}
        </article>
      ))}
    </div>
  );
}

function MetricStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function MetricsEditor({ post }: { post: Post }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [impressions, setImpressions] = useState(String(post.impressions));
  const [likes, setLikes] = useState(String(post.likes));
  const [comments, setComments] = useState(String(post.comments));
  const [reposts, setReposts] = useState(String(post.reposts));
  const [notes, setNotes] = useState(post.notes ?? "");

  const update = useServerFn(updateMetrics);
  const m = useMutation({
    mutationFn: () =>
      update({
        data: {
          id: post.id,
          impressions: Number(impressions),
          likes: Number(likes),
          comments: Number(comments),
          reposts: Number(reposts),
          notes,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Update metrics from LinkedIn →
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Paste the numbers from LinkedIn's post analytics. (LinkedIn's API doesn't expose these for personal profiles.)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField label="Impressions" value={impressions} onChange={setImpressions} />
        <NumberField label="Likes" value={likes} onChange={setLikes} />
        <NumberField label="Comments" value={comments} onChange={setComments} />
        <NumberField label="Reposts" value={reposts} onChange={setReposts} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => m.mutate()}
          disabled={m.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Cancel
        </button>
        {m.error && (
          <span className="self-center text-xs text-destructive">
            {m.error instanceof Error ? m.error.message : "Failed"}
          </span>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

// ---------- Analytics ----------
function AnalyticsTab() {
  const { data: posts } = useSuspenseQuery(postsQuery());
  const published = useMemo(
    () =>
      posts
        .filter((p) => p.status === "published")
        .sort((a, b) => {
          const at = a.published_at ? new Date(a.published_at).getTime() : 0;
          const bt = b.published_at ? new Date(b.published_at).getTime() : 0;
          return at - bt;
        }),
    [posts],
  );

  const totals = useMemo(() => {
    return published.reduce(
      (acc, p) => {
        acc.impressions += p.impressions;
        acc.likes += p.likes;
        acc.comments += p.comments;
        acc.reposts += p.reposts;
        return acc;
      },
      { impressions: 0, likes: 0, comments: 0, reposts: 0 },
    );
  }, [published]);

  const engagementRate =
    totals.impressions > 0
      ? ((totals.likes + totals.comments + totals.reposts) / totals.impressions) * 100
      : 0;

  const chartData = published.map((p, i) => ({
    label:
      p.published_at
        ? new Date(p.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : `#${i + 1}`,
    impressions: p.impressions,
    engagement: p.likes + p.comments + p.reposts,
  }));

  const top = [...published]
    .sort((a, b) => b.likes + b.comments + b.reposts - (a.likes + a.comments + a.reposts))
    .slice(0, 5);

  if (published.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Publish a post to start seeing analytics here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Posts" value={published.length} />
        <StatCard label="Impressions" value={totals.impressions} />
        <StatCard label="Likes" value={totals.likes} />
        <StatCard label="Comments" value={totals.comments} />
        <StatCard label="Engagement rate" value={`${engagementRate.toFixed(2)}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Impressions over time">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="impressions" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Engagement per post">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="engagement" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-medium">Top posts by engagement</h3>
        <ol className="space-y-3">
          {top.map((p, i) => {
            const eng = p.likes + p.comments + p.reposts;
            return (
              <li key={p.id} className="flex gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <div className="text-lg font-semibold text-muted-foreground tabular-nums">{i + 1}</div>
                <div className="flex-1">
                  <div className="line-clamp-2 text-sm">{p.content}</div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
                    <span>👁 {p.impressions.toLocaleString()}</span>
                    <span>♥ {p.likes.toLocaleString()}</span>
                    <span>💬 {p.comments.toLocaleString()}</span>
                    <span>↻ {p.reposts.toLocaleString()}</span>
                    <span className="font-medium text-foreground">Total engagement: {eng.toLocaleString()}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}
