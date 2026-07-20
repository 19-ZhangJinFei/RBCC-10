import { NextResponse } from "next/server";
export const runtime="nodejs";
function upstreamError(detail:string){try{return JSON.parse(detail)?.error?.message??"碧江平面图生成失败。"}catch{return "碧江平面图生成失败。"}}
export async function POST(req:Request){
 const body=await req.json();
 const imageUrls=Array.isArray(body.imageUrls)?body.imageUrls.filter((item:unknown)=>typeof item==="string"&&item.startsWith("data:image/")).slice(0,4):[];
 const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
 if(imageUrls.length<1||!prompt)return NextResponse.json({error:"缺少有效参考图或设计要求。"}, {status:400});
 const apiKey=process.env.ARK_API_KEY,baseUrl=(process.env.ARK_BASE_URL??process.env.AI_BASE_URL??"https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/,""),model=process.env.ARK_IMAGE_MODEL??process.env.AI_IMAGE_MODEL??process.env.MAIN_IMAGE_MODEL??"doubao-seedream-4-0-250828";
 if(!apiKey)return NextResponse.json({error:"服务端未配置 ARK_API_KEY，无法生成碧江平面图。"}, {status:500});
 const response=await fetch(`${baseUrl}/images/generations`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,prompt,image_urls:imageUrls,n:1,size:"1024x1024",response_format:"b64_json",watermark:false})});
 if(!response.ok){const detail=await response.text();return NextResponse.json({error:upstreamError(detail),detail},{status:response.status})}
 const result=await response.json(),base64=result?.data?.[0]?.b64_json,url=result?.data?.[0]?.url;
 if(!base64&&!url)return NextResponse.json({error:"平面图生成接口未返回图片。"}, {status:502});
 return NextResponse.json({imageUrl:base64?`data:image/png;base64,${base64}`:url});
}
