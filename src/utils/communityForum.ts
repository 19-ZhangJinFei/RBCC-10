import type { CommunityPost, PublishCommunityPostInput } from "@/types/community";
import type { ProjectRecord } from "@/types/projectTypes";

const MAX_INLINE_IMAGE_BYTES = 900_000;

function keepSmallDataUrl(value: string | null): string | null {
  if (!value) return null;
  return value.length <= MAX_INLINE_IMAGE_BYTES ? value : null;
}

function compactRecordForCommunity(record: ProjectRecord): ProjectRecord {
  const previewUrl = keepSmallDataUrl(record.patternUrl)
    ?? keepSmallDataUrl(record.cleanPatternUrl)
    ?? keepSmallDataUrl(record.mockupUrl)
    ?? keepSmallDataUrl(record.extractedImageUrl);

  return {
    ...record,
    sourceImageUrl: null,
    extractedImageUrl: null,
    patternUrl: previewUrl,
    cleanPatternUrl: keepSmallDataUrl(record.cleanPatternUrl),
    mockupUrl: null,
    productSceneUrl: null,
  };
}

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
  const body: PublishCommunityPostInput = {
    ...input,
    record: compactRecordForCommunity(input.record),
    avatar: keepSmallDataUrl(input.avatar) ?? input.avatar,
  };
  const response = await fetch("/api/community-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
