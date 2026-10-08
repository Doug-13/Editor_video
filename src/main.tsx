import React, {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Clapperboard,FolderOpen,Save,Film,Music,Plus,Trash2,ChevronLeft,ChevronRight,Play,Pause,Download,Type,Scissors,CheckCircle2,ZoomIn,ZoomOut,GripVertical,Sparkles} from 'lucide-react';
import './style.css';

type Clip={path:string;url:string;name:string;duration:number;start:number;end:number;speed:number;id:string;thumbnail?:string;transition?:Transition};
type TransitionType='fade'|'fadeblack'|'fadewhite'|'slideleft'|'slideright'|'slideup'|'slidedown'|'wipeleft'|'wiperight'|'wipeup'|'wipedown'|'circleopen'|'circleclose';
type Transition={type:TransitionType;duration:number};
type MusicFile={path:string;url:string;name:string}|null;
type Title={id:string;text:string;start:number;end:number;size:number};
type Project={clips:Clip[];music:MusicFile;texts:Title[]};
declare global {interface Window {editor:{chooseVideos:()=>Promise<Omit<Clip,'start'|'end'|'speed'|'id'>[]>;chooseAudio:()=>Promise<MusicFile>;saveProject:(p:Project)=>Promise<string|null>;openProject:()=>Promise<Project|null>;exportVideo:(p:Project)=>Promise<string|null>;makeProxy:(path:string)=>Promise<{path:string;url:string}>;onProgress:(f:(text:string)=>void)=>()=>void}}}
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
function App(){
 const [clips,setClips]=useState<Clip[]>([]),[music,setMusic]=useState<MusicFile>(null),[texts,setTexts]=useState<Title[]>([]);
 const [mediaError,setMediaError]=useState(''); const [zoom,setZoom]=useState(20),[dragging,setDragging]=useState<string|null>(null); const [selected,setSelected]=useState<string|null>(null),[playhead,setPlayhead]=useState(0),[playing,setPlaying]=useState(false),[status,setStatus]=useState('Pronto para começar'),[exporting,setExporting]=useState(false);
 const vids=useRef(new Map<string,HTMLVideoElement>()),stageRef=useRef<HTMLDivElement>(null);
 const playingRef=useRef(false),totalRef=useRef(0),itemsRef=useRef<Item[]>([]),tRef=useRef(0),wasPlaying=useRef(false),lastDuration=useRef(1);
 const {items,total}=useMemo(()=>buildLayout(clips),[clips]);
 // "current" = clipe sob o cursor (em transição, o que está entrando); usado por Dividir.
 const current=useMemo(()=>{const last=items.length-1;const act=items.filter(it=>isActive(it,playhead,last));const it=act[act.length-1];return it?{clip:it.clip,offset:it.start,local:Math.max(0,playhead-it.start)}:null},[items,playhead]);
 const selectedClip=clips.find(c=>c.id===selected)||null;
 const selectedItem=items.find(it=>it.clip.id===selected)||null;
 // Prévia leve (proxy 540p, GOP curto) gerada pelo FFmpeg; a exportação continua usando os arquivos originais.
 const [proxies,setProxies]=useState<Record<string,{state:'pending'|'ready'|'failed';url?:string}>>({});const proxyAsked=useRef(new Set<string>());
 const proxyList=Object.values(proxies),proxyPending=proxyList.filter(p=>p.state==='pending').length,proxyDone=proxyList.length-proxyPending;
 const urlOf=(c:Clip)=>proxies[c.path]?.state==='ready'?proxies[c.path].url!:c.url;
 // Um <video> por clipe visível ou prestes a entrar: o próximo já fica carregado e posicionado, então a emenda não pisca.
 const rendered=items.filter(it=>it.end>playhead-0.05&&it.start<playhead+LOOKAHEAD);
 const activeTitles=texts.filter(t=>playhead>=t.start&&playhead<=t.end);
 useEffect(()=>window.editor.onProgress(setStatus),[]);
 useEffect(()=>{if(playing)setMediaError('')},[playing]);
 useEffect(()=>{if(playhead>total)setPlayhead(total)},[total]);
 useEffect(()=>{if(playing&&playhead>=total){setPlaying(false)}},[playhead,total,playing]);
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
  for(const [id,v] of vids.current){
   const it=list.find(x=>x.clip.id===id);if(!it)continue;
   const active=isActive(it,t,last);
   const f=!active?HIDDEN:tr&&it===tr.out?fx!.out:tr&&it===tr.inc?fx!.inn:SOLO;
   const st=v.style;st.opacity=String(f.opacity);st.transform=f.transform;st.clipPath=f.clip;st.zIndex=String(f.z);
   st.setProperty('mask-image',f.mask);st.setProperty('-webkit-mask-image',f.mask);
   v.volume=Math.min(1,Math.max(0,f.volume));
   if(v.readyState<1)continue;
   const c=it.clip,want=Math.min(c.end,Math.max(c.start,active?c.start+(t-it.start)*c.speed:c.start));
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
 }
 useLayoutEffect(()=>{playingRef.current=playing;totalRef.current=total;itemsRef.current=items;
  if(!playing||!wasPlaying.current)tRef.current=Math.min(playhead,total);wasPlaying.current=playing;
  applyLayout(tRef.current)});
 // Relógio da reprodução: o vídeo mais antigo sob o cursor dita o tempo (nunca retrocede). A troca de clipe é detectada a
 // cada quadro; a interface (contador, régua) é atualizada ~20x/s.
 useEffect(()=>{if(!playing)return;let raf=0,last=0;
  const tick=(now:number)=>{raf=requestAnimationFrame(tick);
   const list=itemsRef.current;if(!list.length)return;
   let t=tRef.current;const m=list.find(it=>isActive(it,t,list.length-1)),v=m?vids.current.get(m.clip.id):undefined;
   if(m&&v&&!v.seeking&&v.readyState>=2){
    const tm=m.start+(v.currentTime-m.clip.start)/m.clip.speed;
    if(v.ended||tm>=m.end-0.02){
     if(m.index===list.length-1){tRef.current=totalRef.current;applyLayout(tRef.current);setPlaying(false);setPlayhead(totalRef.current);return}
     t=m.end+0.001;last=0;
    }else if(tm>t)t=tm;
   }
   tRef.current=t;applyLayout(t);
   if(now-last>=50){last=now;setPlayhead(Math.min(totalRef.current,t))}};
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)},[playing]);
 function setTransition(id:string,tr:Transition|undefined){setClips(a=>a.map(c=>c.id===id?{...c,transition:tr}:c))}
 function chooseTransition(id:string,value:string){if(value==='none'){setTransition(id,undefined);return}const old=clips.find(c=>c.id===id)?.transition;setTransition(id,{type:value as TransitionType,duration:old?.duration??lastDuration.current})}
 function changeTransitionDuration(id:string,d:number){const old=clips.find(c=>c.id===id)?.transition;if(!old||!Number.isFinite(d))return;const duration=Math.min(3,Math.max(0.2,d));lastDuration.current=duration;setTransition(id,{...old,duration})}
 function applyTransitionToAll(){const tr=selectedClip?.transition;if(!tr)return;setClips(a=>a.map((c,i)=>i===0?c:{...c,transition:{...tr}}));setStatus('Transição aplicada a todas as emendas.')}
 function testTransition(){const it=selectedItem;if(!it||it.tIn<=0||proxyPending>0)return;const from=Math.max(0,it.start-1);setMediaError('');tRef.current=from;setPlayhead(from);setPlaying(true)}
 function ensureProxies(paths:string[]){for(const path of new Set(paths)){if(proxyAsked.current.has(path))continue;proxyAsked.current.add(path);setPlaying(false);
   setProxies(a=>({...a,[path]:{state:'pending'}}));
   window.editor.makeProxy(path).then(r=>setProxies(a=>({...a,[path]:{state:'ready',url:r.url}}))).catch(e=>{console.error(e);setStatus('Não foi possível otimizar a prévia de um vídeo; será usado o arquivo original.');setProxies(a=>({...a,[path]:{state:'failed'}}))})}}
 async function importClips(){try{const input=await window.editor.chooseVideos();const more=input.map(c=>({...c,start:0,end:c.duration,speed:1,id:uid()}));setClips(a=>[...a,...more]);ensureProxies(more.map(c=>c.path));if(more.length&&!selected)setSelected(more[0].id);setStatus(`${more.length} vídeo(s) importado(s).`)}catch(e){alert(String(e))}}
 async function importMusic(){try{const f=await window.editor.chooseAudio();if(f)setMusic(f)}catch(e){alert(String(e))}}
 function changeClip(change:Partial<Clip>){if(!selected)return;setClips(a=>a.map(c=>c.id===selected?{...c,...change}:c));setPlaying(false);setPlayhead(0)}
 function reorder(fromId:string,toId:string){if(fromId===toId)return;setClips(old=>{const result=[...old];const from=result.findIndex(x=>x.id===fromId),to=result.findIndex(x=>x.id===toId);if(from<0||to<0)return old;const [item]=result.splice(from,1);result.splice(to,0,item);return result});setPlaying(false);setPlayhead(0)}
 function splitAtPlayhead(){const c=current?.clip;if(!c)return;const sourceTime=c.start+current!.local*c.speed;if(sourceTime<=c.start+0.1||sourceTime>=c.end-0.1){setStatus('Posicione a cabeça de reprodução dentro do clipe.');return}const second={...c,id:uid(),start:sourceTime,transition:undefined};setClips(old=>old.flatMap(x=>x.id===c.id?[{...x,end:sourceTime},second]:[x]));setSelected(second.id);setPlaying(false);setStatus('Clipe dividido em dois.');}
 function move(index:number,d:number){const next=[...clips],to=index+d;if(to<0||to>=next.length)return;[next[index],next[to]]=[next[to],next[index]];setClips(next);setPlayhead(0);setPlaying(false)}
 const project=():Project=>({clips,music,texts});
 async function save(){try{const p=await window.editor.saveProject(project());if(p)setStatus('Projeto salvo: '+p)}catch(e){alert(String(e))}}
 async function open(){try{const p=await window.editor.openProject();if(!p)return;setClips(p.clips.map(c=>({...c,id:c.id||uid()})));ensureProxies(p.clips.map(c=>c.path));setMusic(p.music);setTexts((p.texts||[]).map(t=>({...t,id:t.id||uid()})));setSelected(p.clips[0]?.id||null);setPlayhead(0);setPlaying(false);setStatus('Projeto aberto.')}catch(e){alert(String(e))}}
 async function exportMovie(){if(!clips.length)return;setPlaying(false);setExporting(true);try{const p=await window.editor.exportVideo(project());if(p)setStatus('Exportado: '+p);else setStatus('Exportação cancelada.')}catch(e){setStatus('Erro na exportação');alert(String(e))}finally{setExporting(false)}}
 return <div className="app">
  <header><div className="brand"><Clapperboard size={25}/><div><strong>EDEN <span>VIDEO EDITOR</span></strong><small>Studio • v0.3.0</small></div></div><div className="toolbar"><button onClick={open}><FolderOpen size={17}/> Abrir projeto</button><button onClick={save}><Save size={17}/> Salvar</button><button className="primary" onClick={exportMovie} disabled={!clips.length||exporting}><Download size={17}/>{exporting?'Exportando...':'Exportar MP4'}</button></div></header>
  <section className="workspace">
   <aside className="library"><div className="section-title"><Film size={17}/> Biblioteca</div><button className="add" onClick={importClips}><Plus size={17}/> Importar vídeos</button><button className="add secondary" onClick={importMusic}><Music size={17}/> Adicionar música</button><div className="library-items">{clips.map((c,i)=><div key={c.id} className={'asset '+(selected===c.id?'chosen':'')} onClick={()=>setSelected(c.id)}><Film size={18}/><span title={c.path}>{i+1}. {c.name}<small>{seconds(c.duration)}</small></span></div>)}{music&&<div className="asset music"><Music size={18}/><span title={music.path}>{music.name}<small>Trilha de fundo</small></span><button title="Remover música" onClick={()=>setMusic(null)}><Trash2 size={14}/></button></div>}{!clips.length&&<p className="hint">Importe arquivos para montar sua primeira sequência.</p>}</div></aside>
   <main className="center"><div className="section-title">Pré-visualização <span>1280 × 720 • 16:9</span></div><div className="preview-shell"><div className="preview">{current?<><div className="stage" ref={stageRef}>{rendered.map(it=>{const url=urlOf(it.clip);return <video key={it.clip.id+'|'+url} ref={el=>{if(el)vids.current.set(it.clip.id,el);else vids.current.delete(it.clip.id)}} src={url} preload="auto" playsInline onLoadedMetadata={()=>applyLayout(tRef.current)} onLoadedData={()=>applyLayout(tRef.current)} onError={e=>{const v=e.currentTarget;setMediaError('Falha na leitura do arquivo (código '+(v.error?.code||'?')+'). Verifique o formato e tente novamente.');setPlaying(false)}}/>})}</div>{mediaError&&<div className="media-error">{mediaError}</div>}<div className="titles">{activeTitles.map(t=><div key={t.id} style={{fontSize:`${Math.min(44,t.size*.75)}px`}}>{t.text}</div>)}</div>{proxyPending>0&&<div className="optimizing"><strong>Otimizando a prévia para reprodução fluida…</strong><span>{proxyDone} de {proxyList.length} vídeos prontos • a exportação usa a qualidade original</span></div>}</>:<div className="empty"><Clapperboard size={48}/><h2>Seu próximo vídeo começa aqui</h2><p>Importe clipes para visualizar a edição.</p></div>}</div></div><div className="transport"><button disabled={!clips.length} onClick={()=>{setPlaying(false);setPlayhead(0)}}><ChevronLeft size={18}/></button><button className="play" disabled={!clips.length||proxyPending>0} title={proxyPending>0?'Aguarde a otimização da prévia':'Reproduzir / pausar'} onClick={()=>{if(playhead>=total-0.01){tRef.current=0;setPlayhead(0);setPlaying(true)}else setPlaying(!playing)}}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><button disabled={!clips.length} onClick={()=>{setPlaying(false);setPlayhead(total)}}><ChevronRight size={18}/></button><strong>{seconds(playhead)} <span>/ {seconds(total)}</span></strong></div></main>
   <aside className="inspector"><div className="section-title"><Scissors size={17}/> Propriedades</div>{selectedClip?<div className="fields"><label>Vídeo selecionado<strong title={selectedClip.path}>{selectedClip.name}</strong></label><label>Início do corte (segundos)<input type="number" min="0" max={Math.max(0,selectedClip.end-0.1)} step="0.1" value={selectedClip.start} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<selectedClip.end)changeClip({start:n})}}/></label><label>Fim do corte (segundos)<input type="number" min={selectedClip.start+0.1} max={selectedClip.duration} step="0.1" value={selectedClip.end} onChange={e=>{const n=Number(e.target.value);if(n>selectedClip.start&&n<=selectedClip.duration)changeClip({end:n})}}/></label><label>Velocidade<select value={selectedClip.speed} onChange={e=>changeClip({speed:Number(e.target.value)})}>{[0.25,0.5,0.75,1,1.25,1.5,2,3,4].map(x=><option key={x} value={x}>{x}×</option>)}</select><input aria-label="Velocidade personalizada" type="number" min="0.25" max="4" step="0.05" value={selectedClip.speed} onChange={e=>{const n=Number(e.target.value);if(n>=0.25&&n<=4)changeClip({speed:n})}}/></label><div className="notice">Duração na sequência: {seconds(length(selectedClip))}</div><button className="danger" onClick={()=>{setClips(a=>a.filter(c=>c.id!==selected));setSelected(null);setPlaying(false);setPlayhead(0)}}><Trash2 size={16}/> Remover clipe</button></div>:<p className="hint">Selecione um clipe para editar seus cortes e velocidade.</p>}{selectedClip&&selectedItem&&(selectedItem.index===0?<p className="hint">A primeira cena não tem transição de entrada.</p>:<div className="transition-panel"><div className="divider"/><div className="section-title"><Sparkles size={17}/> Transição de entrada</div><p className="hint">Entre “{clips[selectedItem.index-1].name}” e este clipe.</p><div className="fields"><label>Efeito<select aria-label="Efeito de transição" value={selectedClip.transition?.type||'none'} onChange={e=>chooseTransition(selectedClip.id,e.target.value)}><option value="none">Corte seco (sem transição)</option>{TRANSITION_GROUPS.map(g=><optgroup key={g.group} label={g.group}>{g.items.map(i=><option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}</select></label>{selectedClip.transition&&<><label>Duração: {selectedClip.transition.duration.toFixed(1)} s<input aria-label="Duração da transição" type="range" min="0.2" max="3" step="0.1" value={selectedClip.transition.duration} onChange={e=>changeTransitionDuration(selectedClip.id,Number(e.target.value))}/></label>{selectedItem.tIn<selectedClip.transition.duration-0.05&&<div className="notice">Limitada a {selectedItem.tIn.toFixed(1)} s: cada cena precisa durar pelo menos o dobro da transição.</div>}<div className="two"><button onClick={testTransition} disabled={proxyPending>0||selectedItem.tIn<=0} title="Reproduz desde 1 s antes da emenda"><Play size={14}/> Testar</button><button onClick={applyTransitionToAll} title="Usa este efeito e duração em todas as emendas">Aplicar a todas</button></div><p className="hint">A transição sobrepõe as duas cenas; o vídeo final fica {selectedItem.tIn.toFixed(1)} s mais curto.</p></>}</div></div>)}
   <div className="divider"/><div className="section-title"><Type size={17}/> Textos</div><button className="add" onClick={()=>setTexts(t=>[...t,{id:uid(),text:'Novo título',start:Math.min(playhead,total),end:Math.min(total,playhead+4)>playhead?Math.min(total,playhead+4):playhead+4,size:40}])} disabled={!clips.length}><Plus size={16}/> Inserir texto</button><div className="text-items">{texts.map(t=><div className="text-edit" key={t.id}><input aria-label="Texto" value={t.text} maxLength={180} onChange={e=>setTexts(a=>a.map(x=>x.id===t.id?{...x,text:e.target.value}:x))}/><div className="two"><label>Início<input type="number" min="0" step="0.1" value={t.start} onChange={e=>setTexts(a=>a.map(x=>x.id===t.id?{...x,start:Number(e.target.value)}:x))}/></label><label>Fim<input type="number" min="0" step="0.1" value={t.end} onChange={e=>setTexts(a=>a.map(x=>x.id===t.id?{...x,end:Number(e.target.value)}:x))}/></label></div><div className="two"><label>Tamanho<input type="number" min="12" max="100" value={t.size} onChange={e=>setTexts(a=>a.map(x=>x.id===t.id?{...x,size:Number(e.target.value)}:x))}/></label><button onClick={()=>setTexts(a=>a.filter(x=>x.id!==t.id))} title="Remover"><Trash2 size={16}/></button></div></div>)}</div></aside>
  </section>
  <section className="timeline"><div className="timeline-head"><div className="section-title">Linha do tempo <span>Arraste clipes para reorganizar • arraste a régua para navegar</span></div><div className="timeline-tools"><button title="Dividir no cursor" onClick={splitAtPlayhead} disabled={!current}><Scissors size={15}/> Dividir</button><button onClick={()=>setZoom(z=>Math.max(8,z-5))} title="Reduzir zoom"><ZoomOut size={15}/></button><span>{zoom}px/s</span><button onClick={()=>setZoom(z=>Math.min(100,z+5))} title="Ampliar zoom"><ZoomIn size={15}/></button></div></div>
   <div className="timeline-scroll"><div className="timeline-body" style={{width:`max(100%, ${Math.max(1,total)*zoom+100}px)`}}><div className="ruler"><div className="tracklabel">TEMPO</div><div className="ruler-scale" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setPlaying(false);setPlayhead(Math.max(0,Math.min(total,(e.clientX-r.left)/zoom)))}}>{Array.from({length:Math.floor(total/5)+1},(_,i)=><span key={i} style={{left:`${i*5*zoom}px`}}>{seconds(i*5)}</span>)}<div className="ruler-cursor" style={{left:`${playhead*zoom}px`}}/></div></div>
   <div className="track"><div className="tracklabel"><Film size={15}/> VÍDEO</div><div className="trackclips" style={{width:`${Math.max(total*zoom,1)}px`}}>{items.map(it=>{const c=it.clip,i=it.index;return <div key={c.id} className={'segment '+(selected===c.id?'active':'')} draggable onDragStart={e=>{setDragging(c.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();reorder(e.dataTransfer.getData('text/plain')||dragging||'',c.id);setDragging(null)}} onDragEnd={()=>setDragging(null)} style={{left:`${it.start*zoom}px`,width:`${Math.max(6,it.len*zoom)}px`,zIndex:i+1,backgroundImage:c.thumbnail?`linear-gradient(0deg,#0c2339ee,#10263d55),url("${c.thumbnail}")`:undefined}} onClick={()=>{setSelected(c.id);setPlaying(false);setPlayhead(it.start)}}>{it.tIn>0&&<i className="overlap" style={{width:`${it.tIn*zoom}px`}}/>}<GripVertical size={15}/><span>{i+1}. {c.name}</span><small>{seconds(it.len)} • {c.speed}×</small></div>})}{items.filter(it=>it.index>0).map(it=><button key={'t'+it.clip.id} className={'tmark'+(it.tIn>0?' on':'')+(selected===it.clip.id?' sel':'')} style={{left:`${(it.start+it.tIn/2)*zoom}px`}} title={it.tIn>0?`${transitionLabel(it.clip.transition!.type)} • ${it.tIn.toFixed(1)} s`:'Corte seco — clique para adicionar transição'} onClick={e=>{e.stopPropagation();setSelected(it.clip.id);setPlaying(false);setPlayhead(it.start+it.tIn/2);setTimeout(()=>document.querySelector('.transition-panel')?.scrollIntoView({block:'nearest',behavior:'smooth'}),60)}}>{it.tIn>0?<Sparkles size={12}/>:<Plus size={12}/>}</button>)}</div></div><div className="track audio"><div className="tracklabel"><Music size={15}/> ÁUDIO</div><div className="musictrack" style={{width:`${Math.max(total*zoom,200)}px`}}>{music?<><Music size={15}/>{music.name} <span>música de fundo</span></>:<span>Nenhuma música adicionada</span>}</div></div><div className="track titletrack"><div className="tracklabel"><Type size={15}/> TEXTOS</div><div className="texttrack" style={{width:`${Math.max(total*zoom,200)}px`}}>{texts.map(x=><span key={x.id} className="title-segment" style={{left:x.start*zoom,width:Math.max(30,(x.end-x.start)*zoom)}} title={`${seconds(x.start)} a ${seconds(x.end)}`}>{x.text}</span>)}{!texts.length&&'Nenhum texto adicionado'}</div></div></div></div></section>
  <footer><span><CheckCircle2 size={14}/> {status}</span><span>Processamento local • seus arquivos permanecem no computador</span></footer>
 </div>
}
createRoot(document.getElementById('root')!).render(<App/>);
