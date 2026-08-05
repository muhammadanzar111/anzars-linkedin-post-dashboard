import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  X,
  Pencil,
  Copy,
  Trash2,
  Plus,
  Upload,
  Crop,
  Check,
  Undo2,
  RotateCw,
  UserPlus,
  Maximize2,
  Minimize2,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import type { MediaAttachment } from "./PostToolbar";

const PEN_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff", "#000000"];

type Tool = "none" | "crop" | "pen";
type Rect = { x: number; y: number; w: number; h: number };
type RatioId = "free" | "1:1" | "16:9" | "4:3" | "3:4" | "original";

const RATIOS: { id: RatioId; label: string }[] = [
  { id: "free", label: "Freeform" },
  { id: "1:1", label: "Square 1:1" },
  { id: "16:9", label: "Landscape 16:9" },
  { id: "4:3", label: "Document 4:3" },
  { id: "3:4", label: "Portrait 3:4" },
  { id: "original", label: "Original" },
];

function ratioValue(id: RatioId, canvasW: number, canvasH: number): number | null {
  switch (id) {
    case "1:1":
      return 1;
    case "16:9":
      return 16 / 9;
    case "4:3":
      return 4 / 3;
    case "3:4":
      return 3 / 4;
    case "original":
      return canvasH > 0 ? canvasW / canvasH : null;
    default:
      return null;
  }
}

function clampRect(r: Rect, W: number, H: number): Rect {
  const w = Math.min(Math.max(r.w, 16), W);
  const h = Math.min(Math.max(r.h, 16), H);
  const x = Math.min(Math.max(r.x, 0), W - w);
  const y = Math.min(Math.max(r.y, 0), H - h);
  return { x, y, w, h };
}

// Build a centered rect that fills ~85% of the canvas for the given ratio.
function centeredRect(W: number, H: number, ratio: number | null): Rect {
  if (!ratio) {
    const w = W * 0.85;
    const h = H * 0.85;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }
  let w = W * 0.85;
  let h = w / ratio;
  if (h > H * 0.85) {
    h = H * 0.85;
    w = h * ratio;
  }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// LinkedIn-style attachment editor modal.
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
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [ratioId, setRatioId] = useState<RatioId>("free");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dragRef = useRef<{
    mode: "move" | "nw" | "ne" | "sw" | "se";
    start: { x: number; y: number };
    rect: Rect;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setItems(initialMedia);
      setActiveId(initialMedia[0]?.id ?? null);
      setEditingAlt(false);
      setTool("none");
      setCropRect(null);
      setRatioId("free");
      setDirty(false);
    }
  }, [open, initialMedia]);

  // Lock page scroll while the modal is open so it's always reachable.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  const startCrop = useCallback((nextRatio: RatioId) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = ratioValue(nextRatio, canvas.width, canvas.height);
    setRatioId(nextRatio);
    setCropRect(centeredRect(canvas.width, canvas.height, ratio));
  }, []);

  // Scale the crop box about its center.
  const scaleCrop = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCropRect((r) => {
      if (!r) return r;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const w = r.w * factor;
      const h = r.h * factor;
      return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }, canvas.width, canvas.height);
    });
  }, []);

  const nudgeCrop = useCallback((dx: number, dy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCropRect((r) =>
      r
        ? clampRect(
            { ...r, x: r.x + dx * canvas.width * 0.03, y: r.y + dy * canvas.height * 0.03 },
            canvas.width,
            canvas.height,
          )
        : r,
    );
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (!canvasRef.current || tool !== "pen") return;
    const p = toCanvasCoords(e);
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.strokeStyle = penColor;
    ctx.lineWidth = Math.max(2, canvasRef.current.width / 300);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!canvasRef.current) return;
    if (tool === "pen" && drawing.current) {
      const p = toCanvasCoords(e);
      const ctx = canvasRef.current.getContext("2d")!;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setDirty(true);
    }
  }

  function onPointerUp() {
    drawing.current = false;
  }

  // ---- crop box drag handling ----
  function beginDrag(mode: "move" | "nw" | "ne" | "sw" | "se") {
    return (e: React.PointerEvent) => {
      if (!cropRect) return;
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = { mode, start: toCanvasCoords(e), rect: cropRect };
    };
  }

  function dragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
    const p = toCanvasCoords(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const W = canvas.width;
    const H = canvas.height;
    const ratio = ratioValue(ratioId, W, H);
    const r = d.rect;

    if (d.mode === "move") {
      setCropRect(clampRect({ ...r, x: r.x + dx, y: r.y + dy }, W, H));
      return;
    }

    let x = r.x;
    let y = r.y;
    let w = r.w;
    let h = r.h;
    if (d.mode === "se") {
      w = r.w + dx;
      h = ratio ? w / ratio : r.h + dy;
    } else if (d.mode === "sw") {
      w = r.w - dx;
      h = ratio ? w / ratio : r.h + dy;
      x = r.x + r.w - w;
    } else if (d.mode === "ne") {
      w = r.w + dx;
      h = ratio ? w / ratio : r.h - dy;
      y = r.y + r.h - h;
    } else {
      w = r.w - dx;
      h = ratio ? w / ratio : r.h - dy;
      x = r.x + r.w - w;
      y = r.y + r.h - h;
    }
    if (w < 16 || h < 16) return;
    setCropRect(clampRect({ x, y, w, h }, W, H));
  }

  function dragEnd() {
    dragRef.current = null;
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

  async function rotateActive() {
    const canvas = canvasRef.current;
    if (!canvas || !active || active.kind !== "image") return;
    const out = document.createElement("canvas");
    out.width = canvas.height;
    out.height = canvas.width;
    const ctx = out.getContext("2d")!;
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    await commitCanvas(out);
  }

  function resetActive() {
    const cur = active;
    if (!cur) return;
    setCropRect(null);
    setRatioId("free");
    setDirty(false);
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
  const canvasW = canvasRef.current?.width ?? 1;
  const canvasH = canvasRef.current?.height ?? 1;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex h-screen w-screen items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative mx-auto my-auto flex h-[85vh] max-h-[700px] w-full max-w-4xl animate-fade-in-up flex-col overflow-hidden rounded-xl border border-neutral-800 bg-slate-900 text-neutral-100 shadow-2xl">

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-800 px-5 py-3">
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
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_260px]">
            {/* LEFT — preview */}
            <div className="flex min-h-0 min-w-0 flex-col border-b border-neutral-800 md:border-b-0 md:border-r">
              <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-4">
                {active ? (
                  active.kind === "image" ? (
                    <div className="relative flex max-h-full max-w-full items-center justify-center">
                      <canvas
                        ref={canvasRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerUp}
                        className={`block max-h-full max-w-full rounded-lg object-contain shadow-lg ${
                          tool === "pen" ? "cursor-crosshair" : ""
                        }`}
                        style={{ maxHeight: "100%", maxWidth: "100%" }}
                      />
                      {tool === "crop" && cropRect && (
                        <div
                          className="absolute inset-0"
                          onPointerMove={dragMove}
                          onPointerUp={dragEnd}
                          onPointerLeave={dragEnd}
                        >
                          {/* dim outside */}
                          <div className="pointer-events-none absolute inset-0 bg-black/50" />
                          <div
                            onPointerDown={beginDrag("move")}
                            className="absolute cursor-move border-2 border-emerald-400 bg-emerald-400/5 shadow-[0_0_0_9999px_rgba(0,0,0,0)]"
                            style={{
                              left: pct(cropRect.x, canvasW),
                              top: pct(cropRect.y, canvasH),
                              width: pct(cropRect.w, canvasW),
                              height: pct(cropRect.h, canvasH),
                              backdropFilter: "none",
                            }}
                          >
                            <div className="absolute inset-0 bg-transparent" />
                            {(["nw", "ne", "sw", "se"] as const).map((h) => (
                              <span
                                key={h}
                                onPointerDown={beginDrag(h)}
                                className={`absolute h-4 w-4 rounded-sm border-2 border-white bg-emerald-500 ${
                                  h === "nw"
                                    ? "-left-2 -top-2 cursor-nwse-resize"
                                    : h === "ne"
                                      ? "-right-2 -top-2 cursor-nesw-resize"
                                      : h === "sw"
                                        ? "-bottom-2 -left-2 cursor-nesw-resize"
                                        : "-bottom-2 -right-2 cursor-nwse-resize"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <video
                      src={active.url}
                      controls
                      className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
                    />
                  )
                ) : null}
              </div>

              {/* Crop control drawer */}
              {tool === "crop" && (
                <div className="flex-shrink-0 space-y-2 border-t border-neutral-800 bg-neutral-900 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {RATIOS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => startCrop(r.id)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                          ratioId === r.id
                            ? "bg-blue-600 text-white"
                            : "border border-neutral-700 text-neutral-300 hover:text-white"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full border border-neutral-700 px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => scaleCrop(1.06)}
                        title="Expand"
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-300 hover:text-white"
                      >
                        <Maximize2 className="h-3.5 w-3.5" /> Expand
                      </button>
                      <button
                        type="button"
                        onClick={() => scaleCrop(0.94)}
                        title="Shrink"
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-300 hover:text-white"
                      >
                        <Minimize2 className="h-3.5 w-3.5" /> Shrink
                      </button>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-neutral-700 px-1 py-0.5">
                      {[
                        { icon: ArrowLeft, dx: -1, dy: 0, label: "Move left" },
                        { icon: ArrowRight, dx: 1, dy: 0, label: "Move right" },
                        { icon: ArrowUp, dx: 0, dy: -1, label: "Move up" },
                        { icon: ArrowDown, dx: 0, dy: 1, label: "Move down" },
                      ].map(({ icon: Icon, dx, dy, label }) => (
                        <button
                          key={label}
                          type="button"
                          title={label}
                          aria-label={label}
                          onClick={() => nudgeCrop(dx, dy)}
                          className="rounded-full p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => startCrop(ratioId)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:text-white"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Reset crop
                    </button>
                    <button
                      type="button"
                      onClick={applyCrop}
                      disabled={!cropRect}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" /> Apply crop
                    </button>
                  </div>
                </div>
              )}

              {/* Pinned action row */}
              <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-center gap-4 border-t border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
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
                    if (tool === "crop") {
                      setTool("none");
                      setCropRect(null);
                    } else {
                      setTool("crop");
                      startCrop("free");
                    }
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

                {tool === "pen" && dirty && (
                  <div className="flex items-center gap-2">
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
                <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-950 px-6 py-3">
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
                <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-950 px-6 py-3">
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
            <aside className="flex min-h-0 flex-col bg-neutral-950">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3 text-xs text-neutral-400">
                <span>
                  {items.findIndex((i) => i.id === activeId) + 1} of {items.length}
                </span>
                <span>{hasVideo ? "Video" : "Images"}</span>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
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
              <div className="flex flex-shrink-0 items-center justify-around border-t border-neutral-800 p-3">
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
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-full bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            </aside>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
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
    </div>,
    document.body,
  );

}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex max-h-[85vh] min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-8 py-8 text-center">
      <DeskIllustration />
      <div>
        <div className="text-xl font-semibold text-white sm:text-2xl">Select files to begin</div>
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
      viewBox="0 0 260 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-auto w-full max-w-[180px] flex-shrink-0"
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
