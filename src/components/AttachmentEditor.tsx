import { useEffect, useRef, useState } from "react";
import { X, Pencil, Tag, Copy, Trash2, Plus, Upload } from "lucide-react";
import type { MediaAttachment } from "./PostToolbar";

// LinkedIn-style attachment editor modal.
// Step 1 (no files): empty state with illustration + "Upload from computer"
// Step 2 (files selected): left preview + edit/tag/ALT actions, right sidebar
// with thumbnail list, duplicate/delete/add controls.
export function AttachmentEditor({
  open,
  initialMedia,
  onClose,
  onDone,
}: {
  open: boolean;
  initialMedia: MediaAttachment[];
  onClose: () => void;
  onDone: (media: MediaAttachment[]) => void;
}) {
  const [items, setItems] = useState<MediaAttachment[]>(initialMedia);
  const [activeId, setActiveId] = useState<string | null>(initialMedia[0]?.id ?? null);
  const [altMap, setAltMap] = useState<Record<string, string>>({});
  const [editingAlt, setEditingAlt] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setItems(initialMedia);
      setActiveId(initialMedia[0]?.id ?? null);
      setEditingAlt(false);
    }
  }, [open, initialMedia]);

  if (!open) return null;

  const hasVideo = items.some((i) => i.kind === "video");
  const active = items.find((i) => i.id === activeId) ?? null;

  function pickFiles() {
    fileRef.current?.click();
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming: MediaAttachment[] = [];
    for (const file of Array.from(list)) {
      const kind: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
      // Videos: LinkedIn allows a single video, and can't be mixed with images.
      if (kind === "video") {
        // Replace everything with just this video (LinkedIn constraint)
        incoming.length = 0;
        incoming.push({
          id: crypto.randomUUID(),
          name: file.name,
          url: URL.createObjectURL(file),
          kind,
          file,
          mimeType: file.type,
        });
        break;
      }
      if (hasVideo) continue; // ignore extra images when a video already exists
      incoming.push({
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
        kind,
        file,
        mimeType: file.type,
      });
    }
    setItems((prev) => {
      const isVideoIncoming = incoming.some((i) => i.kind === "video");
      const next = isVideoIncoming ? incoming : [...prev, ...incoming].slice(0, 9);
      if (!activeId && next[0]) setActiveId(next[0].id);
      else if (isVideoIncoming) setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  function duplicateActive() {
    if (!active || active.kind === "video") return;
    const copy: MediaAttachment = { ...active, id: crypto.randomUUID() };
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === active.id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next.slice(0, 9);
    });
    setActiveId(copy.id);
  }

  function deleteActive() {
    if (!active) return;
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== active.id);
      setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  function done() {
    onDone(items);
    onClose();
  }

  const activeAlt = active ? altMap[active.id] ?? "" : "";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h3 className="text-base font-semibold">Editor</h3>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={done}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Done
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              aria-label="Close editor"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {items.length === 0 ? (
          <EmptyState onPick={pickFiles} />
        ) : (
          <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-[1fr_260px]">
            {/* LEFT — preview */}
            <div className="flex flex-col border-b border-neutral-800 md:border-b-0 md:border-r">
              <div className="flex flex-1 items-center justify-center bg-neutral-900 p-6">
                {active ? (
                  active.kind === "image" ? (
                    <img
                      src={active.url}
                      alt={activeAlt || active.name}
                      className="max-h-[440px] max-w-full rounded-lg object-contain shadow-lg"
                    />
                  ) : (
                    <video
                      src={active.url}
                      controls
                      className="max-h-[440px] max-w-full rounded-lg shadow-lg"
                    />
                  )
                ) : null}
              </div>
              {/* Action row */}
              <div className="flex items-center gap-6 border-t border-neutral-800 bg-neutral-950 px-6 py-3 text-sm">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-neutral-300 transition-colors hover:text-white"
                  onClick={pickFiles}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-neutral-300 transition-colors hover:text-white"
                  onClick={() =>
                    alert("Tagging people isn't supported by the LinkedIn public API.")
                  }
                >
                  <Tag className="h-4 w-4" />
                  Tag
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAlt((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 text-xs font-bold tracking-wide transition-colors ${
                    activeAlt
                      ? "border-blue-500 text-blue-300"
                      : "border-neutral-600 text-neutral-300 hover:text-white"
                  }`}
                >
                  ALT
                </button>
              </div>
              {editingAlt && active && (
                <div className="border-t border-neutral-800 bg-neutral-950 px-6 py-3">
                  <label className="mb-1 block text-xs font-medium text-neutral-400">
                    Alternative text (for accessibility)
                  </label>
                  <textarea
                    rows={2}
                    value={activeAlt}
                    onChange={(e) =>
                      setAltMap((m) => ({ ...m, [active.id]: e.target.value }))
                    }
                    placeholder="Describe this image…"
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            {/* RIGHT — sidebar */}
            <aside className="flex flex-col bg-neutral-950">
              <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 text-xs text-neutral-400">
                <span>
                  {items.findIndex((i) => i.id === activeId) + 1} of {items.length}
                </span>
                <span>{hasVideo ? "Video" : "Images"}</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {items.map((it, idx) => {
                  const isActive = it.id === activeId;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setActiveId(it.id)}
                      className="block w-full text-left"
                    >
                      <div
                        className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                          isActive
                            ? "border-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.25)]"
                            : "border-transparent hover:border-neutral-700"
                        }`}
                      >
                        {it.kind === "image" ? (
                          <img
                            src={it.url}
                            alt={it.name}
                            className="h-24 w-full object-cover"
                          />
                        ) : (
                          <video src={it.url} className="h-24 w-full object-cover" />
                        )}
                      </div>
                      <div
                        className={`mt-1 text-center text-xs font-medium tracking-wide ${
                          isActive ? "text-emerald-400" : "text-neutral-500"
                        }`}
                      >
                        {String(idx + 1).padStart(2, "0")}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-around border-t border-neutral-800 px-4 py-3">
                <button
                  type="button"
                  onClick={duplicateActive}
                  disabled={!active || active.kind === "video"}
                  title="Duplicate"
                  className="rounded-full p-2 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={deleteActive}
                  disabled={!active}
                  title="Delete"
                  className="rounded-full p-2 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={pickFiles}
                  title="Add more"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-500"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-8 py-16 text-center">
      <DeskIllustration />
      <div>
        <div className="text-2xl font-semibold text-white">Select files to begin</div>
        <div className="mt-1 text-sm text-neutral-400">
          Share images or a single video in your post.
        </div>
      </div>
      <button
        type="button"
        onClick={onPick}
        className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
      >
        <Upload className="h-4 w-4" />
        Upload from computer
      </button>
    </div>
  );
}

// Simple illustrative SVG: person at a desk with a computer and a sleeping dog.
function DeskIllustration() {
  return (
    <svg
      width="260"
      height="180"
      viewBox="0 0 260 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Floor */}
      <line x1="10" y1="160" x2="250" y2="160" stroke="#334155" strokeWidth="2" />
      {/* Desk */}
      <rect x="60" y="110" width="150" height="6" rx="2" fill="#475569" />
      <rect x="70" y="116" width="4" height="44" fill="#475569" />
      <rect x="196" y="116" width="4" height="44" fill="#475569" />
      {/* Monitor */}
      <rect x="100" y="60" width="80" height="50" rx="4" fill="#1e293b" stroke="#60a5fa" strokeWidth="2" />
      <rect x="108" y="68" width="30" height="4" rx="2" fill="#60a5fa" />
      <rect x="108" y="76" width="50" height="3" rx="1.5" fill="#38bdf8" opacity="0.7" />
      <rect x="108" y="82" width="42" height="3" rx="1.5" fill="#38bdf8" opacity="0.5" />
      <rect x="130" y="110" width="20" height="4" fill="#334155" />
      {/* Person */}
      <circle cx="70" cy="92" r="10" fill="#fbbf24" />
      <path d="M55 130 Q70 108 85 130 L82 160 L58 160 Z" fill="#3b82f6" />
      {/* Arm reaching to keyboard */}
      <path d="M78 118 Q95 118 100 112" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" fill="none" />
      {/* Sleeping dog */}
      <ellipse cx="220" cy="156" rx="22" ry="6" fill="#1e293b" opacity="0.5" />
      <path
        d="M198 152 Q205 138 220 140 Q238 142 242 152 Q244 158 236 158 L206 158 Q198 158 198 152 Z"
        fill="#a3a3a3"
      />
      <circle cx="238" cy="148" r="4" fill="#a3a3a3" />
      <circle cx="240" cy="146" r="0.8" fill="#0f172a" />
      {/* Zzz */}
      <text x="228" y="132" fill="#64748b" fontSize="10" fontFamily="sans-serif">
        z
      </text>
      <text x="234" y="126" fill="#64748b" fontSize="8" fontFamily="sans-serif">
        z
      </text>
    </svg>
  );
}
