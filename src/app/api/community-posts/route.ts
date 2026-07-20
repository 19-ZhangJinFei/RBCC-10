import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { CommunityPost, PublishCommunityPostInput, UpdateCommunityPostInput } from "@/types/community";
import type { ProjectRecord } from "@/types/projectTypes";

const dataDir = process.env.COMMUNITY_POSTS_DIR || path.join(os.tmpdir(), "douyun-community");
const dataFile = path.join(dataDir, "community-posts.json");
const MAX_INLINE_IMAGE_BYTES = 900_000;
const MAX_PATTERN_DATA_BYTES = 1_200_000;
const MAX_POSTS = 500;

type StoredCommunityPost = CommunityPost & {
  ownerId?: string;
  ownerTokenHash?: string;
};

type OwnerCredentials = {
  ownerId: string;
  ownerTokenHash: string;
  displayName: string;
};

let mutationQueue: Promise<void> = Promise.resolve();

async function readPosts(): Promise<StoredCommunityPost[]> {
  try {
    const raw = await readFile(dataFile, "utf8");
    const data = JSON.parse(raw) as { posts?: StoredCommunityPost[] };
    return Array.isArray(data.posts)
      ? data.posts.map((post) => ({ ...post, updatedAt: post.updatedAt ?? post.createdAt }))
      : [];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writePosts(posts: StoredCommunityPost[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify({ posts }, null, 2), "utf8");
}

async function mutatePosts<T>(
  mutation: (posts: StoredCommunityPost[]) => Promise<{ posts: StoredCommunityPost[]; result: T }> | { posts: StoredCommunityPost[]; result: T },
): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const currentPosts = await readPosts();
    const next = await mutation(currentPosts);
    await writePosts(next.posts);
    return next.result;
  });
  mutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function readOwnerCredentials(request: NextRequest): OwnerCredentials | null {
  const ownerId = request.headers.get("x-douge-owner-id")?.trim() ?? "";
  const ownerToken = request.headers.get("x-douge-owner-token")?.trim() ?? "";
  const encodedDisplayName = request.headers.get("x-douge-owner-name")?.trim() ?? "";
  if (!ownerId || ownerId.length > 180 || ownerToken.length < 12 || ownerToken.length > 240) return null;
  let displayName = "";
  try {
    displayName = decodeURIComponent(encodedDisplayName).trim().slice(0, 120);
  } catch {
    displayName = encodedDisplayName.trim().slice(0, 120);
  }
  return { ownerId, ownerTokenHash: hashOwnerToken(ownerToken), displayName };
}

function normalizeOwnerName(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function isLegacyPostOwnedBy(post: StoredCommunityPost, credentials: OwnerCredentials | null): boolean {
  return !!credentials?.displayName
    && !post.ownerId
    && !post.ownerTokenHash
    && normalizeOwnerName(post.author) === normalizeOwnerName(credentials.displayName);
}

function isOwnedBy(post: StoredCommunityPost, credentials: OwnerCredentials | null): boolean {
  const hasMatchingCredentials = !!credentials
    && !!post.ownerId
    && !!post.ownerTokenHash
    && post.ownerId === credentials.ownerId
    && post.ownerTokenHash === credentials.ownerTokenHash;
  return hasMatchingCredentials || isLegacyPostOwnedBy(post, credentials);
}

function toPublicPost(post: StoredCommunityPost, credentials: OwnerCredentials | null): CommunityPost {
  const publicPost = { ...post };
  delete publicPost.ownerId;
  delete publicPost.ownerTokenHash;
  return {
    ...publicPost,
    updatedAt: publicPost.updatedAt ?? publicPost.createdAt,
    isOwnedByCurrentUser: isOwnedBy(post, credentials),
  };
}

function normalizeRequiredText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function keepSmallDataUrl(value: string | null | undefined, maxBytes = MAX_INLINE_IMAGE_BYTES): string | null {
  if (!value) return null;
  return value.length <= maxBytes ? value : null;
}

function compactRecord(record: ProjectRecord): ProjectRecord {
  const patternUrl = keepSmallDataUrl(record.patternUrl)
    ?? keepSmallDataUrl(record.cleanPatternUrl)
    ?? keepSmallDataUrl(record.mockupUrl)
    ?? keepSmallDataUrl(record.extractedImageUrl);
  return {
    ...record,
    sourceImageUrl: null,
    extractedImageUrl: null,
    patternData: record.patternData && record.patternData.length <= MAX_PATTERN_DATA_BYTES ? record.patternData : null,
    patternUrl,
    cleanPatternUrl: keepSmallDataUrl(record.cleanPatternUrl),
    mockupUrl: null,
    productSceneUrl: null,
  };
}

function normalizeAvatar(value: string | undefined, author: string): string {
  if (!value) return author.slice(0, 1) || "豆";
  if (value.startsWith("emoji:")) return value.slice(6);
  if (value.startsWith("data:")) return keepSmallDataUrl(value) ?? (author.slice(0, 1) || "豆");
  return value.slice(0, 2);
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const credentials = readOwnerCredentials(request);
    const posts = await readPosts();
    const filtered = query
      ? posts.filter((post) =>
          [post.title, post.author, post.theme, post.element, post.meaning]
            .some((value) => String(value ?? "").toLowerCase().includes(query)),
        )
      : posts;
    return NextResponse.json({
      posts: filtered
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((post) => toPublicPost(post, credentials)),
    });
  } catch (error) {
    console.error("Failed to read community posts:", error);
    return NextResponse.json({ error: "社区作品加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(() => null) as PublishCommunityPostInput | null;
    const credentials = readOwnerCredentials(request);
    if (!input?.record) {
      return NextResponse.json({ error: "缺少作品记录" }, { status: 400 });
    }
    if (!credentials) {
      return NextResponse.json({ error: "无法确认发布者身份，请刷新页面后重试" }, { status: 401 });
    }

    const author = input.author?.trim() || "豆阁用户";
    const record = compactRecord(input.record);
    const createdAt = Date.now();
    const post: StoredCommunityPost = {
      id: `cloud_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
      title: record.title || `${record.theme} · ${record.element}`,
      author,
      avatar: normalizeAvatar(input.avatar, author),
      createdAt,
      updatedAt: createdAt,
      theme: record.theme,
      element: record.element,
      meaning: record.meaning ?? "",
      colors: input.colors?.length ? input.colors : ["#FFFFFF", "#1557A8", "#943630", "#EDB045"],
      productId: record.productId,
      ownerId: credentials.ownerId,
      ownerTokenHash: credentials.ownerTokenHash,
      record: {
        ...record,
        id: `shared_${record.id}`,
        updatedAt: createdAt,
      },
    };

    const createdPost = await mutatePosts((posts) => ({
      posts: [post, ...posts].slice(0, MAX_POSTS),
      result: post,
    }));
    return NextResponse.json({ post: toPublicPost(createdPost, credentials) });
  } catch (error) {
    console.error("Failed to publish community post:", error);
    return NextResponse.json({ error: "作品发布失败，请检查服务器存储配置" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const input = await request.json().catch(() => null) as UpdateCommunityPostInput | null;
    const credentials = readOwnerCredentials(request);
    if (!input?.id || !credentials) {
      return NextResponse.json({ error: "无法确认作品或发布者身份" }, { status: 401 });
    }

    const title = normalizeRequiredText(input.title, 120);
    const theme = normalizeRequiredText(input.theme, 80);
    const element = normalizeRequiredText(input.element, 80);
    const meaning = normalizeRequiredText(input.meaning, 800);
    if (!title || !theme || !element) {
      return NextResponse.json({ error: "作品名称、传统主题和核心元素不能为空" }, { status: 400 });
    }

    const updatedPost = await mutatePosts((posts) => {
      const index = posts.findIndex((post) => post.id === input.id);
      if (index < 0) throw new Error("POST_NOT_FOUND");
      const current = posts[index];
      if (!isOwnedBy(current, credentials)) throw new Error("POST_FORBIDDEN");

      const updatedAt = Date.now();
      const post: StoredCommunityPost = {
        ...current,
        ownerId: current.ownerId ?? credentials.ownerId,
        ownerTokenHash: current.ownerTokenHash ?? credentials.ownerTokenHash,
        title,
        theme,
        element,
        meaning,
        updatedAt,
        record: {
          ...current.record,
          title,
          theme,
          element,
          meaning,
          updatedAt,
        },
      };
      const nextPosts = [...posts];
      nextPosts[index] = post;
      return { posts: nextPosts, result: post };
    });

    return NextResponse.json({ post: toPublicPost(updatedPost, credentials) });
  } catch (error) {
    if (error instanceof Error && error.message === "POST_NOT_FOUND") {
      return NextResponse.json({ error: "作品不存在或已被删除" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "POST_FORBIDDEN") {
      return NextResponse.json({ error: "只能编辑自己发布的作品" }, { status: 403 });
    }
    console.error("Failed to update community post:", error);
    return NextResponse.json({ error: "作品修改失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const postId = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    const credentials = readOwnerCredentials(request);
    if (!postId || !credentials) {
      return NextResponse.json({ error: "无法确认作品或发布者身份" }, { status: 401 });
    }

    await mutatePosts((posts) => {
      const post = posts.find((item) => item.id === postId);
      if (!post) throw new Error("POST_NOT_FOUND");
      if (!isOwnedBy(post, credentials)) throw new Error("POST_FORBIDDEN");
      return { posts: posts.filter((item) => item.id !== postId), result: undefined };
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "POST_NOT_FOUND") {
      return NextResponse.json({ error: "作品不存在或已被删除" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "POST_FORBIDDEN") {
      return NextResponse.json({ error: "只能删除自己发布的作品" }, { status: 403 });
    }
    console.error("Failed to delete community post:", error);
    return NextResponse.json({ error: "作品删除失败，请稍后重试" }, { status: 500 });
  }
}
