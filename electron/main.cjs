const {app,BrowserWindow,dialog,ipcMain,protocol,net}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');

protocol.registerSchemesAsPrivileged([{scheme:'media',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}]);
const allowedFiles=new Set();
let win;
function allowFile(p){const normalized=path.resolve(p);allowedFiles.add(normalized);return {path:normalized,url:`media://local/${encodeURIComponent(normalized)}`};}
function ffExe(name){return name; /* FFmpeg e FFprobe devem estar no PATH do Windows */}
function execute(bin,args,onProgress){return new Promise((resolve,reject)=>{
  const proc=spawn(ffExe(bin),args,{windowsHide:true});let log='';
  proc.stderr.on('data',part=>{const str=String(part);log=(log+str).slice(-12000);if(onProgress)onProgress(str);});
  proc.on('error',err=>reject(new Error(`${bin} não encontrado ou não pôde iniciar. Instale FFmpeg e inclua no PATH. ${err.message}`)));
  proc.on('close',code=>code===0?resolve(log):reject(new Error(`${bin} retornou ${code}: ${log.slice(-3000)}`)));
});}
async function probe(file){return await new Promise((resolve,reject)=>{
 const p=spawn(ffExe('ffprobe'),['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file],{windowsHide:true});let buf='',err='';
 p.stdout.on('data',x=>buf+=x);p.stderr.on('data',x=>err+=x);
 p.on('error',e=>reject(new Error('FFprobe não encontrado no PATH: '+e.message)));
 p.on('close',c=>{if(c!==0)return reject(new Error(err));try{const j=JSON.parse(buf);resolve({duration:Number(j.format?.duration)||0,hasAudio:j.streams?.some(s=>s.codec_type==='audio')||false});}catch(e){reject(e)}});
});}
function normalizeProject(input){
 if(!input||!Array.isArray(input.clips)||!input.clips.length||input.clips.length>150)throw Error('Projeto sem vídeos ou com quantidade inválida.');
 let clips=input.clips.map(c=>{
  if(typeof c.path!=='string'||!allowedFiles.has(path.resolve(c.path)))throw Error('Arquivo de vídeo não autorizado: importe-o novamente.');
  const start=Number(c.start),end=Number(c.end),speed=Number(c.speed);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(speed)||start<0||end<=start||speed<0.25||speed>4)throw Error('Intervalo ou velocidade inválidos.');
  return {path:path.resolve(c.path),start,end,speed};
 });
 const texts=Array.isArray(input.texts)?input.texts.slice(0,30).map(t=>({text:String(t.text||'').slice(0,180),start:Number(t.start),end:Number(t.end),size:Math.min(100,Math.max(12,Number(t.size)||40))})).filter(t=>t.text&&Number.isFinite(t.start)&&Number.isFinite(t.end)&&t.end>t.start):[];
 const musicPath=typeof input.music==='string'?input.music:input.music?.path;
 const music=typeof musicPath==='string'&&allowedFiles.has(path.resolve(musicPath))?path.resolve(musicPath):null;
 return {clips,texts,music};
}
function escapeDrawText(str){return str.replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/%/g,'\\%').replace(/,/g,'\\,').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/\r?\n/g,' ');}
async function render(project,output,progress){
 const data=normalizeProject(project);const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eden-render-'));
 const send=s=>{progress(s);};
 try{
  let paths=[];
  for(let i=0;i<data.clips.length;i++){
   const c=data.clips[i],info=await probe(c.path);
   if(c.end>info.duration+0.15)throw Error(`O corte da cena ${i+1} ultrapassa a duração do arquivo.`);
   const segment=path.join(temp,`clip-${String(i).padStart(3,'0')}.mp4`);
   const length=c.end-c.start,finalLength=length/c.speed;
   const speedFilter=c.speed===1?'anull':makeAtempo(c.speed);
   const args=['-y','-ss',String(c.start),'-t',String(length),'-i',c.path];
   if(!info.hasAudio)args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
   args.push('-map','0:v:0','-map',info.hasAudio?'0:a:0':'1:a:0',
      '-vf',`setpts=(PTS-STARTPTS)/${c.speed},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p`,
      '-af',info.hasAudio?`${speedFilter},aresample=48000`:'anull',
      '-t',String(finalLength),'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',segment);
   send(`Preparando cena ${i+1}/${data.clips.length}...`);
   await execute('ffmpeg',args);
   paths.push(segment);
  }
  const list=path.join(temp,'list.txt');fs.writeFileSync(list,paths.map(p=>`file '${p.replace(/'/g,"'\\''")}'`).join('\n'),'utf8');
  const joined=path.join(temp,'joined.mp4');
  send('Unindo cenas...');
  await execute('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy',joined]);
  const filters=[];
  const font='C\\:/Windows/Fonts/arial.ttf';
  for(const t of data.texts){
   filters.push(`drawtext=fontfile='${font}':text='${escapeDrawText(t.text)}':fontsize=${t.size}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.80:enable='between(t,${t.start},${t.end})'`);
  }
  const args=['-y','-i',joined];if(data.music)args.push('-stream_loop','-1','-i',data.music);
  if(filters.length)args.push('-vf',filters.join(','));
  if(data.music){args.push('-filter_complex','[0:a:0]volume=0.85[original];[1:a:0]volume=0.22[music];[original][music]amix=inputs=2:duration=first:dropout_transition=0[a]','-map','0:v:0','-map','[a]');}
  else args.push('-map','0:v:0','-map','0:a:0');
  args.push('-c:v',filters.length?'libx264':'copy');
  if(filters.length)args.push('-preset','veryfast','-crf','23','-pix_fmt','yuv420p');
  args.push('-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',output);
  send('Finalizando vídeo MP4...');await execute('ffmpeg',args);
  send('Exportação concluída.');return output;
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function makeAtempo(speed){const filters=[];let s=speed;while(s>2){filters.push('atempo=2');s/=2;}while(s<0.5){filters.push('atempo=0.5');s*=2;}filters.push(`atempo=${s}`);return filters.join(',');}
app.whenReady().then(()=>{
 protocol.handle('media',request=>{
  const u=new URL(request.url);const file=path.resolve(decodeURIComponent(u.pathname.slice(1)));
  if(u.hostname!=='local'||!allowedFiles.has(file))return new Response('Não autorizado',{status:403});
  return net.fetch(pathToFileURL(file).toString());
 });
 win=new BrowserWindow({width:1480,height:900,minWidth:1050,minHeight:690,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 if(!app.isPackaged)win.loadURL('http://127.0.0.1:5173');else win.loadFile(path.join(__dirname,'../dist/index.html'));
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
ipcMain.handle('choose-videos',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'Vídeos',extensions:['mp4','mov','mkv','webm','avi','m4v']}]});if(r.canceled)return [];const files=[];for(const p of r.filePaths){try{const info=await probe(p);if(info.duration>0)files.push({...allowFile(p),duration:info.duration,name:path.basename(p)})}catch(e){dialog.showErrorBox('Erro ao importar',`${p}\n${e.message}`)}}return files;});
ipcMain.handle('choose-audio',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Áudios',extensions:['mp3','wav','m4a','aac','flac','ogg']}]});return r.canceled?null:{...allowFile(r.filePaths[0]),name:path.basename(r.filePaths[0])};});
ipcMain.handle('save-project',async(_event,project)=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Meu projeto.eden.json',filters:[{name:'Projeto Eden',extensions:['json']}]});if(r.canceled)return null;fs.writeFileSync(r.filePath,JSON.stringify(project,null,2),'utf8');return r.filePath;});
ipcMain.handle('open-project',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Projeto Eden',extensions:['json']}]});if(r.canceled)return null;const j=JSON.parse(fs.readFileSync(r.filePaths[0],'utf8'));if(!Array.isArray(j.clips)||j.clips.length>150)throw Error('Arquivo de projeto inválido.');const clips=[];for(const c of j.clips){if(!fs.existsSync(c.path))throw Error('Vídeo não encontrado: '+c.path);const info=await probe(c.path);clips.push({...c,...allowFile(c.path),duration:info.duration,name:path.basename(c.path)});}let music=null;const savedMusic=typeof j.music==='string'?j.music:j.music?.path; if(savedMusic&&fs.existsSync(savedMusic))music={...allowFile(savedMusic),name:path.basename(savedMusic)};return {clips,texts:Array.isArray(j.texts)?j.texts:[],music};});
let busy=false;
ipcMain.handle('export-video',async(event,project)=>{if(busy)throw Error('Já existe uma exportação em andamento.');const r=await dialog.showSaveDialog(win,{defaultPath:'video-final.mp4',filters:[{name:'Vídeo MP4',extensions:['mp4']}]});if(r.canceled)return null;busy=true;try{return await render(project,r.filePath,message=>event.sender.send('export-progress',message));}finally{busy=false;}});
