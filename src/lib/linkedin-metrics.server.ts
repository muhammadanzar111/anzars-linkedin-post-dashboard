const GATEWAY_URL = "https://connector-gateway.lovable.dev/linkedin";

export type LiveMetrics = {
  impressions: number;
  likes: number;
  comments: number;
  reposts: number;
};

export type StatsResult =
  | { ok: true; urn: string; metrics: LiveMetrics }
  | { ok: false; urn: string; status: number; message: string };

function gatewayHeaders(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const linkedinKey = process.env["LINKEDIN_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!linkedinKey) throw new Error("LINKEDIN_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": linkedinKey,
  };
}

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
};

/**
 * Pull live statistics for one share/ugcPost URN.
 *
 * Reads are attempted in two passes:
 *  1. /v2/socialActions/{urn}          -> likeCount + commentsSummary.totalFirstLevelComments
 *  2. /rest/socialMetadata or shares statistics -> totalShareStatistics.* when available
 *
 * Personal-profile connections normally only hold `w_member_social` (write),
 * so these reads can return 403 ACCESS_DENIED. That is surfaced to the caller
 * so the UI can fall back to manual entry instead of silently writing zeros.
 */
export async function fetchPostStats(urn: string): Promise<StatsResult> {
  const headers = gatewayHeaders();
  const encoded = encodeURIComponent(urn);

  const metrics: LiveMetrics = { impressions: 0, likes: 0, comments: 0, reposts: 0 };
  let anySuccess = false;
  let lastStatus = 0;
  let lastMessage = "No statistics endpoint returned data";

  // Pass 1 — social actions (likes / comments)
  try {
    const res = await fetch(`${GATEWAY_URL}/v2/socialActions/${encoded}`, { headers });
    const text = await res.text();
    if (res.ok) {
      const json = JSON.parse(text) as {
        likesSummary?: { totalLikes?: number };
        commentsSummary?: { totalFirstLevelComments?: number; aggregatedTotalComments?: number };
      };
      metrics.likes = n(json.likesSummary?.totalLikes);
      metrics.comments = n(
        json.commentsSummary?.totalFirstLevelComments ?? json.commentsSummary?.aggregatedTotalComments,
      );
      anySuccess = true;
    } else {
      lastStatus = res.status;
      lastMessage = text.slice(0, 300);
      console.error(`LinkedIn socialActions failed [${res.status}]: ${text}`);
    }
  } catch (e) {
    lastMessage = e instanceof Error ? e.message : "socialActions request failed";
  }

  // Pass 2 — share statistics (impressions / shares)
  try {
    const res = await fetch(
      `${GATEWAY_URL}/rest/memberShareStatistics?q=share&shares=List(${encoded})`,
      { headers: { ...headers, "LinkedIn-Version": "202405", "X-Restli-Protocol-Version": "2.0.0" } },
    );
    const text = await res.text();
    if (res.ok) {
      const json = JSON.parse(text) as {
        elements?: Array<{
          totalShareStatistics?: {
            impressionCount?: number;
            likeCount?: number;
            commentCount?: number;
            shareCount?: number;
          };
        }>;
      };
      const s = json.elements?.[0]?.totalShareStatistics;
      if (s) {
        metrics.impressions = n(s.impressionCount);
        metrics.likes = Math.max(metrics.likes, n(s.likeCount));
        metrics.comments = Math.max(metrics.comments, n(s.commentCount));
        metrics.reposts = Math.max(metrics.reposts, n(s.shareCount));
        anySuccess = true;
      }
    } else {
      lastStatus = lastStatus || res.status;
      lastMessage = text.slice(0, 300);
      console.error(`LinkedIn shareStatistics failed [${res.status}]: ${text}`);
    }
  } catch (e) {
    lastMessage = e instanceof Error ? e.message : "shareStatistics request failed";
  }

  if (!anySuccess) return { ok: false, urn, status: lastStatus || 500, message: lastMessage };
  return { ok: true, urn, metrics };
}
