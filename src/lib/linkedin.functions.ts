import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_ORIGIN = "https://connector-gateway.lovable.dev";
const GATEWAY_URL = `${GATEWAY_ORIGIN}/linkedin`;

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const linkedinKey = process.env.LINKEDIN_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!linkedinKey) throw new Error("LINKEDIN_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": linkedinKey,
  } as Record<string, string>;
}

// LinkedIn returns an upload URL on api.linkedin.com/www.linkedin.com. Route it back
// through the connector gateway so the OAuth token is injected for us.
function toGatewayUrl(uploadUrl: string): string {
  try {
    const u = new URL(uploadUrl);
    return `${GATEWAY_ORIGIN}/linkedin${u.pathname}${u.search}`;
  } catch {
    return uploadUrl;
  }
}

type IncomingMedia = {
  kind: "image" | "video";
  name: string;
  mimeType: string;
  dataBase64: string; // raw file bytes, base64 encoded
};

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

async function registerAndUpload(
  authorUrn: string,
  media: IncomingMedia,
  headers: Record<string, string>,
): Promise<string> {
  const recipe =
    media.kind === "video"
      ? "urn:li:digitalmediaRecipe:feedshare-video"
      : "urn:li:digitalmediaRecipe:feedshare-image";

  // Step 1: registerUpload
  const registerRes = await fetch(`${GATEWAY_URL}/v2/assets?action=registerUpload`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: [recipe],
        owner: authorUrn,
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
      },
    }),
  });
  if (!registerRes.ok) {
    const body = await registerRes.text();
    throw new Error(`LinkedIn registerUpload failed [${registerRes.status}]: ${body}`);
  }
  const register = (await registerRes.json()) as {
    value?: {
      asset?: string;
      uploadMechanism?: Record<string, { uploadUrl?: string }>;
    };
  };
  const asset = register.value?.asset;
  const mech = register.value?.uploadMechanism ?? {};
  const uploadUrl =
    mech["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  if (!asset || !uploadUrl) {
    throw new Error("LinkedIn registerUpload did not return an asset/uploadUrl");
  }

  // Step 2: upload the RAW binary with PUT. No multipart, no boundary headers.
  const buffer = base64ToBuffer(media.dataBase64);
  const contentType = media.mimeType || "application/octet-stream";

  // LinkedIn's uploadUrl is pre-signed: a direct PUT with only Content-Type works and
  // avoids the Nginx 405 that the proxied path can produce. Fall back to the gateway
  // (which injects OAuth) if the direct attempt is rejected.
  let uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });

  if (!uploadRes.ok && [401, 403, 405].includes(uploadRes.status)) {
    uploadRes = await fetch(toGatewayUrl(uploadUrl), {
      method: "PUT",
      headers: { ...headers, "Content-Type": contentType },
      body: buffer,
    });
  }

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`LinkedIn media upload failed [${uploadRes.status}]: ${body}`);
  }


  return asset;
}

export const publishLinkedInPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      text: string;
      draftId?: string;
      media?: IncomingMedia[];
    }) => {
      const text = (data?.text ?? "").trim();
      if (text.length > 3000)
        throw new Error("Post exceeds LinkedIn's 3000 character limit");
      const media = Array.isArray(data?.media) ? data!.media!.slice(0, 9) : [];
      // Text-free posting is allowed as long as at least one media asset exists.
      if (!text && media.length === 0)
        throw new Error("Add some text or at least one image/video before publishing");
      return { text, draftId: data?.draftId, media };
    },
  )

  .handler(async ({ data, context }) => {
    const headers = authHeaders();

    const userinfoRes = await fetch(`${GATEWAY_URL}/v2/userinfo`, { method: "GET", headers });
    if (!userinfoRes.ok) {
      const body = await userinfoRes.text();
      console.error(`LinkedIn userinfo failed [${userinfoRes.status}]: ${body}`);
      throw new Error(`Could not read LinkedIn profile [${userinfoRes.status}]: ${body}`);
    }
    const userinfo = (await userinfoRes.json()) as { sub?: string; name?: string };
    if (!userinfo.sub) throw new Error("LinkedIn userinfo missing member id");
    const authorUrn = `urn:li:person:${userinfo.sub}`;

    // Determine media strategy. Videos: only 1 supported. Images: multiple allowed.
    const hasVideo = data.media.some((m) => m.kind === "video");
    const uploadable = hasVideo
      ? data.media.filter((m) => m.kind === "video").slice(0, 1)
      : data.media.filter((m) => m.kind === "image");

    const shareMediaCategory: "NONE" | "IMAGE" | "VIDEO" = hasVideo
      ? "VIDEO"
      : uploadable.length > 0
        ? "IMAGE"
        : "NONE";

    const mediaEntries: Array<{
      status: "READY";
      media: string;
      description?: { text: string };
      title?: { text: string };
    }> = [];
    for (const m of uploadable) {
      const asset = await registerAndUpload(authorUrn, m, headers);
      mediaEntries.push({
        status: "READY",
        media: asset,
        description: { text: m.name },
        title: { text: m.name },
      });
    }

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text: data.text },
      shareMediaCategory,
    };
    if (mediaEntries.length > 0) shareContent.media = mediaEntries;

    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": shareContent,
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const postRes = await fetch(`${GATEWAY_URL}/v2/ugcPosts`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });

    if (!postRes.ok) {
      const body = await postRes.text();
      console.error(`LinkedIn ugcPosts failed [${postRes.status}]: ${body}`);
      throw new Error(`LinkedIn publish failed [${postRes.status}]: ${body}`);
    }

    const postId = postRes.headers.get("x-restli-id") ?? null;
    const publishedAt = new Date().toISOString();

    if (data.draftId) {
      const { data: row, error } = await context.supabase
        .from("posts")
        .update({
          content: data.text,
          status: "published",
          linkedin_post_id: postId,
          published_at: publishedAt,
        })
        .eq("id", data.draftId)
        .select()
        .maybeSingle();
      if (error) console.error("Persist published post (update) failed:", error.message);
      return { ok: true as const, postId, row };
    }
    const { data: row, error } = await context.supabase
      .from("posts")
      .insert({
        user_id: context.userId,
        content: data.text,
        status: "published",
        linkedin_post_id: postId,
        published_at: publishedAt,
      })
      .select()
      .maybeSingle();
    if (error) console.error("Persist published post (insert) failed:", error.message);
    return { ok: true as const, postId, row };
  });
