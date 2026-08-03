# Theme switcher + performance fixes

## What's wrong today

The theme circles in the header only swap the decorative animated background layer. The dashboard wrapper hardcodes `dark bg-slate-950`, so surfaces, borders, text, and accents never change no matter which circle you click. Separately, the page paints three large blurred glow spheres plus a full-viewport blurred background and a blurred sticky header on every frame, and the composer's `text` state lives at the top of the Compose tab with inline handlers, so each keystroke re-renders the preview, viral score, hashtag card, and drafts list.

## 1. Real theme switcher

- Add four theme presets as `[data-theme="..."]` blocks in `src/styles.css`: Midnight Dark (current slate/indigo), Slate (neutral grey-blue), Indigo Purple (deeper violet accents), Clean Light (white surfaces, dark text). Each preset overrides the existing semantic tokens only — background, card, border, primary, muted, accent, foreground — so all components follow automatically.
- Replace the background-only picker with a color-theme picker: the same circle UI, each swatch showing that preset's background + primary. Selection writes `data-theme` (and the `dark` class for the dark presets) on `document.documentElement` and persists to `localStorage`, applied in an effect so there is no hydration mismatch and no reload.
- Remove the hardcoded `dark bg-slate-950` / `bg-slate-900/50` / `border-slate-800/60` classes from the dashboard shell, header, nav, and cards and use the semantic tokens (`bg-background`, `bg-card`, `border-border`, `text-primary`) so switching is instant and Clean Light is actually readable.
- Keep the existing animated-background choice available, but drive its palette from the active theme instead of fixed slate values.

## 2. Performance

- Drop the three `glow-sphere` blurred divs and the header's `backdrop-blur-xl` in favour of a single static radial-gradient background layer plus a solid/translucent header — same look, no per-frame GPU blur.
- Change `@utility glass-card` to use a light single-pass shadow and no `backdrop-filter` (fall back to a slightly opaque card background), and tone the multi-layer box-shadow down to one layer.
- Pause the animated background's keyframe animations when the tab is hidden and respect `prefers-reduced-motion`.
- Isolate composer typing: move `text` into a small composer subtree (or keep it in ComposeTab but wrap consumers), wrap `setText`, `insertAtCursor`, draft load/new, media and doc setters in `useCallback`, and wrap the preview card, viral score card, hashtag optimizer, drafts manager, and history/analytics cards in `React.memo` with stable props. Debounce the viral-score analysis (~200ms) so scoring doesn't run per keystroke.

## Technical notes

Files touched: `src/styles.css` (theme presets, glass-card), `src/components/AnimatedBackground.tsx` (rename/extend picker to color themes, motion guards), `src/routes/_authenticated/dashboard.tsx` (token-based classes, memoization, callbacks), `src/components/ViralInsights.tsx` (memo + debounced analysis). No backend, publishing, or LinkedIn API changes.
