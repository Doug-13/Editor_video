import React, {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Clapperboard,FolderOpen,Save,Film,Music,Plus,Trash2,ChevronLeft,ChevronRight,Play,Pause,Download,Type,Scissors,CheckCircle2,ZoomIn,ZoomOut,GripVertical,Sparkles,Volume2,VolumeX,Maximize,Minimize,Undo2,Rewind,ZoomIn as ZoomInIcon,Copy,Link2,Unlink2,Redo2,Crop,Palette,Bold,Italic,AlignLeft,AlignCenter,AlignRight,Move} from 'lucide-react';
import './style.css';

type Clip={path:string;url:string;name:string;duration:number;start:number;end:number;speed:number;id:string;thumbnail?:string;transition?:Transition;muted?:boolean;reverse?:boolean;volume?:number;zoom?:number;zoomEnd?:number|null;panX?:number;panY?:number;fit?:'fit'|'fill'|'blur';fillX?:number;fillY?:number;fillYEnd?:number|null;width?:number;height?:number;cB?:number;cC?:number;cS?:number;cT?:number;cF?:number};
type TransitionType='fade'|'fadeblack'|'fadewhite'|'slideleft'|'slideright'|'slideup'|'slidedown'|'wipeleft'|'wiperight'|'wipeup'|'wipedown'|'circleopen'|'circleclose';
type Transition={type:TransitionType;duration:number};
type EnvPt={t:number;v:number}; // curva de volume: t em segundos relativos ao início da faixa, v de 0 a 1 (× volume da faixa)
type AudioFile={path:string;url:string;name:string;duration:number};
type AudioLane=AudioFile&{id:string;start:number;offset:number;fileEnd?:number;loop:boolean;volume:number;muted:boolean;env:EnvPt[]};
type VideoAudio={volume:number;muted:boolean;env:EnvPt[]};
type TAlign='left'|'center'|'right';
type TextStyle={font?:string;bold?:boolean;italic?:boolean;color?:string;opacity?:number;outline?:number;outlineColor?:string;shadow?:boolean;box?:boolean;boxColor?:string;boxOpacity?:number;align?:TAlign;x?:number;y?:number};
type Title={id:string;text:string;start:number;end:number;size:number;clipId?:string;offset?:number;dur?:number}&TextStyle;   // com clipId: início = início do vídeo + offset; dur = duração
type Snap={clips:Clip[];pool:Clip[];texts:Title[];lanes:AudioLane[];vAudio:VideoAudio};
type Project={clips:Clip[];pool:Clip[];audio:AudioLane[];videoAudio:VideoAudio;texts:Title[]};
declare global {interface Window {editor:{chooseVideos:()=>Promise<Omit<Clip,'start'|'end'|'speed'|'id'>[]>;chooseAudio:()=>Promise<AudioFile[]>;saveProject:(p:Project)=>Promise<string|null>;openProject:()=>Promise<Project|null>;exportVideo:(p:Project)=>Promise<string|null>;makeProxy:(path:string)=>Promise<{path:string;url:string}>;makeReversed:(path:string,start:number,end:number,force?:boolean)=>Promise<{path:string;url:string;length:number}>;onProgress:(f:(text:string)=>void)=>()=>void}}}
const uid=()=>globalThis.crypto.randomUUID();
const seconds=(s:number)=>{const n=Math.max(0,Math.floor(s));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
const length=(c:Clip)=>(c.end-c.start)/c.speed;
const TRANSITION_GROUPS:{group:string;items:{id:TransitionType;label:string}[]}[]=[
 {group:'Fade',items:[{id:'fade',label:'Dissolver'},{id:'fadeblack',label:'Fade para preto'},{id:'fadewhite',label:'Fade para branco'}]},
 {group:'Deslizar',items:[{id:'slideleft',label:'Deslizar para a esquerda'},{id:'slideright',label:'Deslizar para a direita'},{id:'slideup',label:'Deslizar para cima'},{id:'slidedown',label:'Deslizar para baixo'}]},
 {group:'Cortina',items:[{id:'wipeleft',label:'Cortina para a esquerda'},{id:'wiperight',label:'Cortina para a direita'},{id:'wipeup',label:'Cortina para cima'},{id:'wipedown',label:'Cortina para baixo'}]},
 {group:'Círculo',items:[{id:'circleopen',label:'Círculo abrindo'},{id:'circleclose',label:'Círculo fechando'}]}];
const TRANSITION_IDS=new Set<string>(TRANSITION_GROUPS.flatMap(g=>g.items.map(i=>i.id)));
const transitionLabel=(t:string)=>TRANSITION_GROUPS.flatMap(g=>g.items).find(i=>i.id===t)?.label||t;
// ---- Textos: fontes, estilos e posição ----
// Cada fonte aponta para os arquivos do Windows (C:\Windows\Fonts) usados na exportação: [normal, negrito, itálico, negrito+itálico].
// null = a fonte não tem essa variação; o botão correspondente fica desativado (a prévia não "inventa" negrito/itálico, igual ao FFmpeg).
type FontDef={id:string;label:string;css:string;files:[string,string|null,string|null,string|null]};
const FONTS:FontDef[]=[
 {id:'arial',label:'Arial',css:"Arial,sans-serif",files:['arial.ttf','arialbd.ttf','ariali.ttf','arialbi.ttf']},
 {id:'arialblack',label:'Arial Black',css:"'Arial Black',Arial,sans-serif",files:['ariblk.ttf',null,null,null]},
 {id:'segoe',label:'Segoe UI',css:"'Segoe UI',sans-serif",files:['segoeui.ttf','segoeuib.ttf','segoeuii.ttf','segoeuiz.ttf']},
 {id:'calibri',label:'Calibri',css:"Calibri,sans-serif",files:['calibri.ttf','calibrib.ttf','calibrii.ttf','calibriz.ttf']},
 {id:'verdana',label:'Verdana',css:"Verdana,sans-serif",files:['verdana.ttf','verdanab.ttf','verdanai.ttf','verdanaz.ttf']},
 {id:'tahoma',label:'Tahoma',css:"Tahoma,sans-serif",files:['tahoma.ttf','tahomabd.ttf',null,null]},
 {id:'trebuchet',label:'Trebuchet MS',css:"'Trebuchet MS',sans-serif",files:['trebuc.ttf','trebucbd.ttf','trebucit.ttf','trebucbi.ttf']},
 {id:'franklin',label:'Franklin Gothic',css:"'Franklin Gothic Medium',sans-serif",files:['framd.ttf',null,'framdit.ttf',null]},
 {id:'impact',label:'Impact',css:"Impact,sans-serif",files:['impact.ttf',null,null,null]},
 {id:'georgia',label:'Georgia',css:"Georgia,serif",files:['georgia.ttf','georgiab.ttf','georgiai.ttf','georgiaz.ttf']},
 {id:'times',label:'Times New Roman',css:"'Times New Roman',serif",files:['times.ttf','timesbd.ttf','timesi.ttf','timesbi.ttf']},
 {id:'palatino',label:'Palatino Linotype',css:"'Palatino Linotype',serif",files:['pala.ttf','palab.ttf','palai.ttf','palabi.ttf']},
 {id:'courier',label:'Courier New',css:"'Courier New',monospace",files:['cour.ttf','courbd.ttf','couri.ttf','courbi.ttf']},
 {id:'consolas',label:'Consolas',css:"Consolas,monospace",files:['consola.ttf','consolab.ttf','consolai.ttf','consolaz.ttf']},
 {id:'comic',label:'Comic Sans MS',css:"'Comic Sans MS',cursive",files:['comic.ttf','comicbd.ttf','comici.ttf','comicz.ttf']},
 {id:'script',label:'Segoe Script',css:"'Segoe Script',cursive",files:['segoesc.ttf','segoescb.ttf',null,null]},
];
const fontById=(id?:string)=>FONTS.find(f=>f.id===id)||FONTS[0];
// Textos antigos (sem estes campos) continuam iguais à exportação das versões anteriores: Arial, branco, contorno preto de 3 px.
const TDEF={font:'arial',bold:false,italic:false,color:'#ffffff',opacity:1,outline:3,outlineColor:'#000000',shadow:false,box:false,boxColor:'#000000',boxOpacity:0.6,align:'center' as TAlign,x:50,y:82};
type TRes=typeof TDEF&{size:number;def:FontDef;b:boolean;i:boolean;file:string};
const STYLE_KEYS=['font','bold','italic','color','opacity','outline','outlineColor','shadow','box','boxColor','boxOpacity'] as const;
function tres(t:Title):TRes{
 const r:any={...TDEF};for(const k of Object.keys(TDEF))if((t as any)[k]!==undefined&&(t as any)[k]!==null)r[k]=(t as any)[k];
 const def=fontById(r.font);let b=!!r.bold&&!!def.files[1],i=!!r.italic&&!!def.files[2];if(b&&i&&!def.files[3])i=false;
 return {...r,size:t.size,def,b,i,file:def.files[(b?1:0)+(i?2:0)]||def.files[0]};
}
const TEXT_PRESETS:{name:string;v:TextStyle}[]=[
 {name:'Clássico',v:{font:'arial',bold:true,italic:false,color:'#ffffff',opacity:1,outline:3,outlineColor:'#000000',shadow:false,box:false}},
 {name:'Legenda',v:{font:'segoe',bold:false,italic:false,color:'#ffffff',opacity:1,outline:0,shadow:false,box:true,boxColor:'#000000',boxOpacity:0.65}},
 {name:'Cinema',v:{font:'georgia',bold:false,italic:true,color:'#f3e3c3',opacity:1,outline:0,shadow:true,box:false}},
 {name:'Impacto',v:{font:'impact',bold:false,italic:false,color:'#ffffff',opacity:1,outline:5,outlineColor:'#000000',shadow:false,box:false}},
 {name:'Destaque',v:{font:'arialblack',bold:false,italic:false,color:'#ffd400',opacity:1,outline:4,outlineColor:'#1a1a1a',shadow:true,box:false}},
 {name:'Neon',v:{font:'trebuchet',bold:true,italic:false,color:'#7df9ff',opacity:1,outline:2,outlineColor:'#003a66',shadow:true,box:false}},
];
const hexA=(hex:string,a:number)=>hex+Math.round(Math.max(0,Math.min(1,a))*255).toString(16).padStart(2,'0');
const tpad=(r:TRes)=>Math.round(r.size*0.25);   // margem da tarja (px no quadro de 720)
// Textos que aparecem AO MESMO TEMPO na mesma posição não se sobrepõem: cada um ganha uma "linha" fixa durante toda a sua
// duração (a primeira livre quando ele entra) e as linhas se empilham para cima (textos na metade de baixo) ou para baixo.
// A prévia e a exportação usam exatamente esta conta. Resultado: centro vertical em px do quadro 1280×720.
function stackTitles(list:{t:Title;span:{start:number;end:number}|null}[]):Map<string,{py:number;slot:number}>{
 const out=new Map<string,{py:number;slot:number}>(),groups=new Map<string,{t:Title;r:TRes;s:number;e:number}[]>();
 for(const {t,span} of list){if(!span)continue;const r=tres(t),k=`${r.align}|${Math.round(r.x)}|${Math.round(r.y)}`;if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push({t,r,s:span.start,e:span.end})}
 for(const g of groups.values()){
  g.sort((a,b)=>a.s-b.s);const ends:number[]=[],hs:number[]=[],slot=new Map<string,number>();
  for(const x of g){let k=ends.findIndex(e=>e<=x.s+0.05);if(k<0){k=ends.length;ends.push(0);hs.push(0)}ends[k]=x.e;slot.set(x.t.id,k);
   hs[k]=Math.max(hs[k],x.r.size*1.2+(x.r.box?tpad(x.r)*2:0)+x.r.outline*2)}
  for(const x of g){const k=slot.get(x.t.id)!,dir=x.r.y>=50?-1:1;let off=0;for(let j=0;j<k;j++)off+=(hs[j]+hs[j+1])/2;out.set(x.t.id,{py:x.r.y*7.2+dir*off,slot:k})}
 }
 return out;
}
const cqh=(px:number)=>`${(px/7.2).toFixed(4)}cqh`;   // px do quadro de 720 → unidade da prévia
function titleStyle(r:TRes,py:number):React.CSSProperties{
 const pad=r.box?tpad(r):0,tx=r.align==='left'?'0%':r.align==='right'?'-100%':'-50%';
 return {left:`${r.x}%`,top:cqh(py),transform:`translate(${tx},-50%)`,fontFamily:r.def.css,fontWeight:r.b?700:400,fontStyle:r.i?'italic':'normal',fontSize:cqh(r.size),
  color:hexA(r.color,r.opacity),WebkitTextStroke:r.outline>0?`${cqh(r.outline*2)} ${hexA(r.outlineColor,r.opacity)}`:undefined,
  textShadow:r.shadow?`${cqh(3)} ${cqh(3)} 0 rgba(0,0,0,${(0.6*r.opacity).toFixed(3)})`:'none',
  background:r.box?hexA(r.boxColor,r.boxOpacity):'transparent',padding:pad?cqh(pad):0};
}
const LOOKAHEAD=2; // segundos de antecedência para carregar o próximo clipe (permite emenda sem corte e transições)
// Uma transição pertence ao clipe que ENTRA e sobrepõe o fim do clipe anterior ao seu começo. Cada lado cede no máximo metade
// da própria duração, assim a entrada e a saída de um mesmo clipe nunca se encontram.
type Item={clip:Clip;index:number;start:number;end:number;len:number;tIn:number};
function buildLayout(clips:Clip[]):{items:Item[];total:number}{
 const items:Item[]=[];let end=0;
 clips.forEach((clip,index)=>{
  const len=length(clip),tr=index>0&&clip.transition&&TRANSITION_IDS.has(clip.transition.type)&&Number.isFinite(clip.transition.duration)?clip.transition:null;
  let tIn=tr?Math.min(tr.duration,len/2,length(clips[index-1])/2):0;if(tIn<0.05)tIn=0;
  const start=index===0?0:end-tIn;items.push({clip,index,start,end:start+len,len,tIn});end=start+len;
 });
 return {items,total:end};
}
const isActive=(it:Item,t:number,last:number)=>t>=it.start&&(t<it.end||(it.index===last&&t>=it.end));
// Efeitos da prévia: reproduzem as fórmulas do filtro xfade do FFmpeg usado na exportação (q = fração já decorrida, 0→1).
type Fx={opacity:number;transform:string;clip:string;mask:string;z:number;volume:number};
const smooth=(a:number,b:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
const SOLO:Fx={opacity:1,transform:'none',clip:'none',mask:'none',z:1,volume:1};
const HIDDEN:Fx={opacity:0,transform:'none',clip:'none',mask:'none',z:0,volume:0};
function radialMask(weight:(d:number)=>number){const stops=[];for(let i=0;i<=10;i++){const d=i/10;stops.push(`rgba(0,0,0,${weight(d).toFixed(3)}) ${i*10}%`)}return `radial-gradient(circle farthest-corner at 50% 50%,${stops.join(',')})`}
function transitionFx(type:TransitionType,q:number):{out:Fx;inn:Fx;bg:string}{
 const out:Fx={...SOLO,volume:1-q},inn:Fx={...SOLO,z:2,volume:q};let bg='#000';
 const a=(q*100).toFixed(3),b=((1-q)*100).toFixed(3);
 switch(type){
  case 'fade':inn.opacity=q;break;
  case 'fadeblack':case 'fadewhite':{
   const P=1-q,wA=P*smooth(0.8,1,P),wB=q*(1-smooth(0.2,1,P));
   inn.opacity=wB;out.opacity=wB>=0.999?0:wA/(1-wB);bg=type==='fadewhite'?'#fff':'#000';break}
  case 'slideleft':out.transform=`translate3d(-${a}%,0,0)`;inn.transform=`translate3d(${b}%,0,0)`;break;
  case 'slideright':out.transform=`translate3d(${a}%,0,0)`;inn.transform=`translate3d(-${b}%,0,0)`;break;
  case 'slideup':out.transform=`translate3d(0,-${a}%,0)`;inn.transform=`translate3d(0,${b}%,0)`;break;
  case 'slidedown':out.transform=`translate3d(0,${a}%,0)`;inn.transform=`translate3d(0,-${b}%,0)`;break;
  case 'wipeleft':inn.clip=`inset(0 0 0 ${b}%)`;break;
  case 'wiperight':inn.clip=`inset(0 ${b}% 0 0)`;break;
  case 'wipeup':inn.clip=`inset(${b}% 0 0 0)`;break;
  case 'wipedown':inn.clip=`inset(0 0 ${b}% 0)`;break;
  case 'circleopen':inn.mask=radialMask(d=>1-smooth(0,1,d+(0.5-q)*3));break;
  case 'circleclose':inn.mask=radialMask(d=>smooth(0,1,d+(q-0.5)*3));break;
 }
 return {out,inn,bg};
}
// Campo numérico de posição na sequência: digite e tecle Enter (ou saia do campo) para confirmar; Esc cancela.
function SeqInput({value,max,title,ghost,wide,onCommit}:{value:number;max:number;title:string;ghost?:boolean;wide?:boolean;onCommit:(n:number)=>void}){
 const [text,setText]=useState(String(value)),focus=useRef(false),dirty=useRef(false),force=useRef(false),cancel=useRef(false);
 useEffect(()=>{if(!focus.current)setText(String(value))},[value]);
 function finish(){
  focus.current=false;const wanted=dirty.current||force.current,skip=cancel.current;dirty.current=force.current=cancel.current=false;
  const n=Math.round(Number(text));
  if(!skip&&wanted&&Number.isFinite(n)&&n>=1&&(ghost||n!==value)){onCommit(Math.min(max,n));return}
  setText(String(value));
 }
 return <input className={'seq'+(ghost?' ghost':'')+(wide?' wide':'')} inputMode="numeric" aria-label={ghost?'Posição para inserir na sequência':'Posição na sequência'} title={title} value={text}
  onClick={e=>e.stopPropagation()} onFocus={e=>{focus.current=true;e.target.select()}}
  onChange={e=>{dirty.current=true;setText(e.target.value.replace(/\D/g,'').slice(0,3))}}
  onBlur={finish}
  onKeyDown={e=>{if(e.key==='Enter'){force.current=true;(e.target as HTMLInputElement).blur()}else if(e.key==='Escape'){cancel.current=true;(e.target as HTMLInputElement).blur()}}}/>;
}
const revEnd=(c:Clip)=>Math.min(c.end,c.duration||c.end);
const revKey=(c:Clip)=>`${c.path}|${c.start.toFixed(3)}|${revEnd(c).toFixed(3)}`;
// trecho do ARQUIVO tocado na prévia: o original, ou a cópia invertida (que começa em 0) quando o clipe é reverso
const rangeOf=(c:Clip,r:Record<string,{state:string;url?:string}>)=>c.reverse&&r[revKey(c)]?.state==='ready'?{a:0,b:revEnd(c)-c.start}:{a:c.start,b:c.end};
const hasZoom=(c:Clip)=>(c.zoom??1)>1.001||(c.zoomEnd!=null&&c.zoomEnd>1.001);
// zoom do clipe (mesma geometria da exportação): pan -1..1 desloca a janela de corte até a borda
function zoomTransform(c:Clip,u:number){const z0=c.zoom??1,z1=c.zoomEnd==null?z0:c.zoomEnd,z=z0+(z1-z0)*Math.min(1,Math.max(0,u));if(z<=1.0001)return 'none';
 return `translate(${(-(c.panX??0)*(z-1)/2*100).toFixed(3)}%,${(-(c.panY??0)*(z-1)/2*100).toFixed(3)}%) scale(${z.toFixed(4)})`}
// Texto vinculado a um vídeo acompanha o vídeo: o tempo na linha do tempo é calculado a partir da posição atual dele.
function titleSpan(t:Title,items:Item[]):{start:number;end:number}|null{
 if(!t.clipId)return {start:t.start,end:t.end};
 const it=items.find(x=>x.clip.id===t.clipId);if(!it)return null;
 const st=it.start+Math.max(0,t.offset??0),en=Math.min(it.end,st+Math.max(0.1,t.dur??(t.end-t.start)));
 return st<en-0.02?{start:st,end:en}:null;
}
// O Web Audio mantém vivo, até o contexto fechar, todo <video>/<audio> ligado a ele (disconnect() não resolve): criar um <video> por clipe
// deixava um decodificador para trás a cada troca e, em sequências longas, a prévia falhava com erro de decodificação. Por isso a prévia usa
// um conjunto FIXO de elementos reutilizáveis ("slots"): ao trocar de clipe, só a fonte do slot muda.
const SLOTS=6;
type MediaDispose=(el:HTMLMediaElement)=>void;
function ClipSlot({idx,cid,src,retry,vids,onMeta,onFail}:{idx:number;cid:string|null;src:string;retry:number;vids:React.MutableRefObject<Map<string,HTMLVideoElement>>;onMeta:()=>void;onFail:(el:HTMLVideoElement)=>void}){
 const ref=useRef<HTMLVideoElement>(null);
 useLayoutEffect(()=>{const el=ref.current!;if(!cid)return;vids.current.set(cid,el);return()=>{if(vids.current.get(cid)===el)vids.current.delete(cid)}},[cid]);
 useEffect(()=>{const el=ref.current!;if(!src){try{el.pause();el.removeAttribute('src');el.load()}catch{}}},[src]);   // slot vago: solta o decodificador
 useEffect(()=>{if(retry>0)ref.current?.load()},[retry]);
 return <div className="layer" hidden={!cid}><div className="zoomer" data-slot={idx}><canvas className="bgfill" width="160" height="90"/><video ref={ref} src={src||undefined} preload="auto" crossOrigin="anonymous" playsInline onLoadedMetadata={onMeta} onLoadedData={onMeta} onSeeked={onMeta} onError={e=>{if(e.currentTarget.getAttribute('src'))onFail(e.currentTarget)}}/></div></div>;
}
function LaneAudio({lid,src,auds,dispose,onMeta,onFail}:{lid:string;src:string;auds:React.MutableRefObject<Map<string,HTMLAudioElement>>;dispose:MediaDispose;onMeta:()=>void;onFail:()=>void}){
 const ref=useRef<HTMLAudioElement>(null);
 useLayoutEffect(()=>{const el=ref.current!;auds.current.set(lid,el);return()=>{if(auds.current.get(lid)===el)auds.current.delete(lid);dispose(el)}},[]);
 return <audio ref={ref} src={src} preload="auto" crossOrigin="anonymous" onLoadedMetadata={onMeta} onError={onFail}/>;
}
const fitOf=(c:Clip)=>c.fit??'fit';
const isVertical=(c:Clip)=>!!c.width&&!!c.height&&c.height>c.width*1.05;
// janela de recorte do modo "preencher": -1 = borda inicial, +1 = borda final (zero = centro); pode varrer ao longo do clipe
const fillPos=(c:Clip,u:number)=>{const y0=c.fillY??0,y1=c.fillYEnd==null?y0:c.fillYEnd;return {x:c.fillX??0,y:y0+(y1-y0)*Math.min(1,Math.max(0,u))}};
// fundo desfocado da prévia: o quadro do próprio vídeo, em miniatura, cobrindo o canvas (o desfoque e o escurecimento vêm do CSS)
function paintBlur(cv:HTMLCanvasElement,v:HTMLVideoElement){const vw=v.videoWidth,vh=v.videoHeight;if(!vw||!vh||v.readyState<2)return;const W=cv.width,H=cv.height,k=Math.max(W/vw,H/vh),sw=W/k,sh=H/k;try{cv.getContext('2d')?.drawImage(v,(vw-sw)/2,(vh-sh)/2,sw,sh,0,0,W,H)}catch{}}
// Correção de cor — a MESMA conta da exportação (electron/main.cjs):
//   por canal: saída = inclinação × entrada + deslocamento (brilho × contraste × temperatura × desbotado); depois matriz de saturação do CSS.
type Grade={slope:number[];icp:number;m:number[][]};
function gradeParams(c:Clip):Grade|null{
 const B=c.cB||0,C=c.cC||0,S=c.cS||0,T=c.cT||0,F=c.cF||0;if(!B&&!C&&!S&&!T&&!F)return null;
 const b=1+B*0.005,k=1+C*0.006,sat=1+S/100,f=F/100,base=1-0.12*f,tr=1+T*0.0015,tb=1-T*0.0015;
 return {slope:[base*k*b*tr,base*k*b,base*k*b*tb],icp:base*(0.5-0.5*k)+0.10*f,
  m:[[0.213+0.787*sat,0.715-0.715*sat,0.072-0.072*sat],[0.213-0.213*sat,0.715+0.285*sat,0.072-0.072*sat],[0.213-0.213*sat,0.715-0.715*sat,0.072+0.928*sat]]};
}
const hasGrade=(c:Clip)=>gradeParams(c)!==null;
// estilos prontos: [brilho, contraste, saturação, temperatura, desbotado]
const GRADE_STYLES:{id:string;name:string;v:[number,number,number,number,number]}[]=[
 {id:'orig',name:'Original',v:[0,0,0,0,0]},{id:'vivid',name:'Vívido',v:[5,20,35,0,0]},{id:'cine',name:'Cinematográfico',v:[-5,25,-10,10,8]},
 {id:'warm',name:'Quente',v:[5,5,10,45,0]},{id:'cool',name:'Frio',v:[0,5,0,-45,0]},{id:'bw',name:'Preto e branco',v:[0,20,-100,0,0]},
 {id:'vintage',name:'Vintage',v:[5,-10,-30,30,40]},{id:'drama',name:'Dramático',v:[-10,45,10,-5,0]},{id:'matte',name:'Suave (matte)',v:[5,-15,-15,5,55]},{id:'night',name:'Noturno',v:[-25,15,-20,-35,0]}];
const gradeVals=(c:Clip):[number,number,number,number,number]=>[c.cB||0,c.cC||0,c.cS||0,c.cT||0,c.cF||0];
const sameVals=(a:number[],b:number[])=>a.every((x,i)=>x===b[i]);
// atualiza o filtro SVG do slot k (feComponentTransfer + feColorMatrix) para a cor do clipe
function setGradeFilter(k:number,g:Grade){
 const f=document.getElementById('eg'+k);if(!f)return;
 const fn=['feFuncR','feFuncG','feFuncB'];fn.forEach((n,i)=>{const e=f.querySelector(n);e?.setAttribute('slope',g.slope[i].toFixed(5));e?.setAttribute('intercept',g.icp.toFixed(5))});
 f.querySelector('feColorMatrix')?.setAttribute('values',g.m.map(r=>r.map(x=>x.toFixed(5)).join(' ')+' 0 0').join(' ')+' 0 0 0 1 0');
}
const ENV_H=34;
function envAt(env:EnvPt[],t:number){
 if(!env.length)return 1;if(t<=env[0].t)return env[0].v;
 for(let i=0;i<env.length-1;i++){const a=env[i],b=env[i+1];if(t<b.t)return a.v+(b.v-a.v)*(t-a.t)/Math.max(1e-6,b.t-a.t)}
 return env[env.length-1].v;
}
// duração (na linha do tempo) em que a faixa soa: repetida até o fim do vídeo ou até o fim do arquivo
const laneSpan=(l:AudioLane)=>Math.max(0.05,(l.fileEnd??l.duration)-l.offset);   // trecho do arquivo que toca
function laneLen(l:AudioLane,total:number){const span=laneSpan(l);if(total<=0)return l.loop?10:span;const room=Math.max(0,total-l.start);return l.loop?room:Math.min(span,room)}
function fadeEnv(env:EnvPt[],len:number,kind:'in'|'out',d:number){
 const dd=Math.max(0.1,Math.min(d,len/2||d));let e=[...env];
 if(kind==='in'){const target=envAt(e,dd);e=[{t:0,v:0},{t:dd,v:target},...e.filter(p=>p.t>dd+0.001)]}
 else{const from=len-dd,target=envAt(e,from);e=[...e.filter(p=>p.t<from-0.001),{t:from,v:target},{t:len,v:0}]}
 return e;
}
function shiftEnv(env:EnvPt[],d:number){if(!env.length)return env;const v0=envAt(env,d);return [{t:0,v:v0},...env.map(p=>({t:p.t-d,v:p.v})).filter(p=>p.t>0.001)]}
const dbText=(v:number)=>v<=0.0001?'-∞ dB':`${(20*Math.log10(v)).toFixed(1)} dB`;
// Faixa de automação de volume: duplo clique cria um ponto, arrastar move, duplo clique/botão direito no ponto remove.
function EnvelopeEditor({env,onChange,len,zoom,color}:{env:EnvPt[];onChange:(e:EnvPt[])=>void;len:number;zoom:number;color:string}){
 const H=ENV_H,W=Math.max(1,len*zoom),svg=useRef<SVGSVGElement>(null),drag=useRef<number|null>(null);
 const yOf=(v:number)=>(1-v)*(H-8)+4,vOf=(y:number)=>Math.min(1,Math.max(0,1-(y-4)/(H-8)));
 const snap=(v:number)=>Math.abs(v-1)<0.05?1:Math.abs(v)<0.05?0:v;
 const at=(e:{clientX:number;clientY:number})=>{const r=svg.current!.getBoundingClientRect();return {t:Math.min(len,Math.max(0,(e.clientX-r.left)/zoom)),v:snap(vOf(e.clientY-r.top))}};
 const line=env.length?[{t:0,v:env[0].v},...env,{t:len,v:env[env.length-1].v}]:[{t:0,v:1},{t:len,v:1}];
 const path=line.map(p=>`${(p.t*zoom).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
 function add(e:React.MouseEvent){if(env.length>=64)return;const n=at(e);
  if(!env.length){onChange([{t:0,v:1},n,{t:len,v:1}].sort((a,b)=>a.t-b.t));return}
  onChange([...env,n].sort((a,b)=>a.t-b.t))}
 function move(e:React.PointerEvent){const i=drag.current;if(i===null||!env[i])return;const n=at(e),lo=i>0?env[i-1].t+0.01:0,hi=i<env.length-1?env[i+1].t-0.01:len;
  const next=env.slice();next[i]={t:Math.min(hi,Math.max(lo,n.t)),v:n.v};onChange(next)}
 return <svg ref={svg} className="env" width={W} height={H} onDoubleClick={add} onPointerMove={move} onPointerUp={()=>{drag.current=null}}>
  <line x1="0" x2={W} y1={yOf(1)} y2={yOf(1)} className="env-ref"/>
  <polygon points={`0,${H} ${path} ${W},${H}`} fill={color} opacity=".22"/>
  <polyline points={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
  {env.map((p,i)=><circle key={i} cx={p.t*zoom} cy={yOf(p.v)} r="5" className="env-pt" stroke={color}
   onPointerDown={e=>{e.stopPropagation();(e.target as Element).setPointerCapture(e.pointerId);drag.current=i}}
   onDoubleClick={e=>{e.stopPropagation();onChange(env.filter((_,k)=>k!==i))}}
   onContextMenu={e=>{e.preventDefault();e.stopPropagation();onChange(env.filter((_,k)=>k!==i))}}><title>{`${p.t.toFixed(1)} s • ${Math.round(p.v*100)}%`}</title></circle>)}
 </svg>;
}
function App(){
 const [clips,setClips]=useState<Clip[]>([]),[pool,setPool]=useState<Clip[]>([]),[lanes,setLanes]=useState<AudioLane[]>([]),[vAudio,setVAudio]=useState<VideoAudio>({volume:1,muted:false,env:[]}),[selAudio,setSelAudio]=useState<string|null>(null),[fadeLen,setFadeLen]=useState(2),[full,setFull]=useState(false),[fsShow,setFsShow]=useState(true),[texts,setTexts]=useState<Title[]>([]);
 const [mediaError,setMediaError]=useState(''); const [zoom,setZoom]=useState(20),[dragging,setDragging]=useState<string|null>(null); const [selected,setSelected]=useState<string|null>(null),[playhead,setPlayhead]=useState(0),[playing,setPlaying]=useState(false),[status,setStatus]=useState('Pronto para começar'),[exporting,setExporting]=useState(false);
 const vids=useRef(new Map<string,HTMLVideoElement>()),stageRef=useRef<HTMLDivElement>(null),previewRef=useRef<HTMLDivElement>(null),fsTimer=useRef(0),actions=useRef<Record<string,(...a:any[])=>void>>({});
 const auds=useRef(new Map<string,HTMLAudioElement>()),lanesRef=useRef<AudioLane[]>([]),vAudioRef=useRef<VideoAudio>({volume:1,muted:false,env:[]});
 const actxRef=useRef<AudioContext|null>(null),gains=useRef(new WeakMap<HTMLMediaElement,{g:GainNode;src:MediaElementAudioSourceNode;last:number}>());
 // Web Audio: permite volume acima de 100% e curvas suaves. Sem ele, cai para element.volume (máx. 100%).
 function ensureCtx(){let c=actxRef.current;if(!c){try{c=new AudioContext();actxRef.current=c}catch{return null}}if(c.state==='suspended')c.resume().catch(()=>{});return c}
 function setGain(el:HTMLMediaElement,x:number){
  x=Math.max(0,x);const c=actxRef.current;
  if(c){let n=gains.current.get(el);
   if(!n){try{const src=c.createMediaElementSource(el),g=c.createGain();src.connect(g);g.connect(c.destination);n={g,src,last:-1};gains.current.set(el,n)}catch{}}
   if(n){el.volume=1;if(Math.abs(n.last-x)>0.0005){n.last=x;n.g.gain.setTargetAtTime(x,c.currentTime,0.012)}return}
  }
  el.volume=Math.min(1,x);
 }
 const playingRef=useRef(false),totalRef=useRef(0),itemsRef=useRef<Item[]>([]),tRef=useRef(0),wasPlaying=useRef(false),lastDuration=useRef(1);
 const {items,total}=useMemo(()=>buildLayout(clips),[clips]);
 // "current" = clipe sob o cursor (em transição, o que está entrando); usado por Dividir.
 const current=useMemo(()=>{const last=items.length-1;const act=items.filter(it=>isActive(it,playhead,last));const it=act[act.length-1];return it?{clip:it.clip,offset:it.start,local:Math.max(0,playhead-it.start)}:null},[items,playhead]);
 const selectedClip=clips.find(c=>c.id===selected)||null;
 const selectedItem=items.find(it=>it.clip.id===selected)||null;
 // Prévia leve (proxy 540p, GOP curto) gerada pelo FFmpeg; a exportação continua usando os arquivos originais.
 const [proxies,setProxies]=useState<Record<string,{state:'pending'|'ready'|'failed';url?:string}>>({});const proxyAsked=useRef(new Set<string>());
 const seqPaths=new Set(clips.map(c=>c.path)),proxyList=Object.entries(proxies).filter(([k])=>seqPaths.has(k)).map(([,v])=>v),proxyPending=proxyList.filter(p=>p.state==='pending').length,proxyDone=proxyList.length-proxyPending;
 const [revs,setRevs]=useState<Record<string,{state:'pending'|'ready'|'failed';url?:string}>>({}),revAsked=useRef(new Set<string>()),revsRef=useRef<Record<string,{state:string;url?:string}>>({});
 const urlOf=(c:Clip)=>c.reverse&&revs[revKey(c)]?.state==='ready'?revs[revKey(c)].url!:(proxies[c.path]?.state==='ready'?proxies[c.path].url!:c.url);
 const revPending=clips.filter(c=>c.reverse&&!['ready','failed'].includes(revs[revKey(c)]?.state||'')).length,prepPending=proxyPending+revPending;
 // gera a cópia invertida (leve) em segundo plano; espera 0,5 s sem alterações no corte para não gerar a cada tecla
 useEffect(()=>{const id=window.setTimeout(()=>{for(const c of clips){if(!c.reverse)continue;const k=revKey(c);if(revAsked.current.has(k))continue;revAsked.current.add(k);
   setRevs(a=>({...a,[k]:{state:'pending'}}));
   window.editor.makeReversed(c.path,c.start,revEnd(c)).then(async r=>{const res=await fetch(r.url,{headers:{Range:'bytes=0-1'}}).catch(()=>null);if(res&&res.status!==200&&res.status!==206)throw Error(`o arquivo invertido não pôde ser lido (HTTP ${res.status})`);setRevs(a=>({...a,[k]:{state:'ready',url:r.url}}))}).catch(e=>{console.error(e);setStatus('Não foi possível inverter um vídeo: '+(e?.message||e));setRevs(a=>({...a,[k]:{state:'failed'}}))})}},500);return()=>window.clearTimeout(id)},[clips]);
 // Um <video> por clipe visível ou prestes a entrar: o próximo já fica carregado e posicionado, então a emenda não pisca.
 const rendered=items.filter(it=>it.end>playhead-0.05&&it.start<playhead+LOOKAHEAD);
 const titleSpans=useMemo(()=>texts.map(t=>({t,span:titleSpan(t,items)})),[texts,items]);
 const activeTitles=titleSpans.filter(x=>x.span&&playhead>=x.span.start&&playhead<=x.span.end).map(x=>x.t);
 const titleStack=useMemo(()=>stackTitles(titleSpans),[titleSpans]);
 const [dragTitle,setDragTitle]=useState<string|null>(null);
 useEffect(()=>window.editor.onProgress(setStatus),[]);
 useEffect(()=>{if(playing)setMediaError('')},[playing]);
 useEffect(()=>{if(playhead>total)setPlayhead(total)},[total]);
 useEffect(()=>{if(playing&&playhead>=total){setPlaying(false)}},[playhead,total,playing]);
 const slotOf=useRef(new Map<string,number>());
 // cada clipe visível mantém o mesmo slot enquanto estiver na lista; clipes novos ocupam slots livres
 const slotIds=(()=>{const ids=rendered.slice(0,SLOTS).map(it=>it.clip.id),cur:(string|null)[]=Array(SLOTS).fill(null);
  for(const id of ids){const k=slotOf.current.get(id);if(k!==undefined&&cur[k]===null)cur[k]=id}
  for(const id of ids){if(cur.includes(id))continue;const k=cur.indexOf(null);if(k<0)break;cur[k]=id}
  slotOf.current=new Map(cur.flatMap((id,k)=>id?[[id,k] as [string,number]]:[]));return cur})();
 const disposeMedia:MediaDispose=el=>{const n=gains.current.get(el);if(n){try{n.src.disconnect();n.g.disconnect()}catch{}gains.current.delete(el)}try{el.pause();el.removeAttribute('src');el.load()}catch{}};
 // Falha de leitura/decodificação de um vídeo: 1ª vez recarrega o elemento sem parar a reprodução; 2ª vez usa o arquivo original; só então avisa.
 const [retry,setRetry]=useState<Record<string,number>>({}),[safe,setSafe]=useState<Record<string,boolean>>({}),fails=useRef<Record<string,number>>({});
 useEffect(()=>{if(playing)fails.current={}},[playing]);
 function onVideoFail(el:HTMLVideoElement){
  const id=[...vids.current.entries()].find(([,v])=>v===el)?.[0],code=el.error?.code||0,c=id?clips.find(x=>x.id===id):undefined;
  console.error('Falha de mídia',{clip:c?.name,code,mensagem:el.error?.message,fonte:el.currentSrc});
  if(!id||!c){return}   // elemento já descartado: ignora
  const n=(fails.current[id]=(fails.current[id]||0)+1);
  if(n===1){setRetry(r=>({...r,[id]:(r[id]||0)+1}));setStatus('Recarregando “'+c.name+'” após uma falha de leitura…');return}
  if(n===2&&!c.reverse){setSafe(r=>({...r,[id]:true}));setStatus('Usando o arquivo original de “'+c.name+'” na prévia.');return}
  if(n===2&&c.reverse){   // reconstrói a cópia invertida (arquivo novo) e espera o usuário tocar de novo
   const k=revKey(c);setPlaying(false);setRevs(a=>({...a,[k]:{state:'pending'}}));setStatus('Reconstruindo o vídeo invertido de “'+c.name+'”…');
   window.editor.makeReversed(c.path,c.start,revEnd(c),true).then(r=>setRevs(a=>({...a,[k]:{state:'ready',url:r.url}}))).catch(e=>{console.error(e);setStatus('Não foi possível reconstruir o vídeo invertido: '+(e?.message||e));setRevs(a=>({...a,[k]:{state:'failed'}}))});return}
  setMediaError(`Falha na leitura de “${c.name}” (código ${code}${code===3?': erro de decodificação':''}). Tente reproduzir de novo; se persistir, verifique o formato do arquivo.`);setPlaying(false);
 }
 const onPlayError=(e:any)=>{if(e?.name!=='AbortError')setMediaError('Não foi possível reproduzir: '+(e?.message||e))};
 // Posiciona, mostra/oculta e sincroniza cada camada para o instante t da linha do tempo. Roda a cada quadro durante a
 // reprodução e escreve direto no DOM, para a transição ficar suave sem re-renderizar o React 60x por segundo.
 function applyLayout(t:number){
  const list=itemsRef.current;if(!list.length)return;
  const play=playingRef.current,last=list.length-1;
  let tr:{inc:Item;out:Item;q:number}|null=null;
  for(const it of list){if(it.tIn>0&&t>=it.start&&t<it.start+it.tIn){tr={inc:it,out:list[it.index-1],q:(t-it.start)/it.tIn};break}}
  const fx=tr?transitionFx(tr.inc.clip.transition!.type,tr.q):null;
  if(stageRef.current)stageRef.current.style.background=fx?fx.bg:'#000';
  const master=list.find(it=>isActive(it,t,last));
  const va=vAudioRef.current,vGain=(va.muted?0:va.volume)*envAt(va.env,t);
  for(const [id,v] of vids.current){
   const it=list.find(x=>x.clip.id===id);if(!it)continue;
   const active=isActive(it,t,last);
   const f=!active?HIDDEN:tr&&it===tr.out?fx!.out:tr&&it===tr.inc?fx!.inn:SOLO;
   const c=it.clip,rg=rangeOf(c,revsRef.current);
   const zm=v.parentElement as HTMLElement,st=(zm.parentElement as HTMLElement).style,u=active?(t-it.start)/Math.max(0.001,it.len):0;
   st.opacity=String(f.opacity);st.transform=f.transform;st.clipPath=f.clip;st.zIndex=String(f.z);   // a camada leva a transição; o "zoomer" leva o zoom (fundo + vídeo)
   st.setProperty('mask-image',f.mask);st.setProperty('-webkit-mask-image',f.mask);
   zm.style.transform=zoomTransform(c,u);
   {const g=gradeParams(c),gk=g?gradeVals(c).join(','):'';if(zm.dataset.g!==gk){zm.dataset.g=gk;if(g){setGradeFilter(Number(zm.dataset.slot),g);zm.style.filter=`url(#eg${zm.dataset.slot})`}else zm.style.filter='none'}}
   // enquadramento: ajustar (contain), preencher (cover + janela) ou fundo desfocado (contain + canvas por trás)
   const fm=fitOf(c);v.style.objectFit=fm==='fill'?'cover':'contain';
   if(fm==='fill'){const fp=fillPos(c,u);v.style.objectPosition=`${((0.5+0.5*fp.x)*100).toFixed(2)}% ${((0.5+0.5*fp.y)*100).toFixed(2)}%`}else if(v.style.objectPosition)v.style.objectPosition='';
   const cv=zm.firstElementChild as HTMLCanvasElement;cv.style.display=fm==='blur'?'block':'none';if(fm==='blur'&&active)paintBlur(cv,v);
   setGain(v,f.volume*vGain*(c.muted?0:(c.volume??1)));
   if(v.readyState<1)continue;
   const want=Math.min(rg.b,Math.max(rg.a,active?rg.a+(t-it.start)*c.speed:rg.a));
   if(v.playbackRate!==c.speed)v.playbackRate=c.speed;
   const drift=Math.abs(v.currentTime-want);
   if(play&&active){
    if(v.paused){if(drift>0.04)v.currentTime=want;if(!v.ended)v.play().catch(onPlayError)}
    else if(it!==master&&drift>0.15)v.currentTime=want;
   }else{
    if(!v.paused)v.pause();
    if(drift>0.04)v.currentTime=want;
   }
  }
  for(const l of lanesRef.current){
   const a=auds.current.get(l.id);if(!a)continue;
   const rel=t-l.start,span=laneSpan(l),live=rel>=0&&(l.loop||rel<span)&&t<=totalRef.current+0.001;
   const g=l.muted?0:l.volume*envAt(l.env,rel);
   setGain(a,live?g:0);
   if(a.readyState<1)continue;
   const pos=l.offset+(l.loop?rel%span:Math.min(rel,span)),drift=Math.abs(a.currentTime-pos);
   if(play&&live&&g>0){
    if(a.paused){if(drift>0.04)a.currentTime=pos;a.play().catch(onPlayError)}
    else if(drift>0.25&&!(l.loop&&drift>span-0.3))a.currentTime=pos;   // perto da emenda do loop é só diferença de fase
   }else{if(!a.paused)a.pause();if(live&&drift>0.04)a.currentTime=pos}
  }
 }
 useLayoutEffect(()=>{revsRef.current=revs;lanesRef.current=lanes;vAudioRef.current=vAudio;playingRef.current=playing;totalRef.current=total;itemsRef.current=items;
  if(!playing||!wasPlaying.current)tRef.current=Math.min(playhead,total);wasPlaying.current=playing;
  applyLayout(tRef.current)});
 // Relógio da reprodução: o vídeo mais antigo sob o cursor dita o tempo (nunca retrocede). A troca de clipe é detectada a
 // cada quadro; a interface (contador, régua) é atualizada ~20x/s.
 useEffect(()=>{if(!playing)return;let raf=0,last=0;
  const tick=(now:number)=>{raf=requestAnimationFrame(tick);
   const list=itemsRef.current;if(!list.length)return;
   let t=tRef.current;const m=list.find(it=>isActive(it,t,list.length-1)),v=m?vids.current.get(m.clip.id):undefined;
   if(m&&v&&!v.seeking&&v.readyState>=2){
    const tm=m.start+(v.currentTime-rangeOf(m.clip,revsRef.current).a)/m.clip.speed;
    if(v.ended||tm>=m.end-0.02){
     if(m.index===list.length-1){tRef.current=totalRef.current;applyLayout(tRef.current);setPlaying(false);setPlayhead(totalRef.current);return}
     t=m.end+0.001;last=0;
    }else if(tm>t)t=tm;
   }
   tRef.current=t;applyLayout(t);
   if(now-last>=50){last=now;setPlayhead(Math.min(totalRef.current,t))}};
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)},[playing]);
 function togglePlay(){if(!clips.length||prepPending>0)return;ensureCtx();if(playhead>=total-0.01){tRef.current=0;setPlayhead(0);setPlaying(true)}else setPlaying(!playing)}
 function toggleFull(){if(document.fullscreenElement)document.exitFullscreen();else previewRef.current?.requestFullscreen().catch(()=>setStatus('Não foi possível entrar em tela inteira.'))}
 function bumpControls(){setFsShow(true);window.clearTimeout(fsTimer.current);fsTimer.current=window.setTimeout(()=>setFsShow(false),2600)}
 function seekTo(v:number){setPlaying(false);const t=Math.min(total,Math.max(0,v));tRef.current=t;setPlayhead(t)}
 function stepBy(d:number){seekTo(playhead+d)}
 function splitSelected(){if(selAudio&&selAudio!=='video')splitLane(selAudio);else splitAtPlayhead()}
 function removeSelected(){if(selAudio&&selAudio!=='video')removeLane(selAudio);else removeSelectedClip()}
 function duplicateSelected(){if(selAudio&&selAudio!=='video')duplicateLane(selAudio);else if(selected)duplicateClip(selected)}
 actions.current={togglePlay,toggleFull,undo,redo,stepBy,splitSelected,removeSelected,duplicateSelected,home:()=>seekTo(0),end:()=>seekTo(total)};
 useEffect(()=>{const onFs=()=>{const on=document.fullscreenElement===previewRef.current;setFull(on);if(on)bumpControls()};document.addEventListener('fullscreenchange',onFs);return()=>document.removeEventListener('fullscreenchange',onFs)},[]);
 // atalhos: Espaço = tocar/pausar, F = tela inteira (ignorados enquanto você digita em campos)
 useEffect(()=>{
  const typing=(t:EventTarget|null)=>{const e=t as HTMLElement|null;return !!e&&(['INPUT','TEXTAREA','SELECT'].includes(e.tagName)||e.isContentEditable)};
  const down=(e:KeyboardEvent)=>{if(typing(e.target)||e.altKey)return;const A=actions.current,mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
   if(mod){if(k==='z'&&!e.shiftKey){e.preventDefault();A.undo()}else if(k==='y'||(k==='z'&&e.shiftKey)){e.preventDefault();A.redo()}else if(k==='d'){e.preventDefault();A.duplicateSelected()}return}
   if(e.code==='Space'){e.preventDefault();if(!e.repeat)A.togglePlay()}
   else if(k==='f'&&!e.repeat)A.toggleFull();
   else if(k==='s'&&!e.repeat)A.splitSelected();
   else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();A.removeSelected()}
   else if(e.key==='ArrowLeft'){e.preventDefault();A.stepBy(e.shiftKey?-1:-1/30)}
   else if(e.key==='ArrowRight'){e.preventDefault();A.stepBy(e.shiftKey?1:1/30)}
   else if(e.key==='Home'){e.preventDefault();A.home()}
   else if(e.key==='End'){e.preventDefault();A.end()}};
  const up=(e:KeyboardEvent)=>{if(e.code==='Space'&&!typing(e.target))e.preventDefault()};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up)}},[]);
 function setTransition(id:string,tr:Transition|undefined){setClips(a=>a.map(c=>c.id===id?{...c,transition:tr}:c))}
 function chooseTransition(id:string,value:string){if(value==='none'){setTransition(id,undefined);return}const old=clips.find(c=>c.id===id)?.transition;setTransition(id,{type:value as TransitionType,duration:old?.duration??lastDuration.current})}
 function changeTransitionDuration(id:string,d:number){const old=clips.find(c=>c.id===id)?.transition;if(!old||!Number.isFinite(d))return;const duration=Math.min(3,Math.max(0.2,d));lastDuration.current=duration;setTransition(id,{...old,duration})}
 function applyTransitionToAll(){const tr=selectedClip?.transition;if(!tr)return;setClips(a=>a.map((c,i)=>i===0?c:{...c,transition:{...tr}}));setStatus('Transição aplicada a todas as emendas.')}
 function testTransition(){const it=selectedItem;if(!it||it.tIn<=0||prepPending>0)return;const from=Math.max(0,it.start-1);ensureCtx();setMediaError('');tRef.current=from;setPlayhead(from);setPlaying(true)}
 function ensureProxies(paths:string[]){for(const path of new Set(paths)){if(proxyAsked.current.has(path))continue;proxyAsked.current.add(path);setPlaying(false);
   setProxies(a=>({...a,[path]:{state:'pending'}}));
   window.editor.makeProxy(path).then(r=>setProxies(a=>({...a,[path]:{state:'ready',url:r.url}}))).catch(e=>{console.error(e);setStatus('Não foi possível otimizar a prévia de um vídeo; será usado o arquivo original.');setProxies(a=>({...a,[path]:{state:'failed'}}))})}}
 async function importClips(){try{const input=await window.editor.chooseVideos();const more=input.map(c=>({...c,start:0,end:c.duration,speed:1,id:uid(),fit:(c.height&&c.width&&c.height>c.width*1.05?'blur':'fit') as 'blur'|'fit'}));setPool(a=>[...a,...more]);ensureProxies(more.map(c=>c.path));setStatus(`${more.length} vídeo(s) na biblioteca. Digite a posição ao lado do vídeo e tecle Enter para inseri-lo na sequência.`)}catch(e){alert(String(e))}}
 async function importAudio(){try{const files=await window.editor.chooseAudio();if(!files?.length)return;
  const more:AudioLane[]=files.map(f=>({...f,id:uid(),start:0,offset:0,loop:false,volume:1,muted:false,env:[]}));
  setLanes(a=>[...a,...more]);setSelected(null);setSelAudio(more[0].id);setStatus(`${more.length} áudio(s) adicionado(s).`)}catch(e){alert(String(e))}}
 function updateLane(id:string,patch:Partial<AudioLane>){setLanes(a=>a.map(l=>l.id===id?{...l,...patch}:l))}
 function removeLane(id:string){setLanes(a=>a.filter(l=>l.id!==id));setSelAudio(null)}
 function selectAudio(id:string){setSelected(null);setSelAudio(id)}
 useEffect(()=>{if(selected)setSelAudio(null)},[selected]);
 const audioLane=lanes.find(l=>l.id===selAudio)||null,audioProps:VideoAudio|AudioLane|null=selAudio==='video'?vAudio:audioLane,audioLen=selAudio==='video'?total:audioLane?laneLen(audioLane,total):0;
 // Faixas que não se sobrepõem no tempo dividem a mesma linha; uma nova linha só surge quando há conflito.
 // O fim considera também a largura mínima da barra, para que barras nunca se sobreponham visualmente.
 const laneRows=useMemo(()=>{
  const order=lanes.map((l,i)=>({l,i,start:l.start,end:l.start+Math.max(laneLen(l,total),12/zoom)})).sort((a,b)=>a.start-b.start||a.i-b.i);
  const rows:AudioLane[][]=[],ends:number[]=[];
  for(const o of order){let r=ends.findIndex(e=>e<=o.start+1e-6);if(r<0){r=ends.length;ends.push(0);rows.push([])}rows[r].push(o.l);ends[r]=o.end}
  return rows;
 },[lanes,total,zoom]);
 // Cortar arrastando a borda: a esquerda move início da faixa e do trecho juntos (o som não desloca); a direita muda onde o trecho termina.
 function startTrim(e:React.PointerEvent,l:AudioLane,edge:'l'|'r'){
  e.preventDefault();e.stopPropagation();selectAudio(l.id);
  const x0=e.clientX,start0=l.start,off0=l.offset,end0=l.fileEnd??l.duration,env0=l.env,ph=playhead,r2=(v:number)=>Math.round(v*100)/100;
  const mv=(ev:PointerEvent)=>{let d=(ev.clientX-x0)/zoom;
   if(edge==='l'){let dd=Math.max(-off0,-start0,Math.min(d,end0-off0-0.1));const edge0=start0+dd;if(Math.abs(edge0-ph)*zoom<7)dd=Math.max(-off0,-start0,Math.min(ph-start0,end0-off0-0.1));
    updateLane(l.id,{start:r2(start0+dd),offset:r2(off0+dd),env:shiftEnv(env0,dd)})}
   else{let ne=Math.min(l.duration,Math.max(off0+0.1,end0+d));const edgeT=start0+(ne-off0);if(Math.abs(edgeT-ph)*zoom<7)ne=Math.min(l.duration,Math.max(off0+0.1,off0+(ph-start0)));updateLane(l.id,{fileEnd:r2(ne)})}};
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}
 function duplicateLane(id:string){const i=lanes.findIndex(x=>x.id===id);if(i<0)return;const l=lanes[i],len=laneLen(l,total),fits=!l.loop&&(total<=0||l.start+len+0.1<total);
  const copy:AudioLane={...l,id:uid(),name:l.name+' (cópia)',start:fits?Math.round((l.start+len)*100)/100:l.start,env:l.env.map(p=>({...p}))};
  setLanes(a=>{const n=a.slice();n.splice(i+1,0,copy);return n});selectAudio(copy.id);setStatus(fits?'Faixa duplicada logo após a original.':'Faixa duplicada (no mesmo ponto; arraste para posicionar).')}
 function splitLane(id:string){const l=lanes.find(x=>x.id===id);if(!l)return;
  if(l.loop){setStatus('Desmarque “Repetir até o fim do vídeo” para dividir esta faixa.');return}
  const rel=playhead-l.start,len=laneLen(l,total);if(rel<=0.1||rel>=len-0.1){setStatus('Posicione a linha de reprodução dentro da faixa para dividir.');return}
  const cut=l.offset+rel,second:AudioLane={...l,id:uid(),start:Math.round(playhead*100)/100,offset:Math.round(cut*100)/100,env:shiftEnv(l.env,rel)};
  const firstEnv=l.env.length?[...l.env.filter(p=>p.t<rel-0.001),{t:rel,v:envAt(l.env,rel)}]:l.env;
  setLanes(a=>a.flatMap(x=>x.id===id?[{...x,fileEnd:Math.round(cut*100)/100,env:firstEnv},second]:[x]));selectAudio(second.id);setStatus('Faixa dividida em duas.')}
 function setAudioPatch(patch:Partial<VideoAudio>){if(selAudio==='video')setVAudio(v=>({...v,...patch}));else if(selAudio)updateLane(selAudio,patch)}
 function startLaneDrag(e:React.PointerEvent,l:AudioLane){e.preventDefault();selectAudio(l.id);const x0=e.clientX,s0=l.start;
  const mv=(ev:PointerEvent)=>updateLane(l.id,{start:Math.max(0,Math.round((s0+(ev.clientX-x0)/zoom)*100)/100)});
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}
 function changeClip(change:Partial<Clip>){if(!selected)return;setClips(a=>a.map(c=>c.id===selected?{...c,...change}:c));setPlaying(false);setPlayhead(0)}
 function moveClip(id:string,pos:number){
  setClips(a=>{const i=a.findIndex(c=>c.id===id);if(i<0)return a;const n=Math.min(a.length,Math.max(1,Math.round(pos)));if(n-1===i)return a;const next=a.slice(),[c]=next.splice(i,1);next.splice(n-1,0,c);return next});
  setPlaying(false);setSelected(id);setStatus(`Vídeo movido para a posição ${Math.min(clips.length,Math.max(1,Math.round(pos)))}.`)}
 function insertFromPool(id:string,pos:number){
  const c=pool.find(x=>x.id===id);if(!c)return;const n=Math.min(clips.length+1,Math.max(1,Math.round(pos)));
  setPool(a=>a.filter(x=>x.id!==id));setClips(a=>{const next=a.slice();next.splice(n-1,0,{...c,transition:undefined});return next});
  setPlaying(false);setSelected(id);setStatus(`“${c.name}” inserido na posição ${n}.`)}
 function insertAll(){if(!pool.length)return;setClips(a=>[...a,...pool.map(c=>({...c,transition:undefined}))]);setSelected(pool[0].id);setStatus(`${pool.length} vídeo(s) inseridos no fim da sequência.`);setPool([]);setPlaying(false)}
 function takeOut(id:string){const c=clips.find(x=>x.id===id);if(!c)return;setClips(a=>a.filter(x=>x.id!==id));setPool(a=>[...a,{...c,transition:undefined}]);if(selected===id)setSelected(null);setPlaying(false);setStatus(`“${c.name}” voltou para a biblioteca.`)}
 useEffect(()=>{const ids=new Set([...clips,...pool].map(c=>c.id));setTexts(a=>a.some(t=>t.clipId&&!ids.has(t.clipId))?a.filter(t=>!t.clipId||ids.has(t.clipId)):a)},[clips,pool]);
 // Desfazer/refazer: instantâneos (referências imutáveis, baratos) de tudo que o usuário edita. Mudanças seguidas num intervalo
 // curto (arrastar um controle deslizante, digitar) viram um único passo.
 const snapRef=useRef<Snap>({clips,pool,texts,lanes,vAudio}),hist=useRef<{past:Snap[];future:Snap[];committed:Snap|null;timer:number;applying:boolean}>({past:[],future:[],committed:null,timer:0,applying:false});
 const [,setHistTick]=useState(0);
 snapRef.current={clips,pool,texts,lanes,vAudio};
 const sameSnap=(a:Snap,b:Snap)=>a.clips===b.clips&&a.pool===b.pool&&a.texts===b.texts&&a.lanes===b.lanes&&a.vAudio===b.vAudio;
 useEffect(()=>{const h=hist.current,cur=snapRef.current;
  if(h.applying){h.applying=false;h.committed=cur;return}
  if(!h.committed){h.committed=cur;return}
  window.clearTimeout(h.timer);
  h.timer=window.setTimeout(()=>{h.timer=0;const base=h.committed!,now=snapRef.current;if(sameSnap(base,now))return;h.past.push(base);if(h.past.length>100)h.past.shift();h.committed=now;h.future=[];setHistTick(x=>x+1)},450)},[clips,pool,texts,lanes,vAudio]);
 function flushHistory(){const h=hist.current;if(!h.timer)return;window.clearTimeout(h.timer);h.timer=0;const now=snapRef.current;if(h.committed&&!sameSnap(h.committed,now)){h.past.push(h.committed);h.committed=now;h.future=[]}}
 function restore(sn:Snap){const h=hist.current;h.applying=true;window.setTimeout(()=>{h.applying=false},150);setClips(sn.clips);setPool(sn.pool);setTexts(sn.texts);setLanes(sn.lanes);setVAudio(sn.vAudio);setPlaying(false)}
 function undo(){const h=hist.current;flushHistory();const prev=h.past.pop();if(!prev){setStatus('Nada para desfazer.');return}h.future.push(snapRef.current);restore(prev);setHistTick(x=>x+1);setStatus('Desfeito.')}
 function redo(){const h=hist.current,next=h.future.pop();if(!next){setStatus('Nada para refazer.');return}h.past.push(snapRef.current);restore(next);setHistTick(x=>x+1);setStatus('Refeito.')}
 function resetHistory(){const h=hist.current;window.clearTimeout(h.timer);h.timer=0;h.past=[];h.future=[];h.committed=null;h.applying=false;setHistTick(x=>x+1)}
 function removeSelectedClip(){if(!selected)return;setClips(a=>a.filter(c=>c.id!==selected));setSelected(null);setPlaying(false);setPlayhead(0)}
 function addText(){
  const it=current?items.find(x=>x.clip.id===current.clip.id):null;
  if(it){const off=Math.max(0,Math.min(playhead-it.start,it.len-0.5)),dur=Math.max(0.5,Math.min(4,it.len-off));
   setTexts(a=>[...a,{id:uid(),text:'Novo título',start:it.start+off,end:it.start+off+dur,size:48,bold:true,clipId:it.clip.id,offset:+off.toFixed(2),dur:+dur.toFixed(2)}]);setStatus('Texto vinculado ao vídeo sob o cursor: ele acompanha o vídeo se você mudar a posição dele.');return}
  setTexts(a=>[...a,{id:uid(),text:'Novo título',start:Math.min(playhead,total),end:Math.min(total,playhead+4)>playhead?Math.min(total,playhead+4):playhead+4,size:48,bold:true}])}
 function updateText(id:string,patch:Partial<Title>){setTexts(a=>a.map(x=>x.id===id?{...x,...patch}:x))}
 function applyTextStyleAll(id:string){const t=texts.find(x=>x.id===id);if(!t)return;const r=tres(t),st:any={};for(const k of STYLE_KEYS)st[k]=(r as any)[k];st.size=t.size;setTexts(a=>a.map(x=>({...x,...st})));setStatus('Fonte, tamanho e cores aplicados a todos os textos (as posições não mudam).')}
 // Arrastar o texto na prévia muda a posição (em % do quadro); perto do centro horizontal ele "gruda" no meio.
 function startTitleDrag(e:React.PointerEvent,t:Title){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();const st=stageRef.current;if(!st)return;
  const rect=st.getBoundingClientRect(),r=tres(t),sx=e.clientX,sy=e.clientY;setDragTitle(t.id);setPlaying(false);
  const card=document.querySelector(`[data-tid="${t.id}"]`) as HTMLDetailsElement|null;if(card){card.open=true;card.scrollIntoView({block:'nearest',behavior:'smooth'})}
  const move=(ev:PointerEvent)=>{let x=Math.min(100,Math.max(0,r.x+(ev.clientX-sx)/rect.width*100)),y=Math.min(100,Math.max(0,r.y+(ev.clientY-sy)/rect.height*100));if(r.align==='center'&&Math.abs(x-50)<1.5)x=50;updateText(t.id,{x:+x.toFixed(1),y:+y.toFixed(1)})};
  const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);setDragTitle(null)};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 }
 function linkText(id:string){const t=texts.find(x=>x.id===id);if(!t)return;const it=items.find(x=>t.start>=x.start&&t.start<x.end)||items.find(x=>t.start>=x.start)||items[0];if(!it){setStatus('Não há vídeo na sequência para vincular.');return}
  updateText(id,{clipId:it.clip.id,offset:+Math.max(0,t.start-it.start).toFixed(2),dur:+Math.max(0.5,t.end-t.start).toFixed(2)});setStatus('Texto vinculado a “'+it.clip.name+'”.')}
 function unlinkText(id:string){const t=texts.find(x=>x.id===id);if(!t)return;const sp=titleSpan(t,items);updateText(id,{clipId:undefined,offset:undefined,dur:undefined,start:sp?sp.start:t.start,end:sp?sp.end:t.end});setStatus('Texto desvinculado (agora usa tempos fixos).')}
 function updateClip(id:string,patch:Partial<Clip>){setClips(a=>a.map(c=>c.id===id?{...c,...patch}:c))}
 function duplicateClip(id:string){const i=clips.findIndex(c=>c.id===id);if(i<0)return;const copy:Clip={...clips[i],id:uid(),transition:undefined};setClips(a=>{const n=a.slice();n.splice(i+1,0,copy);return n});setTexts(a=>[...a,...a.filter(t=>t.clipId===clips[i].id).map(t=>({...t,id:uid(),clipId:copy.id}))]);setSelected(copy.id);setPlaying(false);setStatus('Vídeo duplicado (com os textos dele) logo após o original.')}
 function setGrade(id:string,v:number[],style?:string){updateClip(id,{cB:v[0],cC:v[1],cS:v[2],cT:v[3],cF:v[4]})}
 function applyGradeToAll(){const c=selectedClip;if(!c)return;const v=gradeVals(c);setClips(a=>a.map(x=>({...x,cB:v[0],cC:v[1],cS:v[2],cT:v[3],cF:v[4]})));setStatus('Cor aplicada a todos os vídeos da sequência.')}
 function applyFitToAll(){const c=selectedClip;if(!c)return;const p:Partial<Clip>={fit:c.fit??'fit',fillX:c.fillX,fillY:c.fillY,fillYEnd:c.fillYEnd};setClips(a=>a.map(x=>({...x,...p})));setStatus('Enquadramento aplicado a todos os vídeos da sequência.')}
 function setClipMuted(id:string,muted:boolean){setClips(a=>a.map(c=>c.id===id?{...c,muted}:c));setStatus(muted?'Som deste vídeo silenciado.':'Som deste vídeo ativado.')}
 function deletePool(id:string){setPool(a=>a.filter(x=>x.id!==id))}
 function reorder(fromId:string,toId:string){if(fromId===toId)return;setClips(old=>{const result=[...old];const from=result.findIndex(x=>x.id===fromId),to=result.findIndex(x=>x.id===toId);if(from<0||to<0)return old;const [item]=result.splice(from,1);result.splice(to,0,item);return result});setPlaying(false);setPlayhead(0)}
 function splitAtPlayhead(){const c=current?.clip;if(!c)return;const local=current!.local*c.speed,srcT=c.reverse?c.end-local:c.start+local;
  if(srcT<=c.start+0.1||srcT>=c.end-0.1){setStatus('Posicione a cabeça de reprodução dentro do clipe.');return}
  // zoom animado: cada metade continua a animação de onde a outra parou
  const z0=c.zoom??1,z1=c.zoomEnd==null?z0:c.zoomEnd,zAt=z0+(z1-z0)*Math.min(1,current!.local/Math.max(0.001,length(c))),anim=c.zoomEnd!=null;
  const a:Partial<Clip>=c.reverse?{start:srcT}:{end:srcT},b:Partial<Clip>=c.reverse?{end:srcT}:{start:srcT};
  const za:Partial<Clip>=anim?{zoom:z0,zoomEnd:zAt}:{},zb:Partial<Clip>=anim?{zoom:zAt,zoomEnd:z1}:{};
  const fy0=c.fillY??0,fy1=c.fillYEnd==null?fy0:c.fillYEnd,fyAt=fy0+(fy1-fy0)*Math.min(1,current!.local/Math.max(0.001,length(c))),fanim=c.fillYEnd!=null;
  const fa:Partial<Clip>=fanim?{fillY:fy0,fillYEnd:fyAt}:{},fb:Partial<Clip>=fanim?{fillY:fyAt,fillYEnd:fy1}:{};
  const second:Clip={...c,...b,...zb,...fb,id:uid(),transition:undefined};
  const cut=current!.local;setTexts(ts=>ts.flatMap(t=>{if(t.clipId!==c.id)return [t];const off=t.offset??0,dur=t.dur??(t.end-t.start);if(off>=cut-0.001)return [{...t,clipId:second.id,offset:+(off-cut).toFixed(3)}];if(off+dur>cut+0.05)return [{...t,dur:+(cut-off).toFixed(3)},{...t,id:uid(),clipId:second.id,offset:0,dur:+(off+dur-cut).toFixed(3)}];return [t]}));
  setClips(old=>old.flatMap(x=>x.id===c.id?[{...x,...a,...za,...fa},second]:[x]));setSelected(second.id);setPlaying(false);setStatus('Clipe dividido em dois.');}
 function move(index:number,d:number){const next=[...clips],to=index+d;if(to<0||to>=next.length)return;[next[index],next[to]]=[next[to],next[index]];setClips(next);setPlayhead(0);setPlaying(false)}
 const project=():Project=>({clips,pool,audio:lanes,videoAudio:vAudio,texts:texts.map(t=>{const sp=titleSpan(t,items),r=tres(t),py=titleStack.get(t.id)?.py??r.y*7.2;const render={fontFile:r.file,color:r.color,opacity:r.opacity,outline:r.outline,outlineColor:r.outlineColor,shadow:r.shadow,box:r.box,boxColor:r.boxColor,boxOpacity:r.boxOpacity,boxPad:tpad(r),align:r.align,px:+(r.x*12.8).toFixed(1),py:+py.toFixed(1)};return sp?{...t,start:sp.start,end:sp.end,render}:{...t,start:0,end:0,render}})});
 async function save(){try{const p=await window.editor.saveProject(project());if(p)setStatus('Projeto salvo: '+p)}catch(e){alert(String(e))}}
 async function open(){try{const p=await window.editor.openProject();if(!p)return;resetHistory();setClips(p.clips.map(c=>({...c,id:c.id||uid()})));setPool((p.pool||[]).map(c=>({...c,id:c.id||uid()})));ensureProxies([...p.clips,...(p.pool||[])].map(c=>c.path));setLanes((p.audio||[]).map(l=>({...l,id:l.id||uid()})));setVAudio(p.videoAudio||{volume:1,muted:false,env:[]});setSelAudio(null);setTexts((p.texts||[]).map(t=>({...t,id:t.id||uid()})));setSelected(p.clips[0]?.id||null);setPlayhead(0);setPlaying(false);setStatus('Projeto aberto.')}catch(e){alert(String(e))}}
 async function exportMovie(){if(!clips.length)return;setPlaying(false);setExporting(true);try{const p=await window.editor.exportVideo(project());if(p)setStatus('Exportado: '+p);else setStatus('Exportação cancelada.')}catch(e){setStatus('Erro na exportação');alert(String(e))}finally{setExporting(false)}}
 const audioPanel=audioProps?<div className="fields audio-panel">
  <label>{selAudio==='video'?'Faixa selecionada':'Nome da faixa'}{audioLane?<input type="text" aria-label="Nome da faixa" value={audioLane.name} onChange={e=>updateLane(audioLane.id,{name:e.target.value})}/>:<strong>Som original dos vídeos</strong>}</label>
  <label><span>Volume: {Math.round(audioProps.volume*100)}% <em>({dbText(audioProps.volume)})</em></span><input aria-label="Volume da faixa" type="range" min="0" max="200" step="1" value={Math.round(audioProps.volume*100)} onChange={e=>setAudioPatch({volume:Number(e.target.value)/100})}/></label>
  <label className="check"><input type="checkbox" aria-label="Silenciar faixa" checked={audioProps.muted} onChange={e=>setAudioPatch({muted:e.target.checked})}/> Silenciar esta faixa</label>
  {audioLane&&<><label>Início na linha do tempo (s)<input type="number" aria-label="Início na linha do tempo" min="0" step="0.1" value={+audioLane.start.toFixed(2)} onChange={e=>updateLane(audioLane.id,{start:Math.max(0,Number(e.target.value)||0)})}/></label>
   <label>Começar a tocar o arquivo em (s)<input type="number" aria-label="Início dentro do arquivo" min="0" max={Math.max(0,audioLane.duration-0.1)} step="0.1" value={+audioLane.offset.toFixed(2)} onChange={e=>updateLane(audioLane.id,{offset:Math.min(Math.max(0,audioLane.duration-0.1),Math.max(0,Number(e.target.value)||0))})}/></label>
   <label>Parar de tocar o arquivo em (s)<input type="number" aria-label="Fim dentro do arquivo" min={+(audioLane.offset+0.1).toFixed(2)} max={+audioLane.duration.toFixed(2)} step="0.1" value={+((audioLane.fileEnd??audioLane.duration)).toFixed(2)} onChange={e=>updateLane(audioLane.id,{fileEnd:Math.min(audioLane.duration,Math.max(audioLane.offset+0.1,Number(e.target.value)||audioLane.duration))})}/></label>
   <label className="check"><input type="checkbox" aria-label="Repetir faixa" checked={audioLane.loop} onChange={e=>updateLane(audioLane.id,{loop:e.target.checked})}/> Repetir até o fim do vídeo</label><p className="hint">O arquivo tem {audioLane.duration.toFixed(1)} s; toca {laneSpan(audioLane).toFixed(1)} s. Arraste as bordas da barra na linha do tempo para cortar.</p><div className="two"><button onClick={()=>duplicateLane(audioLane.id)} title="Cria uma cópia desta faixa"><Copy size={15}/> Duplicar</button><button onClick={()=>splitLane(audioLane.id)} title="Divide a faixa na linha de reprodução"><Scissors size={15}/> Dividir no cursor</button></div></>}
  <div className="divider"/><div className="section-title"><Volume2 size={17}/> Curva de volume</div>
  <p className="hint">Dê um <b>duplo clique</b> na faixa para criar um ponto e arraste para subir ou baixar o volume ao longo do tempo. Duplo clique (ou botão direito) em um ponto o remove.</p>
  <label>Duração do fade (s)<input type="number" aria-label="Duração do fade" min="0.2" max="60" step="0.5" value={fadeLen} onChange={e=>setFadeLen(Math.max(0.2,Number(e.target.value)||2))}/></label>
  <div className="two"><button onClick={()=>setAudioPatch({env:fadeEnv(audioProps.env,audioLen,'in',fadeLen)})} disabled={audioLen<=0}>Fade in</button><button onClick={()=>setAudioPatch({env:fadeEnv(audioProps.env,audioLen,'out',fadeLen)})} disabled={audioLen<=0}>Fade out</button></div>
  <button onClick={()=>setAudioPatch({env:[]})} disabled={!audioProps.env.length}>Limpar curva</button>
  {audioLane&&<button className="danger" onClick={()=>removeLane(audioLane.id)}><Trash2 size={16}/> Remover faixa</button>}
 </div>:null;
 return <div className="app">
  <header><div className="brand"><Clapperboard size={25}/><div><strong>EDEN <span>VIDEO EDITOR</span></strong><small>Studio • v0.9.0</small></div></div><div className="toolbar"><button onClick={undo} disabled={!hist.current.past.length&&!hist.current.timer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Undo2 size={17}/></button><button onClick={redo} disabled={!hist.current.future.length} title="Refazer (Ctrl+Y)" aria-label="Refazer"><Redo2 size={17}/></button><button onClick={open}><FolderOpen size={17}/> Abrir projeto</button><button onClick={save}><Save size={17}/> Salvar</button><button className="primary" onClick={exportMovie} disabled={!clips.length||exporting}><Download size={17}/>{exporting?'Exportando...':'Exportar MP4'}</button></div></header>
  <section className="workspace">
   <aside className="library"><div className="section-title"><Film size={17}/> Biblioteca</div><button className="add" onClick={importClips}><Plus size={17}/> Importar vídeos</button><button className="add secondary" onClick={importAudio}><Music size={17}/> Adicionar áudio</button><div className="library-items">{(pool.length>0||clips.length>0)&&<div className="pool-head"><span>Na sequência ({clips.length})</span></div>}{!clips.length&&pool.length>0&&<p className="hint">Sequência vazia. Digite a posição ao lado de um vídeo abaixo e tecle Enter.</p>}{clips.map((c,i)=><div key={c.id} className={'asset seqitem '+(selected===c.id?'chosen':'')} onClick={()=>setSelected(c.id)}><SeqInput value={i+1} max={clips.length} title="Posição na sequência. Digite outro número e tecle Enter para mover o vídeo." onCommit={n=>moveClip(c.id,n)}/><span title={c.path}>{c.name}<small>{seconds(c.duration)}{c.muted?' • mudo':''}{c.reverse?' • inverso':''}</small></span><button title="Tirar da sequência (volta para a biblioteca)" onClick={e=>{e.stopPropagation();takeOut(c.id)}}><Undo2 size={14}/></button></div>)}{pool.length>0&&<div className="pool-head"><span>Biblioteca • fora da sequência ({pool.length})</span><button onClick={insertAll} title="Insere todos no fim da sequência, na ordem da lista">Inserir todos</button></div>}{pool.map(c=><div key={c.id} className="asset pool"><SeqInput ghost value={clips.length+1} max={clips.length+1} title="Digite a posição desejada e tecle Enter para inserir este vídeo na sequência." onCommit={n=>insertFromPool(c.id,n)}/><span title={c.path}>{c.name}<small>{seconds(c.duration)}{proxies[c.path]?.state==='pending'?' • otimizando…':''}</small></span><button title="Inserir no fim da sequência" onClick={()=>insertFromPool(c.id,clips.length+1)}><Plus size={14}/></button><button title="Excluir da biblioteca" onClick={()=>deletePool(c.id)}><Trash2 size={14}/></button></div>)}{lanes.map(l=><div key={l.id} className={'asset music'+(selAudio===l.id?' chosen':'')} onClick={()=>selectAudio(l.id)}><Music size={18}/><span title={l.path}>{l.name}<small>Áudio • {seconds(l.duration)}</small></span><button title="Remover faixa" onClick={e=>{e.stopPropagation();removeLane(l.id)}}><Trash2 size={14}/></button></div>)}{!clips.length&&!pool.length&&<p className="hint">Importe arquivos para montar sua primeira sequência.</p>}</div></aside>
   <main className="center"><div className="section-title">Pré-visualização <span>1280 × 720 • 16:9</span></div><div className="preview-shell"><div className={'preview'+(full?' full':'')+(full&&!fsShow?' idle':'')} ref={previewRef} onDoubleClick={toggleFull} onMouseMove={()=>{if(full)bumpControls()}}>{current?<><svg className="svgdefs" width="0" height="0" aria-hidden="true">{Array.from({length:SLOTS},(_,k)=><filter key={k} id={'eg'+k} colorInterpolationFilters="sRGB" x="0" y="0" width="1" height="1"><feComponentTransfer><feFuncR type="linear" slope="1" intercept="0"/><feFuncG type="linear" slope="1" intercept="0"/><feFuncB type="linear" slope="1" intercept="0"/></feComponentTransfer><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>)}</svg><div className="stage" ref={stageRef}>{slotIds.map((cid,k)=>{const c=cid?clips.find(x=>x.id===cid):undefined,url=c?(safe[c.id]&&!c.reverse?c.url:urlOf(c)):'';return <ClipSlot key={k} idx={k} cid={c?c.id:null} src={url} retry={c?retry[c.id]||0:0} vids={vids} onMeta={()=>applyLayout(tRef.current)} onFail={onVideoFail}/>})}<div className="titles">{activeTitles.map(t=>{const r=tres(t);return <div key={t.id} className={'ttl'+(dragTitle===t.id?' drag':'')+(playing?' live':'')} style={titleStyle(r,titleStack.get(t.id)?.py??r.y*7.2)} title="Arraste para posicionar" onPointerDown={e=>startTitleDrag(e,t)} onDoubleClick={e=>e.stopPropagation()}>{t.text}</div>})}</div></div><div className="audio-pool">{lanes.map(l=><LaneAudio key={l.id+'|'+l.url} lid={l.id} src={l.url} auds={auds} dispose={disposeMedia} onMeta={()=>applyLayout(tRef.current)} onFail={()=>setMediaError('Falha ao ler o áudio “'+l.name+'”.')}/>)}</div>{mediaError&&<div className="media-error">{mediaError}</div>}{full&&<div className={'fs-controls'+(fsShow?' show':'')} onDoubleClick={e=>e.stopPropagation()}><button onClick={togglePlay} disabled={!clips.length||prepPending>0} title="Tocar / pausar (Espaço)">{playing?<Pause size={22}/>:<Play size={22}/>}</button><span className="fs-time">{seconds(playhead)}</span><input type="range" aria-label="Posição" min="0" max={Math.max(0.01,total)} step="0.01" value={Math.min(playhead,total)} onChange={e=>seekTo(Number(e.target.value))}/><span className="fs-time">{seconds(total)}</span><button onClick={toggleFull} title="Sair da tela inteira (Esc)"><Minimize size={20}/></button></div>}{prepPending>0&&<div className="optimizing"><strong>{revPending>0&&proxyPending===0?'Preparando o vídeo invertido…':'Otimizando a prévia para reprodução fluida…'}</strong><span>{revPending>0&&proxyPending===0?'Acontece só na primeira vez para cada trecho':`${proxyDone} de ${proxyList.length} vídeos prontos`} • a exportação usa a qualidade original</span></div>}</>:<div className="empty"><Clapperboard size={48}/><h2>Seu próximo vídeo começa aqui</h2><p>Importe clipes para visualizar a edição.</p></div>}</div></div><div className="transport"><button disabled={!clips.length} onClick={()=>{setPlaying(false);setPlayhead(0)}}><ChevronLeft size={18}/></button><button className="play" disabled={!clips.length||prepPending>0} title={prepPending>0?'Aguarde a otimização da prévia':'Reproduzir / pausar'} onClick={togglePlay}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><button disabled={!clips.length} onClick={()=>{setPlaying(false);setPlayhead(total)}}><ChevronRight size={18}/></button><strong>{seconds(playhead)} <span>/ {seconds(total)}</span></strong><button className="fsbtn" title="Tela inteira (F)" aria-label="Tela inteira" onClick={toggleFull}><Maximize size={17}/></button></div></main>
   <aside className="inspector"><div className="section-title"><Scissors size={17}/> Propriedades</div>{audioPanel}{selectedClip?<div className="fields"><label>Vídeo selecionado<strong title={selectedClip.path}>{selectedClip.name}</strong></label>{selectedItem&&<label>Posição na sequência (1 a {clips.length})<SeqInput wide value={selectedItem.index+1} max={clips.length} title="Digite o número da posição e tecle Enter para mover este vídeo." onCommit={n=>moveClip(selectedClip.id,n)}/></label>}<label>Início do corte (segundos)<input type="number" min="0" max={Math.max(0,selectedClip.end-0.1)} step="0.1" value={selectedClip.start} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<selectedClip.end)changeClip({start:n})}}/></label><label>Fim do corte (segundos)<input type="number" min={selectedClip.start+0.1} max={selectedClip.duration} step="0.1" value={selectedClip.end} onChange={e=>{const n=Number(e.target.value);if(n>selectedClip.start&&n<=selectedClip.duration)changeClip({end:n})}}/></label><label>Velocidade<select value={selectedClip.speed} onChange={e=>changeClip({speed:Number(e.target.value)})}>{[0.25,0.5,0.75,1,1.25,1.5,2,3,4].map(x=><option key={x} value={x}>{x}×</option>)}</select><input aria-label="Velocidade personalizada" type="number" min="0.25" max="4" step="0.05" value={selectedClip.speed} onChange={e=>{const n=Number(e.target.value);if(n>=0.25&&n<=4)changeClip({speed:n})}}/></label><div className="notice">Duração na sequência: {seconds(length(selectedClip))}</div><label className="check"><input type="checkbox" aria-label="Silenciar vídeo" checked={!!selectedClip.muted} onChange={e=>setClipMuted(selectedClip.id,e.target.checked)}/> Silenciar o som deste vídeo</label><label>Volume do vídeo: {Math.round((selectedClip.volume??1)*100)}%<input type="range" aria-label="Volume do vídeo" min="0" max="200" step="1" value={Math.round((selectedClip.volume??1)*100)} onChange={e=>updateClip(selectedClip.id,{volume:Number(e.target.value)/100})}/></label>
   <label className="check"><input type="checkbox" aria-label="Reproduzir ao contrário" checked={!!selectedClip.reverse} onChange={e=>updateClip(selectedClip.id,{reverse:e.target.checked})}/> Reproduzir ao contrário (inclui o som)</label>
   <div className="divider"/><div className="section-title"><Crop size={17}/> Enquadramento</div>
   {selectedClip.width&&selectedClip.height?<p className="hint">Este vídeo é {isVertical(selectedClip)?'vertical':selectedClip.width>selectedClip.height*1.05?'horizontal':'quase quadrado'} ({selectedClip.width}×{selectedClip.height}); o projeto é 16:9.</p>:null}
   <label>Como encaixar no quadro 16:9<select aria-label="Enquadramento" value={fitOf(selectedClip)} onChange={e=>updateClip(selectedClip.id,{fit:e.target.value as 'fit'|'fill'|'blur'})}><option value="fit">Ajustar (barras pretas)</option><option value="blur">Fundo desfocado (sem cortar)</option><option value="fill">Preencher o quadro (recorta)</option></select></label>
   {fitOf(selectedClip)==='fill'&&(()=>{const ar=selectedClip.width&&selectedClip.height?selectedClip.width/selectedClip.height:0,tall=!ar||ar<16/9-0.02,wide=!ar||ar>16/9+0.02;return <>
    {tall&&<label>Parte do vídeo mantida (vertical): {Math.round((selectedClip.fillY??0)*100)}<input type="range" aria-label="Posição do recorte vertical" min="-100" max="100" step="1" value={Math.round((selectedClip.fillY??0)*100)} onChange={e=>updateClip(selectedClip.id,{fillY:Number(e.target.value)/100})}/></label>}
    {wide&&<label>Parte do vídeo mantida (horizontal): {Math.round((selectedClip.fillX??0)*100)}<input type="range" aria-label="Posição do recorte horizontal" min="-100" max="100" step="1" value={Math.round((selectedClip.fillX??0)*100)} onChange={e=>updateClip(selectedClip.id,{fillX:Number(e.target.value)/100})}/></label>}
    {tall&&<label className="check"><input type="checkbox" aria-label="Varrer o recorte" checked={selectedClip.fillYEnd!=null} onChange={e=>updateClip(selectedClip.id,{fillYEnd:e.target.checked?1:null,fillY:e.target.checked?-1:(selectedClip.fillY??0)})}/> Varrer de cima para baixo durante o vídeo</label>}
    {tall&&selectedClip.fillYEnd!=null&&<label>Posição no fim: {Math.round(selectedClip.fillYEnd*100)}<input type="range" aria-label="Posição final do recorte" min="-100" max="100" step="1" value={Math.round(selectedClip.fillYEnd*100)} onChange={e=>updateClip(selectedClip.id,{fillYEnd:Number(e.target.value)/100})}/></label>}</>})()}
   <button onClick={applyFitToAll} title="Usa este modo (e posição) em todos os vídeos da sequência">Aplicar este enquadramento a todos</button>
   <div className="divider"/><div className="section-title"><Palette size={17}/> Cor e estilo</div>
   <div className="styles">{GRADE_STYLES.map(st=><button key={st.id} className={'chip'+(sameVals(gradeVals(selectedClip),st.v)?' on':'')} onClick={()=>setGrade(selectedClip.id,st.v)} title={`Brilho ${st.v[0]}, contraste ${st.v[1]}, saturação ${st.v[2]}, temperatura ${st.v[3]}, desbotado ${st.v[4]}`}>{st.name}</button>)}</div>
   {([['Brilho','cB',-100,100],['Contraste','cC',-100,100],['Saturação','cS',-100,100],['Temperatura (frio ↔ quente)','cT',-100,100],['Desbotado','cF',0,100]] as [string,'cB'|'cC'|'cS'|'cT'|'cF',number,number][]).map(([lab,key,lo,hi])=><label key={key}>{lab}: {Math.round(selectedClip[key]||0)}<input type="range" aria-label={lab.split(' ')[0]} min={lo} max={hi} step="1" value={Math.round(selectedClip[key]||0)} onChange={e=>updateClip(selectedClip.id,{[key]:Number(e.target.value)} as Partial<Clip>)}/></label>)}
   <div className="two"><button disabled={!hasGrade(selectedClip)} onClick={()=>setGrade(selectedClip.id,[0,0,0,0,0])}>Restaurar cor</button><button onClick={applyGradeToAll} title="Usa esta cor em todos os vídeos da sequência">Aplicar a todos</button></div>
   <div className="divider"/><div className="section-title"><ZoomInIcon size={17}/> Zoom deste vídeo</div>
   <label>Zoom: {Math.round((selectedClip.zoom??1)*100)}%<input type="range" aria-label="Zoom" min="100" max="400" step="5" value={Math.round((selectedClip.zoom??1)*100)} onChange={e=>updateClip(selectedClip.id,{zoom:Number(e.target.value)/100})}/></label>
   <label className="check"><input type="checkbox" aria-label="Animar zoom" checked={selectedClip.zoomEnd!=null} onChange={e=>updateClip(selectedClip.id,{zoomEnd:e.target.checked?Math.min(4,(selectedClip.zoom??1)+0.3):null})}/> Animar o zoom do início ao fim do vídeo</label>
   {selectedClip.zoomEnd!=null&&<label>Zoom no fim: {Math.round(selectedClip.zoomEnd*100)}%<input type="range" aria-label="Zoom final" min="100" max="400" step="5" value={Math.round(selectedClip.zoomEnd*100)} onChange={e=>updateClip(selectedClip.id,{zoomEnd:Number(e.target.value)/100})}/></label>}
   {hasZoom(selectedClip)&&<><label>Posição horizontal: {Math.round((selectedClip.panX??0)*100)}<input type="range" aria-label="Posição horizontal do zoom" min="-100" max="100" step="1" value={Math.round((selectedClip.panX??0)*100)} onChange={e=>updateClip(selectedClip.id,{panX:Number(e.target.value)/100})}/></label><label>Posição vertical: {Math.round((selectedClip.panY??0)*100)}<input type="range" aria-label="Posição vertical do zoom" min="-100" max="100" step="1" value={Math.round((selectedClip.panY??0)*100)} onChange={e=>updateClip(selectedClip.id,{panY:Number(e.target.value)/100})}/></label></>}
   <div className="two"><button onClick={()=>updateClip(selectedClip.id,{zoom:1,zoomEnd:1.3})} title="Zoom de 100% para 130% ao longo do vídeo">Aproximar devagar</button><button onClick={()=>updateClip(selectedClip.id,{zoom:1.3,zoomEnd:1})} title="Zoom de 130% para 100% ao longo do vídeo">Afastar devagar</button></div>
   <button disabled={!hasZoom(selectedClip)} onClick={()=>updateClip(selectedClip.id,{zoom:1,zoomEnd:null,panX:0,panY:0})}>Remover zoom</button>
   <button onClick={()=>duplicateClip(selectedClip.id)} title="Cria uma cópia logo depois deste vídeo"><Copy size={15}/> Duplicar vídeo</button><button className="danger" onClick={removeSelectedClip}><Trash2 size={16}/> Remover clipe</button></div>:(audioPanel?null:<p className="hint">Selecione um clipe ou uma faixa de áudio para editar.</p>)}{selectedClip&&selectedItem&&(selectedItem.index===0?<p className="hint">A primeira cena não tem transição de entrada.</p>:<div className="transition-panel"><div className="divider"/><div className="section-title"><Sparkles size={17}/> Transição de entrada</div><p className="hint">Entre “{clips[selectedItem.index-1].name}” e este clipe.</p><div className="fields"><label>Efeito<select aria-label="Efeito de transição" value={selectedClip.transition?.type||'none'} onChange={e=>chooseTransition(selectedClip.id,e.target.value)}><option value="none">Corte seco (sem transição)</option>{TRANSITION_GROUPS.map(g=><optgroup key={g.group} label={g.group}>{g.items.map(i=><option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}</select></label>{selectedClip.transition&&<><label>Duração: {selectedClip.transition.duration.toFixed(1)} s<input aria-label="Duração da transição" type="range" min="0.2" max="3" step="0.1" value={selectedClip.transition.duration} onChange={e=>changeTransitionDuration(selectedClip.id,Number(e.target.value))}/></label>{selectedItem.tIn<selectedClip.transition.duration-0.05&&<div className="notice">Limitada a {selectedItem.tIn.toFixed(1)} s: cada cena precisa durar pelo menos o dobro da transição.</div>}<div className="two"><button onClick={testTransition} disabled={prepPending>0||selectedItem.tIn<=0} title="Reproduz desde 1 s antes da emenda"><Play size={14}/> Testar</button><button onClick={applyTransitionToAll} title="Usa este efeito e duração em todas as emendas">Aplicar a todas</button></div><p className="hint">A transição sobrepõe as duas cenas; o vídeo final fica {selectedItem.tIn.toFixed(1)} s mais curto.</p></>}</div></div>)}
   <div className="divider"/><div className="section-title"><Type size={17}/> Textos</div><button className="add" onClick={addText} disabled={!clips.length} title="O texto fica vinculado ao vídeo sob a linha de reprodução"><Plus size={16}/> Inserir texto</button><div className="text-items">{texts.map(t=>{const sp=titleSpan(t,items),linked=!!t.clipId,owner=linked?[...clips,...pool].find(c=>c.id===t.clipId):null;return <div className="text-edit" key={t.id}><input aria-label="Texto" value={t.text} maxLength={180} onChange={e=>updateText(t.id,{text:e.target.value})}/>
   {linked?<><p className="hint link"><Link2 size={12}/> Vinculado a “{owner?.name||'?'}”{!sp?' — vídeo fora da sequência: texto oculto':''}</p><div className="two"><label>Início no vídeo (s)<input type="number" aria-label="Início no vídeo" min="0" step="0.1" value={t.offset??0} onChange={e=>updateText(t.id,{offset:Math.max(0,Number(e.target.value)||0)})}/></label><label>Duração (s)<input type="number" aria-label="Duração do texto" min="0.1" step="0.1" value={t.dur??(t.end-t.start)} onChange={e=>updateText(t.id,{dur:Math.max(0.1,Number(e.target.value)||0.1)})}/></label></div><button onClick={()=>unlinkText(t.id)} title="Passa a usar tempos fixos da linha do tempo"><Unlink2 size={14}/> Desvincular do vídeo</button></>
   :<><div className="two"><label>Início<input type="number" min="0" step="0.1" value={t.start} onChange={e=>updateText(t.id,{start:Number(e.target.value)})}/></label><label>Fim<input type="number" min="0" step="0.1" value={t.end} onChange={e=>updateText(t.id,{end:Number(e.target.value)})}/></label></div><button onClick={()=>linkText(t.id)} title="O texto passa a acompanhar o vídeo que está no seu tempo de início"><Link2 size={14}/> Vincular ao vídeo</button></>}
   {(()=>{const r=tres(t),slot=titleStack.get(t.id)?.slot||0,canB=!!r.def.files[1],canI=!!r.def.files[2]&&(!r.b||!!r.def.files[3]);return <details className="tstyle" data-tid={t.id}><summary><Palette size={13}/> Fonte, cor e posição</summary>
    <div className="styles tpresets">{TEXT_PRESETS.map(p=><button key={p.name} className="chip" onClick={()=>updateText(t.id,p.v)} style={{fontFamily:fontById(p.v.font).css}}>{p.name}</button>)}</div>
    <label>Fonte<select aria-label="Fonte" value={r.font} onChange={e=>updateText(t.id,{font:e.target.value})}>{FONTS.map(f=><option key={f.id} value={f.id} style={{fontFamily:f.css}}>{f.label}</option>)}</select></label>
    <div className="trow"><label>Tamanho<input type="number" aria-label="Tamanho do texto" min="12" max="200" value={t.size} onChange={e=>updateText(t.id,{size:Math.min(200,Math.max(12,Number(e.target.value)||12))})}/></label>
     <div className="tgroup" role="group" aria-label="Estilo da letra"><button className={'tbtn'+(r.b?' on':'')} disabled={!canB} aria-pressed={r.b} title={canB?'Negrito':'Esta fonte não tem negrito'} onClick={()=>updateText(t.id,{bold:!r.b})}><Bold size={15}/></button><button className={'tbtn'+(r.i?' on':'')} disabled={!canI} aria-pressed={r.i} title={canI?'Itálico':'Esta fonte não tem itálico'+(r.b&&r.def.files[2]?' com negrito':'')} onClick={()=>updateText(t.id,{italic:!r.i})}><Italic size={15}/></button></div></div>
    <div className="trow"><label>Cor da letra<input type="color" aria-label="Cor da letra" value={r.color} onChange={e=>updateText(t.id,{color:e.target.value})}/></label><label>Opacidade {Math.round(r.opacity*100)}%<input type="range" aria-label="Opacidade do texto" min="10" max="100" value={Math.round(r.opacity*100)} onChange={e=>updateText(t.id,{opacity:Number(e.target.value)/100})}/></label></div>
    <div className="trow"><label>Contorno {r.outline} px<input type="range" aria-label="Espessura do contorno" min="0" max="10" value={r.outline} onChange={e=>updateText(t.id,{outline:Number(e.target.value)})}/></label><label>Cor do contorno<input type="color" aria-label="Cor do contorno" disabled={!r.outline} value={r.outlineColor} onChange={e=>updateText(t.id,{outlineColor:e.target.value})}/></label></div>
    <label className="check"><input type="checkbox" aria-label="Sombra" checked={r.shadow} onChange={e=>updateText(t.id,{shadow:e.target.checked})}/> Sombra</label>
    <label className="check"><input type="checkbox" aria-label="Tarja de fundo" checked={r.box} onChange={e=>updateText(t.id,{box:e.target.checked})}/> Tarja atrás do texto</label>
    {r.box&&<div className="trow"><label>Cor da tarja<input type="color" aria-label="Cor da tarja" value={r.boxColor} onChange={e=>updateText(t.id,{boxColor:e.target.value})}/></label><label>Opacidade {Math.round(r.boxOpacity*100)}%<input type="range" aria-label="Opacidade da tarja" min="0" max="100" value={Math.round(r.boxOpacity*100)} onChange={e=>updateText(t.id,{boxOpacity:Number(e.target.value)/100})}/></label></div>}
    <div className="tsub">Posição</div>
    <div className="tgroup wide" role="group" aria-label="Alinhamento">{([['left','Alinhar à esquerda',AlignLeft],['center','Centralizar',AlignCenter],['right','Alinhar à direita',AlignRight]] as const).map(([a,lbl,Ic])=><button key={a} className={'tbtn'+(r.align===a?' on':'')} aria-pressed={r.align===a} title={lbl} onClick={()=>updateText(t.id,{align:a,x:a==='left'?6:a==='right'?94:50})}><Ic size={15}/></button>)}</div>
    <div className="tgroup wide" role="group" aria-label="Altura">{([['Topo',12],['Meio',50],['Base',85]] as const).map(([lbl,y])=><button key={lbl} className={'tbtn txt'+(Math.round(r.y)===y?' on':'')} onClick={()=>updateText(t.id,{y})}>{lbl}</button>)}</div>
    <div className="trow"><label>Horizontal {Math.round(r.x)}%<input type="range" aria-label="Posição horizontal" min="0" max="100" step="0.5" value={r.x} onChange={e=>updateText(t.id,{x:Number(e.target.value)})}/></label><label>Vertical {Math.round(r.y)}%<input type="range" aria-label="Posição vertical" min="0" max="100" step="0.5" value={r.y} onChange={e=>updateText(t.id,{y:Number(e.target.value)})}/></label></div>
    {slot>0&&<p className="hint"><Move size={12}/> Outro texto aparece ao mesmo tempo nesta posição; este foi empilhado {r.y>=50?'acima':'abaixo'} dele.</p>}
    <p className="hint">Dica: arraste o texto direto na prévia para posicioná-lo.</p>
    <button onClick={()=>applyTextStyleAll(t.id)} title="Copia fonte, tamanho, cores, contorno, sombra e tarja (não a posição)">Aplicar este estilo a todos os textos</button>
   </details>})()}
   <button className="danger" onClick={()=>setTexts(a=>a.filter(x=>x.id!==t.id))} title="Remover este texto"><Trash2 size={15}/> Remover texto</button></div>})}</div></aside>
  </section>
  <section className="timeline"><div className="timeline-head"><div className="section-title">Linha do tempo <span>Arraste clipes para reorganizar • arraste a régua para navegar</span></div><div className="timeline-tools"><button title="Dividir no cursor" onClick={splitAtPlayhead} disabled={!current}><Scissors size={15}/> Dividir</button><button onClick={()=>setZoom(z=>Math.max(8,z-5))} title="Reduzir zoom"><ZoomOut size={15}/></button><span>{zoom}px/s</span><button onClick={()=>setZoom(z=>Math.min(100,z+5))} title="Ampliar zoom"><ZoomIn size={15}/></button></div></div>
   <div className="timeline-scroll"><div className="timeline-body" style={{width:`max(100%, ${Math.max(1,total)*zoom+100}px)`}}><div className="playline" style={{left:`${96+playhead*zoom}px`}}/><div className="ruler"><div className="tracklabel">TEMPO</div><div className="ruler-scale" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setPlaying(false);setPlayhead(Math.max(0,Math.min(total,(e.clientX-r.left)/zoom)))}}>{Array.from({length:Math.floor(total/5)+1},(_,i)=><span key={i} style={{left:`${i*5*zoom}px`}}>{seconds(i*5)}</span>)}<div className="ruler-cursor" style={{left:`${playhead*zoom}px`}}/></div></div>
   <div className="track"><div className="tracklabel"><Film size={15}/> VÍDEO</div><div className="trackclips" style={{width:`${Math.max(total*zoom,1)}px`}}>{items.map(it=>{const c=it.clip,i=it.index;return <div key={c.id} className={'segment '+(selected===c.id?'active':'')} draggable onDragStart={e=>{setDragging(c.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();reorder(e.dataTransfer.getData('text/plain')||dragging||'',c.id);setDragging(null)}} onDragEnd={()=>setDragging(null)} style={{left:`${it.start*zoom}px`,width:`${Math.max(6,it.len*zoom)}px`,zIndex:i+1,backgroundImage:c.thumbnail?`linear-gradient(0deg,#0c2339ee,#10263d55),url("${c.thumbnail}")`:undefined}} onClick={()=>{setSelected(c.id);setPlaying(false);setPlayhead(it.start)}}>{it.tIn>0&&<i className="overlap" style={{width:`${it.tIn*zoom}px`}}/>}<GripVertical size={15}/><span>{i+1}. {c.name}</span><small>{seconds(it.len)} • {c.speed}×{c.muted?' • mudo':''}</small><span className="segicons">{c.muted&&<VolumeX size={13}/>}{c.reverse&&<Rewind size={13}/>}{hasZoom(c)&&<ZoomInIcon size={13}/>}{hasGrade(c)&&<Palette size={13}/>}</span></div>})}{items.filter(it=>it.index>0).map(it=><button key={'t'+it.clip.id} className={'tmark'+(it.tIn>0?' on':'')+(selected===it.clip.id?' sel':'')} style={{left:`${(it.start+it.tIn/2)*zoom}px`}} title={it.tIn>0?`${transitionLabel(it.clip.transition!.type)} • ${it.tIn.toFixed(1)} s`:'Corte seco — clique para adicionar transição'} onClick={e=>{e.stopPropagation();setSelected(it.clip.id);setPlaying(false);setPlayhead(it.start+it.tIn/2);setTimeout(()=>document.querySelector('.transition-panel')?.scrollIntoView({block:'nearest',behavior:'smooth'}),60)}}>{it.tIn>0?<Sparkles size={12}/>:<Plus size={12}/>}</button>)}</div></div><div className="track audio"><div className={'tracklabel alabel'+(selAudio==='video'?' sel':'')} onClick={()=>selectAudio('video')} title="Som original dos vídeos"><button className="mutebtn" onClick={e=>{e.stopPropagation();setVAudio(v=>({...v,muted:!v.muted}))}} title={vAudio.muted?'Ativar o som dos vídeos':'Silenciar os vídeos'}>{vAudio.muted?<VolumeX size={14}/>:<Volume2 size={14}/>}</button><span>SOM DOS VÍDEOS</span></div><div className="alane" style={{width:`${Math.max(total*zoom,200)}px`}}>{total>0&&<div className={'abar video'+(selAudio==='video'?' sel':'')+(vAudio.muted?' muted':'')} style={{left:0,width:`${total*zoom}px`}} onClick={()=>selectAudio('video')}><div className="aname">Som original • {Math.round(vAudio.volume*100)}%{vAudio.muted?' • mudo':''}</div><EnvelopeEditor env={vAudio.env} onChange={env=>setVAudio(v=>({...v,env}))} len={total} zoom={zoom} color="#5ab4ff"/></div>}{!total&&<span className="empty">Importe um vídeo</span>}</div></div>{laneRows.map((row,ri)=><div className="track audio" key={'arow'+ri}><div className="tracklabel" title={row.map(l=>l.name).join('\n')}><Music size={14}/> ÁUDIO {ri+1}</div><div className="alane" style={{width:`${Math.max(total*zoom,200)}px`}}>{row.map(l=>{const len=laneLen(l,total);return <div key={l.id} className={'abar music'+(selAudio===l.id?' sel':'')+(l.muted?' muted':'')} style={{left:`${l.start*zoom}px`,width:`${Math.max(12,len*zoom)}px`}} title={l.name} onClick={()=>selectAudio(l.id)}><div className="aname grab" title="Arraste para mover a faixa no tempo" onPointerDown={e=>startLaneDrag(e,l)}>{len*zoom>=44&&<button className="barmute" title={l.muted?'Ativar faixa':'Silenciar faixa'} aria-label={'Silenciar '+l.name} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();updateLane(l.id,{muted:!l.muted})}}>{l.muted?<VolumeX size={11}/>:<Volume2 size={11}/>}</button>}<span>{l.name} • {Math.round(l.volume*100)}%{l.loop?' • repete':''}</span></div><EnvelopeEditor env={l.env} onChange={env=>updateLane(l.id,{env})} len={Math.max(0.1,len)} zoom={zoom} color="#4fd1b0"/><div className="ahandle l" title="Arraste para cortar o início" onPointerDown={e=>startTrim(e,l,'l')}/>{!l.loop&&<div className="ahandle r" title="Arraste para cortar o fim" onPointerDown={e=>startTrim(e,l,'r')}/>}</div>})}</div></div>)}<div className="track titletrack"><div className="tracklabel"><Type size={15}/> TEXTOS</div><div className="texttrack" style={{width:`${Math.max(total*zoom,200)}px`}}>{titleSpans.filter(x=>x.span).map(({t,span})=><span key={t.id} className={'title-segment'+(t.clipId?' linked':'')} style={{left:span!.start*zoom,width:Math.max(30,(span!.end-span!.start)*zoom)}} title={`${seconds(span!.start)} a ${seconds(span!.end)}${t.clipId?' • vinculado ao vídeo':''}`}>{t.clipId&&<Link2 size={11}/>} {t.text}</span>)}{!texts.length&&'Nenhum texto adicionado'}</div></div></div></div></section>
  <footer><span><CheckCircle2 size={14}/> {status}</span><span>Processamento local • seus arquivos permanecem no computador</span></footer>
 </div>
}
createRoot(document.getElementById('root')!).render(<App/>);
