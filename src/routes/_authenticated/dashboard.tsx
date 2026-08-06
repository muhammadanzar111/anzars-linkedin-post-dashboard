import { createFileRoute, useNavigate } from "@tanstack/react-router";
import lpsLogo from "@/assets/lps-symbol.png.asset.json";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { syncLinkedInMetrics } from "@/lib/metrics-sync.functions";

import { generateLinkedInPost } from "@/lib/ai-writer.functions";
import type { Tables } from "@/integrations/supabase/types";
import { ThemeBackdrop, ThemePicker, useColorTheme } from "@/components/ThemeSwitcher";
import { BestTimeToPostModal } from "@/components/BestTimeToPostModal";
import { ViralScoreCard, HashtagOptimizer } from "@/components/ViralInsights";
import {
  PostToolbar,
  AttachmentStrip,
  BG_TEMPLATES,
  type MediaAttachment,
  type DocAttachment,
} from "@/components/PostToolbar";
import { AttachmentEditor } from "@/components/AttachmentEditor";


import { Clock, User, Pencil, Trash2 } from "lucide-react";

const TONE_STEPS = [
  "Highly Casual",
  "Casual",
  "Balanced",
  "Professional",
  "Corporate",
] as const;

type Post = Tables<"posts">;

const postsQuery = () =>
  queryOptions({
    queryKey: ["posts"],
    queryFn: () => listPosts(),
  });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LN Post Studio" },
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
  const [colorTheme, setColorTheme] = useColorTheme();

  const onSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }, [navigate]);

  // Colours come entirely from the active theme tokens; the backdrop is a
  // single static gradient layer (no blur filters, no animation loops).
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <ThemeBackdrop />
      <header className="relative border-b border-border bg-card/70">

        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={lpsLogo.url} alt="LN Post Studio logo" className="h-7 w-7 object-contain" />
            <div className="flex flex-col justify-center leading-tight">
              <h1 className="text-lg font-bold tracking-tight text-foreground">LN Post Studio</h1>
              <p className="text-xs text-muted-foreground">Draft • Publish • Track</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemePicker theme={colorTheme} onChange={setColorTheme} />
            <button
              onClick={onSignOut}
              className="rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6">
          {(["compose", "history", "analytics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize transition-all ${
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

      <main key={tab} className="relative mx-auto max-w-6xl animate-fade-in-up px-6 py-8">
        {tab === "compose" && <ComposeTab onGoHistory={() => setTab("history")} />}
        {tab === "history" && <HistoryTab />}
        {tab === "analytics" && <AnalyticsTab />}
      </main>

    </div>
  );
}

// Small debounce so per-keystroke re-analysis doesn't stutter the UI.
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ---------- Compose ----------
function ComposeTab({ onGoHistory }: { onGoHistory: () => void }) {
  const qc = useQueryClient();
  const { data: posts } = useSuspenseQuery(postsQuery());
  const drafts = useMemo(() => posts.filter((p) => p.status === "draft"), [posts]);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; message: string } | null>(null);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [media, setMedia] = useState<MediaAttachment[]>([]);
  const [docs, setDocs] = useState<DocAttachment[]>([]);
  const [bgId, setBgId] = useState<string>("none");
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Analysis-heavy cards read the debounced text so typing stays smooth.
  const debouncedText = useDebouncedValue(text, 250);

  const bgTemplate = useMemo(
    () => BG_TEMPLATES.find((t) => t.id === bgId) ?? BG_TEMPLATES[0],
    [bgId],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value),
    [],
  );

  const insertAtCursor = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setText((prev) => prev + snippet);
      return;
    }
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    setText((prev) => prev.slice(0, start) + snippet + prev.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  }, []);

  const addMedia = useCallback((m: MediaAttachment) => setMedia((prev) => [...prev, m]), []);
  const addDoc = useCallback((d: DocAttachment) => setDocs((prev) => [...prev, d]), []);
  const removeMedia = useCallback(
    (id: string) => setMedia((prev) => prev.filter((m) => m.id !== id)),
    [],
  );
  const removeDoc = useCallback(
    (id: string) => setDocs((prev) => prev.filter((d) => d.id !== id)),
    [],
  );
  const openAttachments = useCallback(() => setAttachmentsOpen(true), []);
  const closeAttachments = useCallback(() => setAttachmentsOpen(false), []);
  const closeTimeModal = useCallback(() => setTimeModalOpen(false), []);
  const applyMedia = useCallback((next: MediaAttachment[]) => setMedia(next), []);

  const save = useServerFn(saveDraft);
  const publish = useServerFn(publishLinkedInPost);
  const removePost = useServerFn(deletePost);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removePost({ data: { id } }),
    onSuccess: (_res, id) => {
      if (draftId === id) {
        setDraftId(null);
        setText("");
      }
      setFlash({ kind: "ok", message: "Draft deleted." });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e) =>
      setFlash({ kind: "err", message: e instanceof Error ? e.message : "Delete failed" }),
  });

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
    mutationFn: async (vars: { text: string; draftId?: string; media: MediaAttachment[] }) => {
      const encoded = await Promise.all(
        vars.media
          .filter((m) => m.file)
          .map(async (m) => {
            const buf = await m.file!.arrayBuffer();
            let bin = "";
            const bytes = new Uint8Array(buf);
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
              bin += String.fromCharCode.apply(
                null,
                Array.from(bytes.subarray(i, i + chunk)),
              );
            }
            return {
              kind: m.kind,
              name: m.name,
              mimeType: m.mimeType || m.file!.type || "application/octet-stream",
              dataBase64: btoa(bin),
            };
          }),
      );
      return publish({ data: { text: vars.text, draftId: vars.draftId, media: encoded } });
    },
    onSuccess: () => {
      setFlash({ kind: "ok", message: "Published to LinkedIn." });
      setText("");
      setDraftId(null);
      setMedia([]);
      setDocs([]);
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e) => setFlash({ kind: "err", message: e instanceof Error ? e.message : "Publish failed" }),
  });

  const trimmed = text.trim();
  // Text-free posting allowed when at least one media asset is queued.
  const canPublish =
    (trimmed.length > 0 || media.length > 0) &&
    trimmed.length <= MAX &&
    !publishMutation.isPending;


  const loadDraft = useCallback((d: Post) => {
    setDraftId(d.id);
    setText(d.content);
    setFlash(null);
  }, []);
  const newDraft = useCallback(() => {
    setDraftId(null);
    setText("");
    setFlash(null);
  }, []);
  const deleteDraft = useCallback(
    (id: string) => deleteMutation.mutate(id),
    [deleteMutation],
  );
  const insertHashtags = useCallback((tags: string) => {
    setText((prev) => {
      const base = prev.replace(/\s+$/, "");
      // Remove any trailing hashtag-only line to avoid duplicates
      const withoutTrailingTags = base.replace(/\n[ \t]*(#[\w]+(\s+#[\w]+)*)\s*$/, "");
      return `${withoutTrailingTags}\n\n${tags}`;
    });
    setFlash({ kind: "ok", message: "Hashtags inserted into your post." });
  }, []);

  // Stable callbacks so the memoized AI sidebar doesn't re-render while typing.
  const handleUseAiText = useCallback((t: string) => {
    setText(t);
    setFlash({ kind: "ok", message: "AI draft moved to composer." });
  }, []);
  const openTimeModal = useCallback(() => setTimeModalOpen(true), []);



  return (
    <>
      <div className="grid gap-6 lg:grid-cols-5">
        <AiWriterSidebar onUseText={handleUseAiText} onOpenTimeModal={openTimeModal} />


        <section className="lg:col-span-3">
          <div className="glass-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">{draftId ? "Editing draft" : "New draft"}</h2>
              <span
                className={`text-xs ${trimmed.length > MAX ? "text-destructive" : "text-muted-foreground"}`}
              >
                {trimmed.length}/{MAX}
              </span>
            </div>
            <div className="mb-2">
              <PostToolbar
                insertText={insertAtCursor}
                onAddMedia={addMedia}
                onAddDoc={addDoc}
                bgId={bgId}
                onChangeBg={setBgId}
                onOpenAttachments={openAttachments}
              />

            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              placeholder="What do you want to share?"
              rows={12}
              className="w-full resize-y rounded-xl border border-input bg-background/70 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/40"
            />
            <AttachmentStrip
              media={media}
              docs={docs}
              onRemoveMedia={removeMedia}
              onRemoveDoc={removeDoc}
            />
            {(media.length > 0 || docs.length > 0) && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Note: images and videos are uploaded to LinkedIn with your post. Documents are local previews only.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => publishMutation.mutate({ text: trimmed, draftId: draftId ?? undefined, media })}
                disabled={!canPublish}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:shadow-indigo-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {publishMutation.isPending ? "Publishing…" : "Publish to LinkedIn"}
              </button>
              <button
                onClick={() => saveMutation.mutate({ id: draftId ?? undefined, content: text })}
                disabled={!trimmed || saveMutation.isPending}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-secondary/50 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-secondary active:scale-95 disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving…" : draftId ? "Update draft" : "Save draft"}
              </button>
              <button
                onClick={newDraft}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-secondary/50 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-secondary active:scale-95"
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

          <PreviewCard text={trimmed} media={media} docs={docs} bgTemplate={bgTemplate} />

          <div className="mt-6">
            <ViralScoreCard text={debouncedText} />
          </div>

          <div className="mt-6">
            <HashtagOptimizer text={debouncedText} onInsert={insertHashtags} />
          </div>

          <DraftsManager
            drafts={drafts}
            activeId={draftId}
            deleting={deleteMutation.isPending}
            onEdit={loadDraft}
            onDelete={deleteDraft}
          />

        </section>
      </div>

      <BestTimeToPostModal open={timeModalOpen} onClose={closeTimeModal} />
      <AttachmentEditor
        open={attachmentsOpen}
        initialMedia={media}
        onClose={closeAttachments}
        onDone={applyMedia}
      />

    </>
  );
}

// ---------- Live preview (memoized: only re-renders when its own props change) ----------
const PreviewCard = memo(function PreviewCard({
  text,
  media,
  docs,
  bgTemplate,
}: {
  text: string;
  media: MediaAttachment[];
  docs: DocAttachment[];
  bgTemplate: (typeof BG_TEMPLATES)[number];
}) {
  return (
    <div className="mt-6 glass-card p-5">
      <h2 className="mb-3 text-sm font-medium">Preview</h2>
      <div className={`rounded-lg border border-border p-4 ${bgTemplate.className} ${bgTemplate.textClass}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/10 ring-1 ring-black/10">
            <User className="h-5 w-5 opacity-70" />
          </div>
          <div>
            <div className="text-sm font-semibold">You</div>
            <div className="text-xs opacity-80">Just now · 🌐</div>
          </div>
        </div>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
          {text ? text : <span className="opacity-70">Your post will appear here…</span>}
        </div>
        {media.length > 0 && (
          <div className={`mt-3 grid gap-2 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {media.map((m) =>
              m.kind === "image" ? (
                <img
                  key={m.id}
                  src={m.url}
                  alt={m.name}
                  className="max-h-80 w-full rounded-md bg-black/5 object-contain"
                />
              ) : (
                <video
                  key={m.id}
                  src={m.url}
                  controls
                  className="max-h-80 w-full rounded-md bg-black/5 object-contain"
                />
              ),
            )}
          </div>
        )}

        {docs.length > 0 && (
          <div className="mt-3 space-y-1">
            {docs.map((d) => (
              <div key={d.id} className="rounded-md bg-black/10 px-3 py-2 text-xs">
                📄 {d.name} <span className="opacity-70">· {d.sizeKb} KB</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ---------- Drafts quick manager (memoized) ----------
const DraftsManager = memo(function DraftsManager({
  drafts,
  activeId,
  deleting,
  onEdit,
  onDelete,
}: {
  drafts: Post[];
  activeId: string | null;
  deleting: boolean;
  onEdit: (d: Post) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-6 glass-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary ring-1 ring-primary/25">
          Drafts Quick Manager
        </h2>
        <span className="text-xs text-muted-foreground">{drafts.length}</span>
      </div>
      {drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No drafts yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {drafts.map((d) => (
            <li
              key={d.id}
              className={`flex items-start gap-2 rounded-xl border p-2 text-xs transition-colors ${
                activeId === d.id
                  ? "border-primary/60 bg-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-secondary/60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-foreground">{d.content || "(empty)"}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(d.updated_at).toLocaleString()}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  onClick={() => onEdit(d)}
                  title="Edit draft"
                  className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(d.id)}
                  disabled={deleting}
                  title="Delete draft"
                  className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});


// ---------- AI Writer Sidebar ----------
const AiWriterSidebar = memo(function AiWriterSidebar({
  onUseText,
  onOpenTimeModal,
}: {
  onUseText: (text: string) => void;
  onOpenTimeModal: () => void;
}) {

  const [details, setDetails] = useState("");
  const [toneLevel, setToneLevel] = useState<number>(2);
  const [generated, setGenerated] = useState<string>("");

  const gen = useServerFn(generateLinkedInPost);
  const genMutation = useMutation({
    mutationFn: (vars: { details: string; toneLevel: number }) => gen({ data: vars }),
    onSuccess: (res) => setGenerated(res.text),
  });

  const canGen = details.trim().length > 0 && !genMutation.isPending;

  return (
    <aside className="lg:col-span-2">
      <div className="glass-card sticky top-6 p-5">
        <div className="mb-4">
          <h2 className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary ring-1 ring-primary/25 text-base">AI Post Generator ✨</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Turn raw notes into a scroll-stopping LinkedIn post.
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-background/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium">Tone Adjustment</label>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {TONE_STEPS[toneLevel]}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={toneLevel}
            onChange={(e) => setToneLevel(Number(e.target.value))}
            list="tone-ticks"
            className="w-full accent-primary"
          />
          <datalist id="tone-ticks">
            {TONE_STEPS.map((_, i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Casual</span>
            <span>Balanced</span>
            <span>Corporate</span>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium">Enter your post details</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={6}
          placeholder="e.g., I just finished an unemployment data analysis project using Python. We used linear regression to predict trends..."
          className="w-full resize-y rounded-xl border border-input bg-background/70 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/40"
        />

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => genMutation.mutate({ details: details.trim(), toneLevel })}
            disabled={!canGen}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:shadow-indigo-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {genMutation.isPending ? "Generating…" : "Generate Post 🚀"}
          </button>
          <button
            type="button"
            onClick={onOpenTimeModal}
            title="Best Time to Post"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Best Time</span>
          </button>
        </div>


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
              onClick={() => {
                onUseText(generated);
                // Reset the generator so the next post starts fresh.
                setGenerated("");
                setDetails("");
                genMutation.reset();
              }}
              className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-primary bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Move to Composer ➜
            </button>

          </div>
        )}
      </div>
    </aside>
  );
});


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
        <article key={p.id} className="glass-card p-5">
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

function MetricsEditor({ post, label }: { post: Post; label?: string }) {
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
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type MetricRow = Record<string, unknown>;

function metricsOf(p: MetricRow) {
  const impressions = num(p["impressions"] ?? p["views"]);
  const likes = num(p["likes"]);
  const comments = num(p["comments"]);
  const reposts = num(p["reposts"] ?? p["shares"]);
  return { impressions, likes, comments, reposts, engagement: likes + comments + reposts };
}

function AnalyticsTab() {
  const { data: posts } = useSuspenseQuery(postsQuery());
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const syncFn = useServerFn(syncLinkedInMetrics);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await syncFn({});
      await qc.invalidateQueries({ queryKey: ["posts"] });
      await qc.refetchQueries({ queryKey: ["posts"] });
      if (res.updated > 0) {
        setSyncMsg(`Synced live metrics for ${res.updated} post${res.updated === 1 ? "" : "s"}.`);
      } else if (res.failed > 0) {
        setSyncMsg(
          "LinkedIn didn't return statistics for these posts (personal profiles only grant publish access). Use “Update Metrics” on a post to enter the numbers manually.",
        );
      } else {
        setSyncMsg("Nothing to sync yet.");
      }
    } catch (e) {
      await qc.refetchQueries({ queryKey: ["posts"] });
      setSyncMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [qc, syncFn]);


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

  const rows = useMemo(
    () =>
      published.map((p, i) => ({
        post: p,
        m: metricsOf(p as unknown as MetricRow),
        label: p.published_at
          ? new Date(p.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : `#${i + 1}`,
      })),
    [published],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, { m }) => ({
          impressions: acc.impressions + m.impressions,
          likes: acc.likes + m.likes,
          comments: acc.comments + m.comments,
          reposts: acc.reposts + m.reposts,
          engagement: acc.engagement + m.engagement,
        }),
        { impressions: 0, likes: 0, comments: 0, reposts: 0, engagement: 0 },
      ),
    [rows],
  );

  const engagementRate = totals.impressions > 0 ? (totals.engagement / totals.impressions) * 100 : 0;

  const chartData = useMemo(
    () => rows.map((r) => ({ label: r.label, impressions: r.m.impressions, engagement: r.m.engagement })),
    [rows],
  );

  const top = useMemo(() => [...rows].sort((a, b) => b.m.engagement - a.m.engagement).slice(0, 5), [rows]);

  const syncButton = (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
    >
      {syncing ? "Syncing…" : "Sync Metrics"}
    </button>
  );

  if (published.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{syncButton}</div>
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Publish a post to start seeing analytics here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Analytics overview</h2>
        {syncButton}
      </div>
      {syncMsg && (
        <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {syncMsg}
        </p>
      )}


      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Posts" value={published.length} />
        <StatCard label="Impressions" value={totals.impressions} />
        <StatCard label="Likes" value={totals.likes} />
        <StatCard label="Total engagement" value={totals.engagement} />
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

      <div className="glass-card p-5">
        <h3 className="mb-3 text-sm font-medium">Top posts by engagement</h3>
        <ol className="space-y-3">
          {top.map(({ post: p, m }, i) => {
            return (
              <li key={p.id} className="flex gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <div className="text-lg font-semibold text-muted-foreground tabular-nums">{i + 1}</div>
                <div className="flex-1">
                  <div className="line-clamp-2 text-sm">{p.content}</div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
                    <span>👁 {m.impressions.toLocaleString()}</span>
                    <span>♥ {m.likes.toLocaleString()}</span>
                    <span>💬 {m.comments.toLocaleString()}</span>
                    <span>↻ {m.reposts.toLocaleString()}</span>
                    <span className="font-medium text-foreground">
                      Total engagement: {m.engagement.toLocaleString()}
                    </span>
                  </div>
                  <MetricsEditor post={p} label="Update Metrics" />
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
    <div className="glass-card p-5">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}
