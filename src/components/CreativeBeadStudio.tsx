"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CultureExplanation from "@/components/CultureExplanation";
import ExportPanel from "@/components/ExportPanel";
import InteractiveMatting from "@/components/InteractiveMatting";
import ProductMockup from "@/components/ProductMockup";
import ProfilePage from "@/components/ProfilePage";
import LoginModal from "@/components/LoginModal";
import { saveProjectRecord, loadCurrentUserProfile, type StoredUser } from "@/utils/profileStorage";
import type { ProjectRecord } from "@/types/projectTypes";
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
import {
  getAllHexValues,
  getDisplayColorKey,
  sortColorsByHue,
  filterColorsByFamily,
  IMAGE_FILTER_OPTIONS,
  COLOR_FAMILIES,
  type ColorFamily,
  type ImageFilter,
} from "@/utils/colorSystemUtils";

type SiteView = "home" | "start" | "faq" | "profile";
type StudioStep = "config" | "extract" | "pattern" | "preview";

const navItems: { id: SiteView; label: string; icon: string }[] = [
  { id: "home", label: "首页", icon: "🏠" },
  { id: "start", label: "快速开始", icon: "🚀" },
  { id: "faq", label: "帮助", icon: "💡" },
];

const studioSteps: { id: StudioStep; label: string; desc: string; icon: string }[] = [
  { id: "config", label: "配置", desc: "选择传统主题、作品形式、网格尺寸、颜色数量和可用色", icon: "⚙️" },
  { id: "extract", label: "主体提取", desc: "AI 生成或上传图片，查看原图与主体提取结果", icon: "✂️" },
  { id: "pattern", label: "拼豆图纸", desc: "生成带色号网格、统计颜色用量并导出图纸", icon: "🧩" },
  { id: "preview", label: "场景预览", desc: "查看成品效果、文化说明并导出完整制作资料", icon: "🖼️" },
];

const formLabels = [
  { id: "coaster", label: "杯垫底稿" },
  { id: "keychain", label: "挂件底稿" },
  { id: "magnet", label: "冰箱贴底稿" },
  { id: "brooch", label: "胸针底稿" },
  { id: "pendant", label: "吊饰底稿" },
  { id: "bag_charm", label: "随身牌底稿" },
];

const showcase = [
  { title: "青花莲纹", theme: "青花瓷", colors: ["#FFFFFF", "#1557A8", "#3677D2", "#CDE8FF"] },
  { title: "敦煌飞天", theme: "敦煌文化", colors: ["#FCF9E0", "#EDB045", "#943630", "#0B3C43"] },
  { title: "京剧脸谱", theme: "戏曲脸谱", colors: ["#FFFFFF", "#E7002F", "#000000", "#FFDA45"] },
  { title: "山海瑞兽", theme: "山海经", colors: ["#1D1414", "#D30022", "#166F41", "#FFC830"] },
];

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
    title: "选择传统主题",
    text: "从青花瓷、敦煌纹样、京剧脸谱、山海经、二十四节气等主题出发，确定适合拼豆表达的主体、纹样和色彩气质。",
  },
  {
    anchor: "guide-upload",
    title: "AI 生成或上传素材",
    text: "可让 AI 生成传统文化图案，也可上传手绘稿、照片或参考图，系统会提取主体并转为可编辑的拼豆网格。",
  },
  {
    anchor: "guide-mapping",
    title: "映射传统配色",
    text: "以开源色表进行近似色映射，支持指定已有颜色、限制颜色数量、保留网格线，便于实际摆豆和核对。",
  },
  {
    anchor: "guide-export",
    title: "导出制作资料",
    text: "导出带色号图纸、预览图、文化说明和用量统计 CSV，用于个人创作、课堂活动、社群分享或开源二次开发。",
  },
];

type HelpSection = {
  id: string;
  title: string;
  icon: string;
  subs: { title: string; content: string | string[] }[];
};

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
          "✅ 一站式导出：图纸（带色号）+ 统计CSV + 文化说明 + 场景预览",
        ],
      },
    ],
  },
  {
    id: "guide-theme",
    title: "操作指南 · 主题选择",
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
    title: "操作指南 · 素材与提取",
    icon: "✂️",
    subs: [
      {
        title: "AI 生成图案",
        content: "点击「AI 生成图案」按钮，系统会根据你选择的主题、核心元素、作品形式等参数，调用AI生成一幅传统文化风格的图案。生成后会自动进入「主体提取」步骤。",
      },
      {
        title: "上传自己的图片",
        content: "支持上传JPG/PNG格式图片。上传后会先进行主体提取（自动识别和分离主要元素），再结合当前主题生成适合拼豆化的图像。传统纹样、书法字形、器物纹饰和简洁插画效果最佳。复杂照片或多人物场景可能提取效果不理想。",
      },
      {
        title: "使用内置样例",
        content: "点击「使用内置样例」快速生成一个示例拼豆图纸，无需等待AI生成，适合快速体验流程或测试参数调整效果。",
      },
      {
        title: "交互式抠图",
        content: "在「主体提取」步骤中，点击「打开交互式抠图」可手动调整抠图区域。通过调整前景/背景笔刷和阈值，精细控制提取结果，适合对AI自动提取不满意的场景。",
      },
    ],
  },
  {
    id: "guide-mapping",
    title: "操作指南 · 配色与调色板",
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
        title: "颜色合并与平滑",
        content: "「平滑杂点」选项是一个像素画后处理优化开关，默认处于开启状态。当它开启时，系统会在初始颜色映射完成后，对相邻且颜色相似的像素区域进行合并处理。具体来说，算法采用广度优先搜索（BFS），遍历整个像素网格，识别出颜色差异（基于 RGB 欧氏距离）小于预设阈值的连通区域，然后将每个区域内的所有像素统一设置为该区域内出现次数最多的色号。这一步骤可以有效消除小面积的杂色块，让画面看起来更加整洁干净，特别适合处理照片或复杂图片转换后产生的琐碎颜色点。如果你处理的是插画或已经比较简洁的图形，杂色问题不严重，也可以关闭此选项以保留原始的细节和边缘过渡。建议在大多数情况下保持开启，仅在需要保留精细纹理或渐变效果时关闭。",
      },
    ],
  },
  {
    id: "guide-export",
    title: "操作指南 · 导出与预览",
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
        title: "生成场景预览",
        content: "在「场景预览」步骤，点击「生成场景图」可查看拼豆图纸在选定作品形式上的效果预览。场景图由AI根据图纸和作品形式自动生成，帮助想象成品效果。",
      },
      {
        title: "导出完整作品资料",
        content: "在「场景预览」步骤右侧的「导出作品资料」面板中，你可以一键导出包含文化说明、场景图、拼豆图纸和用量统计的完整作品档案。",
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
        content: "主体提取算法基于图像分割技术，对轮廓清晰、背景简洁、主体突出的图片识别效果最好。以下是一些建议可以显著改善提取效果：1）如果你对自动提取结果不满意，可以在「主体提取」步骤中点击「打开交互式抠图」，通过手动标记前景和背景区域来精细调整抠图边界；2）选择主体与背景对比度更高的图片重新上传，纯色或渐变简单的背景更有利于算法识别；3）在「配置」步骤中调整主题和文化叙述的描述，这会影响 AI 对图片风格的理解，从而生成更符合预期的传统纹样风格图案。如果图片本身分辨率过低或主体过小，也可能导致提取效果不佳，建议使用清晰的大图。",
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
        ],
      },
      {
        title: "二、区域颜色合并（基于相似度 BFS）",
        content: [
          "使用广度优先搜索（BFS）遍历初始映射数据。识别颜色相似（欧氏距离小于阈值）的连通区域。找出每个区域内出现次数最多的珠子色号，将该区域内所有单元格统一设置为这个主导色号对应的颜色。",
          "这是去除杂色的关键步骤。通过调整相似度阈值可以控制合并程度，阈值越大合并越多，颜色越少但细节损失也会增加。",
        ],
      },
      {
        title: "三、背景移除（基于边界洪水填充）",
        content: [
          "定义一组背景色号。从图像所有边界单元格开始，使用洪水填充（Flood Fill）算法。标记所有从边界开始、颜色属于背景色号且相互连通的单元格为「外部背景」。统计和导出时将忽略这些外部单元格。",
          "这确保了用量统计只包含实际需要的拼豆，不会把背景色也算进去。",
        ],
      },
      {
        title: "四、颜色排除与重映射",
        content: [
          "当自动合并后仍有不满意颜色时，你可以手动排除某些颜色。排除后，系统会确定一个重映射目标调色板（包含网格中最初存在且当前未被排除的所有颜色），将所有使用被排除颜色的非外部单元格重新映射到目标调色板中的最接近颜色。",
          "如果目标调色板为空（排除了所有可用颜色），系统会阻止此次排除。恢复被排除颜色时会触发完整的图像重新处理流程。",
        ],
      },
      {
        title: "五、图像滤镜实现",
        content: [
          "滤镜在对图像进行像素化之前应用，直接修改原始图像的像素RGB值。每种滤镜采用不同的像素级变换算法：",
          "· 高对比：将RGB值向两端拉伸（接近0或255），增强色块边界",
          "· 鲜艳：提高饱和度，使颜色更艳丽",
          "· 柔和：降低饱和度并提高亮度，效果更温柔",
          "· 暖色调：增加红色分量，减少蓝色分量",
          "· 冷色调：增加蓝色分量，减少红色分量",
          "· 灰度：使用加权平均法（0.299R + 0.587G + 0.114B）去色",
          "· 怀旧：应用复古棕色调矩阵变换",
          "滤镜选择直接影响像素化结果，同一张图在不同滤镜下会得到不同的拼豆图纸。建议尝试不同滤镜找到最适合主题的效果。",
        ],
      },
      {
        title: "六、开源技术栈",
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
  const [gridSize, setGridSize] = useState(32);
  const [colorCount, setColorCount] = useState(8);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>("1:1");
  const [showGrid, setShowGrid] = useState(true);
  const [antiAlias, setAntiAlias] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<ImageFilter>("none");
  const [colorFamily, setColorFamily] = useState<ColorFamily>("全部");
  const [forcedColors, setForcedColors] = useState<string[]>([]);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [extractedImageUrl, setExtractedImageUrl] = useState<string | null>(null);
  const [pattern, setPattern] = useState<BeadPattern | null>(null);
  const [patternUrl, setPatternUrl] = useState<string | null>(null);
  const [cleanPatternUrl, setCleanPatternUrl] = useState<string | null>(null);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [productSceneUrl, setProductSceneUrl] = useState<string | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [showMatting, setShowMatting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneAbortRef = useRef<AbortController | null>(null);

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

  const abortScene = useCallback(() => {
    sceneAbortRef.current?.abort();
    sceneAbortRef.current = null;
  }, []);

  const prevStepRef = useRef<StudioStep>("config");
  const sceneAutoTriggeredRef = useRef(false);
  const restoringRef = useRef(false);

  const [confirmNew, setConfirmNew] = useState<"ai" | "sample" | "upload" | null>(null);
  const pendingUploadRef = useRef<File | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(() => loadCurrentUserProfile());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Toast 自动消失
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // 检查是否有未保存的进度
  const hasUnsavedWork = !!(sourceImageUrl || pattern || patternUrl);

  const doUseSample = useCallback(() => {
    abortScene();
    // 只替换源头图像和提取图像，不动之前生成的 pattern/scene
    const original = renderSampleDesignOriginal(options);
    setSourceImageUrl(original);
    setExtractedImageUrl(original);
    setError(null);
    setConfirmNew(null);
  }, [abortScene, options]);

  const doUpload = async (file: File) => {
    abortScene();
    setLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      const imageUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setSourceImageUrl(imageUrl);
      // 只替换源头图像，不动之前生成的 pattern/scene
      const response = await fetch("/api/extract-theme-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, isUpload: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "主体提取失败");
      setExtractedImageUrl(result.imageUrl);
      setShowMatting(true);
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
      renderPatternToCanvas(canvasRef.current, pattern, true);
    }
    const patternCanvas = document.createElement("canvas");
    renderPatternToCanvas(patternCanvas, pattern, true);
    setPatternUrl(patternCanvas.toDataURL("image/png"));

    const cleanCanvas = document.createElement("canvas");
    renderPatternToCanvasClean(cleanCanvas, pattern, showGrid);
    setCleanPatternUrl(cleanCanvas.toDataURL("image/png"));
  }, [pattern, showGrid, step]);

  const handleThemeSelect = (themeId: string) => {
    const next = cultureThemes.find((item) => item.id === themeId);
    if (!next) return;
    setTheme(next.name);
    setElement(next.elements[0] ?? "");
    setMeaning(next.meaning);
  };

  const clearPatternArtifacts = () => {
    setPattern(null);
    setPatternUrl(null);
    setCleanPatternUrl(null);
    setProductSceneUrl(null);
    setMockupUrl(null);
  };

  const buildPatternFromExtracted = async () => {
    if (!extractedImageUrl) {
    setError(null);
    setToastMsg("请先完成主题提取，再生成拼豆图纸。");
    setStep("extract");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await imageDataUrlToPattern(
        extractedImageUrl,
        { ...options, antiAlias, source: sourceImageUrl === extractedImageUrl ? "ai" : "upload", preserveSourceRatio: false },
        forcedColors,
        selectedFilter,
      );
      setPattern(next);
      setProductSceneUrl(null);
      setMockupUrl(null);
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
  }, [step, extractedImageUrl, options, antiAlias, forcedColors, selectedFilter]);

  const handleGenerateAI = async () => {
    abortScene();
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
      setSourceImageUrl(result.imageUrl);
      setExtractedImageUrl(result.imageUrl);
      clearPatternArtifacts();
      setShowMatting(false);
      setStep("extract");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 图案生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = (file: File) => {
    abortScene();
    const reader = new FileReader();
    reader.onload = async () => {
      setLoading(true);
      setError(null);
      try {
        const imageUrl = String(reader.result);
        setSourceImageUrl(imageUrl);
        const response = await fetch("/api/extract-theme-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, isUpload: true }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error ?? "主体提取失败");
        setExtractedImageUrl(result.imageUrl);
        clearPatternArtifacts();
        setShowMatting(true);
        setStep("extract");
      } catch (err) {
        setError(err instanceof Error ? err.message : "图片处理失败");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const applyMattingResult = async (resultImageUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extract-theme-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: resultImageUrl, isUpload: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "主题图案生成失败");
      setExtractedImageUrl(result.imageUrl);
      clearPatternArtifacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "抠图结果转传统文创图案失败");
    } finally {
      setLoading(false);
    }
  };

  const generateScene = async () => {
    const scenePatternUrl = cleanPatternUrl ?? patternUrl;
    if (!scenePatternUrl) return;
    abortScene();
    const controller = new AbortController();
    sceneAbortRef.current = controller;
    setSceneLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-product-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternUrl: scenePatternUrl, productId, aspectRatio }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "场景预览生成失败");
      setProductSceneUrl(result.imageUrl);
      setMockupUrl(result.imageUrl);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "场景预览生成失败");
    } finally {
      setSceneLoading(false);
    }
  };

  // 进入步骤四（场景预览）时，如果已有拼豆图纸但尚未生成场景图，自动触发生成
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = step;

    // 只有从其他步骤进入 preview 时才自动触发
    if (step === "preview" && prev !== "preview") {
      const hasPattern = !!(cleanPatternUrl ?? patternUrl);
      if (hasPattern && !productSceneUrl && !sceneLoading) {
        sceneAutoTriggeredRef.current = true;
        generateScene();
      }
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // 当 patternUrl 或 cleanPatternUrl 变化时（图纸重新生成），如果当前在 preview 步骤且有图纸但无场景，自动重新生成场景
  useEffect(() => {
    if (step === "preview") {
      const hasPattern = !!(cleanPatternUrl ?? patternUrl);
      if (hasPattern && !productSceneUrl && !sceneLoading) {
        generateScene();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternUrl, cleanPatternUrl]);

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

  const renderStep = () => {
    if (step === "config") {
      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">⚙️ 配置传统文化拼豆方案</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">选择主题、核心元素、叙述、作品形式、比例与网格参数。</p>
            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-medium">
                传统主题
                <select onChange={(event) => handleThemeSelect(event.target.value)} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2">
                  {cultureThemes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
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
                  <select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2">
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
                  🎨 颜色上限：{colorCount} 色
                  <input type="range" min={2} max={128} step={2} value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))} className="mt-3 w-full" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  显示网格
                  <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  平滑杂点
                  <input type="checkbox" checked={antiAlias} onChange={(event) => setAntiAlias(event.target.checked)} />
                </label>
                <label className="relative text-sm font-medium">
                  🌈 滤镜
                  <select value={selectedFilter} onChange={(event) => setSelectedFilter(event.target.value as ImageFilter)} className="mt-1 w-full appearance-none rounded-md border border-stone-300 py-2 pl-10 pr-3">
                    {IMAGE_FILTER_OPTIONS.map((f) => (
                      <option key={f.key} value={f.key}>{f.icon} {f.name}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute left-2 top-1/2 mt-4 -translate-y-1/2 text-base">
                    {IMAGE_FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.icon ?? "🎨"}
                  </span>
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
            <h2 className="text-xl font-semibold">🎨 调色板</h2>
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
          </section>
        </div>
      );
    }

    if (step === "extract") {
      return (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">🖼️ 原始素材</h2>
            <p className="mt-1 text-sm text-stone-500">AI 生成或上传的原图会保留在这里，用于回看主题来源。</p>
            <div className="mt-4">{renderImageBox(sourceImageUrl, "原始素材")}</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={handleGenerateAI} disabled={loading} className="rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading ? "生成中..." : "重新 AI 生成"}
              </button>
              <label className="cursor-pointer rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">
                重新上传
                <input type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleUpload(file);
                  event.currentTarget.value = "";
                }} />
              </label>
            </div>
          </section>
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-xl font-semibold">✂️ 主体提取结果</h2>
            <p className="mt-1 text-sm text-stone-500">上传图片会先提取主要元素，并结合当前主题生成传统文创图案；这里不进行拼豆化，拼豆网格会在第三阶段生成。</p>
            <div className="mt-4">{renderImageBox(extractedImageUrl, "主体素材")}</div>
            <div className="mt-4 flex flex-wrap gap-3">
              {sourceImageUrl && (
                <button type="button" onClick={() => setShowMatting((value) => !value)} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold">
                  {showMatting ? "收起交互式抠图" : "打开交互式抠图"}
                </button>
              )}
              <button type="button" onClick={buildPatternFromExtracted} disabled={loading || !extractedImageUrl} className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading ? "生成中..." : "生成拼豆图纸"}
              </button>
            </div>
          </section>
          {showMatting && sourceImageUrl && (
            <div className="lg:col-span-2">
              <InteractiveMatting
                imageUrl={sourceImageUrl}
                onMattingResult={applyMattingResult}
                onClose={() => setShowMatting(false)}
              />
            </div>
          )}
        </div>
      );
    }

    if (step === "pattern") {
      const total = beadCounts.reduce((sum, item) => sum + item.count, 0);
      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">🧩 拼豆图纸</h2>
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
              <div className="mt-5 overflow-auto rounded-md border border-stone-200 bg-stone-50 p-4">
                {pattern ? (
                  <canvas ref={canvasRef} className="mx-auto max-w-full" />
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
            <h2 className="text-xl font-semibold">📊 用量统计</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
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
                    <tr key={item.rgb} className="border-t border-stone-200">
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
            <h2 className="text-xl font-semibold">⚙️ 当前配置</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">可在此直接调整参数，图纸将实时刷新。</p>
            <div className="mt-3 grid gap-3">
              <label className="text-sm font-medium">
                作品形式
                <select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">
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
                🎨 颜色上限：{colorCount} 色
                <input type="range" min={2} max={128} step={2} value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <div className="grid gap-2 md:grid-cols-3">
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  显示网格
                  <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                </label>
                <label className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium">
                  平滑杂点
                  <input type="checkbox" checked={antiAlias} onChange={(event) => setAntiAlias(event.target.checked)} />
                </label>
                <label className="relative text-sm font-medium">
                  🌈 滤镜
                  <select value={selectedFilter} onChange={(event) => setSelectedFilter(event.target.value as ImageFilter)} className="mt-1 w-full appearance-none rounded-md border border-stone-300 py-1.5 pl-8 pr-2 text-xs">
                    {IMAGE_FILTER_OPTIONS.map((f) => (
                      <option key={f.key} value={f.key}>{f.icon} {f.name}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute left-2 top-1/2 mt-3 -translate-y-1/2 text-xs">
                    {IMAGE_FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.icon ?? "🎨"}
                  </span>
                </label>
              </div>
            </div>
          </section>
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">🎨 成品场景预览</h2>
              <p className="mt-1 text-sm text-stone-500">查看拼豆图纸在 {formLabel} 上的效果，可生成更完整的场景图。</p>
            </div>
            <button type="button" onClick={generateScene} disabled={!patternUrl || sceneLoading} className="rounded-md bg-[#8f1d21] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {sceneLoading ? "生成中..." : "生成场景图"}
            </button>
          </div>
          <div className="mt-5">
            <ProductMockup
              pattern={pattern}
              product={product}
              sceneUrl={productSceneUrl}
              loading={sceneLoading}
              onRendered={(url) => setMockupUrl(url)}
            />
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-3 text-xl font-semibold">📤 导出作品资料</h2>
            <ExportPanel title={copy.title} patternUrl={patternUrl} mockupUrl={mockupUrl} copy={copy} beadCounts={beadCounts} />
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-3 text-xl font-semibold">📖 文化说明</h2>
            <CultureExplanation copy={copy} />
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
    setProductId(record.productId);
    setGridSize(record.gridSize);
    setColorCount(record.colorCount);
    setAspectRatio(record.aspectRatio as AspectRatioId);
    setShowGrid(record.showGrid);
    setAntiAlias(record.antiAlias);
    setSourceImageUrl(record.sourceImageUrl);
    setExtractedImageUrl(record.extractedImageUrl);
    setPatternUrl(record.patternUrl);
    setCleanPatternUrl(record.cleanPatternUrl);
    setMockupUrl(record.mockupUrl);
    setProductSceneUrl(record.productSceneUrl);

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
  }, []);

  // 自动保存当前作品到历史记录
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
      completed: step === "preview" && !!productSceneUrl,
      theme,
      element,
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
      mockupUrl,
      productSceneUrl,
    };
    saveProjectRecord(record);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, step, pattern, patternUrl, cleanPatternUrl, productSceneUrl, sourceImageUrl]);

  return (
    <main className="min-h-screen bg-[#f8f5ef] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#fffdf7]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 左侧 Logo */}
          <button type="button" onClick={() => setView("home")} className="flex shrink-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[#8f1d21] text-xs font-bold text-white">韵</span>
          </button>

          {/* 中间导航 */}
          <nav className="flex items-center gap-1 rounded-md bg-stone-100 p-1">
              {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
            onClick={() => setView(item.id)}
                className={`rounded px-4 py-2 text-sm font-medium transition ${
                  view === item.id ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"
                }`}
              >
                <span className="mr-1">{item.icon}</span>{item.label}
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
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
            >
              <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-stone-300 text-xs font-semibold text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </span>
              <span className="hidden sm:inline">登录</span>
            </button>
          )}
        </div>
      </header>

      {/* 个人主页 */}
      {view === "profile" && (
        <ProfilePage
          onBack={() => setView("home")}
          onRestoreProject={handleRestoreProject}
        />
      )}

      {view === "home" && (
        <>
          <section className="relative overflow-hidden bg-[#2b2118] text-white">
            <div className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
              <p className="text-sm font-semibold text-[#f2c46d]">千年纹样 × 掌间拼豆</p>
              <h1 className="mt-3 max-w-4xl whitespace-nowrap text-2xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                方寸之间，粒粒皆可触摸的东方诗篇
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-200">
                从传统纹样中拾取一片色彩，让古老的审美以新的温度落回掌心。豆韵以AI为笔，将文化意象织入像素网格——选题、生成、映射、成稿，每一步皆是对传统的再创作，也是献给手作时光的一封情书。
              </p>
              <div className="mt-7 flex flex-wrap gap-4">
                <button type="button" onClick={() => setView("start")} className="rounded-md bg-[#f2c46d] px-8 py-4 text-base font-bold text-stone-950 shadow-lg transition hover:bg-[#f4d07a] hover:shadow-xl">
                  🚀 快速开始
                </button>
              </div>
              <ScrollingPatternBand />
            </div>
            <div className="mx-auto grid max-w-7xl gap-5 px-4 pb-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
              {showcase.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => {
                    const themeData = cultureThemes.find((t) => t.name === item.theme);
                    if (themeData) {
                      setTheme(themeData.name);
                      setElement(themeData.elements[0] ?? "");
                      setMeaning(themeData.meaning);
                    }
                    clearPatternArtifacts();
                    setSourceImageUrl(null);
                    setExtractedImageUrl(null);
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

          <section className="bg-[#fffdf7] py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <p className="text-sm font-semibold text-[#8f1d21]">制作流程</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">从文化意象到拼豆底稿</h2>
              <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {craftSteps.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      setView("faq");
                      // 延迟滚动以等待 DOM 渲染
                      setTimeout(() => {
                        document.getElementById(item.anchor)?.scrollIntoView({ behavior: "smooth" });
                      }, 150);
                    }}
                    className="w-full rounded-lg border border-stone-200 bg-[#fbf7ed] p-5 text-left transition hover:border-[#8f1d21]/40 hover:shadow-sm"
                  >
                    <PatternMiniature colors={["#FFFFFF", "#1557A8", "#943630", "#EDB045"]} />
                    <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{item.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {view === "faq" && (
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-[#8f1d21]">创作指南</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">豆韵 · 帮助</h1>
          <div className="mt-8 space-y-6">
            {helpData.map((section) => (
              <div key={section.id} id={section.id} className="scroll-mt-20 rounded-lg border border-stone-200 bg-white">
                <div className="border-b border-stone-100 px-5 py-4">
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    <span>{section.icon}</span>
                    <span>{section.title}</span>
                  </h2>
                </div>
                <div className="divide-y divide-stone-100">
                  {section.subs.map((sub, subIndex) => (
                    <details key={subIndex} className="group p-5" open={subIndex === 0}>
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
            ))}
          </div>
        </section>
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
                        setToastMsg("请先生成或上传素材，再进入主体提取步骤。");
                      } else if (index === 2 && !extractedImageUrl) {
                        setToastMsg("请先完成主体提取，再生成拼豆图纸。");
                      } else if (index === 3 && !pattern) {
                        setToastMsg("请先生成拼豆图纸，再进入场景预览。");
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
                      clearPatternArtifacts();
                      setSourceImageUrl(null);
                      setExtractedImageUrl(null);
                      if (confirmNew === "ai") {
                        handleGenerateAI();
                      } else if (confirmNew === "sample") {
                        doUseSample();
                      } else if (confirmNew === "upload") {
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
        <div className="fixed left-1/2 top-20 z-[200] -translate-x-1/2 animate-bounce rounded-lg bg-red-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* 登录/注册弹窗 */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoggedIn={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
          }}
        />
      )}
    </main>
  );
}
