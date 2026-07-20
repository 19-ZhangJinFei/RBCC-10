"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CultureExplanation from "@/components/CultureExplanation";
import BijiangCheckIn from "@/components/BijiangCheckIn";
import FilterDropdown from "@/components/FilterDropdown";
import ProfilePage from "@/components/ProfilePage";
import SubjectMaskEditor, { type MaskMode } from "@/components/SubjectMaskEditor";
import LoginModal from "@/components/LoginModal";
import AiChatPanel from "@/components/ai/AiChatPanel";
import { ProjectFallbackPreview } from "@/components/ProjectFallbackPreview";
import { clearAiChatHistory } from "@/utils/aiChat";
import { deleteProjectRecord, loadActiveProjectId, loadProjectHistoryAsync, saveProjectRecord, loadCurrentUserProfile, loadApiConfig, DEFAULT_AUTO_SAVE_INTERVAL_SECONDS, normalizeAutoSaveIntervalSeconds, type StoredUser } from "@/utils/profileStorage";
import { loadAppLanguage, saveAppLanguage, type AppLanguage } from "@/utils/language";
import { SITE_VIEW_COOKIE_KEY, type SiteView } from "@/utils/siteView";
import { COMMUNITY_POSTS_CHANGED_EVENT, deleteCommunityPost, fetchCommunityPosts, loadCachedCommunityPosts, publishCommunityPost, saveCachedCommunityPosts, updateCommunityPost } from "@/utils/communityForum";
import type { ProjectRecord } from "@/types/projectTypes";
import type { CommunityPost as CloudCommunityPost } from "@/types/community";
import type { SubjectIdentification } from "@/types/subjectIdentification";
import { type AspectRatioId, aspectRatios } from "@/data/aspectRatios";
import { bijiangElementGroups, cultureThemes } from "@/data/cultureThemes";
import { bijiangAsset } from "@/data/bijiangAssets";
import { getProductTemplate } from "@/data/productTemplates";
import { countBeads, type BeadCount } from "@/utils/countBeads";
import { buildKit, type Kit } from "@/utils/buildKit";
import { LEVEL_SPECS, simplifyToLevel, type DifficultyStats } from "@/utils/difficultyGrading";
import type { MappedPixel } from "@/utils/pixelation";
import {
  imageDataUrlToPattern,
  renderPatternToCanvas,
  renderPatternToCanvasClean,
  renderSampleDesignOriginal,
  type BeadPattern,
} from "@/utils/culturePattern";
import type { SubjectAnalysis, SubjectMask } from "@/utils/subjectAnalysis";
import {
  getAllHexValues,
  getDisplayColorKey,
  sortColorsByHue,
  filterColorsByFamily,
  COLOR_FAMILIES,
  IMAGE_FILTER_OPTIONS,
  type ColorFamily,
  type ImageFilter,
} from "@/utils/colorSystemUtils";

type StudioStep = "config" | "extract" | "pattern" | "preview";
type ProductConfigDefault = {
  aspectRatio: AspectRatioId;
  gridSize: number;
  colorCount: number;
};

type CompactPatternPayload = {
  v: 1;
  width: number;
  height: number;
  palette: string[];
  source: BeadPattern["source"];
  cells: string;
};

const emptySubjectIdentification: SubjectIdentification = {
  subject: "",
  category: "",
  evidence: [],
  confidence: 0,
  alternatives: [],
  visualSummary: "",
};

function isSubjectIdentification(value: unknown): value is SubjectIdentification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SubjectIdentification>;
  return (
    typeof candidate.subject === "string" &&
    typeof candidate.category === "string" &&
    Array.isArray(candidate.evidence) &&
    candidate.evidence.every((item) => typeof item === "string") &&
    typeof candidate.confidence === "number" &&
    Array.isArray(candidate.alternatives) &&
    candidate.alternatives.every((item) => typeof item === "string") &&
    typeof candidate.visualSummary === "string"
  );
}

function formatSubjectIdentification(identification: SubjectIdentification): string {
  return [
    `主体名称：${identification.subject || "-"}`,
    `类别：${identification.category || "-"}`,
    `置信度：${Number.isFinite(identification.confidence) ? `${Math.round(identification.confidence * 100)}%` : "-"}`,
    `证据：${identification.evidence.length ? identification.evidence.join("；") : "-"}`,
    `备选：${identification.alternatives.length ? identification.alternatives.join("；") : "-"}`,
    `摘要：${identification.visualSummary || "-"}`,
  ].join("\n");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDefaultProjectTitle(theme: string, element: string, productLabel: string): string {
  return `${theme} · ${element} · ${productLabel}`;
}

function serializePattern(pattern: BeadPattern | null): string | null {
  if (!pattern) return null;
  const palette = pattern.palette.map((color) => color.toUpperCase());
  const paletteIndex = new Map(palette.map((color, index) => [color, index]));
  const cells = pattern.grid.flat().map((pixel) => {
    if (pixel.isExternal) return "__";
    const index = paletteIndex.get(pixel.color.toUpperCase()) ?? 0;
    return index.toString(36).padStart(2, "0");
  }).join("");

  const payload: CompactPatternPayload = {
    v: 1,
    width: pattern.width,
    height: pattern.height,
    palette,
    source: pattern.source,
    cells,
  };

  return JSON.stringify(payload);
}

function deserializePattern(raw: string | null): BeadPattern | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CompactPatternPayload | BeadPattern;
    if ("v" in parsed && parsed.v === 1) {
      const grid: BeadPattern["grid"] = [];
      for (let y = 0; y < parsed.height; y += 1) {
        const row: BeadPattern["grid"][number] = [];
        for (let x = 0; x < parsed.width; x += 1) {
          const token = parsed.cells.slice((y * parsed.width + x) * 2, (y * parsed.width + x + 1) * 2);
          if (token === "__") {
            row.push({ key: "", color: "#FFFFFF", isExternal: true });
            continue;
          }
          const paletteIndex = Number.parseInt(token, 36);
          const color = parsed.palette[paletteIndex] ?? parsed.palette[0] ?? "#000000";
          row.push({ key: getDisplayColorKey(color), color });
        }
        grid.push(row);
      }
      return {
        width: parsed.width,
        height: parsed.height,
        palette: parsed.palette,
        source: parsed.source,
        grid,
      };
    }
    return parsed as BeadPattern;
  } catch {
    return null;
  }
}

const navItems: { id: SiteView; zh: string; en: string }[] = [
  { id: "home", zh: "首页", en: "Home" },
  { id: "start", zh: "创作", en: "Create" },
  { id: "checkin", zh: "碧江打卡", en: "Check In" },
  { id: "projects", zh: "项目", en: "Projects" },
  { id: "ai", zh: "豆阁AI", en: "Doge AI" },
  { id: "community", zh: "论坛", en: "Forum" },
  { id: "faq", zh: "帮助", en: "Help" },
];
const studioSteps: { id: StudioStep; label: string; desc: string }[] = [
  { id: "config", label: "配置", desc: "选择碧江或传统主题、作品形式、网格尺寸、颜色数量和可用色" },
  { id: "extract", label: "主体提取与再创作", desc: "提取图片核心主体意象，展示颜色占比，并基于主体图进行文化风格再创作" },
  { id: "pattern", label: "拼豆图纸", desc: "像素化处理、自动移除轮廓外浅色杂块以节省拼豆用量、生成带色号网格并统计用量" },
  { id: "preview", label: "制作方案", desc: "汇总成本、用时、采购、难度、导出与文化说明" },
];

const formLabels = [
  { id: "coaster", label: "杯垫底稿" },
  { id: "keychain", label: "挂件底稿" },
  { id: "magnet", label: "冰箱贴底稿" },
  { id: "brooch", label: "胸针底稿" },
  { id: "pendant", label: "吊饰底稿" },
  { id: "bag_charm", label: "随身牌底稿" },
];

const formLabelEn: Record<string, string> = {
  coaster: "Coaster Draft",
  keychain: "Keychain Draft",
  magnet: "Fridge Magnet Draft",
  brooch: "Brooch Draft",
  pendant: "Pendant Draft",
  bag_charm: "Bag Charm Draft",
};

const studioStepEn: Record<StudioStep, { label: string; desc: string }> = {
  config: { label: "Configure", desc: "Choose theme, product type, grid size, color count, and available colors." },
  extract: { label: "Extract and Recreate", desc: "Extract the main subject, review color ratios, and recreate it in a cultural visual style." },
  pattern: { label: "Bead Pattern", desc: "Pixelate the design, clean outer light artifacts, generate color-coded grids, and count materials." },
  preview: { label: "Making Plan", desc: "Generate materials, tools, bead placement, ironing steps, and export files." },
};

const themeEn: Record<string, { name: string; meaning: string; elements: Record<string, string> }> = {
  bijiang_village: {
    name: "Bijiang Village",
    meaning: "Bijiang Village brings together Cantonese carving crafts, ancestral halls, traditional academies, farming-and-reading culture, and Chinese-Western architecture.",
    elements: {},
  },
  dunhuang: { name: "Dunhuang Culture", meaning: "Dunhuang culture blends Buddhist art, Silk Road civilization, and Chinese ornament, making it suitable for high-contrast bead patterns.", elements: { "飞天": "Flying Apsaras", "藻井": "Caisson Ceiling", "祥云": "Auspicious Clouds", "莲花纹": "Lotus Pattern", "九色鹿": "Nine-Colored Deer" } },
  blue_porcelain: { name: "Blue-and-White Porcelain", meaning: "Blue-and-white porcelain expresses Chinese ceramic aesthetics through crisp blue-white contrast and elegant ornament.", elements: { "莲花": "Lotus", "缠枝纹": "Scroll Pattern", "云纹": "Cloud Pattern", "瓷瓶": "Porcelain Vase", "海水纹": "Wave Pattern" } },
  opera_mask: { name: "Peking Opera Masks", meaning: "Peking opera masks use color to symbolize character and theatrical culture, ideal for symmetrical bead designs.", elements: { "关羽": "Guan Yu", "张飞": "Zhang Fei", "曹操": "Cao Cao", "包拯": "Bao Zheng", "对称脸谱": "Symmetric Mask" } },
  shanhaijing: { name: "Classic of Mountains and Seas", meaning: "Shanhaijing imagery emphasizes imagination and Eastern mythology, suitable for strong silhouettes and decorative accessories.", elements: { "神兽": "Mythic Beast", "羽翼": "Wings", "山纹": "Mountain Pattern", "日月": "Sun and Moon", "瑞兽": "Auspicious Beast" } },
  solar_terms: { name: "Twenty-Four Solar Terms", meaning: "The solar terms connect seasons, farming, and life aesthetics, suitable for seasonal craft pieces.", elements: { "立春": "Start of Spring", "清明": "Qingming", "小满": "Grain Buds", "白露": "White Dew", "冬至": "Winter Solstice" } },
  oracle_bone: { name: "Oracle Bone Script", meaning: "Oracle bone script turns the origins of Chinese characters into concise symbols for low-resolution grids.", elements: { "日": "Sun", "月": "Moon", "山": "Mountain", "水": "Water", "人": "Person" } },
  sanxingdui: { name: "Sanxingdui Bronze Culture", meaning: "Sanxingdui bronze culture centers on mysterious masks, sacred trees, and sun worship.", elements: { "青铜面具": "Bronze Mask", "纵目面具": "Protruding-Eye Mask", "神树": "Sacred Tree", "太阳轮": "Sun Wheel", "金杖纹": "Gold Staff Pattern" } },
  forbidden_city: { name: "Forbidden City Court Patterns", meaning: "Forbidden City court patterns combine royal architecture, ceremonial colors, and auspicious ornament.", elements: { "宫墙": "Palace Wall", "琉璃瓦": "Glazed Tile", "龙纹": "Dragon Pattern", "海水江崖": "Sea-and-Cliff Pattern", "如意纹": "Ruyi Pattern" } },
  auspicious_animals: { name: "Traditional Auspicious Animals", meaning: "Auspicious animals carry blessing, protection, and good fortune symbolism.", elements: { "麒麟": "Qilin", "貔貅": "Pixiu", "凤凰": "Phoenix", "龙": "Dragon", "狮子": "Lion" } },
  zodiac: { name: "Chinese Zodiac", meaning: "The zodiac combines folk calendar culture and blessings, suitable for festive charms and family crafts.", elements: { "鼠": "Rat", "牛": "Ox", "虎": "Tiger", "兔": "Rabbit", "龙": "Dragon", "蛇": "Snake", "马": "Horse", "羊": "Goat", "猴": "Monkey", "鸡": "Rooster", "狗": "Dog", "猪": "Pig" } },
  dream_red_chamber: { name: "Dream of the Red Chamber", meaning: "Dream of the Red Chamber combines garden imagery, poetry, character fate, and jade symbolism, suitable for refined bead patterns with classical literary feeling.", elements: { "通灵宝玉": "Magic Jade", "绛珠仙草": "Crimson Pearl Plant", "海棠花": "Crabapple Blossom", "大观园": "Grand View Garden", "金陵十二钗": "Twelve Beauties of Jinling" } },
  journey_west: { name: "Journey to the West", meaning: "Journey to the West centers on mythic adventure, pilgrimage, and vivid character forms, suitable for dynamic bead charms and coaster designs.", elements: { "孙悟空": "Sun Wukong", "金箍棒": "Golden Cudgel", "筋斗云": "Somersault Cloud", "莲花座": "Lotus Seat", "火焰山": "Flaming Mountain" } },
  romance_three_kingdoms: { name: "Romance of the Three Kingdoms", meaning: "Romance of the Three Kingdoms emphasizes heroes, strategy, weapons, horses, and banners, suitable for solemn high-contrast cultural patterns.", elements: { "青龙偃月刀": "Green Dragon Crescent Blade", "羽扇纶巾": "Feather Fan and Silk Cap", "赤兔马": "Red Hare Horse", "桃园结义": "Oath of the Peach Garden", "战旗": "Battle Banner" } },
  water_margin: { name: "Water Margin", meaning: "Water Margin evokes brotherhood, rivers-and-lakes heroism, Liangshan gathering, and bold folk storytelling, suitable for strong graphic bead pieces.", elements: { "梁山泊": "Liangshan Marsh", "替天行道旗": "Justice Banner", "虎纹": "Tiger Pattern", "酒碗": "Wine Bowl", "朴刀": "Podao Blade" } },
};

const beadUsageEn: Record<string, string> = {
  "轮廓": "Outline",
  "留白": "Blank",
  "过渡": "Transition",
  "主纹样": "Main Motif",
  "强调": "Accent",
  "装饰": "Decoration",
  "填充": "Fill",
};

const colorFamilyLabelEn: Record<ColorFamily, string> = {
  "全部": "All",
  "红色系": "Red",
  "橙色系": "Orange",
  "黄色系": "Yellow",
  "绿色系": "Green",
  "青色系": "Cyan",
  "蓝色系": "Blue",
  "紫色系": "Purple",
  "粉色系": "Pink",
  "灰色系": "Gray",
  "白色系": "White",
  "黑色系": "Black",
};

const productConfigDefaults: Record<string, ProductConfigDefault> = {
  coaster: { aspectRatio: "1:1", gridSize: 48, colorCount: 12 },
  keychain: { aspectRatio: "1:1", gridSize: 32, colorCount: 8 },
  magnet: { aspectRatio: "1:1", gridSize: 40, colorCount: 10 },
  brooch: { aspectRatio: "1:1", gridSize: 32, colorCount: 8 },
  pendant: { aspectRatio: "3:4", gridSize: 48, colorCount: 12 },
  bag_charm: { aspectRatio: "1:1", gridSize: 40, colorCount: 10 },
};

function getProductConfigDefault(productId: string): ProductConfigDefault {
  return productConfigDefaults[productId] ?? productConfigDefaults.coaster;
}

const showcase = [
  {
    title: "金楼金箔木雕",
    theme: "碧江村",
    element: "金箔木雕",
    meaning: "从碧江金楼的金箔木雕中提取花鸟、人物与吉祥纹样，转译为古雅精致的拼豆图案。",
    colors: ["#F3EFE7", "#33596A", "#B57938"],
    previewImage: bijiangAsset("金楼内部装饰.jpg"),
  },
  {
    title: "砖雕大照壁",
    theme: "碧江村",
    element: "砖雕（戏剧人物、吉祥图案）",
    meaning: "以碧江村砖雕大照壁为灵感，凝练戏剧人物与吉祥图案的层次和轮廓。",
    colors: ["#F3EFE7", "#33596A", "#B57938"],
    previewImage: bijiangAsset("砖雕大照壁.jpg"),
  },
  {
    title: "镬耳山墙",
    theme: "碧江村",
    element: "镬耳山墙",
    meaning: "提取广府镬耳山墙的高耸曲线和建筑秩序，形成具有岭南辨识度的文创图案。",
    colors: ["#F3EFE7", "#33596A", "#B57938"],
    previewImage: bijiangAsset("金楼.png"),
  },
  {
    title: "祠堂耕读",
    theme: "碧江村",
    element: "耕读文化",
    meaning: "围绕碧江祠堂、书塾和耕读传统组织文化意象，表达饮水思源与诗礼传家的精神。",
    colors: ["#F3EFE7", "#33596A", "#B57938"],
    previewImage: bijiangAsset("慕堂苏公祠.jpg"),
  },
];

const communityTemplates: CommunityTemplate[] = showcase.map((item, index) => ({
  id: `template_${index}`,
  title: item.title,
  author: ["金楼拾光", "碧江砖韵", "岭南筑影", "耕读工坊"][index] ?? "豆阁工坊",
  avatar: ["金", "砖", "镬", "耕"][index] ?? "豆",
  createdAt: Date.UTC(2026, 6, 21 - index, 2, 0, 0),
  theme: item.theme,
  element: item.element,
  meaning: item.meaning,
  colors: item.colors,
  productId: "coaster",
  previewImage: item.previewImage,
}));

function getImportedTemplatePreview(record: ProjectRecord): string | null {
  if (!/·\s*(导入|Import)$/.test(record.title)) return null;
  return showcase.find((item) => item.theme === record.theme && item.element === record.element)?.previewImage ?? null;
}

const showcaseReferenceImages = [
  { src: bijiangAsset("金楼.png"), alt: "碧江金楼" },
  { src: bijiangAsset("金楼内部装饰.jpg"), alt: "金楼内部装饰" },
  { src: bijiangAsset("砖雕大照壁.jpg"), alt: "砖雕大照壁" },
  { src: bijiangAsset("泰兴大街.jpg"), alt: "泰兴大街" },
  { src: bijiangAsset("慕堂苏公祠.jpg"), alt: "慕堂苏公祠" },
  { src: bijiangAsset("南山蘓公祠.jpg"), alt: "南山蘓公祠" },
  { src: bijiangAsset("峭岩蘓公祠.jpg"), alt: "峭岩蘓公祠" },
  { src: bijiangAsset("照壁.jpg"), alt: "照壁" },
  { src: bijiangAsset("怡堂.jpg"), alt: "怡堂" },
  { src: bijiangAsset("太后宫.jpg"), alt: "太后宫" },
  { src: bijiangAsset("德云居.jpg"), alt: "德云居" },
  { src: bijiangAsset("复涌.jpg"), alt: "复涌" },
];

const homeStepImages = [
  showcaseReferenceImages[6],
  showcaseReferenceImages[9],
  showcaseReferenceImages[3],
  showcaseReferenceImages[11],
];

const homeForumImages = [
  showcaseReferenceImages[1],
  showcaseReferenceImages[4],
  showcaseReferenceImages[7],
  showcaseReferenceImages[10],
];

const craftSteps = [
  {
    anchor: "guide-theme",
    title: "主题选择",
    text: "从碧江村建筑、雕刻、书塾与耕读文化出发，确定适合拼豆表达的核心元素和色彩气质。",
  },
  {
    anchor: "guide-upload",
    title: "素材与提取",
    text: "AI 生成图像直接进入输出端；上传本地图片时先用交互式画笔确认核心主体，再由 AI 结合传统文化配置进行再创作。",
  },
  {
    anchor: "guide-mapping",
    title: "配色与调色板",
    text: "以开源色表进行近似色映射，支持指定已有颜色并限制颜色数量、开启网格辅助线，便于实际摆豆时精准核对。",
  },
  {
    anchor: "guide-export",
    title: "制作与导出",
    text: "汇总成本、用时、采购清单、难度阶梯和导出资料，并在右下角集中展示文化信息。",
  },
];

type HelpSection = {
  id: string;
  title: string;
  icon: string;
  subs: { title: string; content: string | string[] }[];
};

type CommunityTemplate = {
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
  previewImage?: string;
};

type CommunityPost = CommunityTemplate & {
  type: "template" | "project";
  record?: ProjectRecord;
  updatedAt?: number;
  isOwnedByCurrentUser?: boolean;
};

type CommunityEditDraft = {
  title: string;
  theme: string;
  element: string;
  meaning: string;
};

const helpSidebarNav = [
  {
    id: "purpose",
    label: "设计目的",
    icon: "目标",
    subs: [] as { label: string; anchor: string }[],
  },
  {
    id: "guide",
    label: "操作指南",
    icon: "指南",
    subs: [
      { label: "主题选择", anchor: "guide-theme" },
      { label: "素材与提取", anchor: "guide-upload" },
      { label: "配色与图纸", anchor: "guide-mapping" },
      { label: "制作与导出", anchor: "guide-export" },
    ],
  },
  {
    id: "common-issues",
    label: "常见问题",
    icon: "问答",
    subs: [] as { label: string; anchor: string }[],
  },
  {
    id: "usage-tips",
    label: "使用技巧",
    icon: "技巧",
    subs: [] as { label: string; anchor: string }[],
  },
];

const helpData: HelpSection[] = [
  {
    id: "purpose",
    title: "设计目的",
    icon: "目标",
    subs: [
      {
        title: "豆阁现在解决什么问题？",
        content: "豆阁当前不是单纯的图片转像素工具，而是一套围绕传统文化拼豆创作的完整工作流。用户可以从首页进入创作、项目、豆阁AI、论坛和帮助几个独立页面：创作用于完成主题配置、素材处理、图纸生成和制作方案；项目页集中管理最近设计并支持搜索、继续编辑、删除和新建；论坛页用于浏览示例和用户发布作品并导入模板；豆阁AI现在调用生图接口，输入提示词后直接输出图像。设计目的就是把文化主题、图像生成、主体识别、拼豆颜色映射、用量统计、项目保存和分享导入放在一个连续流程中，让用户既能快速得到可制作的拼豆图纸，也能保留人工调整空间。",
      },
      {
        title: "和普通拼豆或聊天工具有什么区别？",
        content: "普通拼豆工具通常只负责把图片像素化，普通聊天工具只输出文字建议；豆阁当前实现把两者拆成更明确的功能边界。豆阁AI页面使用生图API，负责根据提示词生成图像，不再作为普通问答弹窗存在；创作流程中的主体识别会把图像理解结果排版为主体名称、类别、证据、置信度、备选项和视觉摘要，并允许用户手动修改；第二步再创作使用这些可编辑识别信息生成提示词，不再把原图直接传给AI；第四步文化说明则同时使用图像和识别信息。图纸阶段还支持点击某种颜色后让所有同色块呈现轻微立体强调效果，方便查找材料位置，这些都是面向实际制作而不是只做展示的功能。",
      },
    ],
  },
  {
    id: "guide-theme",
    title: "主题选择",
    icon: "主题",
    subs: [
      {
        title: "如何从顶部导航进入正确页面？",
        content: "顶部导航现在按实际功能拆分为首页、创作、项目、豆阁AI、论坛和帮助。当前所在页面会以醒目的酒红色块显示，避免和普通白色按钮混淆。要开始制作拼豆作品，应点击“创作”；要恢复或搜索已有设计，应点击“项目”；要单独用生图模型生成图片，应点击“豆阁AI”；要查看作品分享和示例模板，应进入“论坛”。首页只作为入口和功能概览，不承担具体编辑任务。这样设计的好处是每个页面职责清晰，用户不会把项目管理、AI生图、论坛导入和拼豆图纸编辑混在一个弹窗或个人主页里操作。",
      },
      {
        title: "第一步配置需要填写哪些内容？",
        content: "进入“创作”后，第一步是配置作品基础参数。你需要选择传统文化主题、核心元素、文化叙述、作品形式、画面比例、网格尺寸、颜色数量、是否显示网格、是否平滑杂点、是否连接孤立色块以及可用颜色。作品形式会影响后续制作方案和文化说明，例如杯垫、挂件、冰箱贴、胸针、吊饰、随身牌等都会有不同的用途表述。网格尺寸决定图纸精细度，颜色数量决定材料复杂度。配置阶段的文字不是第四步文化说明的唯一依据，当前实现中特别要求第四步以图像和主体识别结果为主，避免只照搬用户配置主题。",
      },
      {
        title: "内置主题和首页示例有什么关系？",
        content: "首页展示的示例和创作页中的主题配置是两个入口：示例用于快速带入一组主题、元素、说明和推荐色，适合不知道从哪里开始的用户；创作页中的下拉与输入项则允许你细化或完全重写主题。点击首页示例后，系统会进入创作配置页，并把推荐颜色加入调色板，随后你仍然可以调整网格、颜色上限、滤镜和作品形式。论坛入口也展示四张较小的示例图，它们用于说明论坛中可分享和导入的作品形态，不等同于当前项目本身。导入论坛作品时，系统会把模板保存为项目记录并进入可编辑状态。",
      },
      {
        title: "项目页和个人主页的历史有什么区别？",
        content: "当前实现已经把历史作品从个人主页中分离成顶部导航的“项目”页面。项目页顶部有搜索栏，下面显示最近设计，卡片中包含预览图、标题、主题元素、更新时间，以及继续编辑和删除操作。最末尾有红色圆形加号的新建项目入口，点击后会清空当前进度并跳转到创作页第一步。个人主页仍保留头像、昵称和API配置等账户相关内容，不再作为主要历史项目入口。这个拆分让项目管理更直接，也避免用户为了找作品必须进入个人资料界面。",
      },
    ],
  },
  {
    id: "guide-upload",
    title: "素材与提取",
    icon: "素材",
    subs: [
      {
        title: "豆阁AI现在如何生成图像？",
        content: "豆阁AI现在作为顶部导航中的独立页面存在，不再是右下角悬浮标或弹窗。它的接口已改为调用Ark生图API，输入框提示为“输入生图提示词”，按钮为“生成图片”。发送后，服务端会取最近一条用户消息作为生图提示词，调用Ark的images/generations接口，并把返回的base64图片或URL作为助手消息展示在聊天区域中。历史消息会保存imageUrl，因此刷新后仍能看到已生成图像。这个页面适合先独立探索视觉概念，生成满意的图像后再回到创作流程中上传或使用，不再承担传统文化问答文本助手的职责。",
      },
      {
        title: "上传图片后主体识别怎样工作？",
        content: "上传本地图片后，系统会先在浏览器中生成主体区域，用绿色蒙版显示在图像上。用户可以用鼠标选择同色连通区域，也可以切换增加、减少模式用画笔修正主体边界。与此同时，图像理解API会生成结构化识别结果，包括主体名称、类别、证据、置信度、备选项和视觉摘要。这些内容会显示在第二步的独立识别结果模块中，并且支持手动编辑。当前实现强调：第二步AI再创作不再把原始图片传给AI，而是把用户确认后的识别JSON作为提示词依据，让用户可以主动纠正识别偏差。",
      },
      {
        title: "第二步再创作为什么不再传图片？",
        content: "第二步的目标是根据已确认主体进行传统文化风格再创作，而不是让AI重新猜测上传图里有什么。因此当前实现会先通过图像理解得到结构化主体信息，再让用户在识别结果模块中手动修改，最后把这份信息作为提示词传给AI进行再创作。这样做可以减少视觉模型误识别对后续创作的影响，也能让用户把主体名称、类别和关键证据写得更具体。比如模型把“莲花纹”识别成“花朵”时，用户可以直接改成莲花、植物纹样、花瓣层叠和青白配色等描述，再生成更贴合的传统文化图案。",
      },
      {
        title: "第四步文化说明使用哪些输入？",
        content: "第四步生成文化说明时，当前实现与第二步不同：它会把图像和结构化识别信息一起提供给文化说明接口。也就是说，文化说明不应该只根据第一步配置的主题和文化叙述来写，而应根据最终可见图像、主体名称、类别、视觉证据、置信度、备选项和视觉摘要共同判断。这样可以避免配置主题和实际图像不一致时产生错误说明。输出内容会组织为作品标题、文化来源、图案寓意和设计说明，并在制作方案页中展示和导出。用户应优先检查主体识别模块是否准确，因为它会直接影响第四步文案的文化判断。",
      },
      {
        title: "内置样例、AI生成图和上传图有什么差别？",
        content: "内置样例用于快速体验完整流程，不依赖外部AI接口，适合测试网格、配色、用量统计和导出效果。豆阁AI页面生成的图像是独立生图结果，可以作为灵感或素材来源，但需要用户回到创作流程中继续处理。创作页中直接生成的文化图案会进入后续拼豆流程；上传图则会触发主体蒙版和图像理解识别，适合把已有照片、插画或图案转成可制作作品。三者最终都可以进入拼豆图纸生成，但进入第二步时的主体识别、是否需要手动修蒙版、是否传图片给AI等行为不同，使用前应根据素材来源选择合适路径。",
      },
    ],
  },
  {
    id: "guide-mapping",
    title: "配色与图纸",
    icon: "配色",
    subs: [
      {
        title: "颜色上限和手动选色如何影响图纸？",
        content: "颜色上限控制最终拼豆图纸最多使用多少种颜色，数值越低，图案越简化，采购和摆豆越轻松；数值越高，细节越丰富，但材料准备和对照难度也会增加。手动选色区域允许用户按色系筛选并指定可用颜色，系统在映射时会优先使用这些颜色。若已选颜色数量超过颜色上限，界面会提示超出部分不会进入最终映射。实际操作中建议先确定作品用途和尺寸，再决定颜色数量：小尺寸挂件适合少色块和高对比，大尺寸杯垫或装饰画可以使用更多层次。每次调整后重新生成图纸，可以直观看到变化。",
      },
      {
        title: "图纸上的颜色强调怎么使用？",
        content: "当前拼豆图纸支持颜色强调功能。在图纸步骤中，点击某一个格子，系统会记录该格子的颜色，并把所有同色块绘制成轻微立体豆粒效果。强调效果通过格子内部的圆形高光、阴影和边缘描边实现，范围限制在原格子内，因此不会遮挡其他色块，也不会改变导出的原始图纸数据。你也可以点击右侧用量统计表中的某一行，快速强调该颜色在整张图纸中的分布。这个功能适合摆豆时查找某种材料的位置，尤其在颜色相近、网格较大或色号较多的作品中，可以明显降低找色成本。",
      },
      {
        title: "点击编辑颜色和点击强调颜色有什么区别？",
        content: "图纸步骤中存在两种不同交互：普通点击用于强调同色块，编辑模式下点击用于改色。默认情况下，点击格子只会选择该颜色并显示立体强调，不修改图纸数据；当你开启“点击编辑”后，再点击格子会把该格子替换为当前选中的编辑颜色，同时更新调色板和用量统计。右侧色表行点击会选择并强调该颜色，但不会自动开启修改图纸的风险操作。这样的设计可以让用户先检查颜色分布，再决定是否进入编辑模式。需要精修时，先从颜色按钮或统计表选择目标颜色，再开启编辑，逐格修正错误色块。",
      },
      {
        title: "色号体系和用量统计有什么作用？",
        content: "豆阁使用开源中性色号体系来标记颜色，每个格子显示的色号来自颜色映射表，并对应一个标准RGB值。它不是某个商家的专属编号，而是方便用户在不同材料品牌之间做近似对照。用量统计会按颜色汇总总颗数、比例和用途说明，并可以导出CSV文件，用于采购、分装和制作前检查。由于实体拼豆不同品牌和批次可能存在轻微色差，建议在正式制作前用实际材料和屏幕颜色做一次对照。图纸、无标注图、材料清单和制作方案应配合使用：图纸负责摆放位置，CSV负责采购数量，方案负责时间和成本预估。",
      },
    ],
  },
  {
    id: "guide-export",
    title: "制作与导出",
    icon: "导出",
    subs: [
      {
        title: "可以导出哪些文件？",
        content: "当前制作阶段支持导出多种资料：带网格和色号的拼豆图纸PNG、无标注图纸PNG、材料清单CSV，以及制作方案文本。带标注图纸适合打印后对照摆豆，无标注图纸适合做展示或场景预览参考，CSV适合整理采购清单，制作方案会汇总作品形式、网格尺寸、颜色数、总豆数、预估时间、成本范围、工具材料和熨烫步骤。导出内容基于当前图纸状态生成，因此如果你在图纸步骤里手动改过颜色或切换过网格显示，应在确认最终效果后再导出。项目页保存的是工作进度，导出文件才是可离线使用的制作资料。",
      },
      {
        title: "制作方案如何估算时间和成本？",
        content: "制作方案会根据图纸中的总拼豆颗数、颜色种类和固定熨烫时间进行估算。当前逻辑把单颗摆豆时间、换色准备时间和熨烫冷却时间分开计算，再给出总分钟数；成本估算则根据总豆数、颜色包数量和基础工具材料范围给出区间。它不是精确报价，而是帮助用户判断作品规模是否适合当前时间和预算。颜色越多，换色和分装时间越长；格子越多，总摆豆时间越长；小作品虽然总豆数少，但如果颜色特别多，也会增加准备成本。实际制作时建议额外准备少量备用豆，防止颜色偏差或损耗。",
      },
      {
        title: "项目会如何保存和恢复？",
        content: "项目记录会保存在浏览器项目库中，并按当前登录用户区分。项目页会显示最近设计，支持搜索标题、主题、元素和作品形式。点击继续编辑会恢复主题、参数、源图、提取图、图纸数据、图纸预览和当前步骤等状态；点击删除会移除该项目记录；点击红色加号会清空当前进度并进入新建创作。论坛导入的作品也会先保存为项目，再进入编辑状态。需要注意，浏览器数据可能受到缓存清理、隐私模式或设备更换影响，所以重要作品仍建议导出PNG、CSV和制作方案到本地文件。",
      },
      {
        title: "论坛分享和模板导入如何配合项目使用？",
        content: "论坛页用于查看作品分享和模板导入。用户可以发布当前作品，系统会把当前进度保存为项目记录，并把作品信息发布到论坛数据中；其他用户点击论坛卡片可以查看预览、主题、元素、文化说明和推荐配色。如果作品带有完整记录，导入时会复制成新的项目并进入编辑；如果只是内置模板，则会创建一个带主题、元素、说明和推荐色的项目草稿。首页论坛区域现在使用四张较小示例图展示论坛内容形态，点击后进入论坛页面。论坛不是最终导出区，而是作品发现、复用和继续创作的入口。",
      },
    ],
  },
  {
    id: "common-issues",
    title: "常见问题",
    icon: "问答",
    subs: [
      {
        title: "生成的图片刷新或切换页面后还能看到吗？",
        content: "可以。豆阁AI生成的图像会自动保存在浏览器本地存储中，刷新页面或切换到其他页面再回来，历史消息中的图片仍然可以正常显示。需要注意：如果清理浏览器缓存或使用无痕模式，本地数据可能会被清除，建议将重要的生成结果截图保存或下载到电脑里。",
      },
      {
        title: "生成图片速度很慢，是正常现象吗？",
        content: "生成图片通常比文字回复慢很多，这是正常现象。调用生图模型接口需要等待服务端处理，一般需要几秒到几十秒不等。页面出现“正在生成图像”时请耐心等待，不要重复点击发送按钮。如果长时间无响应，可以点击发送按钮（此时变为中断按钮）中断当前请求，然后重试。网络状况不佳或模型负载较高时，生成时间会更长。",
      },
      {
        title: "如何把豆阁AI生成的图片导入到创作流程？",
        content: "豆阁AI页面是一个独立的生图工具，生成的图片目前不会自动进入创作流程。如果你想用AI生成的图片制作拼豆图纸，可以把生成的图片截图或右键保存到本地，然后在创作流程第二步点击“上传图片”，将保存的图片上传后进行主体识别和拼豆图纸生成。",
      },
      {
        title: "拼豆图纸上的颜色和实际买到的拼豆有色差怎么办？",
        content: "豆阁使用开源中性色号体系标记颜色，每个色号对应一个标准RGB值，与实际品牌的拼豆颜色可能存在差异。建议在制作前先拿实物拼豆与屏幕颜色做一次对照。如果发现某个颜色偏差较大，可以在图纸步骤开启“点击编辑”模式，手动将该颜色格子替换为更接近实际材料的颜色。导出材料清单后，也可以在使用时根据实际颜色灵活调整。",
      },
      {
        title: "我的作品保存在哪里？换设备或清缓存会丢失吗？",
        content: "作品记录保存在当前浏览器的项目库中，AI聊天历史和API配置保存在当前浏览器本地，不会上传到云端服务器。因此如果清理浏览器缓存、使用无痕模式或更换设备登录，这些数据都可能丢失。重要作品建议通过图纸PNG、材料清单CSV和制作方案文本导出到本地文件保存。发布到论坛的作品会存储在云端，其他人可以看到你的分享，但项目编辑状态仍保存在本地。",
      },
      {
        title: "生图按钮点了没反应或提示出错怎么办？",
        content: "首先检查个人主页的API配置：如果开启了“使用系统默认模型”，需要服务端已经配置好ARK_API_KEY和环境变量；如果是手动模式，需要确保已填写生图模型的API Key并选择了正确的模型名称。其次查看输入框是否为空，生图提示词不能为空。如果接口返回具体错误信息（如模型未开通、鉴权失败等），页面会以助手消息展示错误原因，可根据提示处理。生图请求较慢时按钮会显示为中断按钮，代表请求正在处理中，请勿重复点击。",
      },
      {
        title: "在论坛发布的作品别人能看到吗？如何管理已发布的作品？",
        content: "在论坛发布作品后，其他用户可以看到作品预览、主题、元素和文化说明。由当前账号新发布的作品会标记为“我的作品”，打开详情后可以修改作品名称、主题、元素和文化说明，也可以删除论坛发布。编辑或删除只影响论坛内容，不会改动浏览器中的本地项目；出于权限安全考虑，旧版未记录发布凭证的帖子只能继续浏览和导入。",
      },
      {
        title: "如何把论坛里别人分享的作品导入到自己的创作？",
        content: "在论坛页面点击任意作品卡片，如果是对应的项目记录，系统会自动复制为新的项目并进入编辑状态，你可以在此基础上继续修改和完善。如果是内置模板，则会创建一个带主题、元素和推荐色的草稿。导入后的作品会保存在你的项目列表中，与原帖子互不影响。",
      },
    ],
  },
  {
    id: "usage-tips",
    title: "使用技巧",
    icon: "技巧",
    subs: [
      {
        title: "如何让生成的拼豆图纸更精致？",
        content: "增加网格尺寸可以让图案细节更丰富，但拼豆颗数也会成倍增加。建议根据作品尺寸合理选择：小尺寸挂件（32×32）适合简洁高对比的图案，杯垫（48×48）可以保留更多细节。颜色数量建议控制在8-12种，太多会增加材料采购和摆豆难度。开启平滑杂点可以去除孤立噪点，让主体更干净。",
      },
      {
        title: "如何快速查找某种颜色在图纸中的位置？",
        content: "在图纸步骤中，点击任意格子或右侧用量统计表中的颜色行，系统会高亮显示该颜色的所有格子（呈现轻微立体豆粒效果）。这个功能非常适合摆豆时逐一放置同色材料，尤其在颜色较多、网格较大的作品中，可以显著降低找色时间。完成该颜色的摆豆后，点击其他格子即可切换到下一种颜色。",
      },
      {
        title: "主体识别结果不理想时怎样调整？",
        content: "第一步：用鼠标在图片上点击同色区域，绿色蒙版会覆盖被识别为主体部分。第二步：切换增加/减少画笔模式，手动修正主体边界。第三步：点击“AI识别主体”后，结果会显示为主体名称、类别、证据、置信度等结构化信息，你可以直接编辑这些文字描述。第四步：修改后的识别信息会作为AI再创作的提示词依据，不必重新上传图片。建议在进入下一步前，先把识别信息调整到最接近你期望的状态。",
      },
      {
        title: "图纸上的格子和色号看不清怎么办？",
        content: "如果网格线太细或色号文字太小，可以导出带标注的PNG图纸后在本地放大查看。导出时建议选择高分辨率格式，色号文字会按格子大小自动适配。同时你可以关闭“显示网格”选项，查看无标注版本，方便预览整体效果。在制作中建议打印纸质图纸对照摆豆，比在屏幕上查看更方便。",
      },
      {
        title: "多个作品之间如何快速切换编辑？",
        content: "在顶部导航点击“项目”页面，可以看到所有历史作品列表，支持按标题、主题、元素和作品形式搜索。点击“继续编辑”即可恢复该作品的完整状态（包括配置参数、源图、图纸和当前步骤）。项目页末尾有红色加号按钮，可以开始一个全新的创作，之前的进度不会丢失。",
      },
      {
        title: "拼豆制作方案里的时间和成本估算可靠吗？",
        content: "制作方案是根据总豆数、颜色种类和固定熨烫时间进行的粗略估算，不是精确报价。单颗摆豆时间按0.05分钟（3秒）计算，换色每次加2分钟准备时间，再加上10分钟固定熨烫时间。成本方面根据豆包数量和基础工具估算区间。这些数据可以帮助你判断作品规模是否适合当前时间和预算，实际制作时会因个人熟练度、工具差异和材料品牌不同而有所变化。",
      },
    ],
  },
];

const showcaseEn = [
  {
    title: "Gold-Foil Woodcarving",
    theme: "Bijiang Village",
    element: "Gold-Foil Woodcarving",
    meaning: "A refined bead motif derived from the floral, figure, and auspicious carvings inside Bijiang Golden House.",
    author: "Golden House Studio",
    avatar: "Go",
  },
  {
    title: "Brick-Carved Screen Wall",
    theme: "Bijiang Village",
    element: "Narrative Brick Carving",
    meaning: "A layered design inspired by Bijiang's monumental brick-carved screen wall and its theatrical auspicious scenes.",
    author: "Bijiang Brick Studio",
    avatar: "Br",
  },
  {
    title: "Wok-Ear Gable",
    theme: "Bijiang Village",
    element: "Wok-Ear Gable",
    meaning: "The soaring symmetrical silhouette of a Cantonese wok-ear gable becomes a recognizable Lingnan craft motif.",
    author: "Lingnan Form Studio",
    avatar: "Li",
  },
  {
    title: "Ancestral Hall and Learning",
    theme: "Bijiang Village",
    element: "Farming-and-Reading Culture",
    meaning: "An ancestral-hall composition expressing remembrance, education, and the Bijiang ideal of farming and learning.",
    author: "Heritage Workshop",
    avatar: "He",
  },
];

const helpSidebarNavEn = [
  { id: "purpose", label: "Purpose", icon: "Goal", subs: [] as { label: string; anchor: string }[] },
  {
    id: "guide",
    label: "Guide",
    icon: "Guide",
    subs: [
      { label: "Theme Setup", anchor: "guide-theme" },
      { label: "Image and Extraction", anchor: "guide-upload" },
      { label: "Palette and Pattern", anchor: "guide-mapping" },
      { label: "Making and Export", anchor: "guide-export" },
    ],
  },
  { id: "common-issues", label: "FAQ", icon: "FAQ", subs: [] as { label: string; anchor: string }[] },
  { id: "usage-tips", label: "Tips", icon: "Tips", subs: [] as { label: string; anchor: string }[] },
];

const helpDataEn: HelpSection[] = [
  {
    id: "purpose",
    title: "Purpose",
    icon: "Goal",
    subs: [
      { title: "What does Doge solve?", content: "Doge is a complete workflow for traditional-culture bead art: choose a theme, generate or upload imagery, identify the subject, convert it to a bead pattern, count materials, save projects, and import community templates." },
      { title: "How is it different from a normal pixel tool?", content: "It combines image generation, editable subject identification, cultural recreation, bead color mapping, material counting, project persistence, and community import in one workflow designed for real making." },
    ],
  },
  {
    id: "guide-theme",
    title: "Theme Setup",
    icon: "Theme",
    subs: [
      { title: "How do I start?", content: "Use Create to configure a traditional theme, core element, product type, aspect ratio, grid size, color limit, grid display, smoothing, isolated-block connection, and available colors." },
      { title: "How do built-in examples work?", content: "Home and Forum examples provide starting themes and recommended colors. You can import them, then adjust all parameters before generating a final bead pattern." },
    ],
  },
  {
    id: "guide-upload",
    title: "Image and Extraction",
    icon: "Image",
    subs: [
      { title: "How does Doge AI generate images?", content: "Doge AI is a separate image-generation page. Its generated image history is persisted locally so refreshes keep generated images visible." },
      { title: "How does subject identification work?", content: "After upload, the browser creates a green subject mask. You can click, add, subtract, or box-select areas, then AI generates editable structured subject information." },
      { title: "Why does recreation use subject JSON?", content: "Recreation uses the confirmed subject identification rather than guessing from the original image again. This lets you correct the subject before AI creates the cultural pattern." },
    ],
  },
  {
    id: "guide-mapping",
    title: "Palette and Pattern",
    icon: "Palette",
    subs: [
      { title: "How do color limit and selected colors affect the pattern?", content: "The color limit controls final complexity. Manually selected colors are prioritized during mapping, while extra selected colors beyond the limit are ignored." },
      { title: "How do I use color highlighting?", content: "Click a pattern cell or count-table row to highlight all cells of that color. Enable cell editing only when you need to change specific cells." },
    ],
  },
  {
    id: "guide-export",
    title: "Making and Export",
    icon: "Export",
    subs: [
      { title: "What can I export?", content: "You can export a labeled pattern PNG, clean pattern PNG, materials CSV, and making plan text based on the current pattern state." },
      { title: "How are time and cost estimated?", content: "The plan estimates bead placement time from total beads and color changes, then adds a fixed ironing allowance and a material cost range." },
      { title: "How are projects saved?", content: "Projects are saved in the browser project library by user. The Projects page can restore theme, parameters, images, pattern data, preview, and current step." },
    ],
  },
  {
    id: "common-issues",
    title: "FAQ",
    icon: "FAQ",
    subs: [
      { title: "Will generated images remain after refresh?", content: "Yes. Doge AI generated images are saved in local browser storage and remain visible after refresh unless browser data is cleared." },
      { title: "What if image generation is slow?", content: "Image generation can take several seconds or longer. Wait for the request to finish or stop it and retry if it stalls." },
      { title: "Where are my works saved?", content: "Projects and AI chat history are stored in the current browser. Export important PNG, CSV, and plan files for offline backup." },
    ],
  },
  {
    id: "usage-tips",
    title: "Tips",
    icon: "Tips",
    subs: [
      { title: "How do I make the pattern more refined?", content: "Increase grid size for more detail, but expect more beads. Reduce color count for simpler small items and increase it for larger decorative pieces." },
      { title: "How do I correct subject identification?", content: "Adjust the mask with select, add, subtract, or box tools, run AI subject identification, then edit the structured result before recreation." },
      { title: "How do I switch between works?", content: "Open Projects, search by title, theme, element, or product type, then continue editing any saved record." },
    ],
  },
];

function downloadUrl(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

function downloadBeadCsv(items: BeadCount[], filename: string): void {
  const header = ["色号", "RGB", "数量", "比例", "用途"];
  const rows = items.map((item) => [
    item.brandCode,
    item.rgb,
    String(item.count),
    `${(item.ratio * 100).toFixed(2)}%`,
    item.usage,
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  downloadUrl(URL.createObjectURL(blob), filename);
}

function downloadKitCsv(kit: Kit, filename: string): void {
  const header = ["\u8272\u53F7", "RGB", "\u9700\u8981\u9897\u6570", "\u4E70\u51E0\u5305", "\u5355\u4EF7(\u5143/\u5305)", "\u5C0F\u8BA1(\u5143)", "\u7528\u9014", "\u6DD8\u5B9D\u94FE\u63A5"];
  const rows = kit.items.map((item) => [
    item.colorCode,
    item.rgb,
    String(item.count),
    String(item.packs),
    String(item.pricePerPack),
    String(item.subtotal),
    item.usage,
    item.buyUrl,
  ]);
  const totalRow = ["\u5408\u8BA1", "", String(kit.totalBeads), String(kit.totalPacks), "", String(kit.totalPrice), "", ""];
  const csv = [header, ...rows, totalRow]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  downloadUrl(URL.createObjectURL(blob), filename);
}

function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" });
  downloadUrl(URL.createObjectURL(blob), filename);
}

function estimateBeadingMinutes(totalBeads: number, colorKinds: number): number {
  if (totalBeads <= 0) return 0;
  return Math.round(totalBeads * 0.05 + colorKinds * 2 + 10);
}

const BEAD_TIME_PER_PIECE = 0.05;
const IRONING_TIME = 10;


function formatDuration(minutes: number): string {
  if (minutes <= 0) return "-";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} 分钟`;
  if (mins === 0) return `${hours} 小时`;
  return `${hours} 小时 ${mins} 分钟`;
}

function estimateMaterialCost(totalBeads: number, colorKinds: number): { min: number; max: number } {
  if (totalBeads <= 0) return { min: 0, max: 0 };
  const beadPacks = Math.max(colorKinds, Math.ceil((totalBeads * 1.15) / 1000));
  return {
    min: beadPacks * 3 + 8,
    max: beadPacks * 7 + 20,
  };
}

function formatPostTime(timestamp: number, language: AppLanguage = "zh"): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return language === "en" ? `${minutes} min ago` : `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === "en" ? `${hours} hr ago` : `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return language === "en" ? `${days} days ago` : `${days} 天前`;
  return new Date(timestamp).toLocaleDateString(language === "en" ? "en-US" : "zh-CN");
}

function PatternMiniature({ colors }: { colors: string[] }) {
  const cells = Array.from({ length: 64 }, (_, index) => {
    const x = index % 8;
    const y = Math.floor(index / 8);
    const distance = Math.abs(x - 3.5) + Math.abs(y - 3.5);
    return colors[Math.min(colors.length - 1, Math.floor(distance / 2))] ?? colors[0];
  });

  return (
    <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm">
      {cells.map((color, index) => (
        <span key={index} style={{ backgroundColor: color }} className="border-[0.5px] border-white/60" />
      ))}
    </div>
  );
}

function CraftSection({ setView, language }: { setView: (v: SiteView) => void; language: AppLanguage }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const L = useCallback((zh: string, en: string) => (language === "en" ? en : zh), [language]);
  const subtitleText = L("从文化意象到拼豆底稿", "From Cultural Image to Bead Draft");
  const [typedSub, setTypedSub] = useState("");

  // IntersectionObserver — 每次滚动进/出视口都重新触发
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        } else {
          // 离开视口时重置，下次进入重新播放
          setVisible(false);
          setTypedSub("");
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 打字副标题 — visible 从 false→true 时重新播放
  useEffect(() => {
    if (!visible) return;
    setTypedSub("");
    let index = 0;
    const t = setInterval(() => {
      index++;
      setTypedSub(subtitleText.slice(0, index));
      if (index >= subtitleText.length) clearInterval(t);
    }, 60);
    return () => clearInterval(t);
  }, [subtitleText, visible]);

  return (
    <section ref={sectionRef} className="bg-[#f3efe7] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-[#33596a]">{L("制作流程", "Making Workflow")}</p>
        <h2 className="mt-2 min-h-[1.2em] text-3xl font-semibold tracking-tight">
          {typedSub}
          {visible && typedSub.length < subtitleText.length && (
            <span className="inline-block w-[2px] h-[0.9em] bg-[#33596a] ml-0.5 animate-pulse align-middle" />
          )}
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {(language === "en" ? helpDataEn.slice(1, 5).map((section) => ({ anchor: section.id, title: section.title, text: String(section.subs[0]?.content ?? "") })) : craftSteps).map((item, i) => (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                setView("faq");
                setTimeout(() => {
                  document.getElementById(item.anchor)?.scrollIntoView({ behavior: "smooth" });
                }, 150);
              }}
              className={`flex h-full flex-col rounded-lg border border-stone-200 bg-[#f3efe7] p-5 text-left transition-all duration-700 ease-out hover:border-[#33596a]/40 hover:shadow-sm ${
                visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{
                transitionDelay: visible ? `${i * 250 + 500}ms` : "0ms",
              }}
            >
              <div className="aspect-square overflow-hidden rounded-md border border-stone-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={homeStepImages[i].src} alt={homeStepImages[i].alt} className="h-full w-full object-cover" />
              </div>
              <p className="mt-3 text-xs font-bold tracking-wider text-[#33596a] uppercase">
                Step {i + 1}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-stone-600 text-justify">{item.text}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeCommunitySection({ setView, language }: { setView: (v: SiteView) => void; language: AppLanguage }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [forumText, setForumText] = useState("");
  const [faqText, setFaqText] = useState("");
  const L = useCallback((zh: string, en: string) => (language === "en" ? en : zh), [language]);
  const forumTitle = L("社区论坛", "Community Forum");
  const faqTitle = L("疑问解答", "Questions and Answers");
  const nav = language === "en" ? helpSidebarNavEn : helpSidebarNav;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    setForumText("");
    setFaqText("");
    let forumIndex = 0;
    let faqIndex = 0;
    let faqTimer: ReturnType<typeof setInterval> | null = null;
    const forumTimer = setInterval(() => {
      forumIndex++;
      setForumText(forumTitle.slice(0, forumIndex));
      if (forumIndex >= forumTitle.length) {
        clearInterval(forumTimer);
        faqTimer = setInterval(() => {
          faqIndex++;
          setFaqText(faqTitle.slice(0, faqIndex));
          if (faqIndex >= faqTitle.length && faqTimer) clearInterval(faqTimer);
        }, 90);
      }
    }, 90);
    return () => {
      clearInterval(forumTimer);
      if (faqTimer) clearInterval(faqTimer);
    };
  }, [faqTitle, forumTitle, visible]);

  return (
    <section ref={sectionRef} className="bg-[#f3efe7] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="space-y-12">
          <div>
            <p className="text-sm font-semibold text-[#33596a]">{L("作品分享", "Work Sharing")}</p>
            <h2 className="mt-2 min-h-[1.2em] text-3xl font-semibold tracking-tight">
              {forumText}
              {visible && forumText.length < forumTitle.length && <span className="ml-0.5 inline-block h-[0.9em] w-[2px] animate-pulse bg-[#33596a] align-middle" />}
            </h2>
            <button
              type="button"
              onClick={() => setView("community")}
              className={`mt-8 w-full rounded-lg border border-stone-200 bg-white p-6 text-left shadow-sm transition-all duration-700 hover:border-[#33596a]/50 hover:shadow-md ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
            >
              <div className="grid w-full grid-cols-4 gap-3">
                {homeForumImages.map((image) => (
                  <div key={image.src} className="aspect-square overflow-hidden rounded-md bg-stone-50 ring-1 ring-stone-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <h3 className="mt-4 text-xl font-semibold">{L("进入论坛", "Enter Forum")}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{L("浏览大家发布的拼豆作品，搜索主题关键词，一键导入喜欢的模板继续创作。", "Browse published bead works, search by theme, and import favorite templates for further creation.")}</p>
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#33596a]">{L("疑问解答", "Help")}</p>
            <h2 className="mt-2 min-h-[1.2em] text-3xl font-semibold tracking-tight">
              {faqText}
              {visible && forumText.length >= forumTitle.length && faqText.length < faqTitle.length && <span className="ml-0.5 inline-block h-[0.9em] w-[2px] animate-pulse bg-[#33596a] align-middle" />}
            </h2>
            <div className={`mt-8 grid gap-4 md:grid-cols-2 transition-all delay-200 duration-700 ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
              {nav.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setView("faq");
                    setTimeout(() => {
                      document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                    }, 150);
                  }}
                  className="rounded-lg border border-stone-200 bg-white p-6 text-left shadow-sm transition hover:border-[#33596a]/50 hover:shadow-md"
                >
                  <span className="text-2xl">{section.icon}</span>
                  <h3 className="mt-3 text-xl font-semibold text-stone-950">{section.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {section.subs.length > 0 ? section.subs.map((sub) => sub.label).join(" / ") : L("查看对应模块的完整说明。", "View the full guide for this module.")}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScrollingPatternBand() {
  return (
    <div className="relative mt-12 overflow-hidden pt-4 pb-10" aria-hidden="true">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#33596a] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#33596a] to-transparent" />
      <div className="home-pattern-scroll-track">
        {[0, 1].map((group) => (
          <div key={group} className="home-pattern-scroll-set">
            {showcaseReferenceImages.map((image) => (
              <div key={`${group}-${image.src}`} className="h-32 w-32 flex-none overflow-hidden rounded-lg bg-white/10 p-2 shadow-lg ring-1 ring-white/15 sm:h-40 sm:w-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt={image.alt} className="h-full w-full rounded-md object-cover" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreativeBeadStudio({ initialView = "home" }: { initialView?: SiteView }) {
  const [language, setLanguage] = useState<AppLanguage>(() => loadAppLanguage());
  const ui = {
    brand: language === "en" ? "Doge" : "豆阁",
    login: language === "en" ? "Log in" : "登录",
    register: language === "en" ? "Register" : "注册",
    newProject: language === "en" ? "New Project" : "新建项目",
    noProjects: language === "en" ? "No matching projects found." : "没有找到匹配的项目。",
    aiTitle: language === "en" ? "Traditional Culture and Bead Design Chat" : "传统文化与拼豆问答",
    forumEyebrow: language === "en" ? "Community Forum" : "社区论坛",
    forumTitle: language === "en" ? "Works, Sharing, and Template Imports" : "作品分享与模板导入",
    forumDesc: language === "en"
      ? "Browse and import shared bead works. You can also edit or delete works published from your current account."
      : "浏览并导入大家分享的拼豆作品；当前账号发布的作品还可以随时编辑或删除。",
    publishCurrent: language === "en" ? "Publish Current Work" : "发布当前作品",
  };
  const L = useCallback((zh: string, en: string) => (language === "en" ? en : zh), [language]);

  useEffect(() => {
    saveAppLanguage(language);
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  }, [language]);

  const firstTheme = cultureThemes[0];
  const [view, setView] = useState<SiteView>(initialView);
  const [step, setStep] = useState<StudioStep>("config");
  const [theme, setTheme] = useState(firstTheme.name);
  const [element, setElement] = useState(firstTheme.elements[0] ?? "金箔木雕");
  const [elementGroupId, setElementGroupId] = useState("all");
  const [meaning, setMeaning] = useState(firstTheme.elementMeanings?.[firstTheme.elements[0]] ?? firstTheme.meaning);
  const [productId, setProductId] = useState("coaster");
  const [gridSize, setGridSize] = useState(() => getProductConfigDefault("coaster").gridSize);
  const [colorCount, setColorCount] = useState(() => getProductConfigDefault("coaster").colorCount);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>(() => getProductConfigDefault("coaster").aspectRatio);
  const [showGrid, setShowGrid] = useState(true);
  const [antiAlias, setAntiAlias] = useState(true);
  const [connectIslands, setConnectIslands] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<ImageFilter>("none");
  const [colorFamily, setColorFamily] = useState<ColorFamily>("全部");
  const [forcedColors, setForcedColors] = useState<string[]>([]);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [extractedImageUrl, setExtractedImageUrl] = useState<string | null>(null);
  const [pattern, setPattern] = useState<BeadPattern | null>(null);
  const [patternUrl, setPatternUrl] = useState<string | null>(null);
  const [cleanPatternUrl, setCleanPatternUrl] = useState<string | null>(null);
  const [highlightedPatternColor, setHighlightedPatternColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 拼豆图纸步骤：点击编辑颜色
  const [isPainting, setIsPainting] = useState(false);
  const [paintColor, setPaintColor] = useState<string>('#000000');
  const [paintColorKey, setPaintColorKey] = useState<string>('');
  // 难度分级 L1–L5（智能简化）阶梯
  const [ladder, setLadder] = useState<{ level: number; label: string; url: string; stats: DifficultyStats; grid: MappedPixel[][]; palette: string[]; width: number; height: number }[]>([]);
  const [ladderLoading, setLadderLoading] = useState(false);
  const directOutputRef = useRef(false);

  const product = getProductTemplate(productId);
  const rawFormLabel = formLabels.find((item) => item.id === productId)?.label ?? "拼豆底稿";
  const formLabel = language === "en" ? formLabelEn[productId] ?? rawFormLabel : rawFormLabel;
  const elementStructure = cultureThemes.find((item) => item.name === theme || item.id === theme)?.elementStructures?.[element] ?? "";
  const options = useMemo(
    () => ({
      theme,
      element,
      meaning: [meaning, elementStructure ? `【结构特征与生成约束】${elementStructure}` : ""].filter(Boolean).join("\n"),
      product: formLabel,
      productPrompt: product.aiPrompt,
      aspectRatio,
      gridSize,
      colorCount,
      language,
    }),
    [aspectRatio, colorCount, element, elementStructure, formLabel, gridSize, language, meaning, product.aiPrompt, theme],
  );

  const paletteColors = useMemo(() => {
    const colors = getAllHexValues().map((hex) => ({
      color: hex,
      key: getDisplayColorKey(hex),
    }));
    return sortColorsByHue(colors);
  }, []);

  const beadCounts = useMemo(
    () => (pattern ? countBeads(pattern.grid) : []),
    [pattern],
  );

  // 采购清单：把 BOM 换算成「买几包 / 花多少钱 / 淘宝链接」
  const kit = useMemo(() => buildKit(beadCounts), [beadCounts]);

  // 难度分级：把当前图纸智能简化成 L1–L5 五个版本（缩略图 + 指标），非破坏性预览
  const generateLadder = useCallback(() => {
    if (!pattern) return;
    setLadderLoading(true);
    try {
      const items = LEVEL_SPECS.map((spec) => {
        const res = simplifyToLevel(pattern.grid, spec.level);
        const canvas = document.createElement("canvas");
        renderPatternToCanvas(canvas, { ...pattern, grid: res.grid, palette: res.palette, width: res.width, height: res.height }, false);
        return { level: spec.level, label: spec.label, url: canvas.toDataURL("image/png"), stats: res.stats, grid: res.grid, palette: res.palette, width: res.width, height: res.height };
      });
      setLadder(items);
    } finally {
      setLadderLoading(false);
    }
  }, [pattern]);

  // 把某个难度档应用到当前图纸（人拍板）
  const applyLadderLevel = useCallback(
    (item: { grid: MappedPixel[][]; palette: string[]; width: number; height: number }) => {
      setPattern((prev) => (prev ? { ...prev, grid: item.grid, palette: item.palette, width: item.width, height: item.height } : prev));
    },
    [],
  );

  const forcedColorWarning = useMemo(() => {
    if (forcedColors.length <= colorCount) return null;
    if (language === "en") {
      return `${forcedColors.length} colors are selected, exceeding the current ${colorCount}-color limit. The extra ${forcedColors.length - colorCount} colors will not be used in final mapping. Reduce selected colors or raise the color limit.`;
    }
    return `已指定 ${forcedColors.length} 种颜色，超过当前 ${colorCount} 色上限。超出的 ${forcedColors.length - colorCount} 种颜色不会进入最终映射，请减少指定颜色或提高颜色上限。`;
  }, [colorCount, forcedColors.length, language]);

  const selectedCultureTheme = useMemo(
    () => cultureThemes.find((item) => item.name === theme || item.id === theme),
    [theme],
  );
  const isBijiangTheme = selectedCultureTheme?.id === "bijiang_village";
  const filteredCultureElements = useMemo(() => {
    const availableElements = selectedCultureTheme?.elements ?? [];
    if (!isBijiangTheme || elementGroupId === "all") return availableElements;
    const group = bijiangElementGroups.find((item) => item.id === elementGroupId);
    const groupElements = new Set<string>(group?.elements ?? []);
    return availableElements.filter((item) => groupElements.has(item));
  }, [elementGroupId, isBijiangTheme, selectedCultureTheme]);
  const displayThemeName = useCallback((item: { id: string; name: string }) => (
    language === "en" ? themeEn[item.id]?.name ?? item.id.replaceAll("_", " ") : item.name
  ), [language]);
  const displayElementName = useCallback((value: string) => {
    if (language !== "en") return value;
    const elementMap = selectedCultureTheme ? themeEn[selectedCultureTheme.id]?.elements : undefined;
    return elementMap?.[value] ?? value;
  }, [language, selectedCultureTheme]);
  const displayMeaning = useCallback((value: string) => {
    if (language !== "en") return value;
    return selectedCultureTheme ? themeEn[selectedCultureTheme.id]?.meaning ?? value : value;
  }, [language, selectedCultureTheme]);
  const displayFormLabel = useCallback((id: string, label: string) => (
    language === "en" ? formLabelEn[id] ?? label : label
  ), [language]);
  const displayStep = useCallback((item: { id: StudioStep; label: string; desc: string }) => (
    language === "en" ? studioStepEn[item.id] : { label: item.label, desc: item.desc }
  ), [language]);
  const formatDurationLocal = useCallback((minutes: number) => {
    if (language !== "en") return formatDuration(minutes);
    if (minutes <= 0) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours} hr`;
    return `${hours} hr ${mins} min`;
  }, [language]);
  const formatSubjectIdentificationLocal = useCallback((identification: SubjectIdentification) => {
    if (language !== "en") return formatSubjectIdentification(identification);
    return [
      `Subject: ${identification.subject || "-"}`,
      `Category: ${identification.category || "-"}`,
      `Confidence: ${Number.isFinite(identification.confidence) ? `${Math.round(identification.confidence * 100)}%` : "-"}`,
      `Evidence: ${identification.evidence.length ? identification.evidence.join("; ") : "-"}`,
      `Alternatives: ${identification.alternatives.length ? identification.alternatives.join("; ") : "-"}`,
      `Summary: ${identification.visualSummary || "-"}`,
    ].join("\n");
  }, [language]);
  const defaultProjectTitle = useMemo(
    () => language === "en"
      ? buildDefaultProjectTitle(
        selectedCultureTheme ? displayThemeName(selectedCultureTheme) : theme,
        displayElementName(element),
        formLabel,
      )
      : buildDefaultProjectTitle(theme, element, formLabel),
    [displayElementName, displayThemeName, element, formLabel, language, selectedCultureTheme, theme],
  );
  const activeHelpSidebarNav = language === "en" ? helpSidebarNavEn : helpSidebarNav;
  const activeHelpData = language === "en" ? helpDataEn : helpData;

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(() => loadCurrentUserProfile());
  const [projectQuery, setProjectQuery] = useState("");
  const [projectRecords, setProjectRecords] = useState<ProjectRecord[]>([]);
  const [communityQuery, setCommunityQuery] = useState("");
  const [communityRefresh, setCommunityRefresh] = useState(0);
  const [selectedCommunityPost, setSelectedCommunityPost] = useState<CommunityPost | null>(null);
  const [cloudCommunityPosts, setCloudCommunityPosts] = useState<CloudCommunityPost[]>(() => loadCachedCommunityPosts());
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityEditDraft, setCommunityEditDraft] = useState<CommunityEditDraft | null>(null);
  const [communityDeleteConfirm, setCommunityDeleteConfirm] = useState(false);
  const [communityMutationLoading, setCommunityMutationLoading] = useState(false);

  useEffect(() => {
    document.cookie = `${SITE_VIEW_COOKIE_KEY}=${encodeURIComponent(view)}; Path=/; SameSite=Lax`;
  }, [view]);

  const communityPosts = useMemo<CommunityPost[]>(() => {
    const query = communityQuery.trim().toLowerCase();
    const cloudPosts = cloudCommunityPosts
      .filter((post) => {
        if (!query) return true;
        return [post.title, post.author, post.theme, post.element, post.meaning]
          .some((value) => value.toLowerCase().includes(query));
      })
      .map((post): CommunityPost => ({
        ...post,
        type: "project",
      }));
    const templatePosts = communityTemplates
      .filter((template) => {
        if (!query) return true;
        return [template.title, template.author, template.theme, template.element, template.meaning]
          .some((value) => value.toLowerCase().includes(query));
      })
      .map((template): CommunityPost => ({
        ...template,
        type: "template",
      }));
    return [...cloudPosts, ...templatePosts].sort((a, b) => b.createdAt - a.createdAt);
  }, [cloudCommunityPosts, communityQuery]);

  const displayCommunityPost = useCallback((post: CommunityPost) => {
    if (language !== "en" || post.type !== "template") return post;
    const index = Number(post.id.replace("template_", ""));
    const text = Number.isFinite(index) ? showcaseEn[index] : undefined;
    if (!text) return post;
    return {
      ...post,
      title: text.title,
      author: text.author,
      avatar: text.avatar,
      theme: text.theme,
      element: text.element,
      meaning: text.meaning,
    };
  }, [language]);

  const displayProjectTheme = useCallback((value: string) => {
    if (language !== "en") return value;
    const themeItem = cultureThemes.find((item) => item.name === value || item.id === value);
    return themeItem ? displayThemeName(themeItem) : value;
  }, [displayThemeName, language]);

  const filteredProjectRecords = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    const sorted = [...projectRecords].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query) return sorted;
    return sorted.filter((record) =>
      [record.title, record.theme, record.element, record.productId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [projectQuery, projectRecords]);

  const refreshProjectRecords = useCallback(async () => {
    setProjectRecords(await loadProjectHistoryAsync());
  }, []);

  useEffect(() => {
    void refreshProjectRecords();
  }, [refreshProjectRecords]);

  const restoringRef = useRef(false);
  const currentProjectIdRef = useRef<string | null>(null);
  const lastAutoSaveSignatureRef = useRef<string>("");
  const activeProjectRestoredRef = useRef(false);
  const previousViewRef = useRef<SiteView>("home");

  const [confirmNew, setConfirmNew] = useState<"ai" | "sample" | "upload" | null>(null);
  const pendingUploadRef = useRef<File | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalStep, setLoginModalStep] = useState<"login" | "register">("login");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"warning" | "success">("warning");
  const [projectTitleDraft, setProjectTitleDraft] = useState("");
  const [projectTitleManual, setProjectTitleManual] = useState(false);
  const [autoSaveIntervalSeconds, setAutoSaveIntervalSeconds] = useState(() => normalizeAutoSaveIntervalSeconds(loadApiConfig()?.autoSaveIntervalSeconds ?? DEFAULT_AUTO_SAVE_INTERVAL_SECONDS));
  const [aiChatResetToken, setAiChatResetToken] = useState(0);
  const [extractPrompt, setExtractPrompt] = useState<string | null>(null);
  const [subjectAnalysis, setSubjectAnalysis] = useState<SubjectAnalysis | null>(null);
  const [subjectIdentification, setSubjectIdentification] = useState<SubjectIdentification | null>(null);
  const [subjectIdentificationPrompt, setSubjectIdentificationPrompt] = useState<string | null>(null);
  const [subjectIdentificationLoading, setSubjectIdentificationLoading] = useState(false);
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [subjectMaskMode, setSubjectMaskMode] = useState<MaskMode>("select");
  const [subjectMaskSnapshot, setSubjectMaskSnapshot] = useState<SubjectMask | null>(null);
  const [resultSubjectAnalysis, setResultSubjectAnalysis] = useState<SubjectAnalysis | null>(null);
  const [resultMaskMode, setResultMaskMode] = useState<MaskMode>("select");
  const [resultMaskSnapshot, setResultMaskSnapshot] = useState<SubjectMask | null>(null);
  const [resultMaskSyncVersion, setResultMaskSyncVersion] = useState(0);
  const [costDropdownOpen, setCostDropdownOpen] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [culturePrompt, setCulturePrompt] = useState<string | null>(null);
  const [cultureTextLoading, setCultureTextLoading] = useState(false);
  const [aiCultureCopy, setAiCultureCopy] = useState<{
    title: string;
    source: string;
    meaning: string;
    design: string;
  } | null>(null);


  // 首页打字机动画状态
  const homeTypingLine1 = L("方寸之间，重遇碧江村的岭南风华", "Rediscover Bijiang's Lingnan Heritage, Bead by Bead");
  const homeTypingLine2 = L(
    "从碧江村的金楼、祠堂、书塾与古街中拾取一片岭南色彩。豆阁以 AI 为笔，将金箔木雕、砖雕、镬耳山墙和耕读文化织入像素网格，让碧江记忆以新的温度落回掌心。",
    "Draw from Bijiang Village's Golden House, ancestral halls, academies, and old streets. Doge uses AI to weave Lingnan architecture, carving crafts, and learning traditions into craft-ready pixel grids."
  );
  const [typedLine1, setTypedLine1] = useState("");
  const [typedLine2, setTypedLine2] = useState("");
  const [typingDone, setTypingDone] = useState(false);

  // 打字机动画
  useEffect(() => {
    // 只在主页视图时触发
    if (view !== "home") return;
    
    setTypedLine1("");
    setTypedLine2("");
    setTypingDone(false);

    let line1Index = 0;
    let line2Index = 0;
    let timer: ReturnType<typeof setInterval>;

    // 先打字第一行（标题）
    const startLine2 = () => {
      timer = setInterval(() => {
        if (line2Index < homeTypingLine2.length) {
          line2Index++;
          setTypedLine2(homeTypingLine2.slice(0, line2Index));
        } else {
          clearInterval(timer);
          // 全部打完，延迟一点再浮现内容
          setTimeout(() => setTypingDone(true), 400);
        }
      }, 40); // 放慢至 40ms
    };

    // 开始打第一行
    timer = setInterval(() => {
      if (line1Index < homeTypingLine1.length) {
        line1Index++;
        setTypedLine1(homeTypingLine1.slice(0, line1Index));
      } else {
        clearInterval(timer);
        // 延迟 200ms 开始打第二行
        setTimeout(startLine2, 200);
      }
    }, 80);

    return () => clearInterval(timer);
  }, [homeTypingLine1, homeTypingLine2, view]);

  // Toast 自动消失
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => {
      setToastMsg(null);
      setToastType("warning");
    }, 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    const handleCommunityChanged = () => setCommunityRefresh((value) => value + 1);
    window.addEventListener(COMMUNITY_POSTS_CHANGED_EVENT, handleCommunityChanged);
    return () => window.removeEventListener(COMMUNITY_POSTS_CHANGED_EVENT, handleCommunityChanged);
  }, []);

  // 用户身份变化时先恢复该身份上次成功同步的缓存，避免等待网络时只显示默认作品。
  useEffect(() => {
    setCloudCommunityPosts(loadCachedCommunityPosts());
  }, [currentUser]);

  // 加载完整论坛列表；搜索只在本地筛选，失败或超时时保留现有缓存。
  useEffect(() => {
    let alive = true;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12_000);
    setCommunityLoading(true);
    setCommunityError(null);
    fetchCommunityPosts("", controller.signal)
      .then((posts) => {
        if (!alive) return;
        setCloudCommunityPosts(posts);
        saveCachedCommunityPosts(posts);
      })
      .catch((err) => {
        if (!alive) return;
        setCommunityError(timedOut
          ? L("社区同步超时，已显示上次加载的内容。", "Community sync timed out. Showing the last loaded content.")
          : err instanceof Error ? err.message : L("社区作品加载失败", "Failed to load community works"));
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (alive) setCommunityLoading(false);
      });
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [communityRefresh, currentUser, L]);

  // 论坛停留期间定期静默同步；窗口重新激活、标签页恢复或网络恢复时立即同步。
  useEffect(() => {
    if (view !== "community") return;
    const refresh = () => setCommunityRefresh((value) => value + 1);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [view]);

  const hasUnsavedWork = !!(sourceImageUrl || pattern || patternUrl);

  const resetAutoSaveTracking = useCallback(() => {
    currentProjectIdRef.current = null;
    lastAutoSaveSignatureRef.current = "";
  }, []);

  const clearPatternArtifacts = useCallback(() => {
    setPattern(null);
    setPatternUrl(null);
    setCleanPatternUrl(null);
  }, []);

  const clearResultSubjectSelection = useCallback(() => {
    setResultSubjectAnalysis(null);
    setResultMaskSnapshot(null);
    setResultMaskMode("select");
    setResultMaskSyncVersion((value) => value + 1);
  }, []);

  const clearSubjectIdentification = useCallback(() => {
    setSubjectIdentification(null);
    setSubjectIdentificationPrompt(null);
  }, []);

  const generateCultureText = useCallback(async (promptOverride?: string) => {
    if (!pattern || beadCounts.length === 0) {
      setToastType("warning");
      setToastMsg(L("请先生成拼豆图纸。", "Generate the bead pattern first."));
      return;
    }
    if (!extractedImageUrl) {
      setToastType("warning");
      setToastMsg(L("请先生成或上传再创作图像。", "Generate or upload the recreated image first."));
      return;
    }
    setCultureTextLoading(true);
    try {
      const response = await fetch("/api/generate-culture-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: formLabel,
          gridWidth: pattern.width,
          gridHeight: pattern.height,
          gridSize,
          colorCount,
          beadCounts,
          imageUrl: extractedImageUrl,
          subjectIdentification,
          prompt: promptOverride,
          language,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? L("文化文案生成失败", "Failed to generate cultural copy"));
      if (result.copy) {
        setAiCultureCopy(result.copy);
      }
      if (result.prompt) {
        setCulturePrompt(result.prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : L("文化文案生成失败", "Failed to generate cultural copy"));
    } finally {
      setCultureTextLoading(false);
    }
  }, [pattern, beadCounts, formLabel, gridSize, colorCount, extractedImageUrl, subjectIdentification, language, L]);

  useEffect(() => {
    setAiCultureCopy(null);
    setCulturePrompt(null);
  }, [extractedImageUrl, formLabel, gridSize, colorCount, subjectIdentification]);

  useEffect(() => {
    if (projectTitleManual) return;
    setProjectTitleDraft(defaultProjectTitle);
  }, [defaultProjectTitle, projectTitleManual]);


  const clearCurrentProgress = useCallback(() => {
    directOutputRef.current = false;
    resetAutoSaveTracking();
    setProjectTitleDraft("");
    setProjectTitleManual(false);
    clearPatternArtifacts();
    clearResultSubjectSelection();
    setSourceImageUrl(null);
    setExtractedImageUrl(null);
    setSubjectAnalysis(null);
    setSubjectMaskSnapshot(null);
    clearSubjectIdentification();
    setSubjectDirty(false);
    setExtractPrompt(null);
    setError(null);
    setConfirmNew(null);
    setStep("config");
  }, [clearPatternArtifacts, clearResultSubjectSelection, clearSubjectIdentification, resetAutoSaveTracking]);

  const doUseSample = useCallback(() => {
    clearPatternArtifacts();
    const original = renderSampleDesignOriginal(options);
    resetAutoSaveTracking();
    directOutputRef.current = true;
    setForcedColors(selectedCultureTheme?.paletteHints ?? []);
    setSubjectAnalysis(null);
    setSubjectMaskSnapshot(null);
    clearSubjectIdentification();
    setSubjectDirty(false);
    setSourceImageUrl(original);
    setExtractedImageUrl(original);
    clearResultSubjectSelection();
    setExtractPrompt(null);
    setError(null);
    setConfirmNew(null);
    setStep("extract");
  }, [clearPatternArtifacts, clearResultSubjectSelection, clearSubjectIdentification, options, resetAutoSaveTracking, selectedCultureTheme]);

  const doUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      const imageUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      resetAutoSaveTracking();
      directOutputRef.current = false;
      setForcedColors(selectedCultureTheme?.paletteHints ?? []);
      setSubjectAnalysis(null);
      setSubjectMaskSnapshot(null);
      clearSubjectIdentification();
      setSubjectDirty(false);
      setSourceImageUrl(imageUrl);
    setExtractedImageUrl(null);
    clearResultSubjectSelection();
      setExtractPrompt(null);
      clearPatternArtifacts();
      setStep("extract");
    } catch (err) {
      setError(err instanceof Error ? err.message : L("图片处理失败", "Image processing failed"));
    } finally {
      setLoading(false);
      setConfirmNew(null);
    }
  };

  useEffect(() => {
    if (!pattern) return;
    if (canvasRef.current) {
      renderPatternToCanvas(canvasRef.current, pattern, showGrid, highlightedPatternColor);
    }
    const patternCanvas = document.createElement("canvas");
    renderPatternToCanvas(patternCanvas, pattern, showGrid);
    setPatternUrl(patternCanvas.toDataURL("image/png"));

    const cleanCanvas = document.createElement("canvas");
    renderPatternToCanvasClean(cleanCanvas, pattern, showGrid);
    setCleanPatternUrl(cleanCanvas.toDataURL("image/png"));
  }, [pattern, showGrid, step, highlightedPatternColor]);

  const handleThemeInput = (value: string) => {
    setTheme(value);
    const next = cultureThemes.find((item) => item.name === value || item.id === value);
    if (!next) return;
    const nextElement = next.elements[0] ?? "";
    setElementGroupId("all");
    setElement(nextElement);
    setMeaning(next.elementMeanings?.[nextElement] ?? next.meaning);
    setForcedColors(next.paletteHints);
  };

  const applyProductConfigDefault = (nextProductId: string) => {
    const defaults = getProductConfigDefault(nextProductId);
    setProductId(nextProductId);
    setAspectRatio(defaults.aspectRatio);
    setGridSize(defaults.gridSize);
    setColorCount(defaults.colorCount);
  };

  const buildPatternFromExtracted = async () => {
    if (!extractedImageUrl) {
    setError(null);
    setToastType("warning");
    setToastMsg(L("请先完成主题提取，再生成拼豆图纸。", "Complete subject extraction before generating the bead pattern."));
    setStep("extract");
      return;
    }
    if (!resultSubjectAnalysis) {
      setError(null);
      setToastType("warning");
      setToastMsg(L("请先在创作结果中点击主体，或使用增加/减少画笔指定要拼豆化的主体区域。", "Click the subject in the result, or use the add/subtract brush to mark the area for bead conversion."));
      setStep("extract");
      return;
    }
    if (!directOutputRef.current && subjectDirty) {
      setError(null);
      setToastType("warning");
      setToastMsg(L("主体区域已变化，请先点击 AI 再创作生成新的输出图像。", "The subject area changed. Run AI recreation before generating the bead pattern."));
      setStep("extract");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await imageDataUrlToPattern(
        resultSubjectAnalysis.subjectImageUrl,
        { ...options, antiAlias, connectIslands, source: sourceImageUrl === extractedImageUrl ? "ai" : "upload", preserveSourceRatio: false },
        forcedColors,
        selectedFilter,
      );
      setPattern(next);
      setStep("pattern");
    } catch (err) {
      setError(err instanceof Error ? err.message : L("拼豆图纸生成失败", "Failed to generate bead pattern"));
    } finally {
      setLoading(false);
    }
  };

  const configRegenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConfigRef = useRef<string>("");

  // 当步骤为 pattern 且右下角配置参数变化时，防抖自动重新生成拼豆图纸
  useEffect(() => {
    if (step !== "pattern" || !extractedImageUrl) return;
    const configKey = JSON.stringify({ options, antiAlias, forcedColors, selectedFilter });
    // 首次进入 pattern 时不重复触发
    if (!prevConfigRef.current) {
      prevConfigRef.current = configKey;
      return;
    }
    if (configKey === prevConfigRef.current) return;
    prevConfigRef.current = configKey;

    if (configRegenTimerRef.current) clearTimeout(configRegenTimerRef.current);
    configRegenTimerRef.current = setTimeout(() => {
      buildPatternFromExtracted();
    }, 500);
    return () => {
      if (configRegenTimerRef.current) clearTimeout(configRegenTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, extractedImageUrl, options, antiAlias, connectIslands, forcedColors, selectedFilter]);

  const handleGenerateAI = async (promptOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-culture-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...options,
          prompt: promptOverride,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? L("AI 图案生成失败", "AI pattern generation failed"));
      resetAutoSaveTracking();
      directOutputRef.current = true;
      setForcedColors(selectedCultureTheme?.paletteHints ?? []);
      setSubjectAnalysis(null);
      setSubjectMaskSnapshot(null);
      clearSubjectIdentification();
      setSubjectDirty(false);
      setSourceImageUrl(result.imageUrl);
      setExtractedImageUrl(result.imageUrl);
      clearResultSubjectSelection();
      setExtractPrompt(result.prompt);
      clearPatternArtifacts();
      setStep("extract");
    } catch (err) {
      setError(err instanceof Error ? err.message : L("AI 图案生成失败", "AI pattern generation failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectAnalysis = useCallback((analysis: SubjectAnalysis) => {
    setSubjectAnalysis(analysis);
    setSubjectIdentification(null);
    setSubjectIdentificationPrompt(null);
    if (directOutputRef.current) {
      setResultSubjectAnalysis(analysis);
      setSubjectDirty(false);
      return;
    }
    setSubjectDirty(true);
  }, []);

  const handleSourceMaskSnapshotChange = useCallback((mask: SubjectMask | null) => {
    setSubjectMaskSnapshot(mask);
    if (directOutputRef.current) {
      setResultMaskSnapshot(mask);
      setResultMaskSyncVersion((value) => value + 1);
    }
  }, []);

  const identifySubject = useCallback(async () => {
    if (!subjectAnalysis) {
      setToastType("warning");
      setToastMsg(L("请先在左侧完成主体区域选择。", "Select the subject area on the left first."));
      return;
    }

    setSubjectIdentificationLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/identify-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: subjectAnalysis.subjectImageUrl,
          config: loadApiConfig(),
          language,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? L("主体识别失败", "Subject identification failed"));
      if (!isSubjectIdentification(result?.identification)) {
        throw new Error(L("主体识别接口未返回有效识别结果。", "Subject identification did not return a valid result."));
      }
      setSubjectIdentification(result.identification);
      setSubjectIdentificationPrompt(result.prompt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : L("主体识别失败", "Subject identification failed"));
    } finally {
      setSubjectIdentificationLoading(false);
    }
  }, [language, L, subjectAnalysis]);

  const generateSubjectRecreation = useCallback(async (promptOverride?: string) => {
    if (directOutputRef.current) return;
    if (!subjectAnalysis) {
      setError(null);
      setToastType("warning");
      setToastMsg(L("请先在左侧完成主体区域选择。", "Select the subject area on the left first."));
      return;
    }
    if (!subjectIdentification) {
      setError(null);
      setToastType("warning");
      setToastMsg(L("请先完成主体识别，确认或修改识别结果后再进行 AI 再创作。", "Identify the subject, then confirm or edit the result before AI recreation."));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extract-theme-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isUpload: true,
          subjectIdentification,
          product: formLabel,
          productPrompt: product.aiPrompt,
          aspectRatio,
          sourceColorSummary: subjectAnalysis.colorSummary,
          sourceColors: subjectAnalysis.colors,
          prompt: promptOverride,
          language,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? L("主体提取失败", "Subject recreation failed"));
      setExtractedImageUrl(result.imageUrl);
      clearResultSubjectSelection();
      setExtractPrompt(result.prompt);
      clearPatternArtifacts();
      setSubjectDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : L("抠图结果转传统文创图案失败", "Failed to turn the subject into a cultural pattern"));
    } finally {
      setLoading(false);
    }
  }, [aspectRatio, clearPatternArtifacts, clearResultSubjectSelection, formLabel, language, L, product.aiPrompt, subjectAnalysis, subjectIdentification]);

  const renderImageBox = (url: string | null, alt: string) => (
    <div className="aspect-square overflow-hidden rounded-md border border-stone-200 bg-stone-50">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full place-items-center text-sm text-stone-400">{L("暂无图像", "No image")}</div>
      )}
    </div>
  );
  void renderImageBox;

  const renderSubjectIdentificationEditor = (context: "extract" | "preview") => {
    const identification = subjectIdentification ?? emptySubjectIdentification;
    const editable = context === "extract";

    return (
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{context === "extract" ? L("主体识别结果", "Subject Identification") : L("文化说明识别依据", "Cultural Copy Evidence")}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              {context === "extract"
                ? L("AI 先识别主体并生成结构化信息。你可以修改后再用于 AI 再创作。", "AI identifies the subject and creates structured information. You can edit it before AI recreation.")
                : L("文化说明会同时读取这份主体信息和当前再创作图像。", "The cultural copy uses this subject information together with the current recreated image.")}
            </p>
          </div>
          {context === "extract" && (
            <button
              type="button"
              onClick={identifySubject}
              disabled={subjectIdentificationLoading || !subjectAnalysis}
              className="rounded-md bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {subjectIdentificationLoading ? L("识别中...", "Identifying...") : subjectIdentification ? L("重新识别主体", "Identify Again") : L("AI 识别主体", "Identify Subject")}
            </button>
          )}
        </div>

        {subjectIdentification ? (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium">
                {L("主体名称", "Subject Name")}
                <input
                  value={identification.subject}
                  disabled={!editable}
                  onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), subject: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                />
              </label>
              <label className="text-sm font-medium">
                {L("类别", "Category")}
                <input
                  value={identification.category}
                  disabled={!editable}
                  onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), category: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                />
              </label>
            </div>
            <label className="text-sm font-medium">
              {L("视觉证据", "Visual Evidence")}
              <textarea
                value={identification.evidence.join("\n")}
                disabled={!editable}
                rows={4}
                onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), evidence: splitLines(event.target.value) }))}
                className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                placeholder={L("每行一条证据", "One evidence item per line")}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-[1fr_160px]">
              <label className="text-sm font-medium">
                {L("备选识别", "Alternatives")}
                <textarea
                  value={identification.alternatives.join("\n")}
                  disabled={!editable}
                  rows={3}
                  onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), alternatives: splitLines(event.target.value) }))}
                  className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                  placeholder={L("每行一个备选", "One alternative per line")}
                />
              </label>
              <label className="text-sm font-medium">
                {L("置信度", "Confidence")}
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={identification.confidence}
                  disabled={!editable}
                  onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), confidence: Number(event.target.value) }))}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                />
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full bg-[#33596a]" style={{ width: `${Math.max(0, Math.min(100, identification.confidence * 100))}%` }} />
                </div>
              </label>
            </div>
            <label className="text-sm font-medium">
              {L("视觉摘要", "Visual Summary")}
              <textarea
                value={identification.visualSummary}
                disabled={!editable}
                rows={4}
                onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), visualSummary: event.target.value }))}
                className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
              />
            </label>
            <div className="rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-600 whitespace-pre-wrap">
              {formatSubjectIdentificationLocal(identification)}
            </div>
            {context === "extract" && subjectIdentificationPrompt && (
              <details className="rounded-md border border-stone-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium text-stone-700">{L("查看主体识别提示词", "View Subject Identification Prompt")}</summary>
                <div className="mt-3 max-h-36 overflow-y-auto rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-600 font-mono whitespace-pre-wrap">
                  {subjectIdentificationPrompt}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-sm leading-6 text-stone-500">
            {context === "extract"
              ? L("完成左侧主体区域选择后，点击“AI 识别主体”生成主体名称、类别、证据、置信度和备选项。", "After selecting the subject area on the left, click Identify Subject to generate name, category, evidence, confidence, and alternatives.")
              : L("步骤二尚未生成主体识别结果。", "Step 2 has not generated subject identification yet.")}
          </div>
        )}
      </section>
    );
  };

  const renderStep = () => {
    if (step === "config") {
      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">{L("配置传统文化拼豆方案", "Configure Cultural Bead Design")}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">{L("选择主题、核心元素、叙述、作品形式、比例与网格参数。", "Choose the theme, core element, notes, product type, ratio, and grid settings.")}</p>
            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-medium">
                {L("传统主题", "Traditional Theme")}
                <select
                  value={theme}
                  onChange={(event) => handleThemeInput(event.target.value)}
                  className="mt-1.5 max-h-64 w-full rounded-md border border-stone-300 bg-white px-3 py-1.5"
                >
                  {cultureThemes.map((item) => (
                    <option key={item.id} value={item.name}>
                      {displayThemeName(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {L("核心元素", "Core Element")}
                <input
                  list="culture-element-options"
                  value={displayElementName(element)}
                  onChange={(event) => setElement(event.target.value)}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2"
                />
                <datalist id="culture-element-options">
                  {(selectedCultureTheme?.elements ?? []).map((item) => (
                    <option key={item} value={displayElementName(item)} />
                  ))}
                </datalist>
                {selectedCultureTheme && (
                  <div className="mt-3 space-y-3">
                    {isBijiangTheme && (
                      <div className="flex flex-wrap gap-2" aria-label={L("核心元素分类筛选", "Core element category filters")}>
                        {bijiangElementGroups.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => setElementGroupId(group.id)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                              elementGroupId === group.id
                                ? "border-[#b57938] bg-[#b57938] text-white"
                                : "border-[#b57938]/20 bg-[#b57938]/5 text-[#8a5a2b] hover:border-[#b57938]/50"
                            }`}
                          >
                            {group.label} · {group.elements.length}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
                    {filteredCultureElements.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setElement(item);
                          setMeaning(selectedCultureTheme.elementMeanings?.[item] ?? selectedCultureTheme.meaning);
                        }}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          element === item
                            ? "border-[#33596a] bg-[#33596a] text-white"
                            : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-400"
                        }`}
                      >
                        {displayElementName(item)}
                      </button>
                    ))}
                    </div>
                  </div>
                )}
              </label>
              <label className="text-sm font-medium">
                {L("文化叙述", "Cultural Notes")}
                <textarea value={displayMeaning(meaning)} onChange={(event) => setMeaning(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2" />
              </label>
              {isBijiangTheme && (
                <section className="rounded-md border border-[#33596a]/20 bg-[#f3efe7]/60 p-4" aria-live="polite">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[#33596a]">{L("结构特征与生成约束", "Structural Features & Generation Constraints")}</h3>
                    <span className="shrink-0 rounded-full bg-[#33596a]/10 px-2 py-1 text-[11px] font-medium text-[#33596a]">{elementStructure.length} {L("字", "chars")}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-700">
                    {elementStructure || L("请从上方选择碧江文化元素以查看结构特征。", "Select a Bijiang cultural element above to view its structural features.")}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-stone-500">
                    {L("该内容为只读稳定性约束，会自动加入 AI 生成提示词，不会覆盖可编辑的文化叙述。", "This read-only stability constraint is automatically appended to the AI prompt without replacing your editable cultural notes.")}
                  </p>
                </section>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">
                  {L("作品形式", "Product Type")}
                  <select value={productId} onChange={(event) => applyProductConfigDefault(event.target.value)} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2">
                    {formLabels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {displayFormLabel(item.id, item.label)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  {L("画面比例", "Aspect Ratio")}
                  <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatioId)} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2">
                    {aspectRatios.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">
                  {L("网格尺寸", "Grid Size")}：{gridSize} x {gridSize}
                  <input type="range" min={16} max={128} step={8} value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className="mt-3 w-full" />
                </label>
                <label className="text-sm font-medium">
                  {L("颜色上限", "Color Limit")}：{colorCount} {L("色", "colors")}
                  <input type="range" min={2} max={128} step={2} value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))} className="mt-3 w-full" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  {L("显示网格", "Show Grid")}
                  <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  {L("平滑杂点", "Smooth Speckles")}
                  <input type="checkbox" checked={antiAlias} onChange={(event) => setAntiAlias(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  {L("连接孤立色块", "Connect Isolated Blocks")}
                  <input type="checkbox" checked={connectIslands} onChange={(event) => setConnectIslands(event.target.checked)} />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (hasUnsavedWork) { setConfirmNew("ai"); return; }
                    handleGenerateAI();
                  }}
                  disabled={loading}
                  className="rounded-md bg-[#33596a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? L("生成中...", "Generating...") : L("AI 生成图案", "Generate AI Pattern")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (hasUnsavedWork) { setConfirmNew("sample"); return; }
                    doUseSample();
                  }}
                  className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold"
                >
                  {L("使用内置样例", "Use Built-in Sample")}
                </button>
                <label className="cursor-pointer rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">
                  {L("上传图片", "Upload Image")}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (hasUnsavedWork) {
                      setConfirmNew("upload");
                      // 存下文件引用，确认后再处理
                      pendingUploadRef.current = file;
                      return;
                    }
                    void doUpload(file);
                    event.currentTarget.value = "";
                  }} />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">{L("调色板", "Palette")}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">{L("按色系筛选可用颜色，点击选择要纳入最终色表的颜色，已选颜色会标注选择顺序。", "Filter available colors by family. Click colors to include them in the final palette; selected colors show their order.")}</p>
            {forcedColorWarning && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{forcedColorWarning}</div>}
            {/* 色系分类菜单 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {COLOR_FAMILIES.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setColorFamily(f.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    colorFamily === f.key
                      ? "bg-[#33596a] text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {f.icon} {language === "en" ? colorFamilyLabelEn[f.key] : f.key}
                </button>
              ))}
            </div>
            {/* 已选颜色展示 */}
            {forcedColors.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-stone-50 p-2">
                <span className="mr-1 text-xs font-medium text-stone-500">{L("已选：", "Selected:")}</span>
                {forcedColors.map((hex, index) => {
                  const key = getDisplayColorKey(hex);
                  return (
                    <span
                      key={hex}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: hex }}
                      title={`${key} ${hex}`}
                    >
                      #{index + 1}
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setForcedColors([])}
                  className="ml-1 text-xs text-stone-400 hover:text-red-500"
                >
                  {L("清空", "Clear")}
                </button>
              </div>
            )}
            {/* 色板网格 */}
            <div className="mt-2 flex max-h-80 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-stone-200 p-2">
              {filterColorsByFamily(paletteColors, colorFamily).map((item) => {
                const selectedIndex = forcedColors.indexOf(item.color);
                const selected = selectedIndex !== -1;
                return (
                  <button
                    key={item.color}
                    type="button"
                    title={`${selected ? L(`已选第 ${selectedIndex + 1} 个`, `Selected #${selectedIndex + 1}`) : L("点击选择", "Click to select")}：${item.key} ${item.color}`}
                    onClick={() => setForcedColors((prev) => (selected ? prev.filter((hex) => hex !== item.color) : [...prev, item.color]))}
                    className={`relative h-7 w-7 rounded border transition ${selected ? "border-stone-950 ring-2 ring-[#33596a]" : "border-stone-200 hover:scale-110"}`}
                    style={{ backgroundColor: item.color }}
                  >
                    {selected && (
                      <span className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full border border-stone-950 bg-white px-0.5 text-[9px] font-bold leading-none text-stone-950 shadow-sm">
                        {selectedIndex + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* 滤镜区域 */}
            <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{L("滤镜", "Filter")}</span>
                <FilterDropdown value={selectedFilter} onChange={(value) => setSelectedFilter(value)} language={language} />
              </div>
              {selectedFilter !== "none" && (
                <div className="mt-2 text-xs text-stone-500 leading-relaxed">
                  {language === "en" ? "Keep or apply a selected image color filter." : IMAGE_FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.desc ?? "保持原始色彩"}
                </div>
              )}
            </div>
          </section>
        </div>
      );
    }

    if (step === "extract") {
      const directGeneratedImage = !!sourceImageUrl && extractedImageUrl === sourceImageUrl;
      return (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{L("原图", "Source Image")}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {L("交互式主体识别：请点击图像中的主体。绿色蒙版表示将进入拼豆化的主体范围；识别不准时，可切换增加或减少并用画笔修正。", "Interactive subject selection: click the subject in the image. The green mask marks the area to convert into beads; use add/subtract tools to refine it.")}
              </p>
            </div>
            <SubjectMaskEditor
              imageUrl={sourceImageUrl}
              loading={loading}
              autoDetect={true}
              initialSelection={directGeneratedImage ? "auto" : "full"}
              mode={subjectMaskMode}
              language={language}
              savedMask={subjectMaskSnapshot}
              onModeChange={setSubjectMaskMode}
              onSubjectChange={handleSubjectAnalysis}
              onMaskSnapshotChange={handleSourceMaskSnapshotChange}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">
                {L("重新上传", "Upload Again")}
                <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void doUpload(file);
                  event.currentTarget.value = "";
                }} />
              </label>
            </div>
          </section>
          <div className="space-y-5">
            {renderSubjectIdentificationEditor("extract")}
            {!directGeneratedImage && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="text-xl font-semibold">{L("AI 再创作", "AI Recreation")}</h2>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  {L("左侧主体识别只在本地计算蒙版和裁切主体。点击此按钮后，才会把主体裁切图发送给 AI 生成传统文化风格输出图像。", "The left subject selection only computes the mask locally. This button sends the confirmed subject information to AI for a cultural-style recreated image.")}
                </p>
                <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                  {L("当前再创作请求只发送主体识别 JSON，不发送主体图片。", "This recreation request sends subject identification JSON only, not the subject image.")}
                </div>
                {subjectDirty && extractedImageUrl && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {L("主体区域已变化，需要重新 AI 再创作后再生成拼豆图纸。", "The subject area changed. Re-run AI recreation before generating the bead pattern.")}
                  </div>
                )}
                {!extractPrompt && (
                  <button
                    type="button"
                    onClick={() => generateSubjectRecreation()}
                    disabled={loading || !subjectAnalysis || !subjectIdentification}
                    className="mt-4 rounded-md bg-[#33596a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {loading ? L("生成中...", "Generating...") : L("AI 再创作", "AI Recreation")}
                  </button>
                )}
              </section>
            )}
            {extractPrompt && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{L("当前 AI 提示词", "Current AI Prompt")}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      if (directGeneratedImage) {
                        void handleGenerateAI(extractPrompt);
                      } else {
                        void generateSubjectRecreation(extractPrompt);
                      }
                    }}
                    disabled={loading || (!directGeneratedImage && (!subjectAnalysis || !subjectIdentification))}
                    className="rounded-md bg-[#33596a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {loading ? L("生成中...", "Generating...") : L("重新 AI 生成", "Regenerate with AI")}
                  </button>
                </div>
                <textarea
                  value={extractPrompt}
                  onChange={(event) => setExtractPrompt(event.target.value)}
                  rows={10}
                  className="mt-3 w-full resize-y rounded-md border border-stone-300 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-700"
                />
              </section>
            )}
            <section className="rounded-lg border border-stone-200 bg-white p-5">
              <h2 className="text-xl font-semibold">{L("创作结果", "Creation Result")}</h2>
              <div className="mt-4">
                <SubjectMaskEditor
                  key={`${extractedImageUrl ?? "empty"}-${directGeneratedImage ? resultMaskSyncVersion : 0}`}
                  imageUrl={extractedImageUrl}
                  loading={loading}
                  autoDetect={!directGeneratedImage}
                  initialSelection={directGeneratedImage ? "empty" : "auto"}
                  showHeader={false}
                  mode={resultMaskMode}
                  language={language}
                  savedMask={resultMaskSnapshot}
                  onModeChange={setResultMaskMode}
                  onSubjectChange={setResultSubjectAnalysis}
                  onMaskSnapshotChange={setResultMaskSnapshot}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={buildPatternFromExtracted} disabled={loading || !extractedImageUrl || (!directGeneratedImage && subjectDirty)} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {loading ? L("生成中...", "Generating...") : L("生成拼豆图纸", "Generate Bead Pattern")}
                </button>
              </div>
            </section>
          </div>
        </div>
      );
    }

    if (step === "pattern") {
      const total = beadCounts.reduce((sum, item) => sum + item.count, 0);
      const beadingMinutes = estimateBeadingMinutes(total, beadCounts.length);
      
      // 处理画布点击：拼豆图纸上点击网格修改颜色
      const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!pattern || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // 计算缩放比例（canvas 内部像素 / CSS 显示尺寸）
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        // renderPatternToCanvas 内部参数
        const cell = Math.max(12, Math.floor(2000 / Math.max(pattern.width, pattern.height)));
        const labelWidth = 32;
        const labelHeight = 20;
        
        // 转换到 canvas 像素坐标
        const canvasX = clickX * scaleX;
        const canvasY = clickY * scaleY;
        
        // 减去标签边距，得到网格坐标
        const gridCol = Math.floor((canvasX - labelWidth) / cell);
        const gridRow = Math.floor((canvasY - labelHeight) / cell);
        
        // 检查是否在网格范围内
        if (gridCol < 0 || gridCol >= pattern.width || gridRow < 0 || gridRow >= pattern.height) return;
        
        const cellData = pattern.grid[gridRow]?.[gridCol];
        if (!cellData || cellData.isExternal) return;
        setHighlightedPatternColor(cellData.color);
        if (!isPainting) return;
        
        // 更新该像素的颜色
        const newGrid = pattern.grid.map((row, y) =>
          row.map((pixel, x) => {
            if (x === gridCol && y === gridRow && !pixel.isExternal) {
              return { ...pixel, color: paintColor, key: paintColorKey };
            }
            return pixel;
          })
        );
        
        const updatedPattern: BeadPattern = {
          ...pattern,
          grid: newGrid,
          palette: Array.from(new Set(newGrid.flat().filter(c => !c.isExternal).map(c => c.color))),
        };
        
        setPattern(updatedPattern);
      };
      
      // 获取当前图纸中使用的颜色列表（用于颜色选择器）
      const patternColors = pattern
        ? Array.from(new Set(pattern.grid.flat().filter(c => !c.isExternal).map(c => c.color)))
            .map(hex => ({ hex, key: getDisplayColorKey(hex) }))
        : [];
      
      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{L("拼豆图纸", "Bead Pattern")}</h2>
                <p className="mt-1 text-sm text-stone-500">{L("当前使用开源传统色号标注，不包含外部供应专属字段。", "Uses open heritage color labels and no vendor-specific fields.")}</p>
              </div>
              <div className="flex gap-2">
                {patternUrl && (
                  <button type="button" onClick={() => downloadUrl(patternUrl, "traditional-bead-pattern.png")} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold">
                    {L("下载图纸", "Download Pattern")}
                  </button>
                )}
                <button type="button" onClick={() => downloadBeadCsv(beadCounts, "traditional-bead-counts.csv")} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold">
                  {L("下载用量 CSV", "Download Counts CSV")}
                </button>
              </div>
              </div>
              {pattern && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-stone-200 bg-stone-50 p-2">
                  <button
                    type="button"
                    onClick={() => setIsPainting(!isPainting)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      isPainting
                        ? 'bg-[#33596a] text-white shadow-sm'
                        : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {isPainting ? L("编辑中", "Editing") : L("点击编辑", "Edit Cells")}
                  </button>
                  {isPainting && (
                    <span className="text-xs text-stone-500 ml-1">
                      {L("在图纸上点击格子修改颜色 | 当前颜色：", "Click cells on the pattern to change colors | Current color:")}
                    </span>
                  )}
                  {isPainting && (
                    <span
                      className="inline-block h-5 w-5 rounded border border-stone-400"
                      style={{ backgroundColor: paintColor }}
                      title={`${paintColorKey} ${paintColor}`}
                    />
                  )}
                  {isPainting && paintColorKey && (
                    <span className="text-xs font-mono text-stone-600">{paintColorKey}</span>
                  )}
                  {/* 颜色选择器 */}
                  {isPainting && patternColors.length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-2 border-l border-stone-300 pl-2">
                      {patternColors.map(({ hex, key }) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => {
                            setHighlightedPatternColor(hex);
                            setPaintColor(hex);
                            setPaintColorKey(key);
                          }}
                          className={`h-6 w-6 rounded border transition hover:scale-110 ${
                            paintColor === hex
                              ? 'border-stone-950 ring-2 ring-[#33596a] scale-110'
                              : 'border-stone-400'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={`${key} ${hex}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 overflow-auto rounded-md border border-stone-200 bg-stone-50 p-4">
                {pattern ? (
                  <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    className={`mx-auto max-w-full ${isPainting ? 'cursor-crosshair' : ''}`}
                  />
                ) : (
                  <div className="grid min-h-64 place-items-center text-center">
                    <div>
                      <p className="text-sm text-stone-500">{L("第三阶段会把主题提取图案转换成拼豆网格。", "Stage 3 converts the extracted design into a bead grid.")}</p>
                      <button type="button" onClick={buildPatternFromExtracted} disabled={loading || !extractedImageUrl} className="mt-3 rounded-md bg-[#33596a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                        {loading ? L("生成中...", "Generating...") : L("生成拼豆图纸", "Generate Bead Pattern")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

          <div className="flex flex-col gap-6 overflow-y-auto">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">{L("用量统计", "Material Counts")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center md:grid-cols-4">
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">{L("总颗数", "Total Beads")}</p>
                <p className="text-lg font-bold">{total}</p>
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">{L("颜色数", "Colors")}</p>
                <p className="text-lg font-bold">{beadCounts.length}</p>
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">{L("网格", "Grid")}</p>
                <p className="text-lg font-bold">{pattern ? `${pattern.width}x${pattern.height}` : "-"}</p>
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">{L("预估用时", "Estimated Time")}</p>
                <p className="text-lg font-bold">{formatDurationLocal(beadingMinutes)}</p>
              </div>
            </div>
            <div className="mt-4 max-h-[480px] overflow-auto rounded-md border border-stone-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-100 text-left text-stone-600">
                  <tr>
                    <th className="px-3 py-2">{L("颜色", "Color")}</th>
                    <th className="px-3 py-2">{L("色号", "Code")}</th>
                    <th className="px-3 py-2 text-right">{L("数量", "Count")}</th>
                    <th className="px-3 py-2">{L("用途", "Use")}</th>
                  </tr>
                </thead>
                <tbody>
                  {beadCounts.map((item) => (
                    <tr
                      key={item.rgb}
                      className="cursor-pointer border-t border-stone-200 hover:bg-stone-50"
                      onClick={() => {
                        setHighlightedPatternColor(item.rgb);
                        setPaintColor(item.rgb);
                        setPaintColorKey(item.brandCode);
                      }}
                      title={L("点击选择该颜色作为编辑颜色", "Click to use this color for editing")}
                    >
                      <td className="px-3 py-2">
                        <span className="mr-2 inline-block h-4 w-4 rounded-sm border border-stone-300 align-middle" style={{ backgroundColor: item.rgb }} />
                        {item.rgb}
                      </td>
                      <td className="px-3 py-2 font-mono">{item.brandCode}</td>
                      <td className="px-3 py-2 text-right">{item.count}</td>
                      <td className="px-3 py-2">{language === "en" ? beadUsageEn[item.usage] ?? item.usage : item.usage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">{L("当前配置", "Current Settings")}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">{L("可在此直接调整参数，图纸将实时刷新。", "Adjust settings here; the pattern refreshes automatically.")}</p>
            <div className="mt-3 grid gap-3">
              <label className="text-sm font-medium">
                {L("作品形式", "Product Type")}
                <select value={productId} onChange={(event) => applyProductConfigDefault(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
                  {formLabels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {displayFormLabel(item.id, item.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {L("画面比例", "Aspect Ratio")}
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatioId)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
                  {aspectRatios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {L("网格尺寸", "Grid Size")}：{gridSize}
                <input type="range" min={16} max={128} step={8} value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <label className="text-sm font-medium">
                {L("颜色上限", "Color Limit")}：{colorCount} {L("色", "colors")}
                <input type="range" min={2} max={128} step={2} value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  {L("显示网格", "Show Grid")}
                  <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  {L("平滑杂点", "Smooth Speckles")}
                  <input type="checkbox" checked={antiAlias} onChange={(event) => setAntiAlias(event.target.checked)} />
                </label>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{L("滤镜", "Filter")}</span>
                  <FilterDropdown value={selectedFilter} onChange={(value) => setSelectedFilter(value)} language={language} />
                </div>
                {selectedFilter !== "none" && (
                  <div className="mt-2 text-xs text-stone-500 leading-relaxed">
                    {language === "en" ? "Keep or apply a selected image color filter." : IMAGE_FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.desc ?? "保持原始色彩"}
                  </div>
                )}
              </div>
            </div>
          </section>
          </div>
        </div>
      );
    }

    const total = beadCounts.reduce((sum, item) => sum + item.count, 0);
    const beadingMinutes = estimateBeadingMinutes(total, beadCounts.length);
    const cost = estimateMaterialCost(total, beadCounts.length);
    const workTitle = aiCultureCopy?.title?.trim() || (language === "en" ? `${displayElementName(element)} ${formLabel}` : `${element}${formLabel}`);
    const planText = [
      language === "en" ? `${workTitle} Bead Making Plan` : `${workTitle} 拼豆制作方案`,
      "",
      language === "en" ? `Product type: ${formLabel}` : `作品形式：${formLabel}`,
      language === "en" ? `Grid: ${pattern ? `${pattern.width} x ${pattern.height}` : "-"}` : `网格：${pattern ? `${pattern.width} x ${pattern.height}` : "-"}`,
      language === "en" ? `Colors: ${beadCounts.length}` : `颜色数：${beadCounts.length}`,
      language === "en" ? `Total beads: ${total}` : `拼豆总数：${total}`,
      language === "en" ? `Estimated beading time: ${formatDurationLocal(beadingMinutes)}` : `预估拼豆用时：${formatDuration(beadingMinutes)}`,
      language === "en" ? `Estimated material cost: about RMB ${cost.min}-${cost.max}` : `预估材料成本：约 ${cost.min}-${cost.max} 元`,
      "",
      L("材料选择：", "Materials:"),
      L("1. 按材料清单准备对应色号拼豆，建议每种颜色比统计数量多准备 10%-15%。", "1. Prepare beads by the material list; keep 10%-15% extra for each color."),
      L("2. 优先选择同一规格、同一品牌或尺寸一致的 5mm 拼豆，避免熨烫高度不一致。", "2. Prefer beads of the same size and brand to avoid uneven ironing height."),
      L("3. 大面积底色可多准备一包，少量点缀色按最小包装购买即可。", "3. Prepare extra packs for large base colors and minimum packs for small accents."),
      "",
      L("工具选择：", "Tools:"),
      L("1. 透明方形模板板，尺寸需覆盖当前图纸网格。", "1. Transparent square pegboard large enough for the full grid."),
      L("2. 尖头镊子或取豆笔，用于定位小色块和边缘细节。", "2. Fine tweezers or bead pen for small blocks and edges."),
      L("3. 熨斗、烘焙纸或专用熨烫纸、平整压板。", "3. Iron, parchment or ironing paper, and a flat press board."),
      "",
      L("拼豆步骤：", "Beading Steps:"),
      L("1. 从边缘轮廓或最大色块开始摆放，减少整体偏移。", "1. Start from the outer contour or largest color blocks to reduce drift."),
      L("2. 每完成一种颜色，对照图纸和用量统计检查遗漏。", "2. After each color, check the pattern and counts for missed cells."),
      L("3. 小面积颜色最后补齐，避免移动模板时松散。", "3. Add small accent colors last to avoid shifting loose beads."),
      "",
      L("熨烫步骤与注意事项：", "Ironing Notes:"),
      L("1. 覆盖熨烫纸后使用中低温，不要开蒸汽。", "1. Cover with ironing paper, use medium-low heat, and turn off steam."),
      L("2. 以小圆周移动熨斗，先轻压 10-15 秒观察融合状态，再逐步补熨。", "2. Move the iron in small circles; press lightly for 10-15 seconds first, then continue as needed."),
      L("3. 豆孔略收缩且相邻豆粒连接即可停止，避免过熨导致图案变形。", "3. Stop when holes shrink slightly and neighboring beads connect."),
      L("4. 熨完后用平整重物压 2-3 分钟，冷却后再从模板上取下。", "4. Press flat for 2-3 minutes after ironing, then remove after cooling."),
    ].join("\n");

    return (
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="space-y-5">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{L("制作方案", "Making Plan")}</h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-500">{L("根据当前图纸用量，提供材料、工具、拼豆和熨烫流程参考。", "Provides materials, tools, bead placement, and ironing guidance from the current pattern counts.")}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">

              <div className="relative rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">{L("预估成本", "Estimated Cost")}</p>
                <button type="button" onClick={() => setCostDropdownOpen(!costDropdownOpen)} className="w-full text-left text-lg font-bold hover:text-stone-700">{L("约", "About")} {cost.min}-{cost.max} {L("元", "RMB")}</button>
                {costDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-stone-200 bg-white p-3 shadow-lg">
                    <p className="text-xs font-medium text-stone-500">{L("成本组成", "Cost Breakdown")}</p>
                    <ul className="mt-2 space-y-1 text-xs text-stone-600">
                      <li className="flex justify-between"><span>{L("拼豆包数", "Bead Packs")}</span><span>{Math.max(beadCounts.length, Math.ceil((total * 1.15) / 1000))} {L("包", "packs")}</span></li>
                      <li className="flex justify-between"><span>{L("拼豆单价", "Pack Price")}</span><span>3~7 {L("元/包", "RMB/pack")}</span></li>
                      <li className="flex justify-between"><span>{L("模板板", "Pegboard")}</span><span>5~10 {L("元", "RMB")}</span></li>
                      <li className="flex justify-between"><span>{L("熨烫纸", "Ironing Paper")}</span><span>3~10 {L("元", "RMB")}</span></li>
                      <li className="mt-1 border-t border-stone-100 pt-1 font-medium">{L("合计", "Total")}：{cost.min}~{cost.max} {L("元", "RMB")}</li>
                    </ul>
                  </div>
                )}
              </div>
              <div className="relative rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">{L("拼豆用时", "Beading Time")}</p>
                <button type="button" onClick={() => setTimeDropdownOpen(!timeDropdownOpen)} className="w-full text-left text-lg font-bold hover:text-stone-700">{formatDurationLocal(beadingMinutes)}</button>
                {timeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-stone-200 bg-white p-3 shadow-lg">
                    <p className="text-xs font-medium text-stone-500">{L("用时组成", "Time Breakdown")}</p>
                    <ul className="mt-2 space-y-1 text-xs text-stone-600">
                      <li className="flex justify-between"><span>{L("单颗摆豆时间", "Per-bead time")}</span><span>{BEAD_TIME_PER_PIECE} {L("分钟/颗", "min/bead")}</span></li>
                      <li className="flex justify-between"><span>{L("摆豆总计", "Beading total")}（{total} {L("颗", "beads")}）</span><span>≈{formatDurationLocal(Math.round(total * BEAD_TIME_PER_PIECE))}</span></li>
                      <li className="flex justify-between"><span>{L("换色", "Color changes")}（{beadCounts.length} {L("色", "colors")} × 4 {L("分钟/色", "min/color")}）</span><span>{formatDurationLocal(beadCounts.length * 4)}</span></li>
                      <li className="flex justify-between"><span>{L("熨烫（含预热、熨烫、冷却）", "Ironing, preheating, and cooling")}</span><span>{formatDurationLocal(IRONING_TIME)}</span></li>
                      <li className="mt-1 border-t border-stone-100 pt-1 font-medium"><span>{L("合计", "Total")}</span><span>{L("约", "About")} {formatDurationLocal(beadingMinutes)}</span></li>

                    </ul>
                  </div>
                )}
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">{L("图纸规模", "Pattern Size")}</p>
                <p className="text-lg font-bold">{pattern ? `${pattern.width}x${pattern.height}` : "-"}</p>
              </div>
            </div>
          </div>

            <>
              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">{L("材料选择", "Materials")}</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
                  <li>{L("按用量统计准备对应色号拼豆，建议每种颜色多备 10%-15%，防止丢豆和色差补充。", "Prepare beads by the count table and keep 10%-15% extra for each color.")}</li>
                  <li>{L("优先使用同规格拼豆；同一作品不要混用高度差异明显的材料。", "Use beads of the same specification; avoid mixing visibly different heights.")}</li>
                  <li>{L("大色块颜色按整包准备，点缀色可按最小包装购买。", "Prepare full packs for large color areas and minimum packs for accent colors.")}</li>
                </ul>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">{L("采购清单（含淘宝购买）", "Shopping List (Taobao)")}</h3>
                  <button type="button" disabled={kit.items.length === 0} onClick={() => downloadKitCsv(kit, `${workTitle}-${language === "en" ? "shopping-list" : "采购清单"}.csv`)} className="rounded-md border border-[#33596a] px-3 py-1.5 text-xs font-semibold text-[#33596a] disabled:opacity-50">{L("导出采购清单 CSV", "Export Shopping List CSV")}</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-xs text-stone-500">
                        <th className="py-1 pr-3">{L("色号", "Code")}</th>
                        <th className="py-1 pr-3">{L("颗数", "Beads")}</th>
                        <th className="py-1 pr-3">{L("包数", "Packs")}</th>
                        <th className="py-1 pr-3">{L("单价", "Price")}</th>
                        <th className="py-1 pr-3">{L("小计", "Subtotal")}</th>
                        <th className="py-1">{L("购买", "Buy")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kit.items.map((item) => (
                        <tr key={`${item.colorCode}-${item.rgb}`} className="border-b border-stone-100">
                          <td className="py-1.5 pr-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-block h-3 w-3 rounded-sm border border-stone-300" style={{ backgroundColor: item.rgb }} />
                              {item.colorCode}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">{item.count}</td>
                          <td className="py-1.5 pr-3">{item.packs}</td>
                          <td className="py-1.5 pr-3">{item.pricePerPack}</td>
                          <td className="py-1.5 pr-3">{item.subtotal}</td>
                          <td className="py-1.5"><a href={item.buyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#33596a] underline">{L("淘宝购买", "Taobao")}</a></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td className="py-2 pr-3">{L("合计", "Total")}</td>
                        <td className="py-2 pr-3">{kit.totalBeads}</td>
                        <td className="py-2 pr-3">{kit.totalPacks}</td>
                        <td className="py-2 pr-3" />
                        <td className="py-2 pr-3">≈{kit.totalPrice} {L("元", "RMB")}</td>
                        <td className="py-2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="mt-2 text-xs text-stone-400">{L("单价 / 每包颗数 / 损耗为示例值，商科按淘宝实际数据填入 config/kitConfig.ts；未配置的色号自动跳转淘宝搜索。", "Price / pack size / waste are sample values; fill real Taobao data in config/kitConfig.ts. Unmapped codes link to Taobao search.")}</p>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{L("难度分级 L1–L5（智能简化）", "Difficulty Ladder L1–L5")}</h3>
                    <p className="mt-1 text-xs text-stone-500">{L("同一张图自动生成 5 个难度：感知减色 + 结构保持的碎块合并——越低越好拼，越高越精细。", "Auto-generate 5 versions: perceptual color reduction + structure-preserving region merge.")}</p>
                  </div>
                  <button type="button" disabled={!pattern || ladderLoading} onClick={generateLadder} className="shrink-0 rounded-md bg-[#33596a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{ladderLoading ? L("生成中...", "...") : L("生成难度阶梯", "Generate Ladder")}</button>
                </div>
                {ladder.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {ladder.map((item) => (
                      <div key={item.level} className="rounded-md border border-stone-200 p-2">
                        <div className="mb-1 text-xs font-semibold">L{item.level} {item.label}</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt={`L${item.level}`} className="aspect-square w-full rounded border border-stone-100 object-contain" />
                        <div className="mt-1 text-[11px] leading-4 text-stone-500">
                          {L("色号", "colors")} {item.stats.colorKinds}｜{L("豆", "beads")} {item.stats.beadCount}<br />
                          {L("碎块", "bits")} {item.stats.isolatedCount}
                        </div>
                        <button type="button" onClick={() => applyLadderLevel(item)} className="mt-1 w-full rounded border border-[#33596a] px-2 py-1 text-[11px] font-semibold text-[#33596a]">{L("用这档", "Use")}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">{L("工具选择", "Tools")}</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
                  <li>{L("模板板：透明方形板更适合对照网格，尺寸需覆盖完整图纸。", "Pegboard: a transparent square board works best for checking the grid.")}</li>
                  <li>{L("定位工具：尖头镊子适合调整边缘和孤立小色块，取豆笔适合大面积铺色。", "Positioning: tweezers handle edges and small blocks; a bead pen helps with large areas.")}</li>
                  <li>{L("熨烫工具：熨斗、熨烫纸、平整压板；熨斗需关闭蒸汽。", "Ironing: iron, ironing paper, and flat press board; turn off steam.")}</li>
                </ul>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">{L("拼豆", "Beading")}</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
                  <li>{L("先摆放外轮廓或最大色块，建立边界后再填内部细节。", "Start with the outer contour or largest color blocks, then fill details.")}</li>
                  <li>{L("按颜色逐项完成，每完成一种颜色就对照用量统计检查遗漏。", "Complete one color at a time and check the count table for missing cells.")}</li>
                  <li>{L("细小点缀色最后补齐，避免在大面积移动时被碰偏。", "Add small accents last to avoid shifting loose beads.")}</li>
                </ol>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">{L("熨烫", "Ironing")}</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
                  <li>{L("覆盖熨烫纸后使用中低温，先轻压并小范围圆周移动。", "Cover with ironing paper, use medium-low heat, and move in small circles.")}</li>
                  <li>{L("首次熨烫 10-15 秒后检查豆粒连接状态，再分段补熨。", "Check bead fusion after the first 10-15 seconds, then continue in stages.")}</li>
                  <li>{L("豆孔略收缩且相邻豆粒已连接即可停止，避免过熨导致图案变形。", "Stop once holes shrink slightly and neighboring beads connect.")}</li>
                  <li>{L("熨完用平整重物压 2-3 分钟，完全冷却后再脱板。", "Press flat for 2-3 minutes and remove after cooling.")}</li>
                </ol>
              </div>

              {renderSubjectIdentificationEditor("preview")}
              {culturePrompt && (
                <div className="rounded-lg border border-stone-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">{L("AI 文化文案提示词", "AI Cultural Copy Prompt")}</h2>
                    <button
                      type="button"
                      onClick={() => generateCultureText(culturePrompt)}
                      disabled={cultureTextLoading}
                      className="rounded-md bg-[#33596a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {cultureTextLoading ? L("AI 生成中...", "Generating...") : L("重新 AI 生成", "Regenerate with AI")}
                    </button>
                  </div>
                  <textarea
                    value={culturePrompt}
                    onChange={(event) => setCulturePrompt(event.target.value)}
                    rows={12}
                    className="mt-3 w-full resize-y rounded-md border border-stone-300 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-700"
                  />
                </div>
              )}
              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{L("文化说明", "Cultural Notes")}</h2>
                  {!culturePrompt && (
                    <button
                      type="button"
                      onClick={() => generateCultureText()}
                      disabled={cultureTextLoading}
                      className="rounded-md bg-[#33596a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {cultureTextLoading ? L("AI 生成中...", "Generating...") : L("AI 生成文化说明", "Generate Cultural Notes")}
                    </button>
                  )}
                </div>
                {aiCultureCopy ? (
                  <CultureExplanation copy={aiCultureCopy} language={language} />
                ) : (
                  <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-sm leading-6 text-stone-500">
                    {L("点击 AI 生成文化说明后，系统会读取当前再创作图像，并把作品名称、文化来源、图案寓意、设计说明分别填入对应模块。", "Click Generate Cultural Notes and the system will read the current recreated image, then fill in the title, cultural source, meaning, and design notes.")}
                  </div>
                )}
              </div>
            </>

        </section>

        <section className="space-y-5">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-3 text-xl font-semibold">{L("图纸预览", "Pattern Preview")}</h2>
            {patternUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={patternUrl} alt={L("拼豆图纸", "Bead Pattern")} className="max-h-[520px] w-full rounded-md border border-stone-200 object-contain" />
            ) : (
              <div className="grid min-h-64 place-items-center rounded-md bg-stone-50 text-sm text-stone-400">{L("暂无图纸", "No pattern")}</div>
            )}
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-3 text-xl font-semibold">{L("方案导出", "Export Plan")}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={!patternUrl} onClick={() => patternUrl && downloadUrl(patternUrl, `${workTitle}-${language === "en" ? "bead-pattern" : "拼豆图纸"}.png`)} className="rounded-md bg-[#33596a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{L("下载图纸 PNG", "Download Pattern PNG")}</button>
              <button type="button" disabled={!cleanPatternUrl} onClick={() => cleanPatternUrl && downloadUrl(cleanPatternUrl, `${workTitle}-${language === "en" ? "clean-pattern" : "无标注图纸"}.png`)} className="rounded-md bg-[#33596a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{L("下载无标注 PNG", "Download Clean PNG")}</button>
              <button type="button" disabled={beadCounts.length === 0} onClick={() => downloadBeadCsv(beadCounts, `${workTitle}-${language === "en" ? "materials" : "材料清单"}.csv`)} className="rounded-md bg-[#33596a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{L("导出材料 CSV", "Export Materials CSV")}</button>
              <button type="button" disabled={kit.items.length === 0} onClick={() => downloadKitCsv(kit, `${workTitle}-${language === "en" ? "shopping-list" : "采购清单"}.csv`)} className="rounded-md bg-[#33596a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{L("导出采购清单", "Export Shopping List")}</button>
              <button type="button" disabled={!pattern} onClick={() => downloadTextFile(planText, `${workTitle}-${language === "en" ? "making-plan" : "制作方案"}.txt`)} className="rounded-md bg-[#33596a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{L("导出制作方案", "Export Making Plan")}</button>
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{L("保存项目", "Save Project")}</h2>
                <p className="mt-1 text-sm leading-6 text-stone-500">{L("保存后可在“项目”页面和个人主页历史记录中继续编辑、恢复进度或发布到社区。", "After saving, continue editing from Projects or profile history, restore progress, or publish to the community.")}</p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                {currentProjectIdRef.current ? L("更新现有项目", "Update Existing Project") : L("创建新项目", "Create New Project")}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-stone-700">
                {L("项目名称", "Project Name")}
                <input
                  type="text"
                  value={projectTitleDraft}
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    setProjectTitleDraft(nextTitle);
                    setProjectTitleManual(nextTitle.trim().length > 0 && nextTitle.trim() !== defaultProjectTitle);
                  }}
                  placeholder={defaultProjectTitle}
                  className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#33596a] focus:ring-2 focus:ring-[#33596a]/20"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={saveCurrentProject}
                  disabled={!sourceImageUrl && !pattern && !patternUrl}
                  className="rounded-md bg-[#33596a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {L("保存到项目", "Save to Projects")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void saveCurrentProject().then((saved) => {
                      if (saved) setView("projects");
                    });
                  }}
                  disabled={!sourceImageUrl && !pattern && !patternUrl}
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
                >
                  {L("保存并查看项目", "Save and View Projects")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void saveCurrentProject().then((saved) => {
                      if (saved) setView("profile");
                    });
                  }}
                  disabled={!sourceImageUrl && !pattern && !patternUrl}
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
                >
                  {L("保存并查看历史", "Save and View History")}
                </button>
                <button
                  type="button"
                  onClick={publishCurrentWork}
                  disabled={!sourceImageUrl && !pattern && !patternUrl}
                  className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
                >
                  {L("保存后发布到社区", "Save and Publish")}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const handleRestoreProject = useCallback((record: ProjectRecord, navigateToStudio = true) => {
    const templatePreview = getImportedTemplatePreview(record);
    const restoredSourceImageUrl = record.sourceImageUrl ?? templatePreview;
    const restoredExtractedImageUrl = record.extractedImageUrl ?? templatePreview;
    const restoredStep: StudioStep = record.currentStep
      ?? (record.patternData || record.patternUrl
        ? (record.completed ? "preview" : "pattern")
        : (restoredExtractedImageUrl || restoredSourceImageUrl ? "extract" : "config"));
    restoringRef.current = true;
    currentProjectIdRef.current = record.id;
    lastAutoSaveSignatureRef.current = "";
    setProjectTitleDraft(record.title);
    setProjectTitleManual(record.title.trim() !== buildDefaultProjectTitle(
      record.theme,
      record.element,
      formLabels.find((item) => item.id === record.productId)?.label ?? "拼豆底板",
    ));
    // 恢复所有状态
    setTheme(record.theme);
    setElement(record.element);
    setMeaning(record.meaning ?? cultureThemes.find((item) => item.name === record.theme)?.meaning ?? "");
    setProductId(record.productId);
    setGridSize(record.gridSize);
    setColorCount(record.colorCount);
    setAspectRatio(record.aspectRatio as AspectRatioId);
    setShowGrid(record.showGrid);
    setAntiAlias(record.antiAlias);
    setConnectIslands(record.connectIslands ?? true);
    setSelectedFilter(record.selectedFilter ?? "none");
    setForcedColors(record.forcedColors ?? []);
    directOutputRef.current = !!restoredSourceImageUrl && restoredExtractedImageUrl === restoredSourceImageUrl;
    setSourceImageUrl(restoredSourceImageUrl);
    setExtractedImageUrl(restoredExtractedImageUrl);
    setExtractPrompt(record.extractPrompt ?? null);
    setHighlightedPatternColor(null);
    setSubjectMaskSnapshot(null);
    clearSubjectIdentification();
    clearResultSubjectSelection();
    setPatternUrl(record.patternUrl);
    setCleanPatternUrl(record.cleanPatternUrl);

    // 恢复 pattern 对象
    setPattern(deserializePattern(record.patternData));

    setStep((record.patternData || record.patternUrl || restoredExtractedImageUrl || restoredSourceImageUrl) ? restoredStep : "config");
    if (navigateToStudio) setView("start");
  }, [clearResultSubjectSelection, clearSubjectIdentification]);

  useEffect(() => {
    if (activeProjectRestoredRef.current) return;
    if (projectRecords.length === 0 || hasUnsavedWork) return;

    const activeProjectId = loadActiveProjectId();
    const activeRecord = activeProjectId
      ? projectRecords.find((record) => record.id === activeProjectId)
      : projectRecords[0];
    if (!activeRecord) return;

    activeProjectRestoredRef.current = true;
    handleRestoreProject(activeRecord, false);
  }, [handleRestoreProject, hasUnsavedWork, projectRecords]);

  // 自动保存当前作品到历史记录
  const buildCurrentProjectRecord = useCallback((title?: string): ProjectRecord => {
    const id = currentProjectIdRef.current ?? `proj_${Date.now()}`;
    const existingRecord = currentProjectIdRef.current
      ? projectRecords.find((record) => record.id === currentProjectIdRef.current) ?? null
      : null;
    currentProjectIdRef.current = id;
    return {
      id,
      title: title ?? (projectTitleDraft.trim() || defaultProjectTitle),
      createdAt: existingRecord?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      completed: step === "preview" && !!pattern,
      currentStep: step,
      theme,
      element,
      meaning,
      productId,
      gridSize,
      colorCount,
      aspectRatio,
      showGrid,
      antiAlias,
      connectIslands,
      selectedFilter,
      forcedColors,
      sourceImageUrl,
      extractedImageUrl,
      extractPrompt,
      patternData: serializePattern(pattern),
      patternUrl,
      cleanPatternUrl,
      mockupUrl: null,
      productSceneUrl: null,
    };
  }, [antiAlias, aspectRatio, cleanPatternUrl, colorCount, connectIslands, defaultProjectTitle, element, extractPrompt, extractedImageUrl, forcedColors, gridSize, meaning, pattern, patternUrl, productId, projectRecords, projectTitleDraft, selectedFilter, showGrid, sourceImageUrl, step, theme]);

  const buildCurrentProjectSignature = useCallback(() => JSON.stringify({
    theme,
    element,
    meaning,
    productId,
    gridSize,
    colorCount,
    aspectRatio,
    showGrid,
    antiAlias,
    connectIslands,
    selectedFilter,
    forcedColors,
    sourceImageUrl,
    extractedImageUrl,
    currentStep: step,
    extractPrompt,
    patternData: serializePattern(pattern),
    patternUrl,
    cleanPatternUrl,
  }), [antiAlias, aspectRatio, cleanPatternUrl, colorCount, connectIslands, element, extractPrompt, extractedImageUrl, forcedColors, gridSize, meaning, pattern, patternUrl, productId, selectedFilter, showGrid, sourceImageUrl, step, theme]);

  useEffect(() => {
    if (restoringRef.current || view !== "start" || !hasUnsavedWork) return;
    const signature = buildCurrentProjectSignature();
    if (signature === lastAutoSaveSignatureRef.current) return;

    const timer = setTimeout(() => {
      const record = buildCurrentProjectRecord();
      void saveProjectRecord(record).then((saved) => {
        if (!saved) return;
        lastAutoSaveSignatureRef.current = signature;
        void refreshProjectRecords();
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [buildCurrentProjectRecord, buildCurrentProjectSignature, hasUnsavedWork, refreshProjectRecords, view]);

  const publishCurrentWork = useCallback(async () => {
    if (!sourceImageUrl && !pattern && !patternUrl) {
      setToastType("warning");
      setToastMsg(L("请先完成一个作品进度后再发布。", "Complete some project progress before publishing."));
      return;
    }
    const record = buildCurrentProjectRecord(projectTitleDraft.trim() || undefined);
    const saved = await saveProjectRecord(record);
    if (!saved) {
      setToastType("warning");
      setToastMsg(L("项目保存失败，浏览器项目库暂时不可用。", "Project save failed. Browser project storage is unavailable."));
      return;
    }
    refreshProjectRecords();
    try {
      const published = await publishCommunityPost({
        record,
        author: currentUser?.nickname ?? L("豆阁用户", "Doge User"),
        avatar: currentUser?.avatarUrl ?? "",
        colors: forcedColors,
      });
      setCloudCommunityPosts((posts) => {
        const nextPosts = [published, ...posts.filter((post) => post.id !== published.id)];
        saveCachedCommunityPosts(nextPosts);
        return nextPosts;
      });
      setToastType("success");
      setToastMsg(L("作品已发布到云端社区，并同步保存到个人主页。", "Work published to the cloud community and saved to your profile."));
      setView("community");
    } catch (err) {
      setToastType("warning");
      setToastMsg(err instanceof Error ? err.message : L("作品发布失败", "Failed to publish work"));
    }
  }, [buildCurrentProjectRecord, currentUser, forcedColors, L, pattern, patternUrl, projectTitleDraft, refreshProjectRecords, sourceImageUrl]);

  const openCommunityPost = useCallback((post: CommunityPost) => {
    setSelectedCommunityPost(post);
    setCommunityEditDraft(null);
    setCommunityDeleteConfirm(false);
  }, []);

  const closeCommunityPost = useCallback(() => {
    if (communityMutationLoading) return;
    setSelectedCommunityPost(null);
    setCommunityEditDraft(null);
    setCommunityDeleteConfirm(false);
  }, [communityMutationLoading]);

  const beginCommunityPostEdit = useCallback((post: CommunityPost) => {
    if (post.type !== "project" || !post.isOwnedByCurrentUser) return;
    setCommunityDeleteConfirm(false);
    setCommunityEditDraft({
      title: post.title,
      theme: post.theme,
      element: post.element,
      meaning: post.meaning,
    });
  }, []);

  const saveCommunityPostEdits = useCallback(async () => {
    if (!selectedCommunityPost || selectedCommunityPost.type !== "project" || !communityEditDraft) return;
    if (!communityEditDraft.title.trim() || !communityEditDraft.theme.trim() || !communityEditDraft.element.trim()) {
      setToastType("warning");
      setToastMsg(L("作品名称、传统主题和核心元素不能为空。", "Title, theme, and core element are required."));
      return;
    }

    setCommunityMutationLoading(true);
    try {
      const updated = await updateCommunityPost({
        id: selectedCommunityPost.id,
        title: communityEditDraft.title,
        theme: communityEditDraft.theme,
        element: communityEditDraft.element,
        meaning: communityEditDraft.meaning,
      });
      setCloudCommunityPosts((posts) => {
        const nextPosts = posts.map((post) => (post.id === updated.id ? updated : post));
        saveCachedCommunityPosts(nextPosts);
        return nextPosts;
      });
      setSelectedCommunityPost({ ...updated, type: "project" });
      setCommunityEditDraft(null);
      setToastType("success");
      setToastMsg(L("论坛作品已更新。", "Forum work updated."));
    } catch (err) {
      setToastType("warning");
      setToastMsg(err instanceof Error ? err.message : L("作品修改失败", "Failed to update work"));
    } finally {
      setCommunityMutationLoading(false);
    }
  }, [communityEditDraft, L, selectedCommunityPost]);

  const removeSelectedCommunityPost = useCallback(async () => {
    if (!selectedCommunityPost || selectedCommunityPost.type !== "project" || !selectedCommunityPost.isOwnedByCurrentUser) return;
    setCommunityMutationLoading(true);
    try {
      await deleteCommunityPost(selectedCommunityPost.id);
      setCloudCommunityPosts((posts) => {
        const nextPosts = posts.filter((post) => post.id !== selectedCommunityPost.id);
        saveCachedCommunityPosts(nextPosts);
        return nextPosts;
      });
      setSelectedCommunityPost(null);
      setCommunityEditDraft(null);
      setCommunityDeleteConfirm(false);
      setToastType("success");
      setToastMsg(L("论坛作品已删除，本地项目仍然保留。", "Forum work deleted; your local project is unchanged."));
    } catch (err) {
      setToastType("warning");
      setToastMsg(err instanceof Error ? err.message : L("作品删除失败", "Failed to delete work"));
    } finally {
      setCommunityMutationLoading(false);
    }
  }, [L, selectedCommunityPost]);

  const saveCurrentProject = useCallback(async () => {
    if (!sourceImageUrl && !pattern && !patternUrl) {
      setToastType("warning");
      setToastMsg(L("请先完成当前创作内容，再保存项目。", "Complete current creation content before saving."));
      return false;
    }

    const record = buildCurrentProjectRecord(projectTitleDraft.trim() || undefined);
    const saved = await saveProjectRecord(record);
    if (!saved) {
      setToastType("warning");
      setToastMsg(L("项目保存失败，浏览器项目库暂时不可用。", "Project save failed. Browser project storage is unavailable."));
      return false;
    }
    lastAutoSaveSignatureRef.current = buildCurrentProjectSignature();
    setProjectTitleDraft(record.title);
    refreshProjectRecords();
    setToastType("success");
    setToastMsg(L("项目已保存，可在“项目”和个人主页历史记录中继续编辑或发布。", "Project saved. Continue editing or publish it from Projects or profile history."));
    setProjectTitleManual(record.title.trim() !== defaultProjectTitle);
    return true;
  }, [buildCurrentProjectRecord, buildCurrentProjectSignature, defaultProjectTitle, L, pattern, patternUrl, projectTitleDraft, refreshProjectRecords, sourceImageUrl]);

  const importCommunityPost = useCallback(async (post: CommunityPost) => {
    if (post.record) {
      const cloned: ProjectRecord = {
        ...post.record,
        id: `proj_${Date.now()}`,
        title: `${post.title} · ${L("导入", "Import")}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completed: false,
      };
      const saved = await saveProjectRecord(cloned);
      if (!saved) {
        setToastType("warning");
        setToastMsg(L("社区作品导入失败，浏览器项目库暂时不可用。", "Community work import failed. Browser project storage is unavailable."));
        return;
      }
      refreshProjectRecords();
      handleRestoreProject(cloned);
      setSelectedCommunityPost(null);
      setToastType("success");
      setToastMsg(L("已导入作品模板，并保存到个人主页。", "Work template imported and saved to your profile."));
      return;
    }

    const defaults = getProductConfigDefault(post.productId);
    const previewImage = post.previewImage ?? null;
    const record: ProjectRecord = {
      id: `proj_${Date.now()}`,
      title: `${post.title} · ${L("导入", "Import")}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completed: false,
      currentStep: previewImage ? "extract" : "config",
      theme: post.theme,
      element: post.element,
      meaning: post.meaning,
      productId: post.productId,
      gridSize: defaults.gridSize,
      colorCount: defaults.colorCount,
      aspectRatio: defaults.aspectRatio,
      showGrid: true,
      antiAlias: true,
      connectIslands: true,
      selectedFilter: "none",
      forcedColors: post.colors,
      sourceImageUrl: previewImage,
      extractedImageUrl: previewImage,
      extractPrompt: null,
      patternData: null,
      patternUrl: null,
      cleanPatternUrl: null,
      mockupUrl: null,
      productSceneUrl: null,
    };
    const saved = await saveProjectRecord(record);
    if (!saved) {
      setToastType("warning");
      setToastMsg(L("社区模板导入失败，浏览器项目库暂时不可用。", "Community template import failed. Browser project storage is unavailable."));
      return;
    }
    refreshProjectRecords();
    handleRestoreProject(record);
    setSelectedCommunityPost(null);
    setToastType("success");
    setToastMsg(L("已导入社区模板，并保存到个人主页。", "Community template imported and saved to your profile."));
  }, [handleRestoreProject, L, refreshProjectRecords]);

  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    const intervalMs = normalizeAutoSaveIntervalSeconds(autoSaveIntervalSeconds) * 1000;
    const timer = setInterval(() => {
      void (async () => {
        if (view !== "start") return;
        const signature = buildCurrentProjectSignature();
        if (signature === lastAutoSaveSignatureRef.current) return;
        const record = buildCurrentProjectRecord();
        const saved = await saveProjectRecord(record);
        if (saved) {
          lastAutoSaveSignatureRef.current = signature;
          void refreshProjectRecords();
          setToastType("success");
          setToastMsg(L("已自动保存当前项目进度", "Current project progress autosaved"));
        }
      })();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [autoSaveIntervalSeconds, buildCurrentProjectRecord, buildCurrentProjectSignature, L, refreshProjectRecords, view]);

  useEffect(() => {
    const previousView = previousViewRef.current;
    previousViewRef.current = view;
    if (previousView !== "start" || view === "start" || restoringRef.current) return;
    const signature = buildCurrentProjectSignature();
    if (signature === lastAutoSaveSignatureRef.current) return;
    const record = buildCurrentProjectRecord();
    void saveProjectRecord(record).then((saved) => {
      if (!saved) return;
      lastAutoSaveSignatureRef.current = signature;
      void refreshProjectRecords();
    });
  }, [buildCurrentProjectRecord, buildCurrentProjectSignature, refreshProjectRecords, view]);

  // 帮助页面：当 details 离开视口时自动收起
  useEffect(() => {
    if (view !== "faq") return;
    let observer: IntersectionObserver | null = null;
    const timer = setTimeout(() => {
      const detailsList = document.querySelectorAll<HTMLDetailsElement>(
        ".min-w-0.flex-1 details"
      );
      if (!detailsList.length) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.target instanceof HTMLDetailsElement && !entry.isIntersecting) {
              entry.target.removeAttribute("open");
            }
          }
        },
        { threshold: 0 }
      );
      detailsList.forEach((d) => observer!.observe(d));
    }, 100);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [view]);

  return (
    <main className="min-h-screen bg-[#f3efe7] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#f3efe7]/95 backdrop-blur">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 左侧 Logo + 品牌文字 */}
          <button type="button" onClick={() => setView("home")} className="flex shrink-0 items-center gap-3">
            <span className="relative h-12 w-12 overflow-hidden rounded-md">
              <Image
                src="/logo.png"
                alt={language === "en" ? "Doge" : "豆阁"}
                fill
                priority
                sizes="48px"
                className="scale-[1.45] object-contain"
              />
            </span>
            <span className="hidden text-lg font-semibold text-stone-800 sm:inline">{ui.brand}</span>
          </button>

          {/* 桌面端导航 - 绝对居中 */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-lg bg-stone-100 p-1.5 lg:flex">
              {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
            onClick={() => {
                  setView(item.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`rounded-md px-5 py-2.5 text-base font-semibold transition ${
                  view === item.id ? "bg-[#33596a] text-white shadow-sm" : "text-stone-600 hover:text-stone-950"
                }`}
              >
                {language === "en" ? item.en : item.zh}
              </button>
            ))}
          </nav>

          {/* 右侧头像 + 登录 */}
          {currentUser ? (
            <button
              type="button"
              onClick={() => {
                const p = loadCurrentUserProfile();
                if (p) setCurrentUser(p);
                setView("profile");
              }}
              className="flex shrink-0 items-center gap-3 rounded-md px-4 py-2 text-lg font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-950"
            >
              <span className="grid h-10 w-10 overflow-hidden rounded-full bg-stone-300 text-sm font-semibold text-white">
                {currentUser.avatarUrl && currentUser.avatarUrl.startsWith("data:") ? (
                  <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-lg">
                    {currentUser.avatarUrl?.startsWith("emoji:")
                      ? currentUser.avatarUrl.slice(6)
                      : currentUser.nickname.charAt(0)}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline">{currentUser.nickname}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={ui.login}
                onClick={() => {
                  setLoginModalStep("login");
                  setShowLoginModal(true);
                }}
                className="flex shrink-0 items-center gap-2 rounded-md bg-[#33596a] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#446f80]"
              >
                <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-[#446f80] text-xs font-semibold text-white">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </span>
                <span className="hidden sm:inline">{ui.login}</span>
              </button>
              <button
                type="button"
                aria-label={ui.register}
                onClick={() => {
                  setLoginModalStep("register");
                  setShowLoginModal(true);
                }}
                className="flex shrink-0 items-center gap-2 rounded-md border border-[#33596a] px-4 py-1.5 text-sm font-semibold text-[#33596a] transition hover:bg-[#33596a] hover:text-white"
              >
                <span className="sm:hidden" aria-hidden="true">＋</span>
                <span className="hidden sm:inline">{ui.register}</span>
              </button>
            </div>
          )}
        </div>
        <nav className="flex w-full items-center gap-1 overflow-x-auto border-t border-stone-200/70 bg-[#f3efe7] px-3 py-2 lg:hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setView(item.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition ${
                view === item.id ? "bg-[#33596a] text-white shadow-sm" : "text-stone-600 hover:text-stone-950"
              }`}
            >
              {language === "en" ? item.en : item.zh}
            </button>
          ))}
        </nav>
      </header>

      {/* 个人主页 */}
      {view === "profile" && (
        <ProfilePage
          onBack={() => setView("home")}
          onRestoreProject={handleRestoreProject}
          onLogin={(user) => {
            setCurrentUser(user);
            refreshProjectRecords();
          }}
          onApiConfigSaved={(config) => {
            setAutoSaveIntervalSeconds(normalizeAutoSaveIntervalSeconds(config.autoSaveIntervalSeconds));
          }}
          language={language}
          onLanguageChange={setLanguage}
          onLogout={() => {
            clearAiChatHistory();
            setAiChatResetToken((value) => value + 1);
            clearCurrentProgress();
            setCurrentUser(null);
            refreshProjectRecords();
          }}
        />
      )}

      {view === "checkin" && <BijiangCheckIn language={language} />}

      {view === "home" && (
        <>
          <section
            className="relative overflow-hidden bg-cover bg-[center_top] bg-no-repeat text-white"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(24, 44, 50, 0.72) 0%, rgba(35, 65, 72, 0.58) 48%, rgba(24, 44, 50, 0.48) 100%), url('/main%20page.png')",
            }}
          >
            <div className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
              <p className="text-sm font-semibold text-[#d8a760]">{L("碧江村韵 × 掌间拼豆", "Bijiang Heritage x Handheld Bead Art")}</p>

              {/* 打字区域固定容器：防止打字时高度变化导致下方元素下移 */}
              <div className="min-h-[200px] md:min-h-[220px] lg:min-h-[260px]">
                {/* 打字机标题 */}
                <h1 className="mt-3 max-w-5xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl xl:whitespace-nowrap">
                  {typedLine1}
                  {typedLine1.length > 0 && typedLine1.length < homeTypingLine1.length && (
                    <span className="ml-0.5 inline-block h-[0.8em] w-[2px] animate-pulse bg-[#d8a760] align-middle" />
                  )}
                </h1>

                {/* 打字机描述 */}
                <p className="mt-5 max-w-2xl text-base leading-7 text-stone-200">
                  {typedLine2}
                  {typedLine2.length > 0 && typedLine2.length < homeTypingLine2.length && (
                    <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#d8a760] align-middle" />
                  )}
                </p>

                {/* 打字完成后浮现快速开始按钮 */}
                <div className={`transition-all duration-700 ${typingDone ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 pointer-events-none"}`}>
                  <div className="mt-7 flex flex-wrap gap-4">
                    <button type="button" onClick={() => setView("start")} className="rounded-md bg-[#b57938] px-8 py-4 text-base font-bold text-white shadow-lg transition hover:bg-[#c78a49] hover:shadow-xl">
                    {L("快速开始", "Start Creating")}
                    </button>
                  </div>
                </div>
              </div>
              {/* 精选主题 — 始终展示 */}
              <div className="pb-8">
                <ScrollingPatternBand />
              </div>

              <div className="max-h-[42rem] overflow-y-auto pb-12 pr-2">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {showcase.map((item, index) => {
                  const text = language === "en" ? showcaseEn[index] : item;
                  return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      setTheme(item.theme);
                      setElement(item.element);
                      setMeaning(item.meaning);
                      applyProductConfigDefault("coaster");
                      // 预设该模板的推荐配色到调色板
                      setForcedColors(item.colors);
                      clearPatternArtifacts();
                      setSourceImageUrl(null);
                      setExtractedImageUrl(null);
                      clearResultSubjectSelection();
                      setSubjectAnalysis(null);
                      setSubjectMaskSnapshot(null);
                      clearSubjectIdentification();
                      setSubjectDirty(false);
                      resetAutoSaveTracking();
                      directOutputRef.current = false;
                      setView("start");
                      setStep("config");
                    }}
                    className="w-full rounded-lg border border-white/15 bg-white/8 p-5 text-left text-white transition hover:bg-white/15 hover:ring-2 hover:ring-[#b57938]"
                  >
                    {item.previewImage ? (
                      <div className="aspect-square overflow-hidden rounded-md border border-white/15 bg-white/10">
                        <img src={item.previewImage} alt={text.title} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <PatternMiniature colors={item.colors} />
                    )}
                    <h2 className="mt-4 text-lg font-semibold">{text.title}</h2>
                    <p className="mt-1 text-sm text-stone-300">{language === "en" ? "Theme palette" : `${item.theme}主题配色`}</p>
                  </button>
                  );
                })}
                </div>
              </div>

              {/* 纹样滚动带 — 始终展示 */}
            </div>
          </section>

          <CraftSection setView={setView} language={language} />
          <HomeCommunitySection setView={setView} language={language} />
        </>
      )}

      {view === "projects" && (
        <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 border-b border-stone-200 pb-8">
            <div>
              <p className="text-sm font-semibold text-[#33596a]">{L("项目", "Projects")}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">{L("最近设计", "Recent Designs")}</h1>
            </div>
            <input
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder={L("搜索项目名称、主题、元素...", "Search project name, theme, or element...")}
              className="w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#33596a] focus:ring-2 focus:ring-[#33596a]/20"
            />
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjectRecords.map((record) => {
              const previewUrl = record.mockupUrl || record.patternUrl || record.cleanPatternUrl || record.extractedImageUrl || record.sourceImageUrl || getImportedTemplatePreview(record);
              return (
                <article key={record.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                  <button type="button" onClick={() => handleRestoreProject(record)} className="block w-full text-left">
                    <div className="aspect-square overflow-hidden rounded-md border border-stone-200 bg-stone-50">
                      {previewUrl ? (
                        <img src={previewUrl} alt={record.title} className="h-full w-full object-contain" />
                      ) : (
                        <ProjectFallbackPreview
                          colors={record.forcedColors}
                          theme={displayProjectTheme(record.theme)}
                          element={record.element}
                          language={language}
                        />
                      )}
                    </div>
                    <h2 className="mt-4 truncate text-lg font-semibold text-stone-950">{record.title || displayProjectTheme(record.theme)}</h2>
                    <p className="mt-1 text-sm text-stone-600">{displayProjectTheme(record.theme)} · {record.element}</p>
                    <p className="mt-2 text-xs text-stone-400">{new Date(record.updatedAt).toLocaleString(language === "en" ? "en-US" : "zh-CN")}</p>
                  </button>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => handleRestoreProject(record)} className="rounded-md bg-[#33596a] px-3 py-2 text-sm font-semibold text-white">{L("继续编辑", "Continue Editing")}</button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteProjectRecord(record.id).then(refreshProjectRecords);
                      }}
                      className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      {L("删除", "Delete")}
                    </button>
                  </div>
                </article>
              );
            })}
            <button
              type="button"
              onClick={() => {
                clearCurrentProgress();
                setStep("config");
                setView("start");
              }}
              className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-[#33596a]/40 bg-white p-6 text-center transition hover:border-[#33596a] hover:bg-[#33596a]/5"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#33596a] text-4xl font-light leading-none text-white">+</span>
              <span className="mt-4 block text-sm font-semibold text-stone-700">{ui.newProject}</span>
            </button>
          </div>

          {filteredProjectRecords.length === 0 && (
            <div className="mt-8 rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
              {ui.noProjects}
            </div>
          )}
        </main>
      )}

      {view === "ai" && (
        <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#33596a]">Doge AI</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">{ui.aiTitle}</h1>
          </div>
          <AiChatPanel embedded resetToken={aiChatResetToken} language={language} />
        </main>
      )}

      {view === "community" && (
        <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 border-b border-stone-200 pb-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#33596a]">{ui.forumEyebrow}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">{ui.forumTitle}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                {ui.forumDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={publishCurrentWork}
              disabled={!sourceImageUrl && !pattern && !patternUrl}
              className="rounded-md bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              🌐 {ui.publishCurrent}
            </button>
          </div>

          <div className="mt-8">
            <label className="block text-sm font-medium text-stone-700" htmlFor="community-search">
              {L("搜索作品", "Search Works")}
            </label>
            <input
              id="community-search"
              value={communityQuery}
              onChange={(event) => setCommunityQuery(event.target.value)}
              placeholder={L("输入关键词：青花、飞天、脸谱、作者名...", "Enter keywords: porcelain, flying apsaras, mask, author...")}
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#33596a] focus:ring-2 focus:ring-[#33596a]/20"
            />
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {communityPosts.map((post) => {
              const displayPost = displayCommunityPost(post);
              const previewUrl = post.record?.patternUrl || post.record?.cleanPatternUrl || post.record?.sourceImageUrl || post.previewImage;
              return (
              <button
                key={post.id}
                type="button"
                onClick={() => openCommunityPost(post)}
                className="group rounded-lg border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#33596a]/40 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#33596a] text-sm font-semibold text-white">
                    {displayPost.avatar.startsWith("data:") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayPost.avatar} alt="" className="h-full w-full object-cover" />
                    ) : displayPost.avatar}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-stone-900">{displayPost.author}</p>
                      {post.type === "project" && post.isOwnedByCurrentUser && (
                        <span className="shrink-0 rounded-full bg-[#33596a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#33596a]">
                          {L("我的作品", "My Work")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">{formatPostTime(displayPost.createdAt, language)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt={displayPost.title} className="aspect-square w-full rounded-md border border-stone-200 object-contain" />
                  ) : (
                    <PatternMiniature colors={post.colors} />
                  )}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-stone-950">{displayPost.title}</h2>
                <p className="mt-1 text-sm text-stone-600">{displayPost.theme} · {displayPost.element}</p>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-500">{displayPost.meaning}</p>
              </button>
              );
            })}
          </div>

          {communityLoading && cloudCommunityPosts.length === 0 && (
            <div className="mt-10 rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
              {L("正在加载云端社区作品...", "Loading cloud community works...")}
            </div>
          )}

          {communityError && (
            <div className="mt-10 rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
              {communityError}
            </div>
          )}

          {!communityLoading && !communityError && communityPosts.length === 0 && (
            <div className="mt-10 rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
              {L("没有找到匹配的作品。", "No matching works found.")}
            </div>
          )}
        </main>
      )}

      {selectedCommunityPost && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-8">
          {(() => {
            const displayPost = displayCommunityPost(selectedCommunityPost);
            return (
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <button
              type="button"
              onClick={closeCommunityPost}
              className="absolute right-4 top-4 z-10 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 shadow-sm transition hover:bg-stone-50"
            >
              {L("关闭", "Close")}
            </button>
            <div className="overflow-y-auto p-6">
              <div className="flex items-center gap-3 pr-20">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#33596a] text-sm font-semibold text-white">
                  {displayPost.avatar.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayPost.avatar} alt="" className="h-full w-full object-cover" />
                  ) : displayPost.avatar}
                </span>
                <div>
                  <h2 className="text-2xl font-semibold text-stone-950">{displayPost.title}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {displayPost.author} · {formatPostTime(displayPost.createdAt, language)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  {selectedCommunityPost.record?.patternUrl || selectedCommunityPost.record?.cleanPatternUrl || selectedCommunityPost.record?.sourceImageUrl || selectedCommunityPost.previewImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedCommunityPost.record?.patternUrl || selectedCommunityPost.record?.cleanPatternUrl || selectedCommunityPost.record?.sourceImageUrl || selectedCommunityPost.previewImage} alt={displayPost.title} className="max-h-[560px] w-full object-contain" />
                  ) : (
                    <PatternMiniature colors={selectedCommunityPost.colors} />
                  )}
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">{L("传统主题", "Traditional Theme")}</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{displayPost.theme}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">{L("核心元素", "Core Element")}</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{displayPost.element}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">{L("文化说明", "Cultural Notes")}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{displayPost.meaning}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">{L("推荐配色", "Suggested Palette")}</p>
                    <div className="mt-3 flex gap-2">
                      {selectedCommunityPost.colors.map((color) => (
                        <span key={color} title={color} className="h-8 w-8 rounded-full border border-stone-200" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-stone-200 bg-stone-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              {selectedCommunityPost.type === "project" && selectedCommunityPost.isOwnedByCurrentUser ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => beginCommunityPostEdit(selectedCommunityPost)}
                    className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-[#33596a]/40 hover:text-[#33596a]"
                  >
                    {L("编辑作品", "Edit Work")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommunityDeleteConfirm(true)}
                    className="rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  >
                    {L("删除作品", "Delete Work")}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-stone-500">
                  {L("只能编辑或删除自己发布的作品。", "Only your own published works can be edited or deleted.")}
                </p>
              )}
              <button
                type="button"
                onClick={() => importCommunityPost(selectedCommunityPost)}
                className="rounded-md bg-[#33596a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#446f80]"
              >
                {L("一键导入作品", "Import Work")}
              </button>
            </div>
          </div>
            );
          })()}
        </div>
      )}

      {selectedCommunityPost && communityEditDraft && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 px-4 py-8">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="border-b border-stone-200 px-6 py-5">
              <p className="text-sm font-semibold text-[#33596a]">{L("管理我的作品", "Manage My Work")}</p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-950">{L("编辑论坛作品", "Edit Forum Work")}</h2>
              <p className="mt-2 text-sm text-stone-500">
                {L("修改只影响论坛中的展示信息，不会改动浏览器里保存的本地项目。", "Changes affect the forum post only and do not modify your locally saved project.")}
              </p>
            </div>
            <div className="grid gap-5 px-6 py-6 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-sm font-medium text-stone-700">{L("作品名称", "Work Title")}</span>
                <input
                  value={communityEditDraft.title}
                  onChange={(event) => setCommunityEditDraft((draft) => draft ? { ...draft, title: event.target.value } : draft)}
                  maxLength={120}
                  className="mt-2 w-full rounded-md border border-stone-300 px-4 py-3 text-sm outline-none focus:border-[#33596a] focus:ring-2 focus:ring-[#33596a]/20"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-stone-700">{L("传统主题", "Traditional Theme")}</span>
                <input
                  value={communityEditDraft.theme}
                  onChange={(event) => setCommunityEditDraft((draft) => draft ? { ...draft, theme: event.target.value } : draft)}
                  maxLength={80}
                  className="mt-2 w-full rounded-md border border-stone-300 px-4 py-3 text-sm outline-none focus:border-[#33596a] focus:ring-2 focus:ring-[#33596a]/20"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-stone-700">{L("核心元素", "Core Element")}</span>
                <input
                  value={communityEditDraft.element}
                  onChange={(event) => setCommunityEditDraft((draft) => draft ? { ...draft, element: event.target.value } : draft)}
                  maxLength={80}
                  className="mt-2 w-full rounded-md border border-stone-300 px-4 py-3 text-sm outline-none focus:border-[#33596a] focus:ring-2 focus:ring-[#33596a]/20"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-sm font-medium text-stone-700">{L("文化说明", "Cultural Notes")}</span>
                <textarea
                  value={communityEditDraft.meaning}
                  onChange={(event) => setCommunityEditDraft((draft) => draft ? { ...draft, meaning: event.target.value } : draft)}
                  maxLength={800}
                  rows={5}
                  className="mt-2 w-full resize-y rounded-md border border-stone-300 px-4 py-3 text-sm leading-6 outline-none focus:border-[#33596a] focus:ring-2 focus:ring-[#33596a]/20"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setCommunityEditDraft(null)}
                disabled={communityMutationLoading}
                className="rounded-md border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-50"
              >
                {L("取消", "Cancel")}
              </button>
              <button
                type="button"
                onClick={saveCommunityPostEdits}
                disabled={communityMutationLoading}
                className="rounded-md bg-[#33596a] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#446f80] disabled:cursor-wait disabled:opacity-60"
              >
                {communityMutationLoading ? L("正在保存...", "Saving...") : L("保存修改", "Save Changes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCommunityPost && communityDeleteConfirm && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 px-4 py-8">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold text-red-700">{L("删除论坛作品", "Delete Forum Work")}</p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">{L("确定删除这条发布吗？", "Delete this published work?")}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {L("删除后其他人将无法再看到或导入它，但你浏览器中的本地项目不会被删除。", "Others will no longer see or import it. Your local browser project will remain intact.")}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCommunityDeleteConfirm(false)}
                disabled={communityMutationLoading}
                className="rounded-md border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-50"
              >
                {L("取消", "Cancel")}
              </button>
              <button
                type="button"
                onClick={removeSelectedCommunityPost}
                disabled={communityMutationLoading}
                className="rounded-md bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
              >
                {communityMutationLoading ? L("正在删除...", "Deleting...") : L("确认删除", "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "faq" && (
        <div className="mx-auto flex max-w-6xl gap-0 px-4 py-14 sm:px-6 lg:px-8">
          {/* 左侧目录导航栏 */}
          <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto lg:block">
            <nav className="space-y-1">
               {activeHelpSidebarNav.map((section) => (
                <div key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 hover:text-stone-950"
                  >
                    <span>{section.icon}</span>
                    <span>{section.label}</span>
                  </a>
                  {section.subs.length > 0 && (
                    <div className="ml-5 space-y-0.5 border-l border-stone-200 pl-2">
                      {section.subs.map((sub) => (
                        <a
                          key={sub.anchor}
                          href={`#${sub.anchor}`}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(sub.anchor)?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="block rounded-md px-3 py-1.5 text-xs text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
                        >
                          {sub.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </aside>

          {/* 右侧内容区域 */}
          <div className="min-w-0 flex-1 lg:pl-8">
            <p className="text-sm font-semibold text-[#33596a]">{L("创作指南", "Creation Guide")}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{L("豆阁 · 帮助", "Doge · Help")}</h1>

            {/* 移动端顶部快速导航 */}
            <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
              {helpSidebarNav.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
                >
                  {section.icon} {section.label}
                </a>
              ))}
            </div>

            <div className="mt-8 space-y-6">
              {activeHelpData.map((section) => {
                // 为操作指南子章节标注 Step 1~4
                const stepMap: Record<string, string> = {
                  "guide-theme": "Step 1",
                  "guide-upload": "Step 2",
                  "guide-mapping": "Step 3",
                  "guide-export": "Step 4",
                };
                const stepLabel = stepMap[section.id];
                return (
                <div key={section.id} id={section.id} className="scroll-mt-20 rounded-lg border border-stone-200 bg-white">
                  <div className="border-b border-stone-100 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-xl font-semibold">
                      {!stepLabel && <span>{section.icon}</span>}
                      {stepLabel && (
                        <span className="text-sm font-bold tracking-wider text-[#33596a] uppercase">{stepLabel}</span>
                      )}
                      <span>{section.title}</span>
                    </h2>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {section.subs.map((sub, subIndex) => (
                      <details key={subIndex} className="group p-5">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-stone-800">
                          {sub.title}
                          <span className="text-xl text-stone-400 group-open:rotate-45 transition-transform">+</span>
                        </summary>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
                          {Array.isArray(sub.content) ? (
                            sub.content.map((line, lineIndex) => (
                              <p key={lineIndex}>{line}</p>
                            ))
                          ) : (
                            <p>{sub.content}</p>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </div>
      )}

      {view === "start" && (
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 grid gap-3 lg:grid-cols-4">
            {studioSteps.map((item, index) => {
              const stepDisplay = displayStep(item);
              // 解锁条件：config 始终可访问，其他步骤需要完成前一步
              const canAccess =
                item.id === "config" ||
                (item.id === "extract" && (!!sourceImageUrl || !!extractedImageUrl)) ||
                (item.id === "pattern" && !!extractedImageUrl) ||
                (item.id === "preview" && !!pattern);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!canAccess) {
                      if (index === 1 && !sourceImageUrl && !extractedImageUrl) {
                        setToastType("warning");
                        setToastMsg(L("请先生成或上传素材，再进入主体提取与再创作步骤。", "Generate or upload material before entering subject extraction and recreation."));
                      } else if (index === 2 && !extractedImageUrl) {
                        setToastType("warning");
                        setToastMsg(L("请先完成主体提取，再生成拼豆图纸。", "Complete subject extraction before generating the bead pattern."));
                      } else if (index === 3 && !pattern) {
                        setToastType("warning");
                        setToastMsg(L("请先生成拼豆图纸，再进入制作方案。", "Generate the bead pattern before entering the making plan."));
                      }
                      return;
                    }
                    setStep(item.id);
                  }}
                  className={`rounded-lg border p-4 text-left transition ${
                    step === item.id
                      ? "border-[#33596a] bg-[#33596a] text-white shadow-sm"
                      : !canAccess
                        ? "cursor-not-allowed border-stone-200 bg-white/60 text-stone-400"
                        : "border-stone-200 bg-white text-stone-700 hover:border-[#33596a]/50"
                  }`}
                >
                  <span className="text-xs font-semibold">0{index + 1}</span>
                  <span className="mt-1 block text-base font-semibold">{stepDisplay.label}</span>
                  <span className={`mt-2 block text-xs leading-5 ${step === item.id ? "text-white/80" : "text-stone-500"}`}>{stepDisplay.desc}</span>
                </button>
              );
            })}

          </div>
          {renderStep()}

          {/* 确认弹窗 */}
          {confirmNew && (
            <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40">
              <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold">{L("放弃当前进度？", "Discard Current Progress?")}</h3>
                <p className="mt-2 text-sm text-stone-600">
                  {L("您当前已有处理中的图案或图纸，", "You already have a pattern or image in progress. ")}
                  {confirmNew === "ai" ? L("使用 AI 重新生成", "Regenerating with AI") : confirmNew === "sample" ? L("切换为内置样例", "Switching to a built-in sample") : L("上传新图片", "Uploading a new image")}
                  {L("将清空已生成的主体提取和拼豆图纸。", " will clear the generated extraction and bead pattern.")}
                </p>
                <p className="mt-1 text-sm text-stone-500">{L("请先下载或保存需要的资料，再继续操作。", "Download or save anything you need before continuing.")}</p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmNew(null);
                      pendingUploadRef.current = null;
                    }}
                    className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
                  >
                    {L("取消", "Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const action = confirmNew;
                      clearPatternArtifacts();
                      setSourceImageUrl(null);
                      setExtractedImageUrl(null);
                      clearResultSubjectSelection();
                      setSubjectAnalysis(null);
                      setSubjectMaskSnapshot(null);
                      clearSubjectIdentification();
                      setSubjectDirty(false);
                      setConfirmNew(null);
                      if (action === "ai") {
                        handleGenerateAI();
                      } else if (action === "sample") {
                        doUseSample();
                      } else if (action === "upload") {
                        const file = pendingUploadRef.current;
                        pendingUploadRef.current = null;
                        if (file) void doUpload(file);
                      }
                    }}
                    className="rounded-md bg-[#33596a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    {L("确认放弃", "Discard")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Toast 警告弹窗 - 移动弹跳 */}
      {toastMsg && (
        <div className={`fixed left-1/2 top-20 z-[200] -translate-x-1/2 animate-bounce rounded-lg px-5 py-3 text-sm font-medium text-white shadow-lg ${
          toastType === "success" ? "bg-emerald-600" : "bg-[#6b1a20]"
        }`}>
          {toastMsg}
        </div>
      )}

      {/* 登录/注册弹窗 */}
      {showLoginModal && (
        <LoginModal
          initialStep={loginModalStep}
          onClose={() => setShowLoginModal(false)}
          onLoggedIn={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
          }}
          onRegisterSuccess={(username) => {
            setToastType("success");
            setToastMsg(L(`用户 ${username} 账号注册成功！`, `User ${username} registered successfully.`));
          }}
          language={language}
        />
      )}

      {/* 页脚 - 产权标语 */}
      <footer className="border-t border-stone-200 bg-[#f3efe7]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-1 px-4 py-6 text-center sm:px-6 lg:px-8">
          <p className="text-xs text-stone-400">
            &copy; {new Date().getFullYear()} {L("豆阁 Doge — 拼豆图纸生成工具", "Doge - Bead Pattern Design Tool")}
          </p>
          <p className="text-xs text-stone-400">
            {L("基于 AGPL-3.0 开源协议 · 以 AI 为笔，让碧江村文化织入像素网格", "AGPL-3.0 licensed · Weaving Bijiang heritage into pixel grids with AI")}
          </p>
          <p className="mt-1 text-[11px] text-stone-300">
            All Rights Reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
