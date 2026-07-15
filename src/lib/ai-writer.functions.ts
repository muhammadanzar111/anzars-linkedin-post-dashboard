import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const TONES = ["Professional", "Educational", "Casual", "Academic"] as const;

const Input = z.object({
  details: z.string().min(1).max(4000),
  tone: z.enum(TONES),
});

const toneGuidance: Record<(typeof TONES)[number], string> = {
  Professional:
    "Polished and confident, tailored to appeal to recruiters and hiring managers. Highlight skills, outcomes, and value.",
  Educational:
    "Clear and instructional. Teach the concept step-by-step so a reader learns something concrete.",
  Casual:
    "Warm, friendly, conversational. Write like you're talking to a peer. Contractions welcome.",
  Academic:
    "Scholarly and precise. Use measured language, reference methods or reasoning, avoid hype.",
};

export const generateLinkedInPost = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("openai/gpt-5.5");

    const system = `You are a world-class LinkedIn ghostwriter. Write ONE ready-to-publish LinkedIn post.

Strict formatting rules:
- First 2 lines must be a strong, scroll-stopping hook. No preamble, no "In this post".
- Insert a blank line after the hook.
- Use short paragraphs (1-2 sentences) with blank lines between them for whitespace.
- Include a bulleted list using "• " (bullet + space) for key points where it fits naturally.
- End with exactly 3 to 4 relevant hashtags on the final line, space-separated (e.g. "#DataScience #Python #MachineLearning").
- No markdown symbols like **, ##, or backticks. No "Here is your post" wrapper. Output ONLY the post body.
- Keep total length under 2500 characters.`;

    const prompt = `Tone: ${data.tone} — ${toneGuidance[data.tone]}

Raw details from the author:
"""
${data.details}
"""

Write the LinkedIn post now.`;

    const { text } = await generateText({
      model,
      system,
      prompt,
    });

    return { text: text.trim() };
  });
