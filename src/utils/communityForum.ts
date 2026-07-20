import type { CommunityPost, PublishCommunityPostInput, UpdateCommunityPostInput } from "@/types/community";
import type { ProjectRecord } from "@/types/projectTypes";
import { loadCurrentUser, loadCurrentUserProfile } from "@/utils/profileStorage";

const MAX_INLINE_IMAGE_BYTES = 900_000;
export const COMMUNITY_POSTS_CHANGED_EVENT = "douge:community-posts-changed";
const COMMUNITY_GUEST_ID_KEY = "douge_community_guest_id";
const COMMUNITY_TOKEN_PREFIX = "douge_community_owner_token:";

type CommunityCredentials = {
  ownerId: string;
  ownerToken: string;
  ownerDisplayName: string;
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
    const ownerDisplayName = loadCurrentUserProfile()?.nickname.trim() ?? "";
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
    return { ownerId, ownerToken, ownerDisplayName };
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
          ...(credentials.ownerDisplayName
            ? { "x-douge-owner-name": encodeURIComponent(credentials.ownerDisplayName) }
            : {}),
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

function loadPreviewImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => reject(new Error("Preview image timed out")), 10_000);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Preview image failed to load"));
    };
    if (/^https?:\/\//i.test(source)) image.crossOrigin = "anonymous";
    image.src = source;
  });
}

async function createPreviewThumbnail(source: string): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  try {
    const image = await loadPreviewImage(source);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return null;

    for (const maxSide of [640, 480]) {
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.68]) {
        const thumbnail = canvas.toDataURL("image/jpeg", quality);
        if (thumbnail.length <= MAX_INLINE_IMAGE_BYTES) return thumbnail;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isStableImageUrl(value: string): boolean {
  return value.startsWith("/") || /^https?:\/\//i.test(value);
}

async function buildCommunityPreview(record: ProjectRecord): Promise<string | null> {
  const candidates = [
    record.patternUrl,
    record.cleanPatternUrl,
    record.mockupUrl,
    record.extractedImageUrl,
    record.sourceImageUrl,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate.startsWith("data:")) {
      const compact = keepSmallDataUrl(candidate);
      if (compact) return compact;
    }
    if (candidate.startsWith("/")) return candidate;
    const thumbnail = await createPreviewThumbnail(candidate);
    if (thumbnail) return thumbnail;
    if (isStableImageUrl(candidate)) return candidate;
  }
  return null;
}

async function compactRecordForCommunity(record: ProjectRecord): Promise<ProjectRecord> {
  const previewUrl = await buildCommunityPreview(record);

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
    record: await compactRecordForCommunity(input.record),
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
