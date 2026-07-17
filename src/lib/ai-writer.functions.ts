import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const Input = z.object({
  details: z.string().min(1).max(4000),
  toneLevel: z.number().int().min(0).max(4),
});

const TONE_LABELS = [
  "Highly Casual / Relatable",
  "Casual & Friendly",
  "Balanced / Conversational",
  "Professional",
  "Strictly Professional / Corporate",
] as const;

const TONE_GUIDANCE = [
  "Raw, casual, storytelling voice. Use simple everyday words a friend would use, contractions, first-person confessions, and vivid tiny moments. No jargon, no buzzwords. Think 'DMing a friend'.",
  "Warm, friendly, conversational. Contractions welcome. Light humor is fine. Peer-to-peer voice.",
  "Balanced conversational-professional. Approachable but credible. Mix a personal hook with clear insight.",
  "Polished and confident. Tailored to recruiters and hiring managers. Highlight skills, outcomes, and measurable value.",
  "Strictly corporate and authoritative. Executive voice. Precise, formal vocabulary, no slang, no emojis in the body copy. Reads like a Fortune-500 thought-leadership post.",
];

export const generateLinkedInPost = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("openai/gpt-5.5");

    const toneLabel = TONE_LABELS[data.toneLevel];
    const toneGuide = TONE_GUIDANCE[data.toneLevel];

    const system = `You are a world-class LinkedIn ghostwriter. Write ONE ready-to-publish LinkedIn post.

Strict formatting rules:
- First 2 lines must be a strong, scroll-stopping hook. No preamble, no "In this post".
- Insert a blank line after the hook.
- Use short paragraphs (1-2 sentences) with blank lines between them for whitespace.
- Include a bulleted list using "• " (bullet + space) for key points where it fits naturally.
- End with exactly 3 to 4 relevant hashtags on the final line, space-separated (e.g. "#DataScience #Python #MachineLearning").
- No markdown symbols like **, ##, or backticks. No "Here is your post" wrapper. Output ONLY the post body.
- Keep total length under 2500 characters.`;

    const prompt = `Tone: ${toneLabel} — ${toneGuide}

Raw details from the author:
"""
${data.details}
"""

Write the LinkedIn post now, strictly in the "${toneLabel}" voice.`;

    const { text } = await generateText({
      model,
      system,
      prompt,
    });

    return { text: text.trim() };
  });
