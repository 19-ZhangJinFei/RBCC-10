"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CultureExplanation from "@/components/CultureExplanation";
import FilterDropdown from "@/components/FilterDropdown";
import ProfilePage from "@/components/ProfilePage";
import SubjectMaskEditor, { type MaskMode } from "@/components/SubjectMaskEditor";
import LoginModal from "@/components/LoginModal";
import AiChatPanel from "@/components/ai/AiChatPanel";
import FloatingAiButton from "@/components/ai/FloatingAiButton";
import { clearAiChatHistory } from "@/utils/aiChat";
import { saveProjectRecord, loadCurrentUserProfile, type StoredUser } from "@/utils/profileStorage";
import { fetchCommunityPosts, publishCommunityPost } from "@/utils/communityForum";
import type { ProjectRecord } from "@/types/projectTypes";
import type { CommunityPost as CloudCommunityPost } from "@/types/community";
import { type AspectRatioId, aspectRatios } from "@/data/aspectRatios";
import { cultureThemes } from "@/data/cultureThemes";
import { getProductTemplate } from "@/data/productTemplates";
import { countBeads, type BeadCount } from "@/utils/countBeads";
import {
  imageDataUrlToPattern,
  renderPatternToCanvas,
  renderPatternToCanvasClean,
  renderSampleDesignOriginal,
  type BeadPattern,
} from "@/utils/culturePattern";
import { generateCultureCopy } from "@/utils/cultureTextGenerator";
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

type SiteView = "home" | "start" | "community" | "faq" | "profile";
type StudioStep = "config" | "extract" | "pattern" | "preview";
type ProductConfigDefault = {
  aspectRatio: AspectRatioId;
  gridSize: number;
  colorCount: number;
};

  const navItems: { id: SiteView; label: string }[] = [
  { id: "home", label: "首页" },
  { id: "start", label: "开始创作" },
  { id: "community", label: "社区论坛" },
  { id: "faq", label: "帮助" },
];

const studioSteps: { id: StudioStep; label: string; desc: string }[] = [
  { id: "config", label: "配置", desc: "选择传统主题、作品形式、网格尺寸、颜色数量和可用色" },
  { id: "extract", label: "主体提取与再创作", desc: "提取图片核心主体意象，展示颜色占比，并基于主体图进行文化风格再创作" },
  { id: "pattern", label: "拼豆图纸", desc: "像素化处理、自动移除轮廓外浅色杂块以节省拼豆用量、生成带色号网格并统计用量" },
  { id: "preview", label: "制作方案", desc: "根据拼豆图纸生成材料、工具、拼豆、熨烫步骤和导出资料" },
];

const formLabels = [
  { id: "coaster", label: "杯垫底稿" },
  { id: "keychain", label: "挂件底稿" },
  { id: "magnet", label: "冰箱贴底稿" },
  { id: "brooch", label: "胸针底稿" },
  { id: "pendant", label: "吊饰底稿" },
  { id: "bag_charm", label: "随身牌底稿" },
];

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
    title: "青花莲纹",
    theme: "青花瓷",
    element: "莲花",
    meaning: "以青花瓷蓝白配色表现莲花的清雅与洁净，适合转译为轮廓简洁、留白明确的杯垫底稿。",
    colors: ["#FFFFFF", "#1557A8", "#3677D2", "#CDE8FF"],
  },
  {
    title: "敦煌飞天",
    theme: "敦煌",
    element: "飞天",
    meaning: "提取敦煌飞天的飘带、乐舞和壁画色彩，以土黄、赭红与青绿构成具有丝路气息的装饰图案。",
    colors: ["#FCF9E0", "#EDB045", "#943630", "#0B3C43"],
  },
  {
    title: "京剧脸谱",
    theme: "京剧",
    element: "脸谱",
    meaning: "以京剧脸谱的对称结构和红、黑、白高对比色表达戏曲人物符号，适合做识别度强的拼豆图纸。",
    colors: ["#FFFFFF", "#E7002F", "#000000", "#FFDA45"],
  },
  {
    title: "山海瑞兽",
    theme: "山海经",
    element: "瑞兽",
    meaning: "围绕山海经瑞兽意象组织羽翼、山纹与日月符号，用墨黑、朱红、青绿和金黄形成神话感轮廓。",
    colors: ["#1D1414", "#D30022", "#166F41", "#FFC830"],
  },
];

const communityTemplates: CommunityTemplate[] = showcase.map((item, index) => ({
  id: `template_${index}`,
  title: item.title,
  author: ["青瓷手作", "敦煌拾色", "梨园拼豆", "山海造物"][index] ?? "豆韵工坊",
  avatar: ["青", "敦", "京", "山"][index] ?? "豆",
  createdAt: Date.UTC(2026, 4, 19 - index, 2, 0, 0),
  theme: item.theme,
  element: item.element,
  meaning: item.meaning,
  colors: item.colors,
  productId: "coaster",
}));

const scrollingPatterns = [
  ["#FFFFFF", "#1557A8", "#3677D2", "#CDE8FF"],
  ["#FCF9E0", "#EDB045", "#943630", "#0B3C43"],
  ["#FFFFFF", "#E7002F", "#000000", "#FFDA45"],
  ["#1D1414", "#D30022", "#166F41", "#FFC830"],
  ["#F8E8C8", "#9F2B22", "#D9A441", "#111827"],
  ["#F7F2E8", "#245C45", "#8F1D21", "#E4B95B"],
];

const craftSteps = [
  {
    anchor: "guide-theme",
    title: "主题选择",
    text: "从青花瓷、敦煌纹样、京剧脸谱、山海经、二十四节气等主题出发，确定适合拼豆表达的主体、纹样和色彩气质。",
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
    text: "生成材料、工具、拼豆、熨烫步骤和成本时间估算，并导出图纸、材料清单和制作方案。",
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
};

type CommunityPost = CommunityTemplate & {
  type: "template" | "project";
  record?: ProjectRecord;
};

const helpSidebarNav = [
  {
    id: "purpose",
    label: "设计目的",
    icon: "🎯",
    subs: [] as { label: string; anchor: string }[],
  },
  {
    id: "guide",
    label: "操作指南",
    icon: "📖",
    subs: [
      { label: "主题选择", anchor: "guide-theme" },
      { label: "素材与提取", anchor: "guide-upload" },
      { label: "配色与调色板", anchor: "guide-mapping" },
      { label: "制作与导出", anchor: "guide-export" },
    ],
  },
  {
    id: "common-issues",
    label: "常见问题",
    icon: "❓",
    subs: [] as { label: string; anchor: string }[],
  },
  {
    id: "tech-details",
    label: "技术详解",
    icon: "🔧",
    subs: [] as { label: string; anchor: string }[],
  },
];

const helpData: HelpSection[] = [
  {
    id: "purpose",
    title: "设计目的",
    icon: "🎯",
    subs: [
      {
        title: "为什么做这个网站？",
        content: [
          "市面上的拼豆软件普遍存在颜色识别不准确、边缘产生灰色毛边、无法自适应合并同色系颜色、手动着色困难无法精准选择颜色、无法给出采购清单、限制图片导出和打印等问题。",
          "豆韵（DouYun）旨在解决这些痛点，为拼豆爱好者打造一个完全免费、开源的拼豆图纸生成工具。网站聚焦中华传统文化主题——青花瓷、敦煌纹样、京剧脸谱、山海经等，让传统纹样以拼豆的形式重新走进生活。",
          "所有功能完全免费，图纸、统计表、文化说明均支持导出，不限制使用场景（个人创作、课堂活动、社群分享均可）。",
        ],
      },
      {
        title: "与传统拼豆工具的区别",
        content: [
          "✅ 颜色识别准确：采用基于主导色的像素化算法，避免灰色毛边",
          "✅ 颜色合并智能：支持相似颜色自动合并，减少色彩数量，去除杂色",
          "✅ 背景自动移除：自动识别外部背景，统计和导出时忽略",
          "✅ 交互式调色板：按色系筛选、强制指定/排除颜色，精准控制最终色表",
          "✅ 开源色号体系：使用开源中性色号标注，不绑定任何商家",
          "✅ 一站式导出：图纸（带色号）+ 统计CSV + 文化说明 + 制作方案",
        ],
      },
    ],
  },
  {
    id: "guide-theme",
    title: "主题选择",
    icon: "🏛️",
    subs: [
      {
        title: "选择传统文化主题",
        content: "进入「快速开始」后，第一步是配置方案。在「传统主题」下拉菜单中，你可以从青花瓷、敦煌文化、戏曲脸谱、山海经、二十四节气等主题中选择。每个主题都预设了核心元素和文化叙述，你可以直接使用或自行修改。",
      },
      {
        title: "设置核心元素和文化叙述",
        content: "「核心元素」是你想突出的具体纹样或图案描述，例如'缠枝莲纹'、'飞天琵琶'。「文化叙述」是作品的背景介绍，会显示在最终导出的文化说明中。",
      },
      {
        title: "选择作品形式和画面比例",
        content: "作品形式可选杯垫、挂件、冰箱贴、胸针、吊饰、随身牌等，每种形式对应不同的AI生成提示词。画面比例支持1:1、2:3、3:2、3:4、4:3、9:16、16:9、自由等。",
      },
      {
        title: "调节网格尺寸和颜色上限",
        content: "网格尺寸（16~128）决定像素画的精细程度，数字越大越精细但摆豆工作量也越大。颜色上限（2~128色）控制最终使用的颜色数量，建议8~16色适合大多数拼豆项目。",
      },
      {
        title: "使用图像滤镜",
        content: "在「平滑杂点」选项旁的滤镜下拉菜单中，你可以选择高对比、鲜艳、柔和、暖色调、冷色调、灰度、怀旧共7种滤镜。滤镜会影响颜色映射前的像素颜色，不同滤镜会让拼豆图纸呈现不同的视觉效果。选择「无滤镜」保持原始色彩。",
      },
    ],
  },
  {
    id: "guide-upload",
    title: "素材与提取",
    icon: "✂️",
    subs: [
      {
        title: "使用 AI 生成图案",
        content: "点击「AI 生成图案」按钮，系统会根据你选择的主题、核心元素、作品形式等参数，调用 AI 生成一幅传统文化风格的图案。生成后会自动进入「主体提取与再创作」步骤，但不会再对 AI 图像执行自动主体识别或二次再创作，右侧输出端直接使用这张 AI 生成图像。左侧交互式主体识别默认没有绿色蒙版，用户可用「鼠标 / 增加 / 减少」和画笔大小手动标记主体区域用于查看主体范围。",
      },
      {
        title: "上传自己的图片",
        content: "支持上传 JPG/PNG 格式图片。上传后会先在原图上自动生成绿色主体蒙版；用户可以继续用「鼠标」点选同色连通区域，或用「增加 / 减少」画笔精修主体范围。系统不会自动触发再创作，确认主体区域后需要点击右侧「AI 再创作」，AI 会识别蒙版裁出的主体并结合传统文化配置生成传统文化艺术图像。传统纹样、书法字形、器物纹饰和简洁插画效果最佳。",
      },
      {
        title: "使用内置样例",
        content: "点击「使用内置样例」快速生成一个示例拼豆图纸，无需等待AI生成，适合快速体验流程或测试参数调整效果。",
      },
      {
        title: "使用交互式抠图",
        content: "在「主体提取与再创作」步骤中，主体识别直接显示在原图画布上，不再打开独立弹窗。顶部提供「鼠标 / 增加 / 减少」三种模式、画笔大小滑块和「重置识别」。上传图的重置会恢复自动主体蒙版；AI 生成图的重置会清空手动蒙版，由用户重新添加区域。",
      },
    ],
  },
  {
    id: "guide-mapping",
    title: "配色与调色板",
    icon: "🎨",
    subs: [
      {
        title: "了解色号的来源和含义",
        content: "在色板下方和图纸网格上，你会看到每个格子都有一个色号标注（如'朱砂'、'霁蓝'），这些色号来源于开源的中性命名体系，其目的是为用户提供一种不绑定任何特定商家或品牌的通用颜色标识。每个色号背后对应一个标准的 RGB 十六进制颜色值，你可以在浏览器中直接查看和对照。色号的存在让拼豆图纸的交流变得更加便捷——无论你使用哪个品牌的拼豆材料，只要对照色号的 RGB 数值，就能找到最接近的物理颜色。在实际使用中，建议在开始拼豆之前先用图纸上的色号与手头的材料做一个简单的颜色校对，这样可以确保成品效果与图纸一致。如果你发现某个色号标注与实际手头颜色有偏差，也可以通过调整颜色映射参数来微调最终的配色方案。整个色号体系已在 colorSystemMapping.json 中开源，包含 291 个标准颜色的映射数据，社区可以自由查阅和贡献。",
      },
      {
        title: "使用调色板强制指定颜色",
        content: "在右侧调色板面板中，你可以按色系（红色系、蓝色系等）筛选颜色，点击任意色块将其加入「已选颜色」列表。已选颜色会标注选择顺序（#1、#2...），并会强制作为最终拼豆图纸的可用色，即系统在将原图颜色映射到拼豆色表时，只会使用你选择的这些颜色作为目标色。这对于希望精准控制成品颜色的用户来说非常实用，例如你想让一款青花瓷杯垫只使用蓝色系和白色系的几种特定颜色，就可以先将这些颜色选中，然后生成图纸。已选颜色可以在列表中点击取消选择，也可以点击「清空」按钮一键重置为自动映射模式。需要注意的是，已选颜色的数量不应超过颜色上限滑块设定的值，否则超出部分不会参与映射，系统会给出明确的提示。建议先通过色板浏览和挑选关键颜色，再调整颜色上限来适配。",
      },
      {
        title: "使用颜色上限控制色彩数量",
        content: "颜色上限滑块控制最终图纸使用的颜色数量，取值范围从 2 色到 128 色。这个参数直接影响拼豆图纸的视觉效果和制作难度：颜色上限越低，画面越简洁、色块越大，适合入门或制作大型拼豆作品；颜色上限越高，画面越丰富细腻，但对应的拼豆采购种类也越多、摆豆时对照色号的工作量也越大。对于大多数传统文化主题拼豆作品，建议将颜色上限设置在 8 到 16 色之间，这个范围既能保证图案有足够的色彩层次和辨识度，又不会让材料采购变得过于繁琐。如果你通过调色板手动指定了「已选颜色」，且这些颜色的数量超过颜色上限设定值，超出部分的颜色将不会被系统纳入映射目标，系统会在界面上给出警告提醒。合理搭配颜色上限和已选颜色列表，可以非常灵活地控制最终图纸的色彩方案。",
      },
      {
        title: "了解颜色合并与平滑",
        content: "「平滑杂点」选项是一个像素画后处理优化开关，默认处于开启状态。当它开启时，系统会在初始颜色映射完成后，对相邻且颜色相似的像素区域进行合并处理。具体来说，算法采用广度优先搜索（BFS），遍历整个像素网格，识别出颜色差异（基于 RGB 欧氏距离）小于预设阈值的连通区域，然后将每个区域内的所有像素统一设置为该区域内出现次数最多的色号。这一步骤可以有效消除小面积的杂色块，让画面看起来更加整洁干净，特别适合处理照片或复杂图片转换后产生的琐碎颜色点。如果你处理的是插画或已经比较简洁的图形，杂色问题不严重，也可以关闭此选项以保留原始的细节和边缘过渡。建议在大多数情况下保持开启，仅在需要保留精细纹理或渐变效果时关闭。",
      },
    ],
  },
  {
    id: "guide-export",
    title: "制作与导出",
    icon: "📤",
    subs: [
      {
        title: "下载拼豆图纸",
        content: "在「拼豆图纸」步骤，点击「下载图纸」可导出带色号标注和网格线的PNG图纸。图纸中每个格子都标注了对应的色号，方便摆豆时对照。外部背景会自动忽略，只保留有效拼豆区域。",
      },
      {
        title: "下载用量统计",
        content: "点击「下载用量 CSV」可导出颜色用量统计表，包含色号、RGB值、数量、比例和用途。CSV文件可以用Excel或WPS打开，方便采购和整理材料。",
      },
      {
        title: "查看制作方案",
        content: "在「制作方案」步骤，系统会根据当前图纸统计拼豆总数、颜色数、预估成本和预估用时，并给出材料选择、工具选择、拼豆顺序和熨烫注意事项。",
      },
      {
        title: "导出完整作品资料",
        content: "在「制作方案」步骤右侧可以查看图纸并导出带色号图纸、无标注图纸、材料清单 CSV 和制作方案文本。",
      },
    ],
  },
  {
    id: "common-issues",
    title: "常见问题",
    icon: "❓",
    subs: [
      {
        title: "AI 生成失败怎么办？",
        content: "请首先检查当前网络连接是否正常，AI 图像生成服务需要稳定的互联网连接才能正常工作。如果网络正常但仍多次失败，建议尝试以下替代方案：1）点击「使用内置样例」按钮，系统会使用预设的纹样样例快速生成拼豆图纸，无需依赖 AI 服务；2）直接上传本地的图片素材，上传后系统会通过主体提取算法自动处理。另外请注意，AI 生成过程通常需要 15 到 30 秒的处理时间，请在此期间不要重复点击按钮或切换页面，耐心等待生成完成。如果问题持续存在，可以尝试刷新页面后重试，或者换一个网络环境（如切换 Wi-Fi 和移动网络）后再尝试。",
      },
      {
        title: "上传的图片提取效果不理想",
        content: "上传图的主体提取算法基于边界背景建模和连通区域分析，对轮廓清晰、背景简洁、主体突出的图片识别效果最好。若自动蒙版不理想，可在「主体提取与再创作」步骤直接使用画笔精修：用「增加」补齐缺失主体，用「减少」擦除误选背景；鼠标点击非蒙版像素会增加同色连通主体，点击绿色蒙版像素会删除该连通蒙版区域。AI 生成图不会自动生成蒙版，需要用户手动添加主体区域；该蒙版不会触发二次 AI 再创作。",
      },
      {
        title: "拼豆图纸颜色太多或太少怎么办？",
        content: "颜色数量是影响拼豆图纸视觉效果和制作复杂度的核心参数。如果你觉得最终图纸颜色太多、采购成本过高，可以尝试以下方法：1）降低「颜色上限」滑块的值（建议从当前的数值逐步下调，每调一次重新生成观察效果）；2）在右侧调色板中手动指定关键颜色并点击「清空」重置已选颜色，让系统重新自动映射；3）开启或增强「平滑杂点」选项，它会自动合并相似颜色的相邻区域。如果你觉得颜色太少、画面缺乏层次感，则可以提高颜色上限值，或在调色板中添加更多颜色到已选列表，同时关闭平滑杂点以保留更丰富的色彩过渡细节。建议在 8 到 16 色之间找到一个平衡点。",
      },
      {
        title: "图纸上的色号代表什么？",
        content: "图纸上每个格子标注的色号（例如'朱砂'、'霁蓝'等）来源于一个完全开源的中性色号命名体系，其设计初衷是不绑定任何特定商家或品牌的拼豆产品。这个体系中每个色号对应一个标准的 RGB 十六进制颜色值（例如 #FF0000 对应红色），这些数据都存储在开源文件 colorSystemMapping.json 中，包含 291 个常见颜色的命名映射。色号的存在主要是为了方便用户之间的图纸交流和材料对照——无论你购买的是哪个品牌的拼豆，只要对照色号对应的 RGB 值，就能找到最接近的物理颜色进行替代。需要注意的是，同一色号在不同品牌和批次的拼豆产品中可能会有细微的色差，建议在开始正式制作前先用少量材料做颜色对比测试。如果你发现某个色号的实际颜色与图纸效果差异较大，也可以手动在调色板中选择更合适的颜色重新映射。",
      },
      {
        title: "棕色系怎么没有了？",
        content: "在最新的版本中，我们对颜色分类体系进行了精简和优化，移除了「棕色系」这个独立分类。原本被归为棕色的颜色现在会根据它们的色相（Hue）和饱和度（Saturation）自动分配到「橙色系」或「灰色系」中。具体来说，偏红棕的颜色会被分类到橙色系，而偏灰棕的低饱和度颜色则会被归类到灰色系。这样做的目的是让分类更加清晰和可预测——如果你在筛选色板时想要寻找棕色系的颜色，可以同时查看橙色系和灰色系中的深色区域。这个分类调整不会影响颜色的可用性和映射逻辑，只是改变了它们在界面筛选菜单中的分组位置。",
      },
      {
        title: "如何保存和恢复作品？",
        content: "作品会自动保存在浏览器的本地存储（localStorage）中，无需手动点击保存。在「快速开始」页面中，每次修改配置参数、生成新的主体提取结果或生成拼豆图纸时，系统都会自动将当前完成状态写入到本地存储中。如果你想跨设备或浏览器访问作品，可以点击右上角的登录按钮注册账号，登录后在个人主页中可以看到所有历史作品的记录列表，点击记录即可一键恢复当时的配置参数和图纸状态。需要注意的是，浏览器本地存储的容量有限（通常为 5MB 到 10MB），建议定期清理不需要的旧作品记录。如果你清除了浏览器缓存或使用了隐私模式，本地存储的作品数据可能会丢失，建议重要的作品及时导出图纸和用量统计 CSV 到本地保存。",
      },
    ],
  },
  {
    id: "tech-details",
    title: "技术详解",
    icon: "🔧",
    subs: [
      {
        title: "一、初始颜色映射（基于主导色）",
        content: [
          "遍历 N×M 网格。对每个单元格，在原图对应区域内找出出现频率最高的像素 RGB 值（忽略透明/半透明像素）。使用欧氏距离在 RGB 空间中，将该主导色映射到当前选定调色板中最接近的颜色。记录每个单元格的初始映射色号和颜色。",
          "这种方法比直接使用平均色（Mean Pooling）效果更好，能够避免灰色毛边问题，保持色块纯净。",
          "颜色映射的数学原理如下：对于网格中第 (i,j) 个单元格，记其覆盖的原图像素集合为 S_{ij}，单元格的主导色 D_{ij} 定义为：",
          "D_{ij} = mode{ (R,G,B) | (R,G,B) ∈ S_{ij} }",
          "即该区域内出现频率最高的 RGB 向量。随后将 D_{ij} 映射到调色板 P 中的最近色：",
          "C_{ij} = argmin_{p ∈ P} || D_{ij} - p ||₂",
          "其中 ||·||₂ 表示 RGB 空间中的欧几里得范数：",
          "|| (r₁,g₁,b₁) - (r₂,g₂,b₂) ||₂ = √[(r₁−r₂)² + (g₁−g₂)² + (b₁−b₂)²]",
        ],
      },
      {
        title: "二、区域颜色合并（基于相似度 BFS）",
        content: [
          "使用广度优先搜索（BFS）遍历初始映射数据。识别颜色相似（欧氏距离小于阈值 τ）的连通区域。找出每个区域内出现次数最多的珠子色号，将该区域内所有单元格统一设置为这个主导色号对应的颜色。",
          "这是去除杂色的关键步骤。通过调整相似度阈值 τ 可以控制合并程度，τ 越大合并越多，颜色越少但细节损失也会增加。",
          "颜色合并条件：对相邻单元格 (i,j) 和 (i',j')，若满足：",
          "|| C_{ij} - C_{i'j'} ||₂ ≤ τ",
          "则它们属于同一连通区域。该区域内所有单元格的颜色统一为：",
          "C_region = mode{ C_{ij} | (i,j) ∈ region }",
          "其中 mode 为区域内出现次数最多的色号。合并后的大色块便于实际摆豆操作，减少频繁换色。",
        ],
      },
      {
        title: "三、背景移除（基于边界洪水填充）",
        content: [
          "定义一组背景色号 B = {b₁, b₂, ..., bₖ}。从图像所有边界单元格开始，使用洪水填充（Flood Fill）算法。标记所有从边界开始、颜色属于 B 且相互连通的单元格为「外部背景」。统计和导出时将忽略这些外部单元格。",
          "这确保了用量统计只包含实际需要的拼豆，不会把背景色也算进去。",
          "边界填充的递归定义：",
          "isExternal(i,j) = True 若 (i,j) 在图像边界且 C_{ij} ∈ B",
          "isExternal(i,j) = True 若 ∃ 邻域 (i',j') 满足 isExternal(i',j')=True 且 C_{ij} ∈ B",
          "否则 isExternal(i,j) = False",
          "实际实现采用队列形式的迭代 BFS 来代替递归，避免栈溢出。",
        ],
      },
      {
        title: "四、颜色排除与重映射",
        content: [
          "当自动合并后仍有不满意颜色时，你可以手动排除某些颜色。排除后，系统会确定一个重映射目标调色板 P'（包含网格中最初存在且当前未被排除的所有颜色），将所有使用被排除颜色的非外部单元格重新映射到 P' 中的最接近颜色。",
          "如果目标调色板 P' 为空（排除了所有可用颜色），系统会阻止此次排除。恢复被排除颜色时会触发完整的图像重新处理流程。",
          "颜色排除重映射公式：",
          "P' = { C_{ij} | (i,j) 非外部单元格 } \\ {被排除色号}",
          "C'_{ij} = argmin_{c ∈ P'} || C_{ij} - c ||₂  ,  当 C_{ij} ∈ 被排除色号集合时",
          "即被排除色号集合中的所有单元格，在剩余颜色中寻找 RGB 欧氏距离最近的目标色。",
        ],
      },
      {
        title: "五、图像滤镜实现",
        content: [
          "滤镜在对图像进行像素化之前应用，直接修改原始图像的像素RGB值。每种滤镜采用不同的像素级变换算法，定义如下（记输入像素为 (R,G,B)，取值范围 [0,1]）：",
          "· 高对比：R' = 1/(1+e^{-6(R-0.5)}), G' = 1/(1+e^{-6(G-0.5)}), B' = 1/(1+e^{-6(B-0.5)})，即 Sigmoid 函数拉伸对比度",
          "· 鲜艳：转换到 HSL 空间，饱和度 S' = min(S × 1.4, 1.0)，然后转换回 RGB",
          "· 柔和：转换到 HSL 空间，饱和度 S' = S × 0.6，亮度 L' = 0.3 + L × 0.7",
          "· 暖色调：R' = min(R × 1.1, 1.0), G' = G, B' = max(B × 0.9, 0.0)",
          "· 冷色调：R' = max(R × 0.9, 0.0), G' = G, B' = min(B × 1.1, 1.0)",
          "· 灰度：Y = 0.299R + 0.587G + 0.114B，R'=G'=B'=Y（ITU-R BT.601 亮度公式）",
          "· 怀旧：R' = R×0.393 + G×0.769 + B×0.189, G' = R×0.349 + G×0.686 + B×0.168, B' = R×0.272 + G×0.534 + B×0.131，然后限制到[0,1]区间",
          "滤镜选择直接影响像素化结果，同一张图在不同滤镜下会得到不同的拼豆图纸。建议尝试不同滤镜找到最适合主题的效果。",
        ],
      },
      {
        title: "六、交互式主体识别",
        content: [
          "上传图片时，系统会先基于边界背景色建立背景模型，并用洪水填充找出与边界连通的背景区域，再取最大的前景连通块作为初始绿色主体蒙版。该步骤只在浏览器本地更新蒙版并裁切主体，不会自动调用 AI。",
          "AI 生成图像和内置样例不会执行自动主体识别，初始蒙版为空。用户需要用「增加」画笔或「鼠标」同色连通选择手动添加主体区域；「减少」画笔用于从蒙版中擦除误选区域。",
          "上传图只有在用户点击右侧「AI 再创作」后，才会把主体裁切图发送给再创作接口。AI 负责识别蒙版裁出的物体主体，并结合传统主题、核心元素、文化叙述和作品形式生成输出图像；AI 生成图直接复制到输出端，手动蒙版只用于确认主体范围。",
        ],
      },
      {
        title: "七、开源技术栈",
        content: [
          "前端框架：Next.js (React) + TypeScript",
          "样式方案：Tailwind CSS",
          "图像处理：浏览器端 Canvas 2D API",
          "AI 生成：服务器端 API 调用",
          "状态管理：React Hooks (useState / useRef / useEffect / useMemo)",
          "数据持久化：浏览器 localStorage",
          "数据格式：开源 JSON 色号映射表 (colorSystemMapping.json)",
          "所有代码完全开源，基于 Apache 2.0 许可证，欢迎二次开发和改进。",
        ],
      },
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

function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" });
  downloadUrl(URL.createObjectURL(blob), filename);
}

function estimateBeadingMinutes(totalBeads: number, colorKinds: number): number {
  if (totalBeads <= 0) return 0;
  return Math.round(totalBeads * 0.25 + colorKinds * 4 + 10);
}

const BEAD_TIME_PER_PIECE = 0.25;
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

function formatPostTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN");
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

function CraftSection({ setView }: { setView: (v: SiteView) => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const subtitleText = "从文化意象到拼豆底稿";
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
  }, [visible]);

  return (
    <section ref={sectionRef} className="bg-[#fffdf7] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-[#8f1d21]">制作流程</p>
        <h2 className="mt-2 min-h-[1.2em] text-3xl font-semibold tracking-tight">
          {typedSub}
          {visible && typedSub.length < subtitleText.length && (
            <span className="inline-block w-[2px] h-[0.9em] bg-[#8f1d21] ml-0.5 animate-pulse align-middle" />
          )}
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {craftSteps.map((item, i) => (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                setView("faq");
                setTimeout(() => {
                  document.getElementById(item.anchor)?.scrollIntoView({ behavior: "smooth" });
                }, 150);
              }}
              className={`flex h-full flex-col rounded-lg border border-stone-200 bg-[#fbf7ed] p-5 text-left transition-all duration-700 ease-out hover:border-[#8f1d21]/40 hover:shadow-sm ${
                visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{
                transitionDelay: visible ? `${i * 250 + 500}ms` : "0ms",
              }}
            >
              <PatternMiniature colors={["#FFFFFF", "#1557A8", "#943630", "#EDB045"]} />
              <p className="mt-3 text-xs font-bold tracking-wider text-[#8f1d21] uppercase">
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

function HomeCommunitySection({ setView }: { setView: (v: SiteView) => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [forumText, setForumText] = useState("");
  const [faqText, setFaqText] = useState("");
  const forumTitle = "社区论坛";
  const faqTitle = "疑问解答";

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
  }, [visible]);

  return (
    <section ref={sectionRef} className="bg-[#f8f5ef] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-[#8f1d21]">作品分享</p>
            <h2 className="mt-2 min-h-[1.2em] text-3xl font-semibold tracking-tight">
              {forumText}
              {visible && forumText.length < forumTitle.length && <span className="ml-0.5 inline-block h-[0.9em] w-[2px] animate-pulse bg-[#8f1d21] align-middle" />}
            </h2>
            <button
              type="button"
              onClick={() => setView("community")}
              className={`mt-8 w-full rounded-lg border border-stone-200 bg-white p-6 text-left shadow-sm transition-all duration-700 hover:border-[#8f1d21]/50 hover:shadow-md ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
            >
              <PatternMiniature colors={["#FFFFFF", "#1557A8", "#943630", "#EDB045"]} />
              <h3 className="mt-4 text-xl font-semibold">进入论坛</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">浏览大家发布的拼豆作品，搜索主题关键词，一键导入喜欢的模板继续创作。</p>
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#8f1d21]">使用帮助</p>
            <h2 className="mt-2 min-h-[1.2em] text-3xl font-semibold tracking-tight">
              {faqText}
              {visible && forumText.length >= forumTitle.length && faqText.length < faqTitle.length && <span className="ml-0.5 inline-block h-[0.9em] w-[2px] animate-pulse bg-[#8f1d21] align-middle" />}
            </h2>
            <button
              type="button"
              onClick={() => setView("faq")}
              className={`mt-8 w-full rounded-lg border border-stone-200 bg-white p-6 text-left shadow-sm transition-all delay-200 duration-700 hover:border-[#8f1d21]/50 hover:shadow-md ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
            >
              <div className="rounded-md bg-stone-100 p-5">
                <h3 className="text-xl font-semibold">查看帮助</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">从主题选择、主体识别、拼豆图纸到制作导出，按步骤查看详细说明。</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScrollingPatternBand() {
  const patternSet = [...scrollingPatterns, ...scrollingPatterns.slice(0, 2)];

  return (
    <div className="relative mt-12 overflow-hidden py-4" aria-hidden="true">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#2b2118] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#2b2118] to-transparent" />
      <div className="home-pattern-scroll-track">
        {[0, 1].map((group) => (
          <div key={group} className="home-pattern-scroll-set">
            {patternSet.map((colors, index) => (
              <div key={`${group}-${index}`} className="h-24 w-24 flex-none rounded-lg bg-white/10 p-2 shadow-lg ring-1 ring-white/15 sm:h-28 sm:w-28">
                <PatternMiniature colors={colors} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreativeBeadStudio() {
  const firstTheme = cultureThemes[1] ?? cultureThemes[0];
  const [view, setView] = useState<SiteView>("home");
  const [step, setStep] = useState<StudioStep>("config");
  const [theme, setTheme] = useState(firstTheme.name);
  const [element, setElement] = useState(firstTheme.elements[0] ?? "传统纹样");
  const [meaning, setMeaning] = useState(firstTheme.meaning);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 拼豆图纸步骤：点击编辑颜色
  const [isPainting, setIsPainting] = useState(false);
  const [paintColor, setPaintColor] = useState<string>('#000000');
  const [paintColorKey, setPaintColorKey] = useState<string>('');
  const directOutputRef = useRef(false);

  const product = getProductTemplate(productId);
  const formLabel = formLabels.find((item) => item.id === productId)?.label ?? "拼豆底稿";
  const options = useMemo(
    () => ({
      theme,
      element,
      meaning,
      product: formLabel,
      productPrompt: product.aiPrompt,
      aspectRatio,
      gridSize,
      colorCount,
    }),
    [aspectRatio, colorCount, element, formLabel, gridSize, meaning, product.aiPrompt, theme],
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

  const copy = useMemo(
    () => generateCultureCopy({ ...options, meaning, beadCounts }),
    [beadCounts, meaning, options],
  );

  const forcedColorWarning = useMemo(() => {
    if (forcedColors.length <= colorCount) return null;
    return `已指定 ${forcedColors.length} 种颜色，超过当前 ${colorCount} 色上限。超出的 ${forcedColors.length - colorCount} 种颜色不会进入最终映射，请减少指定颜色或提高颜色上限。`;
  }, [colorCount, forcedColors.length]);

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(() => loadCurrentUserProfile());
  const [communityQuery, setCommunityQuery] = useState("");
  const [communityRefresh, setCommunityRefresh] = useState(0);
  const [selectedCommunityPost, setSelectedCommunityPost] = useState<CommunityPost | null>(null);
  const [cloudCommunityPosts, setCloudCommunityPosts] = useState<CloudCommunityPost[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);

  const communityPosts = useMemo<CommunityPost[]>(() => {
    const cloudPosts = cloudCommunityPosts.map((post): CommunityPost => ({
      ...post,
      type: "project",
    }));
    const query = communityQuery.trim().toLowerCase();
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

  const restoringRef = useRef(false);

  const [confirmNew, setConfirmNew] = useState<"ai" | "sample" | "upload" | null>(null);
  const pendingUploadRef = useRef<File | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalStep, setLoginModalStep] = useState<"login" | "register">("login");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"warning" | "success">("warning");
  const [, setAiCopy] = useState<string | null>(null);
  const [showAiChat, setShowAiChat] = useState(false);
  const [aiChatResetToken, setAiChatResetToken] = useState(0);
  const [extractPrompt, setExtractPrompt] = useState<string | null>(null);
  const [subjectAnalysis, setSubjectAnalysis] = useState<SubjectAnalysis | null>(null);
  const [subjectDirty, setSubjectDirty] = useState(false);
  const [subjectMaskMode, setSubjectMaskMode] = useState<MaskMode>("select");
  const [subjectMaskSnapshot, setSubjectMaskSnapshot] = useState<SubjectMask | null>(null);
  const [resultSubjectAnalysis, setResultSubjectAnalysis] = useState<SubjectAnalysis | null>(null);
  const [resultMaskMode, setResultMaskMode] = useState<MaskMode>("select");
  const [resultMaskSnapshot, setResultMaskSnapshot] = useState<SubjectMask | null>(null);
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
  const homeTypingLine1 = "方寸之间，粒粒皆可触摸的东方诗篇";
  const homeTypingLine2 = "从传统纹样中拾取一片色彩，让古老的审美以新的温度落回掌心。豆韵以AI为笔，将文化意象织入像素网格——选题、生成、映射、成稿，每一步皆是对传统的再创作，也是献给手作时光的一封情书。";
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
  }, [view]);

  // Toast 自动消失
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => {
      setToastMsg(null);
      setToastType("warning");
    }, 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // 检查是否有未保存的进度
  useEffect(() => {
    let alive = true;
    setCommunityLoading(true);
    setCommunityError(null);
    fetchCommunityPosts(communityQuery)
      .then((posts) => {
        if (alive) setCloudCommunityPosts(posts);
      })
      .catch((err) => {
        if (alive) setCommunityError(err instanceof Error ? err.message : "社区作品加载失败");
      })
      .finally(() => {
        if (alive) setCommunityLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [communityQuery, communityRefresh]);

  const hasUnsavedWork = !!(sourceImageUrl || pattern || patternUrl);

  const clearPatternArtifacts = useCallback(() => {
    setPattern(null);
    setPatternUrl(null);
    setCleanPatternUrl(null);
  }, []);

  const clearResultSubjectSelection = useCallback(() => {
    setResultSubjectAnalysis(null);
    setResultMaskSnapshot(null);
    setResultMaskMode("select");
  }, []);

  const generateCultureText = useCallback(async () => {
    if (!pattern || beadCounts.length === 0) {
      setToastType("warning");
      setToastMsg("请先生成拼豆图纸。");
      return;
    }
    setCultureTextLoading(true);
    try {
      const response = await fetch("/api/generate-culture-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          element,
          meaning,
          product: formLabel,
          gridWidth: pattern.width,
          gridHeight: pattern.height,
          gridSize,
          colorCount,
          beadCounts,
          imageUrl: extractedImageUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "文化文案生成失败");
      if (result.copy) {
        setAiCultureCopy(result.copy);
      }
      if (result.prompt) {
        setCulturePrompt(result.prompt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "文化文案生成失败");
    } finally {
      setCultureTextLoading(false);
    }
  }, [pattern, beadCounts, theme, element, meaning, formLabel, gridSize, colorCount, extractedImageUrl]);


  const clearCurrentProgress = useCallback(() => {
    directOutputRef.current = false;
    clearPatternArtifacts();
    clearResultSubjectSelection();
    setSourceImageUrl(null);
    setExtractedImageUrl(null);
    setSubjectAnalysis(null);
    setSubjectMaskSnapshot(null);
    setSubjectDirty(false);
    setExtractPrompt(null);
    setError(null);
    setConfirmNew(null);
    setStep("config");
  }, [clearPatternArtifacts, clearResultSubjectSelection]);

  const doUseSample = useCallback(() => {
    clearPatternArtifacts();
    const original = renderSampleDesignOriginal(options);
    directOutputRef.current = true;
    setSubjectAnalysis(null);
    setSubjectMaskSnapshot(null);
    setSubjectDirty(false);
    setSourceImageUrl(original);
    setExtractedImageUrl(original);
    clearResultSubjectSelection();
    setExtractPrompt(null);
    setError(null);
    setConfirmNew(null);
    setStep("extract");
  }, [clearPatternArtifacts, clearResultSubjectSelection, options]);

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
      directOutputRef.current = false;
      setSubjectAnalysis(null);
      setSubjectMaskSnapshot(null);
      setSubjectDirty(false);
      setSourceImageUrl(imageUrl);
    setExtractedImageUrl(null);
    clearResultSubjectSelection();
      setExtractPrompt(null);
      clearPatternArtifacts();
      setStep("extract");
      // 上传时自动生成AI文化描述
      try {
        const res = await fetch("/api/generate-culture-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme, element, meaning, product: formLabel }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.text) setAiCopy(data.text);
        }
      } catch {
        // AI 文化描述生成失败不影响主流程
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片处理失败");
    } finally {
      setLoading(false);
      setConfirmNew(null);
    }
  };

  useEffect(() => {
    if (!pattern) return;
    if (canvasRef.current) {
      renderPatternToCanvas(canvasRef.current, pattern, showGrid);
    }
    const patternCanvas = document.createElement("canvas");
    renderPatternToCanvas(patternCanvas, pattern, showGrid);
    setPatternUrl(patternCanvas.toDataURL("image/png"));

    const cleanCanvas = document.createElement("canvas");
    renderPatternToCanvasClean(cleanCanvas, pattern, showGrid);
    setCleanPatternUrl(cleanCanvas.toDataURL("image/png"));
  }, [pattern, showGrid, step]);

  const handleThemeInput = (value: string) => {
    setTheme(value);
    const next = cultureThemes.find((item) => item.name === value || item.id === value);
    if (!next) return;
    setElement(next.elements[0] ?? "");
    setMeaning(next.meaning);
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
    setToastMsg("请先完成主题提取，再生成拼豆图纸。");
    setStep("extract");
      return;
    }
    if (!resultSubjectAnalysis) {
      setError(null);
      setToastType("warning");
      setToastMsg("请先在创作结果中点击主体，或使用增加/减少画笔指定要拼豆化的主体区域。");
      setStep("extract");
      return;
    }
    if (!directOutputRef.current && subjectDirty) {
      setError(null);
      setToastType("warning");
      setToastMsg("主体区域已变化，请先点击 AI 再创作生成新的输出图像。");
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
      setError(err instanceof Error ? err.message : "拼豆图纸生成失败");
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

  const handleGenerateAI = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-culture-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "AI 图案生成失败");
      directOutputRef.current = true;
      setSubjectAnalysis(null);
      setSubjectMaskSnapshot(null);
      setSubjectDirty(false);
      setSourceImageUrl(result.imageUrl);
      setExtractedImageUrl(result.imageUrl);
      clearResultSubjectSelection();
      setExtractPrompt(result.prompt);
      clearPatternArtifacts();
      setStep("extract");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 图案生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectAnalysis = useCallback((analysis: SubjectAnalysis) => {
    setSubjectAnalysis(analysis);
    if (directOutputRef.current) {
      setSubjectDirty(false);
      return;
    }
    setSubjectDirty(true);
  }, []);

  const generateSubjectRecreation = useCallback(async () => {
    if (directOutputRef.current) return;
    if (!subjectAnalysis) {
      setError(null);
      setToastType("warning");
      setToastMsg("请先在左侧完成主体区域选择。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extract-theme-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: subjectAnalysis.subjectImageUrl,
          isUpload: true,
          product: formLabel,
          productPrompt: product.aiPrompt,
          aspectRatio,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "主体提取失败");
      setExtractedImageUrl(result.imageUrl);
      clearResultSubjectSelection();
      setExtractPrompt(result.prompt);
      clearPatternArtifacts();
      setSubjectDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "抠图结果转传统文创图案失败");
    } finally {
      setLoading(false);
    }
  }, [aspectRatio, clearPatternArtifacts, clearResultSubjectSelection, formLabel, product.aiPrompt, subjectAnalysis]);

  const renderImageBox = (url: string | null, alt: string) => (
    <div className="aspect-square overflow-hidden rounded-md border border-stone-200 bg-stone-50">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full place-items-center text-sm text-stone-400">暂无图像</div>
      )}
    </div>
  );
  void renderImageBox;

  const renderStep = () => {
    if (step === "config") {
      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">配置传统文化拼豆方案</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">选择主题、核心元素、叙述、作品形式、比例与网格参数。</p>
            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-medium">
                传统主题
                <input
                  list="culture-theme-options"
                  value={theme}
                  onChange={(event) => handleThemeInput(event.target.value)}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2"
                />
                <datalist id="culture-theme-options">
                  {cultureThemes.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm font-medium">
                核心元素
                <input value={element} onChange={(event) => setElement(event.target.value)} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium">
                文化叙述
                <textarea value={meaning} onChange={(event) => setMeaning(event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2" />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">
                  作品形式
                  <select value={productId} onChange={(event) => applyProductConfigDefault(event.target.value)} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2">
                    {formLabels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  画面比例
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
                  网格尺寸：{gridSize} x {gridSize}
                  <input type="range" min={16} max={128} step={8} value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className="mt-3 w-full" />
                </label>
                <label className="text-sm font-medium">
                  颜色上限：{colorCount} 色
                  <input type="range" min={2} max={128} step={2} value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))} className="mt-3 w-full" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  显示网格
                  <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  平滑杂点
                  <input type="checkbox" checked={antiAlias} onChange={(event) => setAntiAlias(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  连接孤立色块
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
                  className="rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? "生成中..." : "AI 生成图案"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (hasUnsavedWork) { setConfirmNew("sample"); return; }
                    doUseSample();
                  }}
                  className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold"
                >
                  使用内置样例
                </button>
                <label className="cursor-pointer rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">
                  上传图片
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
            <h2 className="text-xl font-semibold">调色板</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">按色系筛选可用颜色，点击选择要纳入最终色表的颜色，已选颜色会标注选择顺序。</p>
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
                      ? "bg-[#8f1d21] text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {f.icon} {f.key}
                </button>
              ))}
            </div>
            {/* 已选颜色展示 */}
            {forcedColors.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md bg-stone-50 p-2">
                <span className="mr-1 text-xs font-medium text-stone-500">已选：</span>
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
                  清空
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
                    title={`${selected ? `已选第 ${selectedIndex + 1} 个` : "点击选择"}：${item.key} ${item.color}`}
                    onClick={() => setForcedColors((prev) => (selected ? prev.filter((hex) => hex !== item.color) : [...prev, item.color]))}
                    className={`relative h-7 w-7 rounded border transition ${selected ? "border-stone-950 ring-2 ring-[#8f1d21]" : "border-stone-200 hover:scale-110"}`}
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
                <span className="text-sm font-medium">滤镜</span>
                <FilterDropdown value={selectedFilter} onChange={(value) => setSelectedFilter(value)} />
              </div>
              {selectedFilter !== "none" && (
                <div className="mt-2 text-xs text-stone-500 leading-relaxed">
                  {IMAGE_FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.desc ?? "保持原始色彩"}
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
              <h2 className="text-xl font-semibold">原图</h2>
              <p className="mt-1 text-sm text-stone-500">
                交互式主体识别：请点击图像中的主体。绿色蒙版表示将进入拼豆化的主体范围；识别不准时，可切换增加或减少并用画笔修正。
              </p>
            </div>
            <SubjectMaskEditor
              imageUrl={sourceImageUrl}
              loading={loading}
              autoDetect={!directGeneratedImage}
              mode={subjectMaskMode}
              savedMask={subjectMaskSnapshot}
              onModeChange={setSubjectMaskMode}
              onSubjectChange={handleSubjectAnalysis}
              onMaskSnapshotChange={setSubjectMaskSnapshot}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={handleGenerateAI} disabled={loading} className="rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading ? "生成中..." : "重新 AI 生成"}
              </button>
              <label className="cursor-pointer rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">
                重新上传
                <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void doUpload(file);
                  event.currentTarget.value = "";
                }} />
              </label>
            </div>
          </section>
          <div className="space-y-5">
            {!directGeneratedImage && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="text-xl font-semibold">AI 再创作</h2>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  左侧主体识别只在本地计算蒙版和裁切主体。点击此按钮后，才会把主体裁切图发送给 AI 生成传统文化风格输出图像。
                </p>
                {subjectDirty && extractedImageUrl && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    主体区域已变化，需要重新 AI 再创作后再生成拼豆图纸。
                  </div>
                )}
                <button
                  type="button"
                  onClick={generateSubjectRecreation}
                  disabled={loading || !subjectAnalysis}
                  className="mt-4 rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? "生成中..." : extractedImageUrl ? "重新 AI 再创作" : "AI 再创作"}
                </button>
              </section>
            )}
            {extractedImageUrl && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">当前 AI 提示词</h2>
                </div>
                <div className="mt-3 max-h-40 overflow-y-auto rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-600 font-mono whitespace-pre-wrap">
                  {extractPrompt || "无"}
                </div>
              </section>
            )}
            <section className="rounded-lg border border-stone-200 bg-white p-5">
              <h2 className="text-xl font-semibold">创作结果</h2>
              <div className="mt-4">
                <SubjectMaskEditor
                  imageUrl={extractedImageUrl}
                  loading={loading}
                  autoDetect={false}
                  showHeader={false}
                  mode={resultMaskMode}
                  savedMask={resultMaskSnapshot}
                  onModeChange={setResultMaskMode}
                  onSubjectChange={setResultSubjectAnalysis}
                  onMaskSnapshotChange={setResultMaskSnapshot}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={buildPatternFromExtracted} disabled={loading || !extractedImageUrl || (!directGeneratedImage && subjectDirty)} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {loading ? "生成中..." : "生成拼豆图纸"}
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
        if (!pattern || !canvasRef.current || !isPainting) return;
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
                <h2 className="text-xl font-semibold">拼豆图纸</h2>
                <p className="mt-1 text-sm text-stone-500">当前使用开源传统色号标注，不包含外部供应专属字段。</p>
              </div>
              <div className="flex gap-2">
                {patternUrl && (
                  <button type="button" onClick={() => downloadUrl(patternUrl, "traditional-bead-pattern.png")} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold">
                    下载图纸
                  </button>
                )}
                <button type="button" onClick={() => downloadBeadCsv(beadCounts, "traditional-bead-counts.csv")} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold">
                  下载用量 CSV
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
                        ? 'bg-[#8f1d21] text-white shadow-sm'
                        : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {isPainting ? '编辑中' : '点击编辑'}
                  </button>
                  {isPainting && (
                    <span className="text-xs text-stone-500 ml-1">
                      在图纸上点击格子修改颜色 | 当前颜色：
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
                            setPaintColor(hex);
                            setPaintColorKey(key);
                          }}
                          className={`h-6 w-6 rounded border transition hover:scale-110 ${
                            paintColor === hex
                              ? 'border-stone-950 ring-2 ring-[#8f1d21] scale-110'
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
                      <p className="text-sm text-stone-500">第三阶段会把主题提取图案转换成拼豆网格。</p>
                      <button type="button" onClick={buildPatternFromExtracted} disabled={loading || !extractedImageUrl} className="mt-3 rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                        {loading ? "生成中..." : "生成拼豆图纸"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

          <div className="flex flex-col gap-6 overflow-y-auto">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">用量统计</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center md:grid-cols-4">
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">总颗数</p>
                <p className="text-lg font-bold">{total}</p>
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">颜色数</p>
                <p className="text-lg font-bold">{beadCounts.length}</p>
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">网格</p>
                <p className="text-lg font-bold">{pattern ? `${pattern.width}x${pattern.height}` : "-"}</p>
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">预估用时</p>
                <p className="text-lg font-bold">{beadingMinutes} 分钟</p>
              </div>
            </div>
            <div className="mt-4 max-h-[480px] overflow-auto rounded-md border border-stone-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-100 text-left text-stone-600">
                  <tr>
                    <th className="px-3 py-2">颜色</th>
                    <th className="px-3 py-2">色号</th>
                    <th className="px-3 py-2 text-right">数量</th>
                    <th className="px-3 py-2">用途</th>
                  </tr>
                </thead>
                <tbody>
                  {beadCounts.map((item) => (
                    <tr
                      key={item.rgb}
                      className="cursor-pointer border-t border-stone-200 hover:bg-stone-50"
                      onClick={() => {
                        setPaintColor(item.rgb);
                        setPaintColorKey(item.brandCode);
                        setIsPainting(true);
                      }}
                      title="点击选择该颜色作为编辑颜色"
                    >
                      <td className="px-3 py-2">
                        <span className="mr-2 inline-block h-4 w-4 rounded-sm border border-stone-300 align-middle" style={{ backgroundColor: item.rgb }} />
                        {item.rgb}
                      </td>
                      <td className="px-3 py-2 font-mono">{item.brandCode}</td>
                      <td className="px-3 py-2 text-right">{item.count}</td>
                      <td className="px-3 py-2">{item.usage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">当前配置</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">可在此直接调整参数，图纸将实时刷新。</p>
            <div className="mt-3 grid gap-3">
              <label className="text-sm font-medium">
                作品形式
                <select value={productId} onChange={(event) => applyProductConfigDefault(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
                  {formLabels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                画面比例
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatioId)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
                  {aspectRatios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                网格尺寸：{gridSize}
                <input type="range" min={16} max={128} step={8} value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <label className="text-sm font-medium">
                颜色上限：{colorCount} 色
                <input type="range" min={2} max={128} step={2} value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  显示网格
                  <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  平滑杂点
                  <input type="checkbox" checked={antiAlias} onChange={(event) => setAntiAlias(event.target.checked)} />
                </label>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">滤镜</span>
                  <FilterDropdown value={selectedFilter} onChange={(value) => setSelectedFilter(value)} />
                </div>
                {selectedFilter !== "none" && (
                  <div className="mt-2 text-xs text-stone-500 leading-relaxed">
                    {IMAGE_FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.desc ?? "保持原始色彩"}
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
    const planText = [
      `${copy.title} 拼豆制作方案`,
      "",
      `作品形式：${formLabel}`,
      `网格：${pattern ? `${pattern.width} x ${pattern.height}` : "-"}`,
      `颜色数：${beadCounts.length}`,
      `拼豆总数：${total}`,
      `预估拼豆用时：${formatDuration(beadingMinutes)}`,
      `预估材料成本：约 ${cost.min}-${cost.max} 元`,
      "",
      "材料选择：",
      "1. 按材料清单准备对应色号拼豆，建议每种颜色比统计数量多准备 10%-15%。",
      "2. 优先选择同一规格、同一品牌或尺寸一致的 5mm 拼豆，避免熨烫高度不一致。",
      "3. 大面积底色可多准备一包，少量点缀色按最小包装购买即可。",
      "",
      "工具选择：",
      "1. 透明方形模板板，尺寸需覆盖当前图纸网格。",
      "2. 尖头镊子或取豆笔，用于定位小色块和边缘细节。",
      "3. 熨斗、烘焙纸或专用熨烫纸、平整压板。",
      "",
      "拼豆步骤：",
      "1. 从边缘轮廓或最大色块开始摆放，减少整体偏移。",
      "2. 每完成一种颜色，对照图纸和用量统计检查遗漏。",
      "3. 小面积颜色最后补齐，避免移动模板时松散。",
      "",
      "熨烫步骤与注意事项：",
      "1. 覆盖熨烫纸后使用中低温，不要开蒸汽。",
      "2. 以小圆周移动熨斗，先轻压 10-15 秒观察融合状态，再逐步补熨。",
      "3. 豆孔略收缩且相邻豆粒连接即可停止，避免过熨导致图案变形。",
      "4. 熨完后用平整重物压 2-3 分钟，冷却后再从模板上取下。",
    ].join("\n");

    return (
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="space-y-5">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">制作方案</h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-500">根据当前图纸用量，提供材料、工具、拼豆和熨烫流程参考。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">

              <div className="relative rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">预估成本</p>
                <button type="button" onClick={() => setCostDropdownOpen(!costDropdownOpen)} className="w-full text-left text-lg font-bold hover:text-stone-700">约 {cost.min}-{cost.max} 元</button>
                {costDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-stone-200 bg-white p-3 shadow-lg">
                    <p className="text-xs font-medium text-stone-500">成本组成</p>
                    <ul className="mt-2 space-y-1 text-xs text-stone-600">
                      <li className="flex justify-between"><span>拼豆包数</span><span>{Math.max(beadCounts.length, Math.ceil((total * 1.15) / 1000))} 包</span></li>
                      <li className="flex justify-between"><span>拼豆单价</span><span>3~7 元/包</span></li>
                      <li className="flex justify-between"><span>模板板</span><span>5~10 元</span></li>
                      <li className="flex justify-between"><span>熨烫纸</span><span>3~10 元</span></li>
                      <li className="mt-1 border-t border-stone-100 pt-1 font-medium">合计：{cost.min}~{cost.max} 元</li>
                    </ul>
                  </div>
                )}
              </div>
              <div className="relative rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">拼豆用时</p>
                <button type="button" onClick={() => setTimeDropdownOpen(!timeDropdownOpen)} className="w-full text-left text-lg font-bold hover:text-stone-700">{beadingMinutes} 分钟</button>
                {timeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-stone-200 bg-white p-3 shadow-lg">
                    <p className="text-xs font-medium text-stone-500">用时组成</p>
                    <ul className="mt-2 space-y-1 text-xs text-stone-600">
                      <li className="flex justify-between"><span>单颗摆豆时间</span><span>{BEAD_TIME_PER_PIECE} 分钟/颗</span></li>
                      <li className="flex justify-between"><span>摆豆总计（{total} 颗）</span><span>≈{Math.round(total * BEAD_TIME_PER_PIECE)} 分钟</span></li>
                      <li className="flex justify-between"><span>换色（{beadCounts.length} 色 × 4 分钟/色）</span><span>{beadCounts.length * 4} 分钟</span></li>
                      <li className="flex justify-between"><span>熨烫（含预热、熨烫、冷却）</span><span>{IRONING_TIME} 分钟</span></li>
                      <li className="mt-1 border-t border-stone-100 pt-1 font-medium"><span>合计</span><span>约 {beadingMinutes} 分钟</span></li>

                    </ul>
                  </div>
                )}
              </div>
              <div className="rounded-md bg-stone-100 p-3">
                <p className="text-xs text-stone-500">图纸规模</p>
                <p className="text-lg font-bold">{pattern ? `${pattern.width}x${pattern.height}` : "-"}</p>
              </div>
            </div>
          </div>

            <>
              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">材料选择</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
                  <li>按用量统计准备对应色号拼豆，建议每种颜色多备 10%-15%，防止丢豆和色差补充。</li>
                  <li>优先使用同规格拼豆；同一作品不要混用高度差异明显的材料。</li>
                  <li>大色块颜色按整包准备，点缀色可按最小包装购买。</li>
                </ul>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">工具选择</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
                  <li>模板板：透明方形板更适合对照网格，尺寸需覆盖完整图纸。</li>
                  <li>定位工具：尖头镊子适合调整边缘和孤立小色块，取豆笔适合大面积铺色。</li>
                  <li>熨烫工具：熨斗、熨烫纸、平整压板；熨斗需关闭蒸汽。</li>
                </ul>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">拼豆</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
                  <li>先摆放外轮廓或最大色块，建立边界后再填内部细节。</li>
                  <li>按颜色逐项完成，每完成一种颜色就对照用量统计检查遗漏。</li>
                  <li>细小点缀色最后补齐，避免在大面积移动时被碰偏。</li>
                </ol>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-5">
                <h3 className="text-lg font-semibold">熨烫</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
                  <li>覆盖熨烫纸后使用中低温，先轻压并小范围圆周移动。</li>
                  <li>首次熨烫 10-15 秒后检查豆粒连接状态，再分段补熨。</li>
                  <li>豆孔略收缩且相邻豆粒已连接即可停止，避免过熨导致图案变形。</li>
                  <li>熨完用平整重物压 2-3 分钟，完全冷却后再脱板。</li>
                </ol>
              </div>
            </>

        </section>

        <section className="space-y-5">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-3 text-xl font-semibold">图纸预览</h2>
            {patternUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={patternUrl} alt="拼豆图纸" className="max-h-[520px] w-full rounded-md border border-stone-200 object-contain" />
            ) : (
              <div className="grid min-h-64 place-items-center rounded-md bg-stone-50 text-sm text-stone-400">暂无图纸</div>
            )}
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-3 text-xl font-semibold">方案导出</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={!patternUrl} onClick={() => patternUrl && downloadUrl(patternUrl, `${copy.title}-拼豆图纸.png`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">下载图纸 PNG</button>
              <button type="button" disabled={!cleanPatternUrl} onClick={() => cleanPatternUrl && downloadUrl(cleanPatternUrl, `${copy.title}-无标注图纸.png`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">下载无标注 PNG</button>
              <button type="button" disabled={beadCounts.length === 0} onClick={() => downloadBeadCsv(beadCounts, `${copy.title}-材料清单.csv`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">导出材料 CSV</button>
              <button type="button" disabled={!pattern} onClick={() => downloadTextFile(planText, `${copy.title}-制作方案.txt`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">导出制作方案</button>
            </div>
          </div>
          {culturePrompt && (
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">AI 文化文案提示词</h2>
              </div>
              <div className="mt-3 max-h-48 overflow-y-auto rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-600 font-mono whitespace-pre-wrap">
                {culturePrompt}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">文化说明</h2>
              <button
                type="button"
                onClick={generateCultureText}
                disabled={cultureTextLoading}
                className="rounded-md bg-[#8f1d21] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {cultureTextLoading ? "AI 生成中..." : "AI 生成文化说明"}
              </button>
            </div>
            {aiCultureCopy ? (
              <CultureExplanation copy={aiCultureCopy} />
            ) : (
              <CultureExplanation copy={copy} />
            )}
          </div>

        </section>
      </div>
    );
  };

  const handleRestoreProject = useCallback((record: ProjectRecord) => {
    restoringRef.current = true;
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
    directOutputRef.current = !!record.sourceImageUrl && record.extractedImageUrl === record.sourceImageUrl;
    setSourceImageUrl(record.sourceImageUrl);
    setExtractedImageUrl(record.extractedImageUrl);
    setSubjectMaskSnapshot(null);
    clearResultSubjectSelection();
    setPatternUrl(record.patternUrl);
    setCleanPatternUrl(record.cleanPatternUrl);

    // 恢复 pattern 对象
    if (record.patternData) {
      try {
        setPattern(JSON.parse(record.patternData) as BeadPattern);
      } catch {
        setPattern(null);
      }
    } else {
      setPattern(null);
    }

    setStep("config");
    setView("start");
  }, [clearResultSubjectSelection]);

  // 自动保存当前作品到历史记录
  const buildCurrentProjectRecord = useCallback((title?: string): ProjectRecord => ({
    id: `proj_${Date.now()}`,
    title: title ?? `${theme} · ${element}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completed: step === "preview" && !!pattern,
    theme,
    element,
    meaning,
    productId,
    gridSize,
    colorCount,
    aspectRatio,
    showGrid,
    antiAlias,
    sourceImageUrl,
    extractedImageUrl,
    patternData: pattern ? JSON.stringify(pattern) : null,
    patternUrl,
    cleanPatternUrl,
    mockupUrl: null,
    productSceneUrl: null,
  }), [antiAlias, aspectRatio, cleanPatternUrl, colorCount, element, extractedImageUrl, gridSize, meaning, pattern, patternUrl, productId, showGrid, sourceImageUrl, step, theme]);

  const publishCurrentWork = useCallback(async () => {
    if (!sourceImageUrl && !pattern && !patternUrl) {
      setToastType("warning");
      setToastMsg("请先完成一个作品进度后再发布。");
      return;
    }
    const record = buildCurrentProjectRecord(`${theme} · ${element}`);
    saveProjectRecord(record);
    try {
      await publishCommunityPost({
        record,
        author: currentUser?.nickname ?? "豆韵用户",
        avatar: currentUser?.avatarUrl ?? "",
        colors: forcedColors,
      });
      setCommunityRefresh((value) => value + 1);
      setToastType("success");
      setToastMsg("作品已发布到云端社区，并同步保存到个人主页。");
      setView("community");
    } catch (err) {
      setToastType("warning");
      setToastMsg(err instanceof Error ? err.message : "作品发布失败");
    }
  }, [buildCurrentProjectRecord, currentUser, element, forcedColors, pattern, patternUrl, sourceImageUrl, theme]);

  const importCommunityPost = useCallback((post: CommunityPost) => {
    if (post.record) {
      const cloned: ProjectRecord = {
        ...post.record,
        id: `proj_${Date.now()}`,
        title: `${post.title} · 导入`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completed: false,
      };
      saveProjectRecord(cloned);
      handleRestoreProject(cloned);
      setCommunityRefresh((value) => value + 1);
      setSelectedCommunityPost(null);
      setToastType("success");
      setToastMsg("已导入作品模板，并保存到个人主页。");
      return;
    }

    const defaults = getProductConfigDefault(post.productId);
    const record: ProjectRecord = {
      id: `proj_${Date.now()}`,
      title: `${post.title} · 导入`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completed: false,
      theme: post.theme,
      element: post.element,
      meaning: post.meaning,
      productId: post.productId,
      gridSize: defaults.gridSize,
      colorCount: defaults.colorCount,
      aspectRatio: defaults.aspectRatio,
      showGrid: true,
      antiAlias: true,
      sourceImageUrl: null,
      extractedImageUrl: null,
      patternData: null,
      patternUrl: null,
      cleanPatternUrl: null,
      mockupUrl: null,
      productSceneUrl: null,
    };
    saveProjectRecord(record);
    setTheme(post.theme);
    setElement(post.element);
    setMeaning(post.meaning);
    setProductId(post.productId);
    setAspectRatio(defaults.aspectRatio);
    setGridSize(defaults.gridSize);
    setColorCount(defaults.colorCount);
    setShowGrid(true);
    setAntiAlias(true);
    setForcedColors(post.colors);
    clearPatternArtifacts();
    setSourceImageUrl(null);
    setExtractedImageUrl(null);
    clearResultSubjectSelection();
    setSubjectAnalysis(null);
    setSubjectMaskSnapshot(null);
    setSubjectDirty(false);
    setExtractPrompt(null);
    directOutputRef.current = false;
    setStep("config");
    setView("start");
    setSelectedCommunityPost(null);
    setCommunityRefresh((value) => value + 1);
    setToastType("success");
    setToastMsg("已导入社区模板，并保存到个人主页。");
  }, [clearPatternArtifacts, clearResultSubjectSelection, handleRestoreProject]);

  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    if (view !== "start") return;
    if (!sourceImageUrl && !pattern) return;

    const record: ProjectRecord = {
      id: `proj_${Date.now()}`,
      title: `${theme} · ${element}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completed: step === "preview" && !!pattern,
      theme,
      element,
      meaning,
      productId,
      gridSize,
      colorCount,
      aspectRatio,
      showGrid,
      antiAlias,
      sourceImageUrl,
      extractedImageUrl,
      patternData: pattern ? JSON.stringify(pattern) : null,
      patternUrl,
      cleanPatternUrl,
      mockupUrl: null,
      productSceneUrl: null,
    };
    saveProjectRecord(record);
  }, [view, step, theme, element, meaning, productId, gridSize, colorCount, aspectRatio, showGrid, antiAlias, pattern, patternUrl, cleanPatternUrl, sourceImageUrl, extractedImageUrl]);

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
    <main className="min-h-screen bg-[#f8f5ef] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#fffdf7]/95 backdrop-blur">
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 左侧 Logo + 品牌文字 */}
          <button type="button" onClick={() => setView("home")} className="flex shrink-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#8f1d21] text-xs font-bold text-white">韵</span>
            <span className="hidden text-sm font-semibold text-stone-800 sm:inline">豆韵 | 传统纹样拼豆设计工具</span>
          </button>

          {/* 中间导航 - 绝对居中 */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg bg-stone-100 p-1.5">
              {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
            onClick={() => {
                  setView(item.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`rounded-md px-5 py-2.5 text-base font-semibold transition ${
                  view === item.id ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"
                }`}
              >
                {item.label}
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
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
            >
              <span className="grid h-7 w-7 overflow-hidden rounded-full bg-stone-300 text-xs font-semibold text-white">
                {currentUser.avatarUrl && currentUser.avatarUrl.startsWith("data:") ? (
                  <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-base">
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
                onClick={() => {
                  setLoginModalStep("login");
                  setShowLoginModal(true);
                }}
                className="flex shrink-0 items-center gap-2 rounded-md bg-[#8f1d21] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#a82428]"
              >
                <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-[#a82428] text-xs font-semibold text-white">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </span>
                <span className="hidden sm:inline">登录</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginModalStep("register");
                  setShowLoginModal(true);
                }}
                className="flex shrink-0 items-center gap-2 rounded-md border border-[#8f1d21] px-4 py-1.5 text-sm font-semibold text-[#8f1d21] transition hover:bg-[#8f1d21] hover:text-white"
              >
                <span className="hidden sm:inline">注册</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 个人主页 */}
      {view === "profile" && (
        <ProfilePage
          onBack={() => setView("home")}
          onRestoreProject={handleRestoreProject}
          onLogout={() => {
            clearAiChatHistory();
            setAiChatResetToken((value) => value + 1);
            setShowAiChat(false);
            clearCurrentProgress();
            setCurrentUser(null);
          }}
        />
      )}

      {view === "home" && (
        <>
          <section className="relative overflow-hidden bg-[#2b2118] text-white">
            <div className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
              <p className="text-sm font-semibold text-[#f2c46d]">千年纹样 × 掌间拼豆</p>

              {/* 打字区域固定容器：防止打字时高度变化导致下方元素下移 */}
              <div className="min-h-[200px] md:min-h-[220px] lg:min-h-[260px]">
                {/* 打字机标题 */}
                <h1 className="mt-3 max-w-4xl whitespace-nowrap text-2xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                  {typedLine1}
                  {typedLine1.length > 0 && typedLine1.length < homeTypingLine1.length && (
                    <span className="inline-block w-[2px] h-[0.8em] bg-[#f2c46d] ml-0.5 animate-pulse align-middle" />
                  )}
                </h1>

                {/* 打字机描述 */}
                <p className="mt-5 max-w-2xl text-base leading-7 text-stone-200">
                  {typedLine2}
                  {typedLine2.length > 0 && typedLine2.length < homeTypingLine2.length && (
                    <span className="inline-block w-[2px] h-[1em] bg-[#f2c46d] ml-0.5 animate-pulse align-middle" />
                  )}
                </p>

                {/* 打字完成后浮现快速开始按钮 */}
                <div className={`transition-all duration-700 ${typingDone ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 pointer-events-none"}`}>
                  <div className="mt-7 flex flex-wrap gap-4">
                    <button type="button" onClick={() => setView("start")} className="rounded-md bg-[#f2c46d] px-8 py-4 text-base font-bold text-stone-950 shadow-lg transition hover:bg-[#f4d07a] hover:shadow-xl">
                      🚀 快速开始
                    </button>
                  </div>
                </div>
              </div>
              {/* 纹样滚动带 — 始终展示 */}
              <ScrollingPatternBand />
            </div>

            {/* 精选主题 — 始终展示 */}
            <div className="mx-auto grid max-w-7xl gap-5 px-4 pb-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
              {showcase.map((item) => (
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
                    setSubjectDirty(false);
                    directOutputRef.current = false;
                    setView("start");
                    setStep("config");
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/8 p-5 text-left text-white transition hover:bg-white/15 hover:ring-2 hover:ring-[#f2c46d]"
                >
                  <PatternMiniature colors={item.colors} />
                  <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-stone-300">{item.theme}主题配色</p>
                </button>
              ))}
            </div>
          </section>

          <CraftSection setView={setView} />
          <HomeCommunitySection setView={setView} />
        </>
      )}

      {view === "community" && (
        <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 border-b border-stone-200 pb-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#8f1d21]">社区论坛</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">作品分享与模板导入</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                云端同步不同用户发布的拼豆作品，按主题、作者或作品名称搜索。点击作品进入预览后，可一键导入为自己的创作进度。
              </p>
            </div>
            <button
              type="button"
              onClick={publishCurrentWork}
              disabled={!sourceImageUrl && !pattern && !patternUrl}
              className="rounded-md bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              🌐 发布当前作品
            </button>
          </div>

          <div className="mt-8">
            <label className="block text-sm font-medium text-stone-700" htmlFor="community-search">
              搜索作品
            </label>
            <input
              id="community-search"
              value={communityQuery}
              onChange={(event) => setCommunityQuery(event.target.value)}
              placeholder="输入关键词：青花、飞天、脸谱、作者名..."
              className="mt-2 w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8f1d21] focus:ring-2 focus:ring-[#8f1d21]/20"
            />
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {communityPosts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setSelectedCommunityPost(post)}
                className="group rounded-lg border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#8f1d21]/40 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#8f1d21] text-sm font-semibold text-white">
                    {post.avatar.startsWith("data:") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.avatar} alt="" className="h-full w-full object-cover" />
                    ) : post.avatar}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900">{post.author}</p>
                    <p className="text-xs text-stone-500">{formatPostTime(post.createdAt)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  {post.record?.patternUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.record.patternUrl} alt={post.title} className="aspect-square w-full rounded-md border border-stone-200 object-contain" />
                  ) : (
                    <PatternMiniature colors={post.colors} />
                  )}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-stone-950">{post.title}</h2>
                <p className="mt-1 text-sm text-stone-600">{post.theme} · {post.element}</p>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-500">{post.meaning}</p>
              </button>
            ))}
          </div>

          {communityLoading && (
            <div className="mt-10 rounded-lg border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
              正在加载云端社区作品...
            </div>
          )}

          {communityError && (
            <div className="mt-10 rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
              {communityError}
            </div>
          )}

          {!communityLoading && !communityError && communityPosts.length === 0 && (
            <div className="mt-10 rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
              没有找到匹配的作品。
            </div>
          )}
        </main>
      )}

      {selectedCommunityPost && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-8">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedCommunityPost(null)}
              className="absolute right-4 top-4 z-10 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 shadow-sm transition hover:bg-stone-50"
            >
              关闭
            </button>
            <div className="overflow-y-auto p-6">
              <div className="flex items-center gap-3 pr-20">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#8f1d21] text-sm font-semibold text-white">
                  {selectedCommunityPost.avatar.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedCommunityPost.avatar} alt="" className="h-full w-full object-cover" />
                  ) : selectedCommunityPost.avatar}
                </span>
                <div>
                  <h2 className="text-2xl font-semibold text-stone-950">{selectedCommunityPost.title}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {selectedCommunityPost.author} · {formatPostTime(selectedCommunityPost.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                  {selectedCommunityPost.record?.patternUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedCommunityPost.record.patternUrl} alt={selectedCommunityPost.title} className="max-h-[560px] w-full object-contain" />
                  ) : (
                    <PatternMiniature colors={selectedCommunityPost.colors} />
                  )}
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">传统主题</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{selectedCommunityPost.theme}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">核心元素</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{selectedCommunityPost.element}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">文化说明</p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{selectedCommunityPost.meaning}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-4">
                    <p className="text-xs font-semibold text-stone-500">推荐配色</p>
                    <div className="mt-3 flex gap-2">
                      {selectedCommunityPost.colors.map((color) => (
                        <span key={color} title={color} className="h-8 w-8 rounded-full border border-stone-200" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t border-stone-200 bg-stone-50 px-6 py-4">
              <button
                type="button"
                onClick={() => importCommunityPost(selectedCommunityPost)}
                className="rounded-md bg-[#8f1d21] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a82428]"
              >
                一键导入作品
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
              {helpSidebarNav.map((section) => (
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
            <p className="text-sm font-semibold text-[#8f1d21]">创作指南</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">豆韵 · 帮助</h1>

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
              {helpData.map((section) => {
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
                      <span>{section.icon}</span>
                      {stepLabel && (
                        <span className="text-sm font-bold tracking-wider text-[#8f1d21] uppercase">{stepLabel}</span>
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
                        setToastMsg("请先生成或上传素材，再进入主体提取与再创作步骤。");
                      } else if (index === 2 && !extractedImageUrl) {
                        setToastType("warning");
                        setToastMsg("请先完成主体提取，再生成拼豆图纸。");
                      } else if (index === 3 && !pattern) {
                        setToastType("warning");
                        setToastMsg("请先生成拼豆图纸，再进入制作方案。");
                      }
                      return;
                    }
                    setStep(item.id);
                  }}
                  className={`rounded-lg border p-4 text-left transition ${
                    step === item.id
                      ? "border-[#8f1d21] bg-[#8f1d21] text-white shadow-sm"
                      : !canAccess
                        ? "cursor-not-allowed border-stone-200 bg-white/60 text-stone-400"
                        : "border-stone-200 bg-white text-stone-700 hover:border-[#8f1d21]/50"
                  }`}
                >
                  <span className="text-xs font-semibold">0{index + 1}</span>
                  <span className="mt-1 block text-base font-semibold">{item.label}</span>
                  <span className={`mt-2 block text-xs leading-5 ${step === item.id ? "text-white/80" : "text-stone-500"}`}>{item.desc}</span>
                </button>
              );
            })}

          </div>
          {renderStep()}

          {/* 确认弹窗 */}
          {confirmNew && (
            <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40">
              <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold">放弃当前进度？</h3>
                <p className="mt-2 text-sm text-stone-600">
                  您当前已有处理中的图案或图纸，{confirmNew === "ai" ? "使用 AI 重新生成" : confirmNew === "sample" ? "切换为内置样例" : "上传新图片"}将清空已生成的主体提取和拼豆图纸。
                </p>
                <p className="mt-1 text-sm text-stone-500">请先下载或保存需要的资料，再继续操作。</p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmNew(null);
                      pendingUploadRef.current = null;
                    }}
                    className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
                  >
                    取消
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
                    className="rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white"
                  >
                    确认放弃
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
            setToastMsg(`用户 ${username} 账号注册成功！`);
          }}
        />
      )}

      {/* AI 豆韵助手 - 浮动按钮 & 聊天面板 */}
      <FloatingAiButton onClick={() => setShowAiChat(true)} />
      <AiChatPanel isOpen={showAiChat} resetToken={aiChatResetToken} onClose={() => setShowAiChat(false)} />

      {/* 页脚 - 产权标语 */}
      <footer className="border-t border-stone-200 bg-[#fffdf7]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-1 px-4 py-6 text-center sm:px-6 lg:px-8">
          <p className="text-xs text-stone-400">
            &copy; {new Date().getFullYear()} 豆韵 DouYun — 拼豆图纸生成工具
          </p>
          <p className="text-xs text-stone-400">
            基于 Apache 2.0 开源协议 · 以 AI 为笔，让千年纹样织入像素网格
          </p>
          <p className="mt-1 text-[11px] text-stone-300">
            All Rights Reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
