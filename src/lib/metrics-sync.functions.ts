import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Sync engagement metrics for every published post that has a LinkedIn URN.
 * Falls back gracefully: posts whose stats can't be read (missing read scopes,
 * rate limits) are reported back so the UI can prompt manual entry.
 */
export const syncLinkedInMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchPostStats } = await import("@/lib/linkedin-metrics.server");

    const { data: posts, error } = await context.supabase
      .from("posts")
      .select("id, linkedin_post_id")
      .eq("status", "published")
      .not("linkedin_post_id", "is", null);
    if (error) throw new Error(error.message);

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of posts ?? []) {
      const urn = p.linkedin_post_id;
      if (!urn) {
        skipped += 1;
        continue;
      }
      const result = await fetchPostStats(urn);
      if (!result.ok) {
        errors.push(`${urn}: [${result.status}] ${result.message}`);
        continue;
      }
      const { error: upErr } = await context.supabase
        .from("posts")
        .update(result.metrics)
        .eq("id", p.id)
        .eq("status", "published");
      if (upErr) errors.push(`${urn}: ${upErr.message}`);
      else updated += 1;
    }

    return {
      total: posts?.length ?? 0,
      updated,
      skipped,
      failed: errors.length,
      errors: errors.slice(0, 3),
    };
  });
