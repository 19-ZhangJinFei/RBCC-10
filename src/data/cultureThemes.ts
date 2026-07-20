import {
  bijiangElementGroups,
  bijiangElementMeanings,
  bijiangElementStructures,
  bijiangElements,
  cultureThemes as bijiangCultureThemes,
} from "@/data/bijiangCulture";

export type CultureTheme = {
  id: string;
  name: string;
  elements: string[];
  colors: string[];
  paletteHints: string[];
  meaning: string;
  elementMeanings?: Record<string, string>;
  elementStructures?: Record<string, string>;
};

const traditionalCultureThemes: CultureTheme[] = [
  {
    id: "dunhuang",
    name: "敦煌文化",
    elements: ["飞天", "藻井", "祥云", "莲花纹", "九色鹿"],
    colors: ["土黄", "赭红", "青绿", "米白"],
    paletteHints: ["#EDB045", "#943630", "#3DAF80", "#FCF9E0", "#0B3C43"],
    meaning: "敦煌文化融合佛教艺术、丝路文明与中国传统装饰审美，适合转译为高对比、强轮廓的拼豆纹样。",
  },
  {
    id: "blue_porcelain",
    name: "青花瓷",
    elements: ["莲花", "缠枝纹", "云纹", "瓷瓶", "海水纹"],
    colors: ["瓷白", "深蓝", "浅蓝"],
    paletteHints: ["#FFFFFF", "#1557A8", "#3677D2", "#CDE8FF", "#1C334D"],
    meaning: "青花瓷以蓝白配色和清雅纹样体现中国陶瓷审美，适合杯垫、冰箱贴和挂饰类文创。",
  },
  {
    id: "opera_mask",
    name: "京剧脸谱",
    elements: ["关羽", "张飞", "曹操", "包拯", "对称脸谱"],
    colors: ["红", "黑", "白", "蓝", "金"],
    paletteHints: ["#E7002F", "#000000", "#FFFFFF", "#1A60C3", "#FFDA45"],
    meaning: "京剧脸谱通过色彩象征人物性格与戏曲文化符号，适合生成对称、饱满、识别度高的拼豆图案。",
  },
  {
    id: "shanhaijing",
    name: "山海经",
    elements: ["神兽", "羽翼", "山纹", "日月", "瑞兽"],
    colors: ["墨黑", "朱红", "青绿", "金黄"],
    paletteHints: ["#1D1414", "#D30022", "#166F41", "#FFC830", "#E6B483"],
    meaning: "山海经意象强调想象力与东方神话叙事，可转化为轮廓鲜明的挂件或摆件。",
  },
  {
    id: "solar_terms",
    name: "二十四节气",
    elements: ["立春", "清明", "小满", "白露", "冬至"],
    colors: ["嫩绿", "米白", "浅蓝", "暖黄"],
    paletteHints: ["#AFDCAB", "#FFFDF0", "#A0E2FB", "#FFDD99", "#F7B4C6"],
    meaning: "二十四节气连接物候、农事与生活美学，适合做胸针、课程材料和季节限定文创。",
  },
  {
    id: "oracle_bone",
    name: "甲骨文",
    elements: ["日", "月", "山", "水", "人"],
    colors: ["骨白", "墨黑", "赭红", "土黄"],
    paletteHints: ["#F6EFE2", "#000000", "#943630", "#EDB045", "#D0CCAA"],
    meaning: "甲骨文把汉字源流转化为简洁符号，天然适合低像素网格和研学手作场景。",
  },
  {
    id: "sanxingdui",
    name: "三星堆青铜文化",
    elements: ["青铜面具", "纵目面具", "神树", "太阳轮", "金杖纹"],
    colors: ["铜绿", "鎏金", "墨黑", "土黄"],
    paletteHints: ["#2F7D64", "#D6A23A", "#111111", "#8A5A2B", "#C7B08A"],
    meaning: "三星堆青铜文化以神秘面具、神树与太阳崇拜为核心，适合转化为强轮廓、高辨识度的挂件和摆件图案。",
  },
  {
    id: "song_porcelain",
    name: "宋代瓷器",
    elements: ["汝窑冰裂纹", "莲瓣纹", "梅瓶", "弦纹", "开片纹"],
    colors: ["天青", "月白", "米灰", "淡绿"],
    paletteHints: ["#A8C8C0", "#F4F1E8", "#D8D1C4", "#B8C8A8", "#8BA39A"],
    meaning: "宋代瓷器强调含蓄、比例与釉色之美，适合制作清雅低饱和的杯垫、胸针和装饰画。",
  },
  {
    id: "hanfu_cloud",
    name: "汉服纹样",
    elements: ["云肩", "团花", "如意云", "织金纹", "对襟纹"],
    colors: ["绛红", "黛蓝", "牙白", "金色"],
    paletteHints: ["#8F1D21", "#253B5B", "#F7F2E8", "#D7A84A", "#6E2E3A"],
    meaning: "汉服纹样承载礼仪、服饰结构与织绣审美，可转化为对称、连续、适合穿戴配饰的拼豆图案。",
  },
  {
    id: "miao_embroidery",
    name: "苗绣",
    elements: ["蝴蝶妈妈", "鸟纹", "鱼纹", "银饰", "花草纹"],
    colors: ["靛蓝", "玫红", "明黄", "银白", "翠绿"],
    paletteHints: ["#123C69", "#D73B7C", "#F1C232", "#E7E7E7", "#1F8A5B"],
    meaning: "苗绣以族群记忆、自然崇拜和高饱和色彩见长，适合生成活泼、密集、装饰性强的手作图案。",
  },
  {
    id: "zhuang_brocade",
    name: "壮锦",
    elements: ["几何菱纹", "铜鼓纹", "花鸟纹", "太阳纹", "水波纹"],
    colors: ["朱红", "靛蓝", "金黄", "翠绿"],
    paletteHints: ["#C62828", "#0F3D63", "#F2C94C", "#2E8B57", "#F8F1D8"],
    meaning: "壮锦以几何节奏和鲜明色块构成织锦秩序，适合转译为规则网格、边框装饰和杯垫底稿。",
  },
  {
    id: "paper_cut",
    name: "剪纸",
    elements: ["窗花", "生肖", "团花", "喜字", "莲年有余"],
    colors: ["中国红", "暖白", "金黄", "墨黑"],
    paletteHints: ["#D6001C", "#FFF7E6", "#F7C948", "#111111", "#B71C1C"],
    meaning: "剪纸以镂空、对称和吉祥寓意为特征，适合生成轮廓清晰、正负形明确的拼豆作品。",
  },
  {
    id: "shadow_puppet",
    name: "皮影戏",
    elements: ["皮影人物", "戏帽", "云袖", "马鞍", "花纹关节"],
    colors: ["琥珀", "朱红", "墨黑", "青绿"],
    paletteHints: ["#C97B2B", "#B51D1A", "#1C1C1C", "#237A57", "#F3D7A4"],
    meaning: "皮影戏强调人物剪影、镂刻纹理与戏曲叙事，适合做层次分明、边缘锐利的挂饰图案。",
  },
  {
    id: "cloisonne",
    name: "景泰蓝",
    elements: ["缠枝莲", "掐丝纹", "宝相花", "瓶身纹", "如意边"],
    colors: ["孔雀蓝", "金色", "珊瑚红", "白"],
    paletteHints: ["#007C89", "#D4AF37", "#D95A4E", "#FFFFFF", "#1D3557"],
    meaning: "景泰蓝融合金属掐丝与浓艳釉色，适合转化为边线明确、色块饱满的文创拼豆图纸。",
  },
  {
    id: "bronze_ware",
    name: "商周青铜器",
    elements: ["饕餮纹", "夔龙纹", "兽面纹", "云雷纹", "鼎"],
    colors: ["青铜绿", "深褐", "金棕", "墨黑"],
    paletteHints: ["#3F6F5B", "#4B2E1E", "#B9853A", "#111111", "#7A8C66"],
    meaning: "商周青铜器纹样庄重、对称、充满礼器秩序，适合制作厚重神秘的摆件或装饰画。",
  },
  {
    id: "forbidden_city",
    name: "故宫宫廷纹样",
    elements: ["宫墙", "琉璃瓦", "龙纹", "海水江崖", "如意纹"],
    colors: ["宫墙红", "琉璃黄", "宝蓝", "金色"],
    paletteHints: ["#8F1D21", "#F2C94C", "#1B4F9C", "#D6A23A", "#F8E8C8"],
    meaning: "故宫宫廷纹样体现皇家建筑、礼制色彩与吉祥纹饰，适合庄重、华丽、纪念品风格的设计。",
  },
  {
    id: "suzhou_garden",
    name: "苏州园林",
    elements: ["漏窗", "太湖石", "粉墙黛瓦", "竹影", "荷塘"],
    colors: ["粉白", "黛灰", "竹绿", "水墨黑"],
    paletteHints: ["#F7F2EA", "#4A5560", "#4F7F52", "#111827", "#C9D6C5"],
    meaning: "苏州园林以借景、留白、窗格和山石组织空间，适合生成静雅、留白明确的拼豆图案。",
  },
  {
    id: "ink_landscape",
    name: "水墨山水",
    elements: ["远山", "松树", "飞鸟", "溪流", "亭台"],
    colors: ["墨黑", "烟灰", "宣纸白", "淡青"],
    paletteHints: ["#111111", "#6B7280", "#F8F5EC", "#9DB8B2", "#3F4A46"],
    meaning: "水墨山水讲究虚实、层次和留白，可转化为低色数、意境化的装饰画与书签图案。",
  },
  {
    id: "auspicious_animals",
    name: "传统瑞兽",
    elements: ["麒麟", "貔貅", "凤凰", "龙", "狮子"],
    colors: ["朱红", "金黄", "青绿", "墨黑"],
    paletteHints: ["#C62828", "#D6A23A", "#2E8B57", "#111111", "#F4E0B5"],
    meaning: "传统瑞兽承载祈福、守护和祥瑞寓意，适合生成轮廓强烈、装饰性高的挂件与摆件。",
  },
  {
    id: "zodiac",
    name: "十二生肖",
    elements: ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"],
    colors: ["中国红", "金黄", "米白", "墨黑"],
    paletteHints: ["#D6001C", "#F2C94C", "#FFF7E6", "#111111", "#8F1D21"],
    meaning: "十二生肖兼具民俗纪年和祝福寓意，适合做节庆挂件、亲子手作和系列化文创。",
  },
  {
    id: "new_year",
    name: "年画与春节",
    elements: ["门神", "年娃", "锦鲤", "爆竹", "福字"],
    colors: ["大红", "金黄", "桃粉", "翠绿"],
    paletteHints: ["#D6001C", "#F7C948", "#F4A3B4", "#2E8B57", "#FFF0D8"],
    meaning: "年画与春节图像强调喜庆、祈福和家庭团圆，适合制作高饱和、节日氛围强的拼豆作品。",
  },
  {
    id: "dragon_boat",
    name: "端午文化",
    elements: ["龙舟", "粽子", "艾草", "五彩绳", "鼓手"],
    colors: ["艾绿", "朱红", "米白", "靛蓝"],
    paletteHints: ["#4F7F52", "#C62828", "#F8F1D8", "#1B4F72", "#D6A23A"],
    meaning: "端午文化融合驱疫祈安、龙舟竞渡与节令饮食，适合做节日限定挂饰和课程材料。",
  },
  {
    id: "mid_autumn",
    name: "中秋文化",
    elements: ["月兔", "桂花", "圆月", "宫灯", "月饼纹"],
    colors: ["月白", "桂花黄", "深蓝", "暖金"],
    paletteHints: ["#F7F2E8", "#F2C94C", "#1D3557", "#D6A23A", "#C9D6E8"],
    meaning: "中秋文化围绕团圆、月亮与桂花意象展开，适合制作温暖、柔和、礼品属性强的图案。",
  },
  {
    id: "tea_culture",
    name: "中国茶文化",
    elements: ["茶盏", "茶壶", "茶山", "茶叶", "水纹"],
    colors: ["茶绿", "陶土", "米白", "深褐"],
    paletteHints: ["#6B8E4E", "#A05A2C", "#F7F2E8", "#4B2E1E", "#C8B88A"],
    meaning: "中国茶文化强调器物、山水与闲雅生活，适合做杯垫、茶席小物和低饱和文创图案。",
  },
  {
    id: "dream_red_chamber",
    name: "红楼梦",
    elements: ["通灵宝玉", "绛珠仙草", "海棠花", "大观园", "金陵十二钗"],
    colors: ["胭脂红", "玉白", "黛青", "浅金"],
    paletteHints: ["#B8334A", "#F7F2E8", "#2F4F5F", "#D6A23A", "#E9B7C5"],
    meaning: "红楼梦意象兼具园林、诗词、人物命运与玉石象征，适合生成细腻、雅致、带有古典文学气质的拼豆图案。",
  },
  {
    id: "journey_west",
    name: "西游记",
    elements: ["孙悟空", "金箍棒", "筋斗云", "莲花座", "火焰山"],
    colors: ["金黄", "朱红", "云白", "靛蓝"],
    paletteHints: ["#F2C94C", "#C62828", "#F8F5EC", "#1B4F9C", "#F28C28"],
    meaning: "西游记以神魔想象、取经叙事和鲜明角色造型为核心，适合制作动感强、轮廓清晰、富有冒险感的挂件和杯垫。",
  },
  {
    id: "romance_three_kingdoms",
    name: "三国演义",
    elements: ["青龙偃月刀", "羽扇纶巾", "赤兔马", "桃园结义", "战旗"],
    colors: ["赤红", "玄黑", "青绿", "金色"],
    paletteHints: ["#B51D1A", "#111111", "#2E8B57", "#D6A23A", "#F2E6C9"],
    meaning: "三国演义强调英雄人物、谋略、兵器与战旗符号，适合转化为庄重、高对比、具有史诗感的文创拼豆图纸。",
  },
  {
    id: "water_margin",
    name: "水浒传",
    elements: ["梁山泊", "替天行道旗", "虎纹", "酒碗", "朴刀"],
    colors: ["墨黑", "朱红", "草绿", "土黄"],
    paletteHints: ["#111111", "#C62828", "#4F7F52", "#C28A3A", "#F1E4C5"],
    meaning: "水浒传围绕江湖侠义、梁山聚义和豪放民间叙事展开，适合生成粗犷有力、边缘明确、适合摆件或徽章的图案。",
  },
  {
    id: "poetry_calligraphy",
    name: "诗词书法",
    elements: ["兰亭序", "印章", "竹简", "毛笔", "卷轴"],
    colors: ["宣纸白", "墨黑", "印泥红", "竹青"],
    paletteHints: ["#F8F5EC", "#111111", "#B51D1A", "#5B7F5A", "#D6C6A8"],
    meaning: "诗词书法以文字气韵、印章和文房器物为核心，适合转化为简洁符号、书签和研学文创。",
  },
];

export { bijiangElementGroups, bijiangElementMeanings, bijiangElementStructures, bijiangElements };

export const cultureThemes: CultureTheme[] = [
  ...bijiangCultureThemes,
  ...traditionalCultureThemes,
];

export function getThemeById(id: string): CultureTheme {
  return cultureThemes.find((theme) => theme.id === id) ?? cultureThemes[0];
}
