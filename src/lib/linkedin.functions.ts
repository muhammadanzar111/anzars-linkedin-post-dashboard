import { createServerFn } from "@tanstack/react-start";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/linkedin";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const linkedinKey = process.env.LINKEDIN_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!linkedinKey) throw new Error("LINKEDIN_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": linkedinKey,
  };
}

export const publishLinkedInPost = createServerFn({ method: "POST" })
  .inputValidator((data: { text: string }) => {
    const text = (data?.text ?? "").trim();
    if (!text) throw new Error("Post text cannot be empty");
    if (text.length > 3000) throw new Error("Post exceeds LinkedIn's 3000 character limit");
    return { text };
  })
  .handler(async ({ data }) => {
    const headers = authHeaders();

    // Get the member URN from userinfo (OIDC 'sub' is the member id)
    const userinfoRes = await fetch(`${GATEWAY_URL}/v2/userinfo`, {
      method: "GET",
      headers,
    });
    if (!userinfoRes.ok) {
      const body = await userinfoRes.text();
      console.error(`LinkedIn userinfo failed [${userinfoRes.status}]: ${body}`);
      throw new Error(`Could not read LinkedIn profile [${userinfoRes.status}]: ${body}`);
    }
    const userinfo = (await userinfoRes.json()) as { sub?: string; name?: string };
    if (!userinfo.sub) throw new Error("LinkedIn userinfo missing member id");
    const authorUrn = `urn:li:person:${userinfo.sub}`;

    const postBody = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: data.text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
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

    const postId = postRes.headers.get("x-restli-id") ?? undefined;
    return { ok: true as const, postId, authorName: userinfo.name };
  });
