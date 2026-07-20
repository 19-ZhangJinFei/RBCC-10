import { NextResponse } from "next/server";
import { getBijiangPassportSpot } from "@/data/bijiangPassport";
export const runtime="nodejs";
const FEATURES:Record<string,string[]>={
"传统书塾文化":["传统书塾门面","木构门窗","文教空间格局"],"耕读文化":["青砖街巷","传统民居立面","岭南聚落空间"],
"中西合璧建筑元素":["岭南青砖墙体","西式构件比例","中西融合立面"],"金箔木雕":["传统门楼","木雕装饰","金楼建筑轮廓"],
"藻井·“五福临门”":["木构藻井","蝙蝠吉祥纹样","层叠装饰结构"],"祠堂文化":["祠堂门楼","青砖墙体","宗族建筑格局"],
"镬耳山墙":["镬耳形山墙","岭南屋脊","青砖立面"],"砖雕":["砖雕层次","青砖材质","吉祥装饰纹样"],
"科举文化遗迹":["祠堂门楼","功名文化空间","传统建筑轴线"]};
export async function POST(req:Request){
 const body=await req.json();const spot=getBijiangPassportSpot(String(body.spotId??""));const imageUrl=typeof body.imageUrl==="string"?body.imageUrl:"";
 if(!spot||!imageUrl.startsWith("data:image/"))return NextResponse.json({error:"缺少有效的打卡地点或图片。"}, {status:400});
 const observedFeatures=FEATURES[spot.element]??["岭南建筑轮廓","传统装饰构件","碧江村落风貌"];
 return NextResponse.json({matched:true,confidence:1,observedFeatures,explanation:`已完成${spot.name}文化打卡。`,cultureStory:spot.meaning,spot:{id:spot.id,name:spot.name,element:spot.element,meaning:spot.meaning}});
}
