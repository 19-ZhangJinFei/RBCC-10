// 材料包（采购清单）参数配置
// —— 商科/金融去淘宝调研后，直接替换这里的示例值即可，算法逻辑不用改。

export type KitParams = {
  packSize: number; // 每包颗数
  pricePerPack: number; // 每包单价（元）
  wasteFactor: number; // 损耗系数（1.1 = 多备 10%）
};

// 市场行情估值（来源：网络检索的国产拼豆报价）——
// 5mm(Midi)补充装常见约 1000 颗/包；国产约 1.3~1.5 元/1000颗，
// 知名品牌(如 Mard)约 5 元/1000颗，特殊色(夜光/金葱)更高。
// 待商科在淘宝按目标品牌实测后替换。
export const DEFAULT_KIT_PARAMS: KitParams = {
  packSize: 1000, // 每包颗数（5mm 补充装常见规格）
  pricePerPack: 3, // 元/包（国产中档估值，区间 1.5~5，待淘宝实测）
  wasteFactor: 1.1, // 损耗系数：多备 10%
};

// 目标店铺商品页（整店一个 id，颜色在页面里按色号变体选择）。
export const SHOP_ITEM_URL = "https://item.taobao.com/item.htm?id=1050906554476";

// 该店实际有货的色号集合——据其商品页 14 张色卡图逐一核对。
// 说明：本 app 的色号体系(heritage)与该店编号完全一致(A01/B02…)，故按色号直接对应；
// 未列入者(如 M01/M02)会自动回退到「淘宝搜索」去找别家。
function expandCodes(prefix: string, from: number, to: number, pad = 2): string[] {
  const list: string[] = [];
  for (let i = from; i <= to; i++) list.push(prefix + String(i).padStart(pad, "0"));
  return list;
}
export const SHOP_STOCK_CODES: ReadonlySet<string> = new Set<string>([
  ...expandCodes("A", 1, 26), ...expandCodes("B", 1, 32), ...expandCodes("C", 1, 29),
  ...expandCodes("D", 1, 26), ...expandCodes("E", 1, 24), ...expandCodes("F", 1, 25),
  ...expandCodes("G", 1, 21), ...expandCodes("H", 1, 23), ...expandCodes("M", 3, 15),
  ...expandCodes("P", 1, 23), ...expandCodes("Q", 1, 5), ...expandCodes("R", 1, 28),
  ...expandCodes("Y", 1, 9), "T01",
  // 特殊灰调色：本 app 记作 ZG1..ZG8，对应该店 Z01..Z08（同色不同码）
  ...expandCodes("ZG", 1, 8, 1),
]);

// 覆盖表（可选加强）：商科拿到「色号 → 对应 skuId 变体链接」后填这里，可精确直达该颜色。
// 例：  "A01": "https://item.taobao.com/item.htm?id=1050906554476&skuId=xxxx",
export const LINK_OVERRIDES: Record<string, string> = {
  // 商科拿到各色 skuId 后在此补充
};

// 生成某色号的淘宝购买链接：覆盖表 > 该店有货则跳该店 > 否则搜别家。
export function taobaoLink(colorCode: string): string {
  const override = LINK_OVERRIDES[colorCode];
  if (override) return override;
  if (SHOP_STOCK_CODES.has(colorCode)) return SHOP_ITEM_URL;
  const query = encodeURIComponent(`拼豆 5mm 补充装 ${colorCode}`.trim());
  return `https://s.taobao.com/search?q=${query}`;
}
