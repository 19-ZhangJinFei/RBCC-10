"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CultureExplanation from "@/components/CultureExplanation";
import FilterDropdown from "@/components/FilterDropdown";
import ProfilePage from "@/components/ProfilePage";
import SubjectMaskEditor, { type MaskMode } from "@/components/SubjectMaskEditor";
import LoginModal from "@/components/LoginModal";
import AiChatPanel from "@/components/ai/AiChatPanel";
import { clearAiChatHistory } from "@/utils/aiChat";
import { deleteProjectRecord, loadProjectHistory, saveProjectRecord, loadCurrentUserProfile, loadApiConfig, type StoredUser } from "@/utils/profileStorage";
import { fetchCommunityPosts, publishCommunityPost } from "@/utils/communityForum";
import type { ProjectRecord } from "@/types/projectTypes";
import type { CommunityPost as CloudCommunityPost } from "@/types/community";
import type { SubjectIdentification } from "@/types/subjectIdentification";
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
import { useAutoSave, saveAutoSaveInterval, loadAutoSaveInterval, formatAutoSaveInterval } from "@/hooks/useAutoSave";

type SiteView = "home" | "start" | "projects" | "ai" | "community" | "faq" | "profile";
type StudioStep = "config" | "extract" | "pattern" | "preview";
type ProductConfigDefault = {
  aspectRatio: AspectRatioId;
  gridSize: number;
  colorCount: number;
};

const emptySubjectIdentification: SubjectIdentification = {
  subject: "",
  category: "",
  evidence: [],
  confidence: 0,
  alternatives: [],
  visualSummary: "",
};

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

const navItems: { id: SiteView; label: string }[] = [
  { id: "home", label: "首页" },
  { id: "start", label: "创作" },
  { id: "projects", label: "项目" },
  { id: "ai", label: "豆韵AI" },
  { id: "community", label: "论坛" },
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
    imageUrl: "/images/莲花杯垫底稿.png",
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
    id: "tech-details",
    label: "技术说明",
    icon: "技术",
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
        title: "豆韵现在解决什么问题？",
        content: "豆韵当前不是单纯的图片转像素工具，而是一套围绕传统文化拼豆创作的完整工作流。用户可以从首页进入创作、项目、豆韵AI、论坛和帮助几个独立页面：创作用于完成主题配置、素材处理、图纸生成和制作方案；项目页集中管理最近设计并支持搜索、继续编辑、删除和新建；论坛页用于浏览示例和用户发布作品并导入模板；豆韵AI现在调用生图接口，输入提示词后直接输出图像。设计目的就是把文化主题、图像生成、主体识别、拼豆颜色映射、用量统计、项目保存和分享导入放在一个连续流程中，让用户既能快速得到可制作的拼豆图纸，也能保留人工调整空间。",
      },
      {
        title: "和普通拼豆或聊天工具有什么区别？",
        content: "普通拼豆工具通常只负责把图片像素化，普通聊天工具只输出文字建议；豆韵当前实现把两者拆成更明确的功能边界。豆韵AI页面使用生图API，负责根据提示词生成图像，不再作为普通问答弹窗存在；创作流程中的主体识别会把图像理解结果排版为主体名称、类别、证据、置信度、备选项和视觉摘要，并允许用户手动修改；第二步再创作使用这些可编辑识别信息生成提示词，不再把原图直接传给AI；第四步文化说明则同时使用图像和识别信息。图纸阶段还支持点击某种颜色后让所有同色块呈现轻微立体强调效果，方便查找材料位置，这些都是面向实际制作而不是只做展示的功能。",
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
        content: "顶部导航现在按实际功能拆分为首页、创作、项目、豆韵AI、论坛和帮助。当前所在页面会以醒目的酒红色块显示，避免和普通白色按钮混淆。要开始制作拼豆作品，应点击“创作”；要恢复或搜索已有设计，应点击“项目”；要单独用生图模型生成图片，应点击“豆韵AI”；要查看作品分享和示例模板，应进入“论坛”。首页只作为入口和功能概览，不承担具体编辑任务。这样设计的好处是每个页面职责清晰，用户不会把项目管理、AI生图、论坛导入和拼豆图纸编辑混在一个弹窗或个人主页里操作。",
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
        title: "豆韵AI现在如何生成图像？",
        content: "豆韵AI现在作为顶部导航中的独立页面存在，不再是右下角悬浮标或弹窗。它的接口已改为调用Ark生图API，输入框提示为“输入生图提示词”，按钮为“生成图片”。发送后，服务端会取最近一条用户消息作为生图提示词，调用Ark的images/generations接口，并把返回的base64图片或URL作为助手消息展示在聊天区域中。历史消息会保存imageUrl，因此刷新后仍能看到已生成图像。这个页面适合先独立探索视觉概念，生成满意的图像后再回到创作流程中上传或使用，不再承担传统文化问答文本助手的职责。",
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
        content: "内置样例用于快速体验完整流程，不依赖外部AI接口，适合测试网格、配色、用量统计和导出效果。豆韵AI页面生成的图像是独立生图结果，可以作为灵感或素材来源，但需要用户回到创作流程中继续处理。创作页中直接生成的文化图案会进入后续拼豆流程；上传图则会触发主体蒙版和图像理解识别，适合把已有照片、插画或图案转成可制作作品。三者最终都可以进入拼豆图纸生成，但进入第二步时的主体识别、是否需要手动修蒙版、是否传图片给AI等行为不同，使用前应根据素材来源选择合适路径。",
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
        content: "豆韵使用开源中性色号体系来标记颜色，每个格子显示的色号来自颜色映射表，并对应一个标准RGB值。它不是某个商家的专属编号，而是方便用户在不同材料品牌之间做近似对照。用量统计会按颜色汇总总颗数、比例和用途说明，并可以导出CSV文件，用于采购、分装和制作前检查。由于实体拼豆不同品牌和批次可能存在轻微色差，建议在正式制作前用实际材料和屏幕颜色做一次对照。图纸、无标注图、材料清单和制作方案应配合使用：图纸负责摆放位置，CSV负责采购数量，方案负责时间和成本预估。",
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
        content: "项目记录会保存在浏览器本地存储中，并按当前登录用户区分。项目页会显示最近设计，支持搜索标题、主题、元素和作品形式。点击继续编辑会恢复主题、参数、源图、提取图、图纸数据、图纸预览和当前步骤等状态；点击删除会移除该项目记录；点击红色加号会清空当前进度并进入新建创作。论坛导入的作品也会先保存为项目，再进入编辑状态。需要注意，本地存储可能受到浏览器缓存清理、隐私模式或设备更换影响，所以重要作品仍建议导出PNG、CSV和制作方案到本地文件。",
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
        title: "为什么豆韵AI不再回答文字问题？",
        content: "当前豆韵AI已经按需求改为生图功能，它调用的是Ark生图API，而不是文本聊天补全API。因此输入后预期输出是图像，不是传统问答说明。界面仍保留聊天式布局，是为了保存提示词和生成图片的上下文记录，但发送按钮已经改为“生成图片”，输入框也提示“输入生图提示词”。如果你需要了解工具使用方式，应进入帮助页面；如果需要文化说明，应在创作流程第四步生成；如果需要图像灵感或视觉素材，则使用豆韵AI页面。这个职责拆分可以避免AI在同一个入口中既回答文字又生成图片，造成用户预期混乱。",
      },
      {
        title: "生图失败应检查什么？",
        content: "生图失败时，先检查服务端是否配置了ARK_API_KEY，以及是否配置了可用的ARK_BASE_URL和ARK_IMAGE_MODEL；如果个人主页选择不使用系统默认模型，则需要确保生图模型API Key和模型名可用。当前服务端默认只把Ark Key作为默认环境配置，不再把OpenAI Key或通用AI_API_KEY当作默认生图凭证。其次检查模型是否开通、账号额度是否足够、提示词是否包含平台不支持的内容。生图请求通常比文本请求慢，页面出现“正在生成图像”时请等待接口返回。若接口返回错误，页面会把错误作为助手消息展示，便于根据模型未开通、鉴权失败或请求格式问题继续处理。",
      },
      {
        title: "主体识别结果不准确怎么办？",
        content: "主体识别模块的设计就是允许用户修正模型判断。识别结果会拆成主体名称、类别、证据、置信度、备选项和视觉摘要，而不是只给一句结论。你可以直接编辑这些字段，例如把笼统的“花朵”改为“莲花纹”，把类别改为“植物纹样”，并在证据中补充“层叠花瓣、中心对称、青白配色”等可见特征。第二步再创作会使用你修改后的结构化信息，不再把原图重新传给AI，因此人工修正会直接影响后续创作。第四步文化说明也会读取识别信息和图像共同生成说明，所以在进入后续步骤前，建议先把识别模块检查准确。",
      },
      {
        title: "图纸颜色太碎或主体不连贯怎么办？",
        content: "如果图纸颜色太碎，可以降低颜色上限、开启平滑杂点、减少手动指定颜色数量，或换用更简洁的源图。若主体边缘有孤立色块，可以开启连接孤立色块，让算法把较小断裂区域连接到稳定主体区域；如果你希望保留非常细的纹理，则可以关闭平滑或提高颜色上限。上传图在进入图纸前还可以通过主体蒙版减少背景干扰，避免背景颜色被统计进有效拼豆区域。当前实现中，背景会通过边界连通的近白区域标记为外部背景，统计和导出时忽略这些单元。调整后重新生成图纸，再用颜色强调功能检查关键颜色分布。",
      },
      {
        title: "为什么个人主页仍有三套Key配置？",
        content: "个人主页的三套Key配置逻辑被保留下来，用于手动配置文本模型、生图模型和图像理解模型。与此同时，服务端默认配置已经改为只使用Ark相关环境变量，也就是ARK_API_KEY、ARK_BASE_URL以及对应的ARK_TEXT_MODEL、ARK_IMAGE_MODEL、ARK_VISION_MODEL。这样做的含义是：系统默认模式走统一Ark配置；用户如果在个人主页手动关闭默认模型并填写自己的Key，则仍可按界面配置使用。不要把这两件事混淆：个人主页是本地用户配置入口，服务端默认环境是部署级配置。当前需求要求不删除三套Key界面，所以帮助说明也按这个实现描述。",
      },
    ],
  },
  {
    id: "tech-details",
    title: "技术说明",
    icon: "技术",
    subs: [
      {
        title: "图像到拼豆图纸的核心流程",
        content: "图纸生成的核心流程是先把源图加载到浏览器Canvas，再按目标网格尺寸划分单元格。每个单元格会统计覆盖区域中的主导颜色，并映射到开源色号表中最接近的RGB颜色。随后系统根据颜色上限做颜色合并，把过多颜色迭代合并到相近且稳定的颜色集合中；如果开启平滑杂点，则会检查单格噪声并用周围主导颜色修正；如果检测到边界连通的近白背景，则标记为外部背景，不计入用量。最后得到的grid数据会同时用于画布渲染、PNG导出、CSV统计、项目保存和制作方案估算。",
      },
      {
        title: "颜色强调为什么不会遮挡其他格子？",
        content: "颜色强调不是通过放大DOM元素实现的，而是在Canvas渲染每个匹配颜色的格子时，在该格子内部绘制一个带径向渐变的圆形豆粒效果。圆形半径会根据单元格大小计算，并留出内边距，因此视觉上有轻微立体凸起，但不会超过当前格子的边界，也不会覆盖相邻格子的色号和边框。普通导出的图纸仍使用原始渲染逻辑，不会把强调状态写入导出文件。这个实现避免了通过CSS缩放造成布局遮挡或坐标错位，同时保持图纸编辑、点击定位和用量统计都基于同一份grid数据。",
      },
      {
        title: "主体识别和文化说明的数据边界",
        content: "当前实现把主体识别、再创作和文化说明分成三个明确阶段。主体识别接口接收图像，输出严格JSON结构；第二步再创作读取用户编辑后的JSON信息生成图像，不再传原图；第四步文化说明同时读取最终图像和主体识别JSON，以图像可见内容和识别证据为依据生成作品介绍。这样的边界可以减少模型在不同阶段重复猜测主体，也方便用户在中间层纠错。代码层面，SubjectIdentification类型规定了subject、category、evidence、confidence、alternatives和visualSummary字段，前端编辑模块和服务端提示词都围绕这份结构传递。",
      },
      {
        title: "Ark API在当前系统中的使用方式",
        content: "当前系统的服务端默认API统一收敛到Ark。文本、图像生成、图像理解、抠图、场景预览等接口默认读取ARK_API_KEY和ARK_BASE_URL，并分别使用ARK_TEXT_MODEL、ARK_IMAGE_MODEL、ARK_VISION_MODEL等模型变量；旧的OpenAI默认环境变量不再作为服务端默认凭证。豆韵AI页面尤其明确使用images/generations进行生图，返回b64_json或url后存入聊天消息的imageUrl字段。个人主页的三套Key配置仍保留，作为用户手动覆盖配置入口。这样既保证部署默认路径统一，又不破坏已有本地配置界面。",
      },
      {
        title: "本地状态、项目记录和论坛数据如何组织？",
        content: "前端主要用React状态管理当前创作流程，用localStorage保存用户、API配置、AI历史消息和项目记录。项目记录包含标题、时间、主题、元素、作品形式、网格尺寸、颜色数量、源图、提取图、图纸数据、图纸预览和无标注预览等字段，项目页读取后按更新时间排序并支持搜索。论坛数据来自内置模板和云端帖子组合，导入时会复制为新的项目，避免直接修改原帖子。豆韵AI历史消息也保存在本地，图片结果通过imageUrl字段展示。由于这些数据大多在浏览器本地，清理缓存或更换设备会影响可恢复性，重要作品应导出文件保存。",
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
        <div className="space-y-12">
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
              <div className="grid max-w-md grid-cols-4 gap-3">
                {showcase.slice(0, 4).map((item) => (
                  <div key={item.title} className="rounded-md bg-stone-50 p-2 ring-1 ring-stone-200">
                    <PatternMiniature colors={item.colors} />
                  </div>
                ))}
              </div>
              <h3 className="mt-4 text-xl font-semibold">进入论坛</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">浏览大家发布的拼豆作品，搜索主题关键词，一键导入喜欢的模板继续创作。</p>
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#8f1d21]">疑问解答</p>
            <h2 className="mt-2 min-h-[1.2em] text-3xl font-semibold tracking-tight">
              {faqText}
              {visible && forumText.length >= forumTitle.length && faqText.length < faqTitle.length && <span className="ml-0.5 inline-block h-[0.9em] w-[2px] animate-pulse bg-[#8f1d21] align-middle" />}
            </h2>
            <div className={`mt-8 grid gap-4 md:grid-cols-2 transition-all delay-200 duration-700 ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
              {helpSidebarNav.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setView("faq");
                    setTimeout(() => {
                      document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                    }, 150);
                  }}
                  className="rounded-lg border border-stone-200 bg-white p-6 text-left shadow-sm transition hover:border-[#8f1d21]/50 hover:shadow-md"
                >
                  <span className="text-2xl">{section.icon}</span>
                  <h3 className="mt-3 text-xl font-semibold text-stone-950">{section.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {section.subs.length > 0 ? section.subs.map((sub) => sub.label).join(" / ") : "查看对应模块的完整说明。"}
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
  const [highlightedPatternColor, setHighlightedPatternColor] = useState<string | null>(null);
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

  const forcedColorWarning = useMemo(() => {
    if (forcedColors.length <= colorCount) return null;
    return `已指定 ${forcedColors.length} 种颜色，超过当前 ${colorCount} 色上限。超出的 ${forcedColors.length - colorCount} 种颜色不会进入最终映射，请减少指定颜色或提高颜色上限。`;
  }, [colorCount, forcedColors.length]);

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(() => loadCurrentUserProfile());
  const [projectQuery, setProjectQuery] = useState("");
  const [projectRecords, setProjectRecords] = useState<ProjectRecord[]>(() => loadProjectHistory());
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

  const refreshProjectRecords = useCallback(() => {
    setProjectRecords(loadProjectHistory());
  }, []);

  const restoringRef = useRef(false);

  const [confirmNew, setConfirmNew] = useState<"ai" | "sample" | "upload" | null>(null);
  const pendingUploadRef = useRef<File | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalStep, setLoginModalStep] = useState<"login" | "register">("login");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"warning" | "success">("warning");
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
  const subjectIdentificationAutoKeyRef = useRef<string | null>(null);
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
    setResultMaskSyncVersion((value) => value + 1);
  }, []);

  const clearSubjectIdentification = useCallback(() => {
    setSubjectIdentification(null);
    setSubjectIdentificationPrompt(null);
  }, []);

  const generateCultureText = useCallback(async () => {
    if (!pattern || beadCounts.length === 0) {
      setToastType("warning");
      setToastMsg("请先生成拼豆图纸。");
      return;
    }
    if (!extractedImageUrl) {
      setToastType("warning");
      setToastMsg("请先生成或上传再创作图像。");
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
  }, [pattern, beadCounts, formLabel, gridSize, colorCount, extractedImageUrl, subjectIdentification]);

  useEffect(() => {
    setAiCultureCopy(null);
    setCulturePrompt(null);
  }, [extractedImageUrl, formLabel, gridSize, colorCount, subjectIdentification]);


  const clearCurrentProgress = useCallback(() => {
    directOutputRef.current = false;
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
  }, [clearPatternArtifacts, clearResultSubjectSelection, clearSubjectIdentification]);

  const doUseSample = useCallback(() => {
    clearPatternArtifacts();
    const original = renderSampleDesignOriginal(options);
    directOutputRef.current = true;
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
  }, [clearPatternArtifacts, clearResultSubjectSelection, clearSubjectIdentification, options]);

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
      clearSubjectIdentification();
      setSubjectDirty(false);
      setSourceImageUrl(imageUrl);
    setExtractedImageUrl(null);
    clearResultSubjectSelection();
      setExtractPrompt(null);
      clearPatternArtifacts();
      setStep("extract");
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
      clearSubjectIdentification();
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
      setToastMsg("请先在左侧完成主体区域选择。");
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
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "主体识别失败");
      setSubjectIdentification(result.identification);
      setSubjectIdentificationPrompt(result.prompt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "主体识别失败");
    } finally {
      setSubjectIdentificationLoading(false);
    }
  }, [subjectAnalysis]);

  useEffect(() => {
    if (!subjectAnalysis || subjectIdentification || subjectIdentificationLoading) return;
    if (subjectIdentificationAutoKeyRef.current === subjectAnalysis.subjectImageUrl) return;
    subjectIdentificationAutoKeyRef.current = subjectAnalysis.subjectImageUrl;
    void identifySubject();
  }, [identifySubject, subjectAnalysis, subjectIdentification, subjectIdentificationLoading]);

  const generateSubjectRecreation = useCallback(async () => {
    if (directOutputRef.current) return;
    if (!subjectAnalysis) {
      setError(null);
      setToastType("warning");
      setToastMsg("请先在左侧完成主体区域选择。");
      return;
    }
    if (!subjectIdentification) {
      setError(null);
      setToastType("warning");
      setToastMsg("请先完成主体识别，确认或修改识别结果后再进行 AI 再创作。");
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
  }, [aspectRatio, clearPatternArtifacts, clearResultSubjectSelection, formLabel, product.aiPrompt, subjectAnalysis, subjectIdentification]);

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

  const renderSubjectIdentificationEditor = (context: "extract" | "preview") => {
    const identification = subjectIdentification ?? emptySubjectIdentification;
    const editable = context === "extract";

    return (
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{context === "extract" ? "主体识别结果" : "文化说明识别依据"}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              {context === "extract"
                ? "AI 先识别主体并生成结构化信息。你可以修改后再用于 AI 再创作。"
                : "文化说明会同时读取这份主体信息和当前再创作图像。"}
            </p>
          </div>
          {context === "extract" && (
            <button
              type="button"
              onClick={identifySubject}
              disabled={subjectIdentificationLoading || !subjectAnalysis}
              className="rounded-md bg-stone-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {subjectIdentificationLoading ? "识别中..." : subjectIdentification ? "重新识别主体" : "AI 识别主体"}
            </button>
          )}
        </div>

        {subjectIdentification ? (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium">
                主体名称
                <input
                  value={identification.subject}
                  disabled={!editable}
                  onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), subject: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                />
              </label>
              <label className="text-sm font-medium">
                类别
                <input
                  value={identification.category}
                  disabled={!editable}
                  onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), category: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                />
              </label>
            </div>
            <label className="text-sm font-medium">
              视觉证据
              <textarea
                value={identification.evidence.join("\n")}
                disabled={!editable}
                rows={4}
                onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), evidence: splitLines(event.target.value) }))}
                className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                placeholder="每行一条证据"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-[1fr_160px]">
              <label className="text-sm font-medium">
                备选识别
                <textarea
                  value={identification.alternatives.join("\n")}
                  disabled={!editable}
                  rows={3}
                  onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), alternatives: splitLines(event.target.value) }))}
                  className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
                  placeholder="每行一个备选"
                />
              </label>
              <label className="text-sm font-medium">
                置信度
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
                  <div className="h-full bg-[#8f1d21]" style={{ width: `${Math.max(0, Math.min(100, identification.confidence * 100))}%` }} />
                </div>
              </label>
            </div>
            <label className="text-sm font-medium">
              视觉摘要
              <textarea
                value={identification.visualSummary}
                disabled={!editable}
                rows={4}
                onChange={(event) => setSubjectIdentification((prev) => ({ ...(prev ?? emptySubjectIdentification), visualSummary: event.target.value }))}
                className="mt-2 w-full resize-none rounded-md border border-stone-300 px-3 py-2 disabled:bg-stone-50"
              />
            </label>
            <div className="rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-600 whitespace-pre-wrap">
              {formatSubjectIdentification(identification)}
            </div>
            {context === "extract" && subjectIdentificationPrompt && (
              <details className="rounded-md border border-stone-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium text-stone-700">查看主体识别提示词</summary>
                <div className="mt-3 max-h-36 overflow-y-auto rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-600 font-mono whitespace-pre-wrap">
                  {subjectIdentificationPrompt}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-sm leading-6 text-stone-500">
            {context === "extract"
              ? "完成左侧主体区域选择后，点击“AI 识别主体”生成主体名称、类别、证据、置信度和备选项。"
              : "步骤二尚未生成主体识别结果。"}
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
              autoDetect={true}
              mode={subjectMaskMode}
              savedMask={subjectMaskSnapshot}
              onModeChange={setSubjectMaskMode}
              onSubjectChange={handleSubjectAnalysis}
              onMaskSnapshotChange={handleSourceMaskSnapshotChange}
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
            {renderSubjectIdentificationEditor("extract")}
            {!directGeneratedImage && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="text-xl font-semibold">AI 再创作</h2>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  左侧主体识别只在本地计算蒙版和裁切主体。点击此按钮后，才会把主体裁切图发送给 AI 生成传统文化风格输出图像。
                </p>
                <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                  当前再创作请求只发送主体识别 JSON，不发送主体图片。
                </div>
                {subjectDirty && extractedImageUrl && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    主体区域已变化，需要重新 AI 再创作后再生成拼豆图纸。
                  </div>
                )}
                <button
                  type="button"
                  onClick={generateSubjectRecreation}
                  disabled={loading || !subjectAnalysis || !subjectIdentification}
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
                  key={`${extractedImageUrl ?? "empty"}-${directGeneratedImage ? resultMaskSyncVersion : 0}`}
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
                            setHighlightedPatternColor(hex);
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
                        setHighlightedPatternColor(item.rgb);
                        setPaintColor(item.rgb);
                        setPaintColorKey(item.brandCode);
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
    const workTitle = aiCultureCopy?.title?.trim() || `${element}${formLabel}`;
    const planText = [
      `${workTitle} 拼豆制作方案`,
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
              <button type="button" disabled={!patternUrl} onClick={() => patternUrl && downloadUrl(patternUrl, `${workTitle}-拼豆图纸.png`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">下载图纸 PNG</button>
              <button type="button" disabled={!cleanPatternUrl} onClick={() => cleanPatternUrl && downloadUrl(cleanPatternUrl, `${workTitle}-无标注图纸.png`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">下载无标注 PNG</button>
              <button type="button" disabled={beadCounts.length === 0} onClick={() => downloadBeadCsv(beadCounts, `${workTitle}-材料清单.csv`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">导出材料 CSV</button>
              <button type="button" disabled={!pattern} onClick={() => downloadTextFile(planText, `${workTitle}-制作方案.txt`)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">导出制作方案</button>
            </div>
          </div>
          {renderSubjectIdentificationEditor("preview")}
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
              <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-sm leading-6 text-stone-500">
                点击 AI 生成文化说明后，系统会读取当前再创作图像，并把作品名称、文化来源、图案寓意、设计说明分别填入对应模块。
              </div>
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
    clearSubjectIdentification();
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
  }, [clearResultSubjectSelection, clearSubjectIdentification]);

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
    refreshProjectRecords();
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
  }, [buildCurrentProjectRecord, currentUser, element, forcedColors, pattern, patternUrl, refreshProjectRecords, sourceImageUrl, theme]);

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
      refreshProjectRecords();
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
    refreshProjectRecords();
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
    clearSubjectIdentification();
    setSubjectDirty(false);
    setExtractPrompt(null);
    directOutputRef.current = false;
    setStep("config");
    setView("start");
    setSelectedCommunityPost(null);
    setCommunityRefresh((value) => value + 1);
    setToastType("success");
    setToastMsg("已导入社区模板，并保存到个人主页。");
  }, [clearPatternArtifacts, clearResultSubjectSelection, clearSubjectIdentification, handleRestoreProject, refreshProjectRecords]);

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
    refreshProjectRecords();
  }, [view, step, theme, element, meaning, productId, gridSize, colorCount, aspectRatio, showGrid, antiAlias, pattern, patternUrl, cleanPatternUrl, sourceImageUrl, extractedImageUrl, refreshProjectRecords]);

  // 自动保存逻辑
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  
  // 在创作过程中启用自动保存（view === "start" 且有工作进度时）
  useEffect(() => {
    if (view === "start" && hasUnsavedWork) {
      setAutoSaveEnabled(true);
    } else {
      setAutoSaveEnabled(false);
    }
  }, [view, hasUnsavedWork]);

  const doAutoSave = useCallback(() => {
    if (!hasUnsavedWork) return;
    const record = buildCurrentProjectRecord(`${theme} · ${element}`);
    saveProjectRecord(record);
    refreshProjectRecords();
    setToastType("success");
    setToastMsg("作品已自动保存 ✓");
  }, [buildCurrentProjectRecord, element, hasUnsavedWork, refreshProjectRecords, theme]);

  useAutoSave(doAutoSave, autoSaveEnabled);

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
            <img src="/logo.jpg" alt="豆韵" className="h-8 w-8 rounded-md object-cover" />
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
                  view === item.id ? "bg-[#8f1d21] text-white shadow-sm" : "text-stone-600 hover:text-stone-950"
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
            clearCurrentProgress();
            setCurrentUser(null);
            refreshProjectRecords();
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
                    clearSubjectIdentification();
                    setSubjectDirty(false);
                    directOutputRef.current = false;
                    setView("start");
                    setStep("config");
                  }}
                  className="w-full rounded-lg border border-white/15 bg-white/8 p-5 text-left text-white transition hover:bg-white/15 hover:ring-2 hover:ring-[#f2c46d]"
                >
                  {item.imageUrl ? (
                    <div className="relative aspect-square overflow-hidden rounded-md">
                      <div className="home-pattern-scroll-vertical-track">
                        {[0, 1].map((group) => (
                          <div key={group} className="home-pattern-scroll-vertical-set">
                            {[0, 1, 2].map((idx) => (
                              <img
                                key={idx}
                                src={item.imageUrl!}
                                alt={item.title}
                                className="w-full flex-none rounded-md object-cover"
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      {/* 底部渐变遮罩 */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#2b2118] to-transparent" />
                    </div>
                  ) : (
                    <PatternMiniature colors={item.colors} />
                  )}
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

      {view === "projects" && (
        <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 border-b border-stone-200 pb-8">
            <div>
              <p className="text-sm font-semibold text-[#8f1d21]">项目</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">最近设计</h1>
            </div>
            <input
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder="搜索项目名称、主题、元素..."
              className="w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8f1d21] focus:ring-2 focus:ring-[#8f1d21]/20"
            />
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjectRecords.map((record) => {
              const previewUrl = record.patternUrl || record.cleanPatternUrl || record.sourceImageUrl;
              return (
                <article key={record.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                  <button type="button" onClick={() => handleRestoreProject(record)} className="block w-full text-left">
                    <div className="aspect-square overflow-hidden rounded-md border border-stone-200 bg-stone-50">
                      {previewUrl ? (
                        <img src={previewUrl} alt={record.title} className="h-full w-full object-contain" />
                      ) : (
                        <div className="grid h-full place-items-center text-sm text-stone-400">暂无预览</div>
                      )}
                    </div>
                    <h2 className="mt-4 truncate text-lg font-semibold text-stone-950">{record.title || record.theme}</h2>
                    <p className="mt-1 text-sm text-stone-600">{record.theme} · {record.element}</p>
                    <p className="mt-2 text-xs text-stone-400">{new Date(record.updatedAt).toLocaleString("zh-CN")}</p>
                  </button>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => handleRestoreProject(record)} className="rounded-md bg-[#8f1d21] px-3 py-2 text-sm font-semibold text-white">继续编辑</button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteProjectRecord(record.id);
                        refreshProjectRecords();
                      }}
                      className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
                    >
                      删除
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
              className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-[#8f1d21]/40 bg-white p-6 text-center transition hover:border-[#8f1d21] hover:bg-[#8f1d21]/5"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#8f1d21] text-4xl font-light leading-none text-white">+</span>
              <span className="mt-4 block text-sm font-semibold text-stone-700">新建项目</span>
            </button>
          </div>

          {filteredProjectRecords.length === 0 && (
            <div className="mt-8 rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
              没有找到匹配的项目。
            </div>
          )}
        </main>
      )}

      {view === "ai" && (
        <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#8f1d21]">豆韵AI</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">传统文化与拼豆问答</h1>
          </div>
          <AiChatPanel embedded resetToken={aiChatResetToken} />
        </main>
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
                      {!stepLabel && <span>{section.icon}</span>}
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
