import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { publishLinkedInPost } from "@/lib/linkedin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LinkedIn Post Composer" },
      { name: "description", content: "Draft, preview, and publish text posts directly to your LinkedIn feed." },
      { property: "og:title", content: "LinkedIn Post Composer" },
      { property: "og:description", content: "Draft, preview, and publish text posts directly to your LinkedIn feed." },
    ],
  }),
  component: Dashboard,
});

const MAX = 3000;

function Dashboard() {
  const publish = useServerFn(publishLinkedInPost);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "success"; postId?: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const trimmed = text.trim();
  const canPublish = trimmed.length > 0 && trimmed.length <= MAX && status.kind !== "loading";

  async function onPublish() {
    if (!canPublish) return;
    setStatus({ kind: "loading" });
    try {
      const res = await publish({ data: { text: trimmed } });
      setStatus({ kind: "success", postId: res.postId });
      setText("");
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Failed to publish" });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">LinkedIn Post Composer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft a text post, preview how it will look, and publish it straight to your LinkedIn feed.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Composer */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Draft</h2>
              <span
                className={`text-xs ${
                  trimmed.length > MAX ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {trimmed.length}/{MAX}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What do you want to share?"
              rows={14}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={onPublish}
                disabled={!canPublish}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status.kind === "loading" ? "Publishing…" : "Publish to LinkedIn"}
              </button>
              <button
                onClick={() => {
                  setText("");
                  setStatus({ kind: "idle" });
                }}
                disabled={!text}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            {status.kind === "success" && (
              <div className="mt-4 rounded-md border border-border bg-secondary p-3 text-sm">
                Published to LinkedIn.
                {status.postId ? <span className="ml-1 text-muted-foreground">({status.postId})</span> : null}
              </div>
            )}
            {status.kind === "error" && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {status.message}
              </div>
            )}
          </section>

          {/* Preview */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-medium">Preview</h2>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div>
                  <div className="text-sm font-semibold">Your Name</div>
                  <div className="text-xs text-muted-foreground">Just now · 🌐</div>
                </div>
              </div>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                {trimmed ? trimmed : (
                  <span className="text-muted-foreground">Your post will appear here…</span>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              This is an approximation. Line breaks, links, and hashtags render on LinkedIn.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
