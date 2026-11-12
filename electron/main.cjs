const {app,BrowserWindow,dialog,ipcMain,protocol}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {Readable}=require('node:stream');
const crypto=require('node:crypto');

// A prévia usa cópias leves (540p): a decodificação por software é rápida e evita o limite de decodificadores de hardware do Windows
// (causa de erros de decodificação em sequências longas). Defina EDEN_HW_DECODE=1 para reativar o hardware.
if(!process.env.EDEN_HW_DECODE)app.commandLine.appendSwitch('disable-accelerated-video-decode');
protocol.registerSchemesAsPrivileged([{scheme:'media',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true,corsEnabled:true}}]);
const allowedFiles=new Set();
let win;
function allowFile(p){const normalized=path.resolve(p);allowedFiles.add(normalized);return {path:normalized,url:`media://local/${encodeURIComponent(normalized)}`};}
function ffExe(name){return name; /* FFmpeg e FFprobe devem estar no PATH do Windows */}
const procs=new Set();
function execute(bin,args,onProgress,cwd){return new Promise((resolve,reject)=>{
  const proc=spawn(ffExe(bin),args,{windowsHide:true,cwd});procs.add(proc);proc.on('close',()=>procs.delete(proc));let log='';
  proc.stderr.on('data',part=>{const str=String(part);log=(log+str).slice(-12000);if(onProgress)onProgress(str);});
  proc.on('error',err=>reject(new Error(`${bin} não encontrado ou não pôde iniciar. Instale FFmpeg e inclua no PATH. ${err.message}`)));
  proc.on('close',code=>code===0?resolve(log):reject(new Error(`${bin} retornou ${code}:\n${log.split(/\r?\n/).filter(l=>l.trim()).slice(-8).join('\n').slice(-1500)}`)));
});}
async function probe(file){return await new Promise((resolve,reject)=>{
 const p=spawn(ffExe('ffprobe'),['-v','error','-show_entries','format=duration:stream=codec_type,width,height:stream_side_data=rotation:stream_tags=rotate','-of','json',file],{windowsHide:true});let buf='',err='';
 p.stdout.on('data',x=>buf+=x);p.stderr.on('data',x=>err+=x);
 p.on('error',e=>reject(new Error('FFprobe não encontrado no PATH: '+e.message)));
 p.on('close',c=>{if(c!==0)return reject(new Error(err));try{const j=JSON.parse(buf);const v=j.streams?.find(s=>s.codec_type==='video'),rot=Math.abs(Number(v?.side_data_list?.find(d=>d.rotation!==undefined)?.rotation??v?.tags?.rotate??0))%360,swap=rot===90||rot===270;
    resolve({duration:Number(j.format?.duration)||0,hasAudio:j.streams?.some(s=>s.codec_type==='audio')||false,width:(swap?v?.height:v?.width)||0,height:(swap?v?.width:v?.height)||0});}catch(e){reject(e)}});
});}
// ---- Proxies de prévia ----
// Vídeos de celular/câmera (4K, HEVC, 60 fps, GOP longo) são pesados demais para o <video> do Chromium, principalmente ao
// fazer seek (trocar de clipe, dividir, clicar na régua). Geramos uma cópia leve (540p, 30 fps, keyframe a cada 12 quadros)
// só para a pré-visualização. A exportação continua usando os arquivos originais.
const PROXY_VERSION='v1';
const proxyDir=()=>path.join(app.getPath('userData'),'proxies');
let proxyQueue=Promise.resolve();
function cleanOldProxies(){try{const dir=proxyDir();if(!fs.existsSync(dir))return;const limit=Date.now()-30*24*3600*1000;for(const f of fs.readdirSync(dir)){const full=path.join(dir,f);try{if(f.endsWith('.part.mp4')||fs.statSync(full).mtimeMs<limit)fs.rmSync(full,{force:true})}catch{}}}catch{}}
function makeProxy(file){
 const run=async()=>{
  const st=await fs.promises.stat(file);
  const key=crypto.createHash('sha1').update(`${PROXY_VERSION}|${file}|${st.size}|${st.mtimeMs}`).digest('hex');
  fs.mkdirSync(proxyDir(),{recursive:true});
  const out=path.join(proxyDir(),key+'.mp4');
  if(!fs.existsSync(out)){
   const tmp=path.join(proxyDir(),key+'.part.mp4');
   try{
    await execute('ffmpeg',['-y','-i',file,'-map','0:v:0','-map','0:a:0?',
     '-vf','scale=w=960:h=540:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,format=yuv420p',
     '-c:v','libx264','-preset','ultrafast','-tune','fastdecode','-crf','28','-g','12','-keyint_min','12','-sc_threshold','0',
     '-c:a','aac','-b:a','96k','-ac','2','-movflags','+faststart','-f','mp4',tmp]);
    fs.renameSync(tmp,out);
   }catch(e){fs.rmSync(tmp,{force:true});throw e;}
  }
  return allowFile(out);
 };
 const job=proxyQueue.then(run);   // um proxy por vez, para não disputar CPU com a prévia
 proxyQueue=job.catch(()=>{});
 return job;
}
const clampNum=(x,d,lo,hi)=>{x=Number(x);return Number.isFinite(x)?Math.min(hi,Math.max(lo,x)):d};
// curva de volume: pontos {t (s, relativo ao início da faixa), v (0..1)} ordenados e sem tempos repetidos
function cleanEnv(env){
 if(!Array.isArray(env))return [];
 const pts=env.slice(0,64).map(p=>({t:Number(p?.t),v:Number(p?.v)})).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v)&&p.t>=0&&p.t<=36000).map(p=>({t:p.t,v:Math.min(1,Math.max(0,p.v))})).sort((a,b)=>a.t-b.t);
 return pts.filter((p,i)=>i===0||p.t-pts[i-1].t>=0.001);
}
const TRANSITIONS=new Set(['fade','fadeblack','fadewhite','slideleft','slideright','slideup','slidedown','wipeleft','wiperight','wipeup','wipedown','circleopen','circleclose']);
function normalizeProject(input){
 if(!input||!Array.isArray(input.clips)||!input.clips.length||input.clips.length>150)throw Error('Projeto sem vídeos ou com quantidade inválida.');
 let clips=input.clips.map(c=>{
  if(typeof c.path!=='string'||!allowedFiles.has(path.resolve(c.path)))throw Error('Arquivo de vídeo não autorizado: importe-o novamente.');
  const start=Number(c.start),end=Number(c.end),speed=Number(c.speed);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(speed)||start<0||end<=start||speed<0.25||speed>4)throw Error('Intervalo ou velocidade inválidos.');
  const td=Number(c.transition?.duration);
  const transition=c.transition&&TRANSITIONS.has(c.transition.type)&&Number.isFinite(td)&&td>=0.1?{type:c.transition.type,duration:Math.min(3,td)}:null;
  return {path:path.resolve(c.path),start,end,speed,transition,muted:!!c.muted,reverse:!!c.reverse,
   volume:clampNum(c.volume,1,0,2),zoom:clampNum(c.zoom,1,1,4),zoomEnd:c.zoomEnd==null?null:clampNum(c.zoomEnd,1,1,4),
   panX:clampNum(c.panX,0,-1,1),panY:clampNum(c.panY,0,-1,1),
   cB:clampNum(c.cB,0,-100,100),cC:clampNum(c.cC,0,-100,100),cS:clampNum(c.cS,0,-100,100),cT:clampNum(c.cT,0,-100,100),cF:clampNum(c.cF,0,0,100),
   fit:['fit','fill','blur'].includes(c.fit)?c.fit:'fit',fillX:clampNum(c.fillX,0,-1,1),fillY:clampNum(c.fillY,0,-1,1),fillYEnd:c.fillYEnd==null?null:clampNum(c.fillYEnd,0,-1,1)};
 });
 const HEX=/^#[0-9a-f]{6}$/i,hex=(v,d)=>typeof v==='string'&&HEX.test(v)?v.toLowerCase():d;
 const texts=Array.isArray(input.texts)?input.texts.slice(0,60).map(t=>{const r=t&&typeof t.render==='object'&&t.render?t.render:{};return {
   text:String(t.text||'').replace(/[\r\n]+/g,' ').slice(0,180),start:Number(t.start),end:Number(t.end),size:Math.round(clampNum(t.size,40,8,200)),
   fontFile:typeof r.fontFile==='string'&&/^[\w.-]+\.(ttf|otf|ttc)$/i.test(r.fontFile)?r.fontFile:'arial.ttf',
   color:hex(r.color,'#ffffff'),opacity:clampNum(r.opacity,1,0,1),outline:Math.round(clampNum(r.outline,3,0,20)),outlineColor:hex(r.outlineColor,'#000000'),shadow:!!r.shadow,
   box:!!r.box,boxColor:hex(r.boxColor,'#000000'),boxOpacity:clampNum(r.boxOpacity,0.6,0,1),boxPad:Math.round(clampNum(r.boxPad,10,0,100)),
   align:['left','center','right'].includes(r.align)?r.align:'center',px:clampNum(r.px,640,0,1280),py:clampNum(r.py,590,0,720)};
  }).filter(t=>t.text.trim()&&Number.isFinite(t.start)&&Number.isFinite(t.end)&&t.end>t.start):[];
 const audio=[];
 for(const l of (Array.isArray(input.audio)?input.audio.slice(0,16):[])){
  const ap=typeof l?.path==='string'?path.resolve(l.path):null;
  if(!ap||!allowedFiles.has(ap))continue;
  audio.push({path:ap,start:clampNum(l.start,0,0,36000),offset:clampNum(l.offset,0,0,36000),fileEnd:l.fileEnd==null?null:clampNum(l.fileEnd,0,0,36000),loop:!!l.loop,volume:clampNum(l.volume,1,0,2),muted:!!l.muted,env:cleanEnv(l.env)});
 }
 const va=input.videoAudio||{};
 const videoAudio={volume:clampNum(va.volume,1,0,2),muted:!!va.muted,env:cleanEnv(va.env)};
 return {clips,texts,audio,videoAudio};
}
// Fontes do Windows (sistema e instaladas só para o usuário). Sem a fonte pedida, usa Arial.
function findFont(file){
 const dirs=[path.join(process.env.WINDIR||'C:\\Windows','Fonts'),process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Microsoft','Windows','Fonts'):null].filter(Boolean);
 for(const name of [file,'arial.ttf'])for(const d of dirs){const f=path.join(d,name);if(fs.existsSync(f))return f;}
 return null;
}
const ffColor=(hex,a)=>`0x${hex.slice(1)}@${Math.max(0,Math.min(1,a)).toFixed(3)}`;
// O texto e a fonte são copiados para a pasta temporária e referenciados por nome relativo (o FFmpeg roda nessa pasta):
// assim nenhum caractere do texto ou do caminho (aspas, dois-pontos, %, vírgula, apóstrofo no nome do usuário…) precisa de escape.
// A posição (px, py = centro vertical, já com o empilhamento de textos simultâneos) vem calculada pelo editor, igual à prévia.
function textFilters(texts,temp){
 const filters=[],fonts=new Map();
 texts.forEach((t,i)=>{
  let font=fonts.get(t.fontFile);
  if(!font){const src=findFont(t.fontFile);if(!src)throw new Error('Nenhuma fonte encontrada em C:\\Windows\\Fonts (nem Arial).');font=`font${fonts.size}${path.extname(src).toLowerCase()}`;fs.copyFileSync(src,path.join(temp,font));fonts.set(t.fontFile,font);}
  const tf=`text${i}.txt`;fs.writeFileSync(path.join(temp,tf),t.text,'utf8');
  const pad=t.box?t.boxPad:0,X=t.px.toFixed(1),Y=t.py.toFixed(1);
  const x=t.align==='left'?`${X}+${pad}`:t.align==='right'?`${X}-text_w-${pad}`:`${X}-text_w/2`;
  let f=`drawtext=fontfile=${font}:textfile=${tf}:expansion=none:fontsize=${t.size}:fontcolor=${ffColor(t.color,t.opacity)}`;
  if(t.outline>0)f+=`:borderw=${t.outline}:bordercolor=${ffColor(t.outlineColor,t.opacity)}`;
  if(t.shadow)f+=`:shadowx=3:shadowy=3:shadowcolor=${ffColor('#000000',0.6*t.opacity)}`;
  if(t.box)f+=`:box=1:boxcolor=${ffColor(t.boxColor,t.boxOpacity)}:boxborderw=${pad}`;
  f+=`:x='${x}':y='${Y}-text_h/2':enable='between(t,${t.start.toFixed(3)},${t.end.toFixed(3)})'`;
  filters.push(f);
 });
 return filters;
}
// Cenas ligadas por transição formam um "grupo" que é combinado com xfade (vídeo) + acrossfade (áudio); as emendas sem
// transição continuam sendo cortes secos. Os grupos são depois concatenados sem recodificar. A transição sobrepõe o fim da
// cena anterior ao início da seguinte, exatamente como na linha do tempo do editor.
// ---- Mixagem de áudio ----
// Volume = ganho fixo da faixa × curva (pontos em segundos relativos ao início da faixa). A expressão do FFmpeg é linear por
// partes e avaliada por quadro, em tempo absoluto da linha do tempo (a faixa é atrasada com adelay antes do volume).
function volumeExpr(gain,env,shift){
 const pts=env.map(p=>({t:p.t+shift,v:p.v}));
 if(!pts.length)return gain.toFixed(4);
 let e=pts[pts.length-1].v.toFixed(4);
 for(let i=pts.length-2;i>=0;i--){const a=pts[i],b=pts[i+1];e=`if(lt(t,${b.t.toFixed(3)}),${a.v.toFixed(4)}+(${(b.v-a.v).toFixed(4)})*(t-${a.t.toFixed(3)})/${(b.t-a.t).toFixed(3)},${e})`;}
 return `${gain.toFixed(4)}*if(lt(t,${pts[0].t.toFixed(3)}),${pts[0].v.toFixed(4)},${e})`;
}
let amixHasNormalize=null;
async function amixSupportsNormalize(){
 if(amixHasNormalize!==null)return amixHasNormalize;
 amixHasNormalize=await new Promise(resolve=>{let out='';const p=spawn(ffExe('ffmpeg'),['-hide_banner','-h','filter=amix'],{windowsHide:true});p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('error',()=>resolve(false));p.on('close',()=>resolve(/\bnormalize\b/.test(out)));});
 return amixHasNormalize;
}
async function buildAudioMix(data,temp,send){
 const va=data.videoAudio,lanes=data.audio.filter(l=>!l.muted&&l.volume>0);
 const neutral=!lanes.length&&!va.muted&&va.volume===1&&!va.env.length;
 if(neutral)return {inputs:[],graph:null,label:null};
 const fmt='aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
 const inputs=[],parts=[],labels=[];
 const vg=va.muted?0:va.volume;
 parts.push(`[0:a:0]${fmt},volume='${volumeExpr(vg,va.env,0)}':eval=frame:precision=float[v0]`);labels.push('[v0]');
 if(lanes.length)send('Mixando as faixas de áudio...');
 for(let i=0;i<lanes.length;i++){
  const l=lanes[i];let src=l.path;
  const info=await probe(l.path);const fileEnd=Math.min(info.duration,l.fileEnd==null?info.duration:l.fileEnd);const span=Math.max(0.05,fileEnd-l.offset);
  if(l.loop&&l.offset>0.01){ // -stream_loop ignora -ss: extrai o trecho e repete o trecho
   src=path.join(temp,`loop-${i}.wav`);
   await execute('ffmpeg',['-y','-ss',String(l.offset),'-t',String(span),'-i',l.path,'-vn','-c:a','pcm_s16le','-ar','48000','-ac','2',src]);
   inputs.push(['-stream_loop','-1','-i',src]);
  }else if(l.loop&&(l.fileEnd==null||fileEnd>=info.duration-0.01))inputs.push(['-stream_loop','-1','-i',src]);
  else if(l.loop){   // ciclo de repetição menor que o arquivo
   src=path.join(temp,`loop-${i}.wav`);
   await execute('ffmpeg',['-y','-ss',String(l.offset),'-t',String(span),'-i',l.path,'-vn','-c:a','pcm_s16le','-ar','48000','-ac','2',src]);
   inputs.push(['-stream_loop','-1','-i',src]);
  }else inputs.push(l.offset>0.01||fileEnd<info.duration-0.01?['-ss',String(l.offset),'-t',String(span),'-i',src]:['-i',src]);
  const delay=Math.round(l.start*1000);
  const chain=[fmt];if(delay>0)chain.push(`adelay=${delay}|${delay}`);
  chain.push(`volume='${volumeExpr(l.volume,l.env,l.start)}':eval=frame:precision=float`);
  const label=`[l${i}]`;parts.push(`[${i+1}:a:0]${chain.join(',')}${label}`);labels.push(label);
 }
 const n=labels.length;
 if(n>1){
  const norm=await amixSupportsNormalize();
  parts.push(`${labels.join('')}amix=inputs=${n}:duration=first:dropout_transition=0${norm?':normalize=0':''}[mixed]`);
  parts.push(norm?'[mixed]alimiter=limit=0.97[a]':`[mixed]volume=${n},alimiter=limit=0.97[a]`);
 }else parts.push(`${labels[0]}alimiter=limit=0.97[a]`);
 return {inputs,graph:parts.join(';'),label:'[a]'};
}
async function buildGroups(data,paths,durs,temp,send){
 const groups=[];let cur=[0];
 for(let i=1;i<paths.length;i++){if(data.clips[i].transition)cur.push(i);else{groups.push(cur);cur=[i]}}
 groups.push(cur);
 const finals=[];
 for(let g=0;g<groups.length;g++){
  const idx=groups[g];
  if(idx.length===1){finals.push(paths[idx[0]]);continue;}
  send(`Aplicando transições (${g+1}/${groups.length})...`);
  const args=['-y'],parts=[];
  idx.forEach((i,k)=>{args.push('-i',paths[i]);parts.push(`[${k}:v]fps=30,settb=AVTB,setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v${k}]`);});
  let vLabel='[v0]',aLabel='[0:a]',acc=durs[idx[0]];
  for(let k=1;k<idx.length;k++){
   const i=idx[k],tr=data.clips[i].transition;
   const d=Math.max(0.05,Math.min(tr.duration,durs[idx[k-1]]/2,durs[i]/2));
   const offset=Math.max(0,acc-d);
   parts.push(`${vLabel}[v${k}]xfade=transition=${tr.type}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}[vx${k}]`);
   parts.push(`${aLabel}[${k}:a]acrossfade=d=${d.toFixed(3)}[ax${k}]`);
   vLabel=`[vx${k}]`;aLabel=`[ax${k}]`;acc=acc+durs[i]-d;
  }
  const out=path.join(temp,`group-${String(g).padStart(3,'0')}.mp4`);
  args.push('-filter_complex',parts.join(';'),'-map',vLabel,'-map',aLabel,'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-r','30','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',out);
  await execute('ffmpeg',args);
  finals.push(out);
 }
 return finals;
}
// Inverte [start,end] do arquivo (vídeo e áudio). O filtro `reverse` guarda todos os quadros na memória, então o trecho é
// invertido em pedaços de `chunk` segundos, e os pedaços são concatenados em ordem inversa.
async function reverseRange({input,start,end,out,maxW,maxH,chunk,crf,preset,gop,finalCrf}){
 const info=await probe(input),total=Math.max(0.1,end-start),n=Math.max(1,Math.ceil(total/chunk)),parts=[];
 try{
  for(let k=0;k<n;k++){
   const a=start+k*chunk,d=Math.min(chunk,end-a);if(d<=0.001)continue;
   const part=`${out}.part${k}.mp4`;
   const vf=[maxW?`scale=w=${maxW}:h=${maxH}:force_original_aspect_ratio=decrease:force_divisible_by=2`:null,'fps=30','format=yuv420p','reverse'].filter(Boolean).join(',');
   const args=['-y','-ss',String(a),'-t',String(d),'-i',input,'-vf',vf];
   if(info.hasAudio)args.push('-af','areverse','-c:a','aac','-b:a','128k','-ar','48000','-ac','2');else args.push('-an');
   args.push('-c:v','libx264','-preset',preset,'-crf',String(crf),'-pix_fmt','yuv420p');
   if(gop)args.push('-g',String(gop),'-keyint_min',String(gop),'-sc_threshold','0','-tune','fastdecode');
   args.push('-movflags','+faststart',part);
   await execute('ffmpeg',args);parts.unshift(part);   // último pedaço primeiro
  }
  const list=`${out}.list.txt`;fs.writeFileSync(list,parts.map(f=>`file '${f.replace(/\\/g,'/').replace(/'/g,"'\\''")}'`).join('\n'),'utf8');
  if(finalCrf!=null){   // prévia: uma única recodificação deixa o arquivo idêntico em estrutura a uma cópia leve normal
   const a=['-y','-f','concat','-safe','0','-i',list,'-c:v','libx264','-preset','ultrafast','-crf',String(finalCrf),'-pix_fmt','yuv420p','-r','30','-g','12','-keyint_min','12','-sc_threshold','0','-tune','fastdecode'];
   if(info.hasAudio)a.push('-c:a','aac','-b:a','128k','-ar','48000','-ac','2');else a.push('-an');
   a.push('-movflags','+faststart',out);await execute('ffmpeg',a);
  }else await execute('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',out]);
  fs.rmSync(list,{force:true});
 }finally{for(const f of parts)fs.rmSync(f,{force:true});}
}
// Zoom do clipe sobre o quadro 1280x720 (equivale ao transform da prévia). Estático: scale+crop (exato).
// Animado: zoompan, com pré-ampliação 2x para reduzir o tremor. O pan vai de -1 (borda) a +1 (borda oposta).
function zoomFilter(c,L){
 const z0=c.zoom,z1=c.zoomEnd==null?c.zoom:c.zoomEnd;
 if(Math.abs(z0-1)<0.001&&Math.abs(z1-1)<0.001)return '';
 const px=(0.5+0.5*c.panX).toFixed(4),py=(0.5+0.5*c.panY).toFixed(4);
 if(Math.abs(z1-z0)<0.001)return `scale=w=trunc(1280*${z0.toFixed(4)}/2)*2:h=trunc(720*${z0.toFixed(4)}/2)*2:flags=bicubic,crop=1280:720:x='(iw-1280)*${px}':y='(ih-720)*${py}'`;
 const frames=Math.max(2,Math.round(L*30));
 return `scale=2560:1440:flags=bicubic,zoompan=z='${z0.toFixed(4)}+(${(z1-z0).toFixed(4)})*min(1,on/${frames})':x='(iw-iw/zoom)*${px}':y='(ih-ih/zoom)*${py}':d=1:s=1280x720:fps=30`;
}
// Correção de cor (a MESMA conta é usada na prévia, em src/main.tsx):
//   1) por canal, uma transformação linear:  saída = inclinação_canal × entrada + deslocamento  (brilho × contraste × temperatura × desbotado)
//   2) matriz de saturação igual à do CSS `saturate()`.
// Brilho multiplica; contraste gira em torno do cinza médio; temperatura empurra R para cima e B para baixo; desbotado levanta os pretos.
function gradeParams(c){
 const B=c.cB||0,C=c.cC||0,S=c.cS||0,T=c.cT||0,F=c.cF||0;
 if(!B&&!C&&!S&&!T&&!F)return null;
 const b=1+B*0.005,k=1+C*0.006,sat=1+S/100,f=F/100,base=1-0.12*f,tr=1+T*0.0015,tb=1-T*0.0015;
 return {slope:[base*k*b*tr,base*k*b,base*k*b*tb],icp:base*(0.5-0.5*k)+0.10*f,sat,
  m:[[0.213+0.787*sat,0.715-0.715*sat,0.072-0.072*sat],[0.213-0.213*sat,0.715+0.285*sat,0.072-0.072*sat],[0.213-0.213*sat,0.715-0.715*sat,0.072+0.928*sat]]};
}
function gradeFilter(c){
 const g=gradeParams(c);if(!g)return '';
 const lut=i=>`'clip(val*${g.slope[i].toFixed(5)}+${g.icp.toFixed(5)}*maxval,minval,maxval)'`;
 let f=`lutrgb=r=${lut(0)}:g=${lut(1)}:b=${lut(2)}`;
 if(Math.abs(g.sat-1)>1e-6){const m=g.m.map(r=>r.map(x=>x.toFixed(5)));f+=`,colorchannelmixer=rr=${m[0][0]}:rg=${m[0][1]}:rb=${m[0][2]}:gr=${m[1][0]}:gg=${m[1][1]}:gb=${m[1][2]}:br=${m[2][0]}:bg=${m[2][1]}:bb=${m[2][2]}`}
 return f;
}
async function render(project,output,progress){
 const data=normalizeProject(project);const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eden-render-'));
 const send=s=>{progress(s);};
 try{
  let paths=[],durs=[];
  for(let i=0;i<data.clips.length;i++){
   const c=data.clips[i];let info=await probe(c.path);
   if(c.end>info.duration+0.15)throw Error(`O corte da cena ${i+1} ultrapassa a duração do arquivo.`);
   const segment=path.join(temp,`clip-${String(i).padStart(3,'0')}.mp4`);
   let src=c.path,cStart=c.start,cEnd=c.end;
   if(c.reverse){   // inverte o trecho primeiro; depois a cena segue o fluxo normal (velocidade, zoom, volume)
    send(`Invertendo cena ${i+1}/${data.clips.length}...`);
    src=path.join(temp,`rev-${i}.mp4`);
    await reverseRange({input:c.path,start:c.start,end:Math.min(c.end,info.duration),out:src,maxW:1280,maxH:720,chunk:5,crf:14,preset:'veryfast'});
    cStart=0;cEnd=Math.min(c.end,info.duration)-c.start;info=await probe(src);
   }
   const length=cEnd-cStart,finalLength=length/c.speed;
   const speedFilter=c.speed===1?'anull':makeAtempo(c.speed);
   const gain=c.muted?0:c.volume;
   const zoom=zoomFilter(c,finalLength);
   // Enquadramento no quadro 1280x720: ajustar (barras), preencher (recorta; a janela pode varrer em Y) ou fundo desfocado.
   const post=[gradeFilter(c),zoom].filter(Boolean),base=`setpts=(PTS-STARTPTS)/${c.speed}`,tail=`${post.length?post.join(',')+',':''}fps=30,setsar=1,format=yuv420p`;
   const fx=(0.5+0.5*c.fillX).toFixed(4),fy0=0.5+0.5*c.fillY,fy1=c.fillYEnd==null?fy0:0.5+0.5*c.fillYEnd;
   const fyExpr=Math.abs(fy1-fy0)<0.0005?fy0.toFixed(4):`(${fy0.toFixed(4)}+(${(fy1-fy0).toFixed(4)})*min(1,t/${Math.max(0.05,finalLength).toFixed(3)}))`;
   let videoArgs;
   if(c.fit==='blur'){
    // fundo: o mesmo vídeo preenchendo o quadro com 14% de ampliação (igual à prévia, que assim esconde a borda do desfoque), reduzido (4x) para desfocar rápido e escurecido; primeiro plano: vídeo inteiro
    videoArgs=['-filter_complex',`[0:v]${base},split=2[a][b];[a]scale=320:180:force_original_aspect_ratio=increase,crop=280:158,gblur=sigma=6.5:steps=2,scale=1280:720:flags=bicubic,colorchannelmixer=rr=0.65:gg=0.65:bb=0.65[bg];[b]scale=1280:720:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}[v]`,'-map','[v]'];
   }else if(c.fit==='fill'){
    videoArgs=['-vf',`${base},scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720:x='(iw-1280)*${fx}':y='(ih-720)*${fyExpr}',${tail}`,'-map','0:v:0'];
   }else{
    videoArgs=['-vf',`${base},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,${tail}`,'-map','0:v:0'];
   }
   const args=['-y','-ss',String(cStart),'-t',String(length),'-i',src];
   if(!info.hasAudio)args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
   args.push(...videoArgs,'-map',info.hasAudio?'0:a:0':'1:a:0',
      '-af',info.hasAudio?`${speedFilter},aresample=48000${gain!==1?`,volume=${gain.toFixed(4)}`:''}`:'anull',
      '-t',String(finalLength),'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',segment);
   send(`Preparando cena ${i+1}/${data.clips.length}...`);
   await execute('ffmpeg',args);
   paths.push(segment);durs.push((await probe(segment)).duration);
  }
  const finals=await buildGroups(data,paths,durs,temp,send);
  const list=path.join(temp,'list.txt');fs.writeFileSync(list,finals.map(p=>`file '${p.replace(/'/g,"'\\''")}'`).join('\n'),'utf8');
  const joined=path.join(temp,'joined.mp4');
  send('Unindo cenas...');
  await execute('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy',joined]);
  const filters=textFilters(data.texts,temp);
  const args=['-y','-i',joined];
  const mix=await buildAudioMix(data,temp,send);
  for(const inp of mix.inputs)args.push(...inp);   // todas as entradas (-i) primeiro...
  if(filters.length)args.push('-vf',filters.join(','));   // ...só então as opções de saída (-vf, -map, -c:v), senão o FFmpeg as aplica à última entrada
  if(mix.graph)args.push('-filter_complex',mix.graph,'-map','0:v:0','-map',mix.label);
  else args.push('-map','0:v:0','-map','0:a:0');
  args.push('-c:v',filters.length?'libx264':'copy');
  if(filters.length)args.push('-preset','veryfast','-crf','23','-pix_fmt','yuv420p');
  args.push('-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',output);
  send('Finalizando vídeo MP4...');await execute('ffmpeg',args,null,temp);
  send('Exportação concluída.');return output;
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function makeAtempo(speed){const filters=[];let s=speed;while(s>2){filters.push('atempo=2');s/=2;}while(s<0.5){filters.push('atempo=0.5');s*=2;}filters.push(`atempo=${s}`);return filters.join(',');}
app.whenReady().then(()=>{
 cleanOldProxies();
 protocol.handle('media',async request=>{
  const u=new URL(request.url);
  const file=path.resolve(decodeURIComponent(u.pathname.slice(1)));
  const inProxies=file.startsWith(proxyDir()+path.sep)&&/\.mp4$/i.test(file);   // pasta de cópias geradas pelo app
  if(u.hostname!=='local'||(!allowedFiles.has(file)&&!inProxies)){console.warn('media://: acesso negado a',file);return new Response('Não autorizado',{status:403});}
  let size;
  try { size=(await fs.promises.stat(file)).size; }
  catch { return new Response('Arquivo não encontrado',{status:404}); }
  const mime={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.flac':'audio/flac'}[path.extname(file).toLowerCase()]||'application/octet-stream';
  const common={'Content-Type':mime,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=0','Access-Control-Allow-Origin':'*'};
  const header=request.headers.get('range');
  let start=0,end=size-1,status=200;
  if(header){
    const m=/^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if(!m)return new Response(null,{status:416,headers:{...common,'Content-Range':`bytes */${size}`}});
    if(!m[1]&&!m[2])return new Response(null,{status:416,headers:{...common,'Content-Range':`bytes */${size}`}});
    if(!m[1]){const tail=Number(m[2]);start=Math.max(0,size-tail);}
    else {start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
    if(start>=size||start>end||!Number.isSafeInteger(start)||!Number.isSafeInteger(end))return new Response(null,{status:416,headers:{...common,'Content-Range':`bytes */${size}`}});
    status=206;
  }
  const headers={...common,'Content-Length':String(end-start+1)};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  if(request.method==='HEAD')return new Response(null,{status,headers});
  const stream=fs.createReadStream(file,{start,end,highWaterMark:1024*1024});
  return new Response(Readable.toWeb(stream),{status,headers});
 });
 win=new BrowserWindow({width:1480,height:900,minWidth:1050,minHeight:690,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 // O modo de desenvolvimento e explicito; 'npm start' usa o build local mesmo com Electron nao empacotado.
 const devMode=process.argv.includes('--dev')||process.env.EDEN_DEV==='1';
 if(devMode){
  win.loadURL('http://127.0.0.1:5173').catch(err=>console.error('Falha ao carregar servidor Vite:',err));
 }else{
  const html=path.join(__dirname,'../dist/index.html');
  if(!fs.existsSync(html)){
   dialog.showErrorBox('Eden Video Editor','Arquivo dist/index.html nao encontrado. Execute npm run build antes de iniciar.');
  }else{
   win.loadFile(html).catch(err=>console.error('Falha ao carregar interface compilada:',err));
  }
 }
});
app.on('before-quit',()=>{for(const p of procs){try{p.kill()}catch{}}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
ipcMain.handle('choose-videos',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'Vídeos',extensions:['mp4','mov','mkv','webm','avi','m4v']}]});if(r.canceled)return [];const files=[];for(const p of r.filePaths){try{const info=await probe(p);if(info.duration>0)files.push({...allowFile(p),duration:info.duration,width:info.width,height:info.height,name:path.basename(p)})}catch(e){dialog.showErrorBox('Erro ao importar',`${p}\n${e.message}`)}}return files;});
ipcMain.handle('choose-audio',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'Áudios',extensions:['mp3','wav','m4a','aac','flac','ogg','opus']}]});if(r.canceled)return [];const out=[];for(const f of r.filePaths.slice(0,16)){const info=await probe(f);out.push({...allowFile(f),name:path.basename(f),duration:info.duration});}return out;});
ipcMain.handle('save-project',async(_event,project)=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Meu projeto.eden.json',filters:[{name:'Projeto Eden',extensions:['json']}]});if(r.canceled)return null;fs.writeFileSync(r.filePath,JSON.stringify(project,null,2),'utf8');return r.filePath;});
ipcMain.handle('open-project',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Projeto Eden',extensions:['json']}]});if(r.canceled)return null;const j=JSON.parse(fs.readFileSync(r.filePaths[0],'utf8'));if(!Array.isArray(j.clips)||j.clips.length>150)throw Error('Arquivo de projeto inválido.');const clips=[];for(const c of j.clips){if(!fs.existsSync(c.path))throw Error('Vídeo não encontrado: '+c.path);const info=await probe(c.path);clips.push({...c,...allowFile(c.path),duration:info.duration,width:info.width,height:info.height,name:path.basename(c.path)});}
 const pool=[];for(const c of (Array.isArray(j.pool)?j.pool.slice(0,150):[])){if(typeof c?.path!=='string'||!fs.existsSync(c.path))continue;try{const info=await probe(c.path);pool.push({...c,...allowFile(c.path),duration:info.duration,width:info.width,height:info.height,name:path.basename(c.path)});}catch{}}
 const audio=[];
 for(const l of (Array.isArray(j.audio)?j.audio.slice(0,16):[])){if(typeof l?.path!=='string'||!fs.existsSync(l.path))continue;const info=await probe(l.path);audio.push({...l,...allowFile(l.path),name:l.name||path.basename(l.path),duration:info.duration,env:cleanEnv(l.env),volume:clampNum(l.volume,1,0,2),start:clampNum(l.start,0,0,36000),offset:clampNum(l.offset,0,0,36000),loop:!!l.loop,muted:!!l.muted});}
 let videoAudio=j.videoAudio?{volume:clampNum(j.videoAudio.volume,1,0,2),muted:!!j.videoAudio.muted,env:cleanEnv(j.videoAudio.env)}:{volume:1,muted:false,env:[]};
 const savedMusic=typeof j.music==='string'?j.music:j.music?.path; // projetos antigos (v0.2): uma música em loop, original 85% e música 22%
 if(!j.audio&&savedMusic&&fs.existsSync(savedMusic)){const info=await probe(savedMusic);audio.push({...allowFile(savedMusic),name:path.basename(savedMusic),duration:info.duration,start:0,offset:0,loop:true,volume:0.22,muted:false,env:[]});videoAudio={volume:0.85,muted:false,env:[]};}
 return {clips,pool,texts:Array.isArray(j.texts)?j.texts:[],audio,videoAudio};});
ipcMain.handle('make-proxy',async(_event,file)=>{if(typeof file!=='string'||!allowedFiles.has(path.resolve(file)))throw Error('Arquivo de vídeo não autorizado.');return await makeProxy(path.resolve(file));});
const revQueue={p:Promise.resolve()};
ipcMain.handle('make-reversed',async(_event,file,start,end,force)=>{
 if(typeof file!=='string'||!allowedFiles.has(path.resolve(file)))throw Error('Arquivo de vídeo não autorizado.');
 const a=clampNum(start,0,0,360000),b=clampNum(end,0,0,360000);if(b-a<0.05)throw Error('Trecho muito curto para inverter.');
 const run=async()=>{
  const proxy=await makeProxy(path.resolve(file));   // inverte a cópia leve, não o arquivo original
  const st=fs.statSync(proxy.path);
  const key=crypto.createHash('sha1').update(`rev2|${proxy.path}|${st.size}|${a.toFixed(3)}|${b.toFixed(3)}`).digest('hex');
  const out=path.join(proxyDir(),force?`rev-${key}-${Date.now().toString(36)}.mp4`:`rev-${key}.mp4`);   // forçar = arquivo novo (a fonte do <video> muda e recarrega)
  if(!fs.existsSync(out)){const tmp=path.join(proxyDir(),`rev-${key}.part.mp4`);
   try{await reverseRange({input:proxy.path,start:a,end:b,out:tmp,chunk:6,crf:20,preset:'ultrafast',gop:12,finalCrf:26});fs.renameSync(tmp,out);}catch(e){fs.rmSync(tmp,{force:true});throw e;}}
  return {...allowFile(out),length:b-a};
 };
 const job=revQueue.p.then(run);revQueue.p=job.catch(()=>{});return job;
});
let busy=false;
ipcMain.handle('export-video',async(event,project)=>{if(busy)throw Error('Já existe uma exportação em andamento.');const r=await dialog.showSaveDialog(win,{defaultPath:'video-final.mp4',filters:[{name:'Vídeo MP4',extensions:['mp4']}]});if(r.canceled)return null;busy=true;try{return await render(project,r.filePath,message=>event.sender.send('export-progress',message));}finally{busy=false;}});
