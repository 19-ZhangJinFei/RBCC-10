"use client";
import { useEffect,useRef,useState } from "react";
import { bijiangPassportSpots,type BijiangPassportSpot } from "@/data/bijiangPassport";
import { bijiangAsset } from "@/data/bijiangAssets";
import { buildCulturePrompt } from "@/utils/promptBuilder";
import { imageDataUrlToPattern,renderPatternToCanvas,type BeadPattern } from "@/utils/culturePattern";
import type { AppLanguage } from "@/utils/language";

type Stamp={uploadedImage:string;flatDesign?:string;features:string[]};
type FinalWork={spotId:string;flatDesign:string;pattern:BeadPattern|null;referenceName:string};
type MaterialItem={key:string;color:string;count:number;reserve:number};
function PatternCanvas({pattern}:{pattern:BeadPattern}){const ref=useRef<HTMLCanvasElement>(null);useEffect(()=>{if(ref.current)renderPatternToCanvas(ref.current,pattern,true)},[pattern]);return <canvas ref={ref} className="h-auto max-h-full max-w-full"/>}
function LandmarkIcon(){return <svg viewBox="0 0 64 64" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#33596a]" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><path d="M32 4C20.4 4 11 13.4 11 25c0 15.8 21 35 21 35s21-19.2 21-35C53 13.4 43.6 4 32 4Z"/><circle cx="32" cy="25" r="8"/><path d="M18 48C8.9 49.6 4 52.2 4 55c0 4.4 12.5 8 28 8s28-3.6 28-8c0-2.8-4.9-5.4-14-7"/></svg>}
function drawFour(){return [...bijiangPassportSpots].sort(()=>Math.random()-.5).slice(0,4)}
function buildMaterialList(pattern:BeadPattern):MaterialItem[]{const counts=new Map<string,MaterialItem>();for(const pixel of pattern.grid.flat()){if(pixel.isExternal)continue;const id=pixel.key+"|"+pixel.color.toUpperCase();const item=counts.get(id);if(item)item.count+=1;else counts.set(id,{key:pixel.key,color:pixel.color.toUpperCase(),count:1,reserve:0})}return [...counts.values()].map(item=>({...item,reserve:Math.ceil(item.count*1.08)})).sort((a,b)=>b.count-a.count)}

export default function BijiangCheckIn({language}:{language:AppLanguage}){
 const [route,setRoute]=useState<BijiangPassportSpot[]>(()=>bijiangPassportSpots.slice(0,4));
 const [stamps,setStamps]=useState<Record<string,Stamp>>({});
 const stampsRef=useRef<Record<string,Stamp>>({});
 const processingRef=useRef(false);
 const [finalWork,setFinalWork]=useState<FinalWork|null>(null);
 const [stage,setStage]=useState<{id:string;text:string}|null>(null);
 const [error,setError]=useState<string|null>(null);
 const uploadedCount=route.filter(spot=>Boolean(stamps[spot.id]?.uploadedImage)).length;
 const completed=route.filter(spot=>Boolean(stamps[spot.id]?.flatDesign)).length;
 const materials=finalWork?.pattern?buildMaterialList(finalWork.pattern):[];

 const generateAllStations=async(snapshot:Record<string,Stamp>)=>{
  if(processingRef.current)return;
  if(route.some(spot=>!snapshot[spot.id]?.uploadedImage))return;
  processingRef.current=true;setError(null);
  let next={...snapshot};
  try{
   for(let index=0;index<route.length;index+=1){
    const spot=route[index],stamp=next[spot.id];
    setStage({id:spot.id,text:"串行生成 "+(index+1)+"/4…"});
    const features=stamp.features.length?stamp.features.join("、"):"岭南建筑轮廓、传统装饰构件、碧江村落风貌";
    const prompt=[buildCulturePrompt({theme:"碧江村",element:spot.element,meaning:spot.meaning,product:"文化打卡护照平面图",aspectRatio:"1:1",gridSize:112,colorCount:256,skillLevel:"beginner",language}),"【地点文化与建筑特征硬性引导】","对应地点："+spot.name,"文化说明："+spot.meaning,"必须体现的建筑特征："+features,"以用户上传照片中的主体建筑为构图和轮廓依据，保留屋顶、门楼、墙体、窗户、牌匾位置和主要装饰关系。","输出完整、紧凑、主体贴近边界的平面装饰图；不要文字、水印、拼豆网格和色号。"].join("\n");
    const response=await fetch("/api/generate-bijiang-design",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageUrls:[stamp.uploadedImage],prompt})});
    const design=await response.json();
    if(!response.ok||!design.imageUrl)throw new Error(spot.name+"平面图生成失败："+(design.error??"接口未返回图像"));
    next={...next,[spot.id]:{...stamp,flatDesign:design.imageUrl}};
    stampsRef.current=next;setStamps(next);
   }
   setFinalWork(null);
  }catch(e){setError(e instanceof Error?e.message:"串行生成平面图失败")}
  finally{processingRef.current=false;setStage(null)}
 };

 const check=async(spot:BijiangPassportSpot,file?:File)=>{
  if(!file||processingRef.current)return;
  setStage({id:spot.id,text:"正在读取打卡照片…"});setError(null);
  const reader=new FileReader();
  reader.onload=async()=>{
   let readySnapshot:Record<string,Stamp>|null=null;
   try{
    const imageUrl=String(reader.result);
    const pass=await fetch("/api/bijiang-checkin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({spotId:spot.id,imageUrl})});
    const verified=await pass.json();if(!pass.ok||!verified.matched)throw new Error(verified.error??"打卡验证失败");
    const next={...stampsRef.current,[spot.id]:{uploadedImage:imageUrl,features:verified.observedFeatures??[]}};
    stampsRef.current=next;setStamps(next);
    setFinalWork(null);
    if(route.every(item=>Boolean(next[item.id]?.uploadedImage)))readySnapshot=next;
   }catch(e){setError(e instanceof Error?e.message:"处理失败")}
   finally{setStage(null)}
   if(readySnapshot)await generateAllStations(readySnapshot);
  };
  reader.onerror=()=>{setStage(null);setError("无法读取所选图片，请重新选择。");};
  reader.readAsDataURL(file);
 };
 const handleUseFlatDesign=async(spot:BijiangPassportSpot)=>{
  const flatDesign=stamps[spot.id]?.flatDesign;
  if(!flatDesign||stage)return;
  setError(null);setFinalWork({spotId:spot.id,flatDesign,pattern:null,referenceName:spot.name});setStage({id:"pattern",text:"正在转换112×112带色号图纸…"});
  try{
   const pattern=await imageDataUrlToPattern(flatDesign,{theme:"碧江村",element:spot.element,meaning:spot.meaning,product:"碧江文化打卡拼豆图",productPrompt:"",aspectRatio:"1:1",gridSize:112,colorCount:256,language,antiAlias:false,connectIslands:false,preserveAllDetails:true,fitForeground:true,source:"ai",preserveSourceRatio:false},[]);
   setFinalWork({spotId:spot.id,flatDesign,pattern,referenceName:spot.name});
  }catch(e){setError(e instanceof Error?e.message:"拼豆图纸生成失败")}finally{setStage(null)}
 };
 const randomize=()=>{const nextRoute=drawFour();stampsRef.current={};processingRef.current=false;setRoute(nextRoute);setStamps({});setFinalWork(null);setStage(null);setError(null)};
 const downloadPattern=()=>{if(!finalWork?.pattern)return;const canvas=document.createElement("canvas");renderPatternToCanvas(canvas,finalWork.pattern,true);const link=document.createElement("a");link.href=canvas.toDataURL("image/png");link.download="碧江文化打卡-112x112带色号拼豆图纸.png";link.click()};
 const downloadMaterials=()=>{if(!finalWork)return;const rows=["色号,颜色,实际颗数,建议准备（含8%余量）",...materials.map(item=>[item.key,item.color,item.count,item.reserve].join(","))];const blob=new Blob(["\ufeff"+rows.join("\n")],{type:"text/csv;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="碧江文化打卡-材料清单.csv";link.click();URL.revokeObjectURL(link.href)};

 return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
  <header className="mb-7 rounded-2xl border border-white/20 bg-[#33596a] bg-cover bg-center p-6 text-white shadow-sm" style={{backgroundImage:`linear-gradient(90deg, rgba(26,55,68,.94) 0%, rgba(51,89,106,.78) 52%, rgba(51,89,106,.38) 100%), url('${bijiangAsset("金楼.png")}')`}}><p className="text-sm font-semibold tracking-[.22em] text-[#f0bd78]">AI BIJIANG CULTURE PASSPORT</p><h1 className="mt-2 text-4xl font-semibold text-white drop-shadow-sm">AI 碧江文化打卡护照</h1><p className="mt-3 max-w-4xl text-sm leading-7 text-white/85">漫步碧江古村，寻访百年祠堂与岭南水乡印记；让金楼木雕、镬耳山墙与乡土人情，在方寸创意中焕发新的文化光彩。</p><div className="mt-5 flex items-center gap-4"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25"><div className="h-full bg-[#f0bd78]" style={{width:(completed/4*100)+"%"}}/></div><strong className="text-white">{completed}/4</strong></div></header>
  <section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold leading-5 text-[#33596a]">文化打卡路线</h2><button type="button" onClick={randomize} disabled={Boolean(stage)} className="rounded-lg border border-[#33596a]/20 px-4 py-2 text-sm text-[#33596a] disabled:opacity-50">随机更换路线</button></div>
   <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">{route.map((spot,i)=>{const stamp=stamps[spot.id];return <div key={spot.id} className="relative h-full min-w-0"><article className={"mx-auto flex h-[450px] w-full min-w-0 flex-col xl:w-[calc(100%-50px)] overflow-hidden rounded-2xl border bg-white/75 "+(stamp?"border-[#b57938]":"border-[#33596a]/15")}><div className="relative h-[220px] w-full shrink-0 overflow-hidden bg-[#f3efe7]"><img src={stamp?.flatDesign??stamp?.uploadedImage??spot.photo} alt={spot.name} className="h-full w-full object-cover"/><span className="absolute left-3 top-3 rounded-full bg-[#33596a]/90 px-3 py-1 text-xs font-bold text-white">第{i+1}站</span>{stamp&&<span className="absolute right-3 top-3 rounded-full bg-[#b57938] px-3 py-1 text-xs font-bold text-white">{stamp.flatDesign?"平面图已生成":"打卡成功"}</span>}</div><div className="flex min-h-0 flex-1 flex-col p-2"><div className="min-h-0 flex-1 overflow-y-auto pr-1"><h3 className="text-xl font-semibold text-[#33596a]">{spot.name}</h3><p className="mt-0.5 text-xs font-medium text-[#b57938]">{spot.element}</p><p className="mt-1 flex items-start gap-1 text-[11px] leading-4 text-[#33596a]/65"><LandmarkIcon/><span>{spot.address}</span></p>{stamp?.flatDesign&&<button type="button" disabled={Boolean(stage)} onClick={()=>void handleUseFlatDesign(spot)} className={"mt-1 w-full rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 "+(finalWork?.spotId===spot.id?"border-[#b57938] bg-[#b57938] text-white":"border-[#33596a]/20 text-[#33596a]")}>{stage?.id==="pattern"&&finalWork?.spotId===spot.id?"正在生成拼豆图纸…":finalWork?.spotId===spot.id?"已使用该平面图":"使用该平面图"}</button>}<p className="mt-1 text-[11px] leading-4 text-[#33596a]/65"><span className="font-semibold text-[#33596a]/80">文化叙述：</span>{spot.meaning}</p></div><label className="mt-2 block shrink-0 cursor-pointer rounded-lg bg-[#33596a] px-3 py-1.5 text-center text-xs font-semibold text-white aria-disabled:cursor-not-allowed aria-disabled:opacity-60" aria-disabled={Boolean(stage)}>{stage?.id===spot.id?stage.text:<span className="inline-flex items-center justify-center gap-2"><span aria-hidden="true" className="text-xl leading-none">＋</span><span>{stamp?.flatDesign?"重新上传图片":stamp?uploadedCount<4?"已上传 · 等待其余图片":"已进入串行生成队列":"上传图片点亮地标"}</span></span>}<input type="file" accept="image/*" className="sr-only" disabled={Boolean(stage)} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";void check(spot,file);}}/></label></div></article>{i<route.length-1&&<span className="absolute -right-3 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-[#b57938]/30 bg-[#f3efe7] text-base font-bold text-[#b57938] xl:grid" aria-hidden="true">→</span>}</div>})}</div>
   {error&&<p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
  </section>
  <section className="mt-8 rounded-2xl border border-[#33596a]/15 bg-white/65 p-5">
   <div className="mb-5"><h2 className="text-xl font-semibold text-[#33596a]">生成拼豆图纸</h2><p className="mt-1 text-sm text-[#33596a]/60">{completed<4?"四张平面图生成完成后，点击上方“使用该平面图”直接生成拼豆图纸。":finalWork?"已生成所选平面图对应的拼豆图纸。":"点击上方任意一张平面图的“使用该平面图”。"}</p></div>
   {finalWork?<><div className="grid gap-5 lg:grid-cols-2"><figure className="overflow-hidden rounded-xl border border-[#33596a]/15 bg-[#f3efe7]"><img src={finalWork.flatDesign} alt="所选平面图" className="aspect-square h-full w-full object-cover"/><figcaption className="border-t border-[#33596a]/10 p-3 text-center text-sm font-semibold text-[#33596a]">所选平面图 · {finalWork.referenceName}</figcaption></figure><div className="rounded-xl border border-[#33596a]/15 bg-white p-3"><div className="grid aspect-square place-items-center overflow-auto">{finalWork.pattern?<PatternCanvas pattern={finalWork.pattern}/>:<p className="text-sm font-medium text-[#33596a]/60">正在生成拼豆图纸…</p>}</div><p className="mt-3 text-center text-sm font-semibold text-[#33596a]">112×112带色号拼豆图纸</p></div></div>{finalWork.pattern&&<><section className="mt-5 rounded-xl border border-[#33596a]/15 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-semibold text-[#33596a]">材料清单</h3><span className="text-xs text-[#33596a]/55">建议数量包含8%备用损耗</span></div><div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-[#f3efe7] text-[#33596a]"><tr><th className="p-2">颜色</th><th className="p-2">色号</th><th className="p-2 text-right">实际颗数</th><th className="p-2 text-right">建议准备</th></tr></thead><tbody>{materials.map(item=><tr key={item.key+"-"+item.color} className="border-t border-[#33596a]/10"><td className="p-2"><span className="inline-block h-5 w-5 rounded border border-black/10 align-middle" style={{backgroundColor:item.color}}/><span className="ml-2">{item.color}</span></td><td className="p-2 font-medium text-[#33596a]">{item.key}</td><td className="p-2 text-right">{item.count}</td><td className="p-2 text-right font-semibold">{item.reserve}</td></tr>)}</tbody></table></div></section><div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-[#33596a]/10 pt-5"><button type="button" onClick={downloadMaterials} className="rounded-lg border border-[#33596a]/20 px-5 py-2.5 text-sm font-semibold text-[#33596a]">导出材料清单 CSV</button><button type="button" onClick={downloadPattern} className="rounded-lg bg-[#b57938] px-5 py-2.5 text-sm font-semibold text-white">导出112×112带色号图纸 PNG</button></div></>}</>:<div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-[#33596a]/20 bg-[#f3efe7]/60 text-center text-sm leading-7 text-[#33596a]/50"><span>完成四张平面图后，点击上方“使用该平面图”<br/>这里将显示所选平面图、对应拼豆图纸、材料清单与导出入口</span></div>}
  </section>
 </main>
};
