import { useCallback, useEffect, useRef, useState } from "react";
import { X, Pencil, Copy, Trash2, Plus, Upload, Crop, Check, Undo2 } from "lucide-react";
import type { MediaAttachment } from "./PostToolbar";

const PEN_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff", "#000000"];

type Tool = "none" | "crop" | "pen";

// LinkedIn-style attachment editor modal.
// Step 1 (no files): empty state with illustration + "Upload from computer"
// Step 2 (files selected): left preview with crop/markup tools, right sidebar
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
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({});
  const [tagDraft, setTagDraft] = useState("");
  const [taggingOpen, setTaggingOpen] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [tool, setTool] = useState<Tool>("none");

  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [dirty, setDirty] = useState(false);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const cropStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) {
      setItems(initialMedia);
      setActiveId(initialMedia[0]?.id ?? null);
      setEditingAlt(false);
      setTool("none");
      setCropRect(null);
      setDirty(false);
    }
  }, [open, initialMedia]);

  const hasVideo = items.some((i) => i.kind === "video");
  const active = items.find((i) => i.id === activeId) ?? null;

  // Load the active image into the canvas whenever it changes.
  useEffect(() => {
    if (!open || !active || active.kind !== "image") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      setDirty(false);
      setCropRect(null);
    };
    img.src = active.url;
  }, [open, active?.id, active?.url, active?.kind]);

  const toCanvasCoords = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (!canvasRef.current || tool === "none") return;
    const p = toCanvasCoords(e);
    if (tool === "pen") {
      drawing.current = true;
      const ctx = canvasRef.current.getContext("2d")!;
      ctx.strokeStyle = penColor;
      ctx.lineWidth = Math.max(2, canvasRef.current.width / 300);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    } else {
      cropStart.current = p;
      setCropRect({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!canvasRef.current) return;
    if (tool === "pen" && drawing.current) {
      const p = toCanvasCoords(e);
      const ctx = canvasRef.current.getContext("2d")!;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setDirty(true);
    } else if (tool === "crop" && cropStart.current) {
      const p = toCanvasCoords(e);
      const s = cropStart.current;
      setCropRect({
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        w: Math.abs(p.x - s.x),
        h: Math.abs(p.y - s.y),
      });
    }
  }

  function onPointerUp() {
    drawing.current = false;
    cropStart.current = null;
  }

  async function commitCanvas(canvas: HTMLCanvasElement) {
    if (!active) return;
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/png"),
    );
    if (!blob) return;
    const name = active.name.replace(/\.[^.]+$/, "") + "-edited.png";
    const file = new File([blob], name, { type: "image/png" });
    const url = URL.createObjectURL(blob);
    setItems((prev) =>
      prev.map((it) => (it.id === active.id ? { ...it, url, file, mimeType: "image/png", name } : it)),
    );
    setDirty(false);
    setCropRect(null);
    setTool("none");
  }

  async function applyCrop() {
    const canvas = canvasRef.current;
    if (!canvas || !cropRect || cropRect.w < 4 || cropRect.h < 4) return;
    const out = document.createElement("canvas");
    out.width = Math.round(cropRect.w);
    out.height = Math.round(cropRect.h);
    out
      .getContext("2d")!
      .drawImage(canvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, out.width, out.height);
    await commitCanvas(out);
  }

  function resetActive() {
    // Re-draw from the original URL by nudging the effect.
    const cur = active;
    if (!cur) return;
    setCropRect(null);
    setDirty(false);
    setItems((prev) => prev.map((it) => (it.id === cur.id ? { ...it } : it)));
    const canvas = canvasRef.current;
    if (canvas) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")?.drawImage(img, 0, 0);
      };
      img.src = cur.url;
    }
  }

  if (!open) return null;

  function pickFiles() {
    fileRef.current?.click();
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming: MediaAttachment[] = [];
    let videoOnly = false;
    for (const file of Array.from(list)) {
      const kind: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
      if (kind === "video") {
        // LinkedIn allows a single video and it can't be mixed with images.
        incoming.length = 0;
        videoOnly = true;
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
      const next = videoOnly ? incoming : [...prev.filter((p) => p.kind !== "video"), ...incoming].slice(0, 9);
      setActiveId(videoOnly ? (next[0]?.id ?? null) : (incoming[0]?.id ?? next[0]?.id ?? null));
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
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl">
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
          <div className="grid min-h-[520px] grid-cols-1 overflow-y-auto md:grid-cols-[1fr_260px]">
            {/* LEFT — preview */}
            <div className="flex flex-col border-b border-neutral-800 md:border-b-0 md:border-r">
              <div className="relative flex flex-1 items-center justify-center bg-neutral-900 p-6">
                {active ? (
                  active.kind === "image" ? (
                    <div className="relative inline-block max-h-[440px] max-w-full">
                      <canvas
                        ref={canvasRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                        style={{ maxHeight: 440, maxWidth: "100%", width: "auto", height: "auto" }}
                        className={`block rounded-lg object-contain shadow-lg ${
                          tool === "pen" ? "cursor-crosshair" : tool === "crop" ? "cursor-cell" : ""
                        }`}
                      />
                      {tool === "crop" && cropRect && cropRect.w > 2 && canvasRef.current && (
                        <div
                          className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/10"
                          style={{
                            left: `${(cropRect.x / canvasRef.current.width) * 100}%`,
                            top: `${(cropRect.y / canvasRef.current.height) * 100}%`,
                            width: `${(cropRect.w / canvasRef.current.width) * 100}%`,
                            height: `${(cropRect.h / canvasRef.current.height) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <video
                      src={active.url}
                      controls
                      className="max-h-[440px] max-w-full rounded-lg object-contain shadow-lg"
                    />
                  )
                ) : null}
              </div>

              {/* Action row */}
              <div className="flex flex-wrap items-center gap-4 border-t border-neutral-800 bg-neutral-950 px-6 py-3 text-sm">
                <button
                  type="button"
                  disabled={!active || active.kind !== "image"}
                  onClick={() => {
                    setTool((t) => (t === "pen" ? "none" : "pen"));
                    setCropRect(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-2 py-1 transition-colors disabled:opacity-40 ${
                    tool === "pen" ? "bg-blue-600 text-white" : "text-neutral-300 hover:text-white"
                  }`}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={!active || active.kind !== "image"}
                  onClick={() => {
                    setTool((t) => (t === "crop" ? "none" : "crop"));
                    setCropRect(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-2 py-1 transition-colors disabled:opacity-40 ${
                    tool === "crop" ? "bg-blue-600 text-white" : "text-neutral-300 hover:text-white"
                  }`}
                >
                  <Crop className="h-4 w-4" />
                  Crop
                </button>
                <button
                  type="button"
                  disabled={!active || active.kind !== "image"}
                  onClick={rotateActive}
                  title="Rotate 90°"
                  className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-neutral-300 transition-colors hover:text-white disabled:opacity-40"
                >
                  <RotateCw className="h-4 w-4" />
                  Rotate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTaggingOpen((v) => !v);
                    setEditingAlt(false);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-2 py-1 transition-colors ${
                    taggingOpen || (active && (tagMap[active.id] ?? []).length > 0)
                      ? "bg-blue-600 text-white"
                      : "text-neutral-300 hover:text-white"
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  Tag
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAlt((v) => !v);
                    setTaggingOpen(false);
                  }}
                  className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 text-xs font-bold tracking-wide transition-colors ${
                    activeAlt
                      ? "border-blue-500 text-blue-300"
                      : "border-neutral-600 text-neutral-300 hover:text-white"
                  }`}
                >
                  ALT
                </button>


                {tool === "pen" && (
                  <div className="ml-auto flex items-center gap-2">
                    {PEN_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPenColor(c)}
                        aria-label={`Pen color ${c}`}
                        style={{ background: c }}
                        className={`h-5 w-5 rounded-full border ${
                          penColor === c ? "border-white ring-2 ring-blue-500" : "border-neutral-600"
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      value={penColor}
                      onChange={(e) => setPenColor(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent"
                      aria-label="Custom pen color"
                    />
                  </div>
                )}

                {tool === "crop" && (
                  <button
                    type="button"
                    onClick={applyCrop}
                    disabled={!cropRect || cropRect.w < 4}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" /> Apply crop
                  </button>
                )}

                {tool === "pen" && dirty && (
                  <div className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      onClick={() => canvasRef.current && commitCanvas(canvasRef.current)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                    >
                      <Check className="h-3.5 w-3.5" /> Save markup
                    </button>
                    <button
                      type="button"
                      onClick={resetActive}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:text-white"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Reset
                    </button>
                  </div>
                )}
              </div>

              {taggingOpen && active && (
                <div className="border-t border-neutral-800 bg-neutral-950 px-6 py-3">
                  <label className="mb-1 block text-xs font-medium text-neutral-400">
                    Tag people or pages in this image
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      placeholder="e.g. @Jane Doe or Acme Inc."
                      className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = tagDraft.trim();
                        if (!v) return;
                        setTagMap((m) => ({ ...m, [active.id]: [...(m[active.id] ?? []), v] }));
                        setTagDraft("");
                      }}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                    >
                      Add tag
                    </button>
                  </div>
                  {(tagMap[active.id] ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(tagMap[active.id] ?? []).map((t, i) => (
                        <span
                          key={`${t}-${i}`}
                          className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-200"
                        >
                          {t}
                          <button
                            type="button"
                            aria-label={`Remove ${t}`}
                            onClick={() =>
                              setTagMap((m) => ({
                                ...m,
                                [active.id]: (m[active.id] ?? []).filter((_, j) => j !== i),
                              }))
                            }
                            className="text-blue-300 hover:text-white"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {editingAlt && active && (
                <div className="border-t border-neutral-800 bg-neutral-950 px-6 py-3">
                  <label className="mb-1 block text-xs font-medium text-neutral-400">
                    Alternative text (for accessibility)
                  </label>
                  <textarea
                    rows={2}
                    value={activeAlt}
                    onChange={(e) => setAltMap((m) => ({ ...m, [active.id]: e.target.value }))}
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
                        className={`relative overflow-hidden rounded-lg border-2 bg-neutral-900 transition-all ${
                          isActive
                            ? "border-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.25)]"
                            : "border-transparent hover:border-neutral-700"
                        }`}
                      >
                        {it.kind === "image" ? (
                          <img src={it.url} alt={it.name} className="h-24 w-full object-contain" />
                        ) : (
                          <video src={it.url} className="h-24 w-full object-contain" />
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
                  title="Add more files"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-500"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </aside>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
            <button
              type="button"
              onClick={() => {
                const idx = items.findIndex((i) => i.id === activeId);
                if (idx > 0) setActiveId(items[idx - 1]!.id);
              }}
              disabled={items.findIndex((i) => i.id === activeId) <= 0}
              className="rounded-full border border-neutral-700 px-4 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-40"
            >
              Back
            </button>
            {items.findIndex((i) => i.id === activeId) < items.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  const idx = items.findIndex((i) => i.id === activeId);
                  setActiveId(items[idx + 1]!.id);
                }}
                className="rounded-full bg-blue-600 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={done}
                className="rounded-full bg-blue-600 px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Done
              </button>
            )}
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
