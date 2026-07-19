import type { BeadCount } from "./countBeads";
import { DEFAULT_KIT_PARAMS, taobaoLink, type KitParams } from "@/config/kitConfig";

// 采购清单的单行：一个色号需要买多少、花多少、去哪买。
export type KitItem = {
  colorCode: string; // 色号
  rgb: string;
  count: number; // 需要颗数
  packs: number; // 买几包
  pricePerPack: number; // 单价（元/包）
  subtotal: number; // 小计（元）
  usage: string; // 用途（轮廓/主纹样/填充…）
  buyUrl: string; // 淘宝购买链接
};

// 整份采购清单：行项 + 汇总。
export type Kit = {
  items: KitItem[];
  totalBeads: number; // 总颗数
  colorKinds: number; // 色号种类数
  totalPacks: number; // 总包数
  totalPrice: number; // 总价（元）
  params: KitParams;
};

/**
 * 把 BOM（每色颗数）换算成「能下单的采购清单」。
 * 逐色号：包数 = ceil(颗数 × 损耗系数 / 每包颗数)，小计 = 包数 × 单价。
 */
export function buildKit(beadCounts: BeadCount[], params: KitParams = DEFAULT_KIT_PARAMS): Kit {
  const { packSize, pricePerPack, wasteFactor } = params;

  const items: KitItem[] = beadCounts
    .filter((bead) => bead.count > 0)
    .map((bead) => {
      const packs = Math.max(1, Math.ceil((bead.count * wasteFactor) / packSize));
      const subtotal = packs * pricePerPack;
      return {
        colorCode: bead.brandCode,
        rgb: bead.rgb,
        count: bead.count,
        packs,
        pricePerPack,
        subtotal,
        usage: bead.usage,
        buyUrl: taobaoLink(bead.brandCode),
      };
    });

  const totalBeads = items.reduce((sum, item) => sum + item.count, 0);
  const totalPacks = items.reduce((sum, item) => sum + item.packs, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    items,
    totalBeads,
    colorKinds: items.length,
    totalPacks,
    totalPrice,
    params,
  };
}
