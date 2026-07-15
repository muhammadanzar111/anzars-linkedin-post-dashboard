import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; content: string }) => {
    const content = (input?.content ?? "").slice(0, 3000);
    return { id: input?.id, content };
  })
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("posts")
        .update({ content: data.content })
        .eq("id", data.id)
        .eq("status", "draft")
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Draft not found");
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("posts")
      .insert({ user_id: context.userId, content: data.content, status: "draft" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Missing id");
    return { id: input.id };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      impressions: number;
      likes: number;
      comments: number;
      reposts: number;
      notes?: string | null;
    }) => {
      const clean = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));
      if (!input?.id) throw new Error("Missing id");
      return {
        id: input.id,
        impressions: clean(input.impressions),
        likes: clean(input.likes),
        comments: clean(input.comments),
        reposts: clean(input.reposts),
        notes: typeof input.notes === "string" ? input.notes.slice(0, 2000) : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const { data: row, error } = await context.supabase
      .from("posts")
      .update(fields)
      .eq("id", id)
      .eq("status", "published")
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Published post not found");
    return row;
  });
