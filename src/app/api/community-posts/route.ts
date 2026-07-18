import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { CommunityPost, PublishCommunityPostInput } from "@/types/community";
import type { ProjectRecord } from "@/types/projectTypes";

const dataDir = process.env.COMMUNITY_POSTS_DIR || path.join(os.tmpdir(), "douyun-community");
const dataFile = path.join(dataDir, "community-posts.json");
const MAX_INLINE_IMAGE_BYTES = 900_000;
const MAX_PATTERN_DATA_BYTES = 1_200_000;

async function readPosts(): Promise<CommunityPost[]> {
  try {
    const raw = await readFile(dataFile, "utf8");
    const data = JSON.parse(raw) as { posts?: CommunityPost[] };
    return Array.isArray(data.posts) ? data.posts : [];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writePosts(posts: CommunityPost[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify({ posts }, null, 2), "utf8");
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
    const posts = await readPosts();
    const filtered = query
      ? posts.filter((post) =>
          [post.title, post.author, post.theme, post.element, post.meaning]
            .some((value) => value.toLowerCase().includes(query)),
        )
      : posts;
    return NextResponse.json({ posts: filtered.sort((a, b) => b.createdAt - a.createdAt) });
  } catch (error) {
    console.error("Failed to read community posts:", error);
    return NextResponse.json({ error: "社区作品加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(() => null) as PublishCommunityPostInput | null;
    if (!input?.record) {
      return NextResponse.json({ error: "缺少作品记录" }, { status: 400 });
    }

    const author = input.author?.trim() || "豆阁用户";
    const record = compactRecord(input.record);
    const createdAt = Date.now();
    const post: CommunityPost = {
      id: `cloud_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
      title: record.title || `${record.theme} · ${record.element}`,
      author,
      avatar: normalizeAvatar(input.avatar, author),
      createdAt,
      theme: record.theme,
      element: record.element,
      meaning: record.meaning ?? "",
      colors: input.colors?.length ? input.colors : ["#FFFFFF", "#1557A8", "#943630", "#EDB045"],
      productId: record.productId,
      record: {
        ...record,
        id: `shared_${record.id}`,
        updatedAt: createdAt,
      },
    };

    const posts = await readPosts();
    const nextPosts = [post, ...posts].slice(0, 500);
    await writePosts(nextPosts);
    return NextResponse.json({ post });
  } catch (error) {
    console.error("Failed to publish community post:", error);
    return NextResponse.json({ error: "作品发布失败，请检查服务器存储配置" }, { status: 500 });
  }
}
