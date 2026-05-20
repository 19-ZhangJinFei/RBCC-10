import type { CommunityPost, PublishCommunityPostInput } from "@/types/community";

export async function fetchCommunityPosts(query = ""): Promise<CommunityPost[]> {
  const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const response = await fetch(`/api/community-posts${params}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("社区作品加载失败");
  }
  const data = await response.json() as { posts?: CommunityPost[] };
  return Array.isArray(data.posts) ? data.posts : [];
}

export async function publishCommunityPost(input: PublishCommunityPostInput): Promise<CommunityPost> {
  const response = await fetch("/api/community-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? "作品发布失败");
  }
  const data = await response.json() as { post?: CommunityPost };
  if (!data.post) {
    throw new Error("作品发布失败");
  }
  return data.post;
}
