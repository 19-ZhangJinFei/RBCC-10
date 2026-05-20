import type { ProjectRecord } from "@/types/projectTypes";

export type CommunityPost = {
  id: string;
  title: string;
  author: string;
  avatar: string;
  createdAt: number;
  theme: string;
  element: string;
  meaning: string;
  colors: string[];
  productId: string;
  record: ProjectRecord;
};

export type PublishCommunityPostInput = {
  record: ProjectRecord;
  author: string;
  avatar: string;
  colors?: string[];
};
