import { useEffect, useRef, useState } from "react";
import {
  Smile,
  Image as ImageIcon,
  Calendar,
  Award,
  Plus,
  Briefcase,
  BarChart3,
  FileText,
  IdCard,
  X,
} from "lucide-react";

// ---------- Types ----------
export type MediaAttachment = { id: string; name: string; url: string; kind: "image" | "video"; file?: File; mimeType?: string };
export type DocAttachment = { id: string; name: string; sizeKb: number };
export type BgTemplate = { id: string; label: string; className: string; textClass: string };

export const BG_TEMPLATES: BgTemplate[] = [
  { id: "none", label: "Default", className: "bg-background", textClass: "text-foreground" },
  { id: "sunset", label: "Sunset", className: "bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600", textClass: "text-white" },
  { id: "ocean", label: "Ocean", className: "bg-gradient-to-br from-cyan-500 to-blue-700", textClass: "text-white" },
  { id: "forest", label: "Forest", className: "bg-gradient-to-br from-emerald-500 to-green-800", textClass: "text-white" },
  { id: "mono", label: "Mono", className: "bg-neutral-900", textClass: "text-white" },
  { id: "cream", label: "Cream", className: "bg-amber-100", textClass: "text-neutral-900" },
];

// ---------- Emoji Set ----------
const EMOJIS = [
  "🚀","🔥","✨","💡","🎉","👏","🙌","💪","🧠","📈","📊","🎯","✅","⚡","🌟","🏆",
  "🤝","💼","📝","📌","🔗","🌐","💬","❤️","👀","😀","😂","😊","🤔","😎","🙏","👇",
  "👉","🎊","🥳","💯","⭐","🌈","☕","📅","📚","🛠️","🎨","🧩","🔍","📣","🕒","💥",
];

// ---------- Celebrate templates ----------
const CELEBRATE_TEMPLATES: { id: string; label: string; text: string }[] = [
  {
    id: "welcome",
    label: "Welcome a new team member",
    text: "🎉 Thrilled to welcome [Name] to our team as our new [Role]!\n\nTheir experience in [area] is going to be a huge asset. Please join me in giving them a warm welcome. 👋\n\n#WelcomeAboard #TeamGrowth",
  },
  {
    id: "launch",
    label: "Launch a new project",
    text: "🚀 Big day! We just launched [Project Name] — [one-line description].\n\nMonths of work from an incredible team. Would love your feedback 👇\n\n#Launch #Product #BuildInPublic",
  },
  {
    id: "praise",
    label: "Praise a colleague",
    text: "👏 Huge shoutout to [Name] for [what they did].\n\nThe kind of teammate that makes everyone around them better. Grateful to work with you.\n\n#Kudos #Teamwork",
  },
  {
    id: "milestone",
    label: "Work milestone",
    text: "🏆 Today marks [X years / a milestone] at [Company].\n\nLooking back, the biggest lesson: [insight].\n\nGrateful to everyone who's been part of the journey. 🙏\n\n#Milestone #Grateful",
  },
  {
    id: "promotion",
    label: "Promotion / New role",
    text: "✨ Excited to share that I've stepped into a new role as [Title] at [Company].\n\nThank you to everyone who's supported me. Now — onto the next chapter. 🚀\n\n#NewRole #Grateful",
  },
];

// ---------- Popover helper ----------
function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

// ---------- Toolbar Button ----------
function ToolButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-input bg-background/60 text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Main Toolbar ----------
export function PostToolbar({
  insertText,
  onAddMedia,
  onAddDoc,
  bgId,
  onChangeBg,
  onOpenAttachments,
}: {
  insertText: (t: string) => void;
  onAddMedia: (m: MediaAttachment) => void;
  onAddDoc: (d: DocAttachment) => void;
  bgId: string;
  onChangeBg: (id: string) => void;
  onOpenAttachments?: () => void;
}) {

  const [open, setOpen] = useState<null | "emoji" | "celebrate" | "event" | "hiring" | "poll" | "bg" | "expand">(null);
  const [showExpanded, setShowExpanded] = useState(false);
  const close = () => setOpen(null);

  const mediaRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);

  function onMediaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      const kind: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
      onAddMedia({ id: crypto.randomUUID(), name: file.name, url, kind, file, mimeType: file.type });
    }
    e.target.value = "";
  }

  function onDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onAddDoc({ id: crypto.randomUUID(), name: file.name, sizeKb: Math.round(file.size / 1024) });
    e.target.value = "";
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background/40 p-1.5">
        <ToolButton title="Add emoji" active={open === "emoji"} onClick={() => setOpen(open === "emoji" ? null : "emoji")}>
          <Smile className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Add media (image / video)"
          onClick={() => (onOpenAttachments ? onOpenAttachments() : mediaRef.current?.click())}
        >
          <ImageIcon className="h-4 w-4" />
        </ToolButton>

        <ToolButton title="Create an event" active={open === "event"} onClick={() => setOpen(open === "event" ? null : "event")}>
          <Calendar className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Celebrate an occasion" active={open === "celebrate"} onClick={() => setOpen(open === "celebrate" ? null : "celebrate")}>
          <Award className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="More options" active={showExpanded} onClick={() => setShowExpanded((s) => !s)}>
          <Plus className={`h-4 w-4 transition-transform ${showExpanded ? "rotate-45" : ""}`} />
        </ToolButton>

        {showExpanded && (
          <>
            <div className="mx-1 h-6 w-px bg-border" />
            <ToolButton title="Share that you're hiring" active={open === "hiring"} onClick={() => setOpen(open === "hiring" ? null : "hiring")}>
              <Briefcase className="h-4 w-4" />
            </ToolButton>
            <ToolButton title="Create a poll" active={open === "poll"} onClick={() => setOpen(open === "poll" ? null : "poll")}>
              <BarChart3 className="h-4 w-4" />
            </ToolButton>
            <ToolButton title="Add a document" onClick={() => docRef.current?.click()}>
              <FileText className="h-4 w-4" />
            </ToolButton>
            <ToolButton title="Text templates & background" active={open === "bg"} onClick={() => setOpen(open === "bg" ? null : "bg")}>
              <IdCard className="h-4 w-4" />
            </ToolButton>
          </>
        )}
      </div>

      <input ref={mediaRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={onMediaChange} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" className="hidden" onChange={onDocChange} />

      {open === "emoji" && (
        <EmojiPopover
          onPick={(e) => {
            insertText(e);
            close();
          }}
          onClose={close}
        />
      )}
      {open === "celebrate" && (
        <CelebratePopover
          onPick={(t) => {
            insertText("\n\n" + t);
            close();
          }}
          onClose={close}
        />
      )}
      {open === "event" && (
        <EventModal
          onSubmit={(text) => {
            insertText("\n\n" + text);
            close();
          }}
          onClose={close}
        />
      )}
      {open === "hiring" && (
        <HiringModal
          onSubmit={(text) => {
            insertText("\n\n" + text);
            close();
          }}
          onClose={close}
        />
      )}
      {open === "poll" && (
        <PollModal
          onSubmit={(text) => {
            insertText("\n\n" + text);
            close();
          }}
          onClose={close}
        />
      )}
      {open === "bg" && <BgPopover value={bgId} onChange={onChangeBg} onClose={close} />}
    </div>
  );
}

// ---------- Emoji ----------
function EmojiPopover({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useClickOutside(onClose);
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="mb-2 text-xs font-medium">Pick an emoji</div>
      <div className="grid grid-cols-8 gap-1 text-lg">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="rounded-md p-1 transition-colors hover:bg-accent"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Celebrate ----------
function CelebratePopover({ onPick, onClose }: { onPick: (t: string) => void; onClose: () => void }) {
  const ref = useClickOutside(onClose);
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-2 w-80 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="mb-2 text-xs font-medium">Celebrate an occasion</div>
      <ul className="space-y-1">
        {CELEBRATE_TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t.text)}
              className="block w-full rounded-md border border-border/60 bg-background/60 p-2 text-left text-xs transition-colors hover:bg-accent"
            >
              <div className="font-medium">{t.label}</div>
              <div className="mt-0.5 line-clamp-2 text-muted-foreground">{t.text.split("\n")[0]}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Background ----------
function BgPopover({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useClickOutside(onClose);
  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="mb-2 text-xs font-medium">Preview background template</div>
      <div className="grid grid-cols-3 gap-2">
        {BG_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`group flex h-14 items-center justify-center rounded-md border text-[10px] font-medium ${t.className} ${t.textClass} ${
              value === t.id ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Applies to the preview card. LinkedIn publishes plain text via the API.
      </p>
    </div>
  );
}

// ---------- Generic Modal ----------
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "mb-1 block text-xs font-medium";

// ---------- Event ----------
function EventModal({ onSubmit, onClose }: { onSubmit: (text: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [link, setLink] = useState("");
  const [desc, setDesc] = useState("");
  const valid = name.trim() && date;

  function submit() {
    const parts = [
      `📅 Event: ${name}`,
      date ? `🗓️ Date: ${date}${time ? ` at ${time}` : ""}` : "",
      link ? `🔗 ${link}` : "",
      desc ? `\n${desc}` : "",
    ].filter(Boolean);
    onSubmit(parts.join("\n"));
  }

  return (
    <Modal title="Create an event" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Event name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AI Product Meetup" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Time</label>
            <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Link (optional)</label>
          <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label className={labelCls}>Description (optional)</label>
          <textarea className={inputCls} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={submit}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Insert event into post
        </button>
      </div>
    </Modal>
  );
}

// ---------- Hiring ----------
function HiringModal({ onSubmit, onClose }: { onSubmit: (text: string) => void; onClose: () => void }) {
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const valid = role.trim() && company.trim();

  function submit() {
    const text = [
      `💼 We're hiring: ${role} @ ${company}`,
      location ? `📍 ${location}` : "",
      "",
      "If you or someone you know is a fit, I'd love to chat 👇",
      link ? `🔗 ${link}` : "",
      "",
      "#Hiring #NowHiring",
    ]
      .filter((l) => l !== undefined)
      .join("\n");
    onSubmit(text);
  }

  return (
    <Modal title="Share that you're hiring" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Role</label>
          <input className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Senior Product Engineer" />
        </div>
        <div>
          <label className={labelCls}>Company</label>
          <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Location (optional)</label>
          <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote · EU" />
        </div>
        <div>
          <label className={labelCls}>Application link (optional)</label>
          <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={submit}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Insert into post
        </button>
      </div>
    </Modal>
  );
}

// ---------- Poll ----------
function PollModal({ onSubmit, onClose }: { onSubmit: (text: string) => void; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [duration, setDuration] = useState("1 week");
  const validOptions = options.filter((o) => o.trim());
  const valid = question.trim() && validOptions.length >= 2;

  function updateOpt(i: number, v: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  }
  function addOpt() {
    if (options.length < 4) setOptions([...options, ""]);
  }
  function removeOpt(i: number) {
    if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i));
  }

  function submit() {
    const text = [
      `📊 Poll: ${question}`,
      "",
      ...validOptions.map((o) => `• ${o}`),
      "",
      `⏱ Voting is open for ${duration}. Cast your vote in the comments 👇`,
    ].join("\n");
    onSubmit(text);
  }

  return (
    <Modal title="Create a poll" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Your question</label>
          <input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What matters most in a great LinkedIn post?" />
        </div>
        <div>
          <label className={labelCls}>Options (2–4)</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputCls}
                  value={opt}
                  onChange={(e) => updateOpt(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOpt(i)}
                    className="rounded-md border border-input px-2 text-xs hover:bg-accent"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 4 && (
            <button type="button" onClick={addOpt} className="mt-2 text-xs text-primary hover:underline">
              + Add option
            </button>
          )}
        </div>
        <div>
          <label className={labelCls}>Duration</label>
          <select className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option>1 day</option>
            <option>3 days</option>
            <option>1 week</option>
            <option>2 weeks</option>
          </select>
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={submit}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Insert poll into post
        </button>
      </div>
    </Modal>
  );
}

// ---------- Attachment previews ----------
export function AttachmentStrip({
  media,
  docs,
  onRemoveMedia,
  onRemoveDoc,
}: {
  media: MediaAttachment[];
  docs: DocAttachment[];
  onRemoveMedia: (id: string) => void;
  onRemoveDoc: (id: string) => void;
}) {
  if (media.length === 0 && docs.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {media.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {media.map((m) => (
            <div key={m.id} className="group relative h-24 w-24 overflow-hidden rounded-md border border-border bg-muted">
              {m.kind === "image" ? (
                <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
              ) : (
                <video src={m.url} className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => onRemoveMedia(m.id)}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground">· {d.sizeKb} KB</span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveDoc(d.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
