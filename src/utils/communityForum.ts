import type { CommunityPost, PublishCommunityPostInput, UpdateCommunityPostInput } from "@/types/community";
import type { ProjectRecord } from "@/types/projectTypes";
import { loadCurrentUser } from "@/utils/profileStorage";

const MAX_INLINE_IMAGE_BYTES = 900_000;
export const COMMUNITY_POSTS_CHANGED_EVENT = "douge:community-posts-changed";
const COMMUNITY_GUEST_ID_KEY = "douge_community_guest_id";
const COMMUNITY_TOKEN_PREFIX = "douge_community_owner_token:";

type CommunityCredentials = {
  ownerId: string;
  ownerToken: string;
};

function randomCredential(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

function toHeaderSafeOwnerId(username: string): string {
  const normalized = username.trim().toLowerCase();
  const headerSafeUsername = /^[\x20-\x7E\xA0-\xFF]+$/.test(normalized)
    ? normalized
    : encodeURIComponent(normalized);
  return `user:${headerSafeUsername}`;
}

function getCommunityCredentials(): CommunityCredentials | null {
  if (typeof window === "undefined" || typeof localStorage?.getItem !== "function") return null;
  try {
    const username = loadCurrentUser();
    let ownerId = username ? toHeaderSafeOwnerId(username) : localStorage.getItem(COMMUNITY_GUEST_ID_KEY);
    if (!ownerId) {
      ownerId = `guest:${randomCredential()}`;
      localStorage.setItem(COMMUNITY_GUEST_ID_KEY, ownerId);
    }

    const tokenKey = `${COMMUNITY_TOKEN_PREFIX}${ownerId}`;
    let ownerToken = localStorage.getItem(tokenKey);
    if (!ownerToken) {
      ownerToken = randomCredential();
      localStorage.setItem(tokenKey, ownerToken);
    }
    return { ownerId, ownerToken };
  } catch {
    return null;
  }
}

function buildCommunityHeaders(includeJson = false): HeadersInit {
  const credentials = getCommunityCredentials();
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(credentials
      ? {
          "x-douge-owner-id": credentials.ownerId,
          "x-douge-owner-token": credentials.ownerToken,
        }
      : {}),
  };
}

function notifyCommunityPostsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COMMUNITY_POSTS_CHANGED_EVENT));
  }
}

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
  const response = await fetch(`/api/community-posts${params}`, {
    cache: "no-store",
    headers: buildCommunityHeaders(),
  });
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
    headers: buildCommunityHeaders(true),
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
  notifyCommunityPostsChanged();
  return data.post;
}

export async function updateCommunityPost(input: UpdateCommunityPostInput): Promise<CommunityPost> {
  const response = await fetch("/api/community-posts", {
    method: "PATCH",
    headers: buildCommunityHeaders(true),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? "作品修改失败");
  }
  const data = await response.json() as { post?: CommunityPost };
  if (!data.post) throw new Error("作品修改失败");
  notifyCommunityPostsChanged();
  return data.post;
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  const response = await fetch(`/api/community-posts?id=${encodeURIComponent(postId)}`, {
    method: "DELETE",
    headers: buildCommunityHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? "作品删除失败");
  }
  notifyCommunityPostsChanged();
}
