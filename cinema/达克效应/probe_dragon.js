const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const commonJS = fs.readFileSync(path.join(__dirname, 'scenes', 'common.js'), 'utf8');
  const exe = path.join(process.env.USERPROFILE, 'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe');
  const b = await chromium.launch({ headless: true, executablePath: fs.existsSync(exe) ? exe : undefined,
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
  const p = await b.newPage({ viewport: { width: 1900, height: 1080 } });
  p.on('pageerror', e => console.error('PAGEERROR:', e.message));
  const html = `<!DOCTYPE html><html><body style='margin:0'>
  <canvas id="c" width="1920" height="1080"></canvas>
  <script>${commonJS}</script>
  <script>
  const c=document.getElementById('c'); const s=c.getContext('2d');
  DK.attach(s); Object.assign(DK.CAM,{x:0,y:0,z:-4,focal:300,pitch:0,yaw:0});
  s.fillStyle='#2a2030'; s.fillRect(0,0,1920,1080);
  DK.billboard(0,0,0,2.4,()=>{ DK.drawDragon({style:'facet',fill:'#e8732c',fill2:'#d96a22',fill3:'#f4a054',
    out:'rgba(60,10,0,1)', rim:null, spikeGold:'rgba(255,216,150,1)', spikeHide:false, eye:0, t:0.4}); });
  window.__d=c.toDataURL('image/png'); window.__done=true;
  </script></body></html>`;
  await p.setContent(html);
  await p.waitForFunction('window.__done===true');
  const data = await p.evaluate(() => window.__d);
  fs.writeFileSync('testsnap/probe_dragon.png', Buffer.from(data.split(',')[1], 'base64'));

  const res = await p.evaluate(async () => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = window.__d; });
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
    const x=cv.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0);
    const d=x.getImageData(0,0,cv.width,cv.height).data, W=cv.width, Hh=cv.height;
    let minX=1e9,maxX=-1,minY=1e9,maxY=-1;
    for(let y=0;y<Hh;y++)for(let xx=0;xx<W;xx++){const i=(y*W+xx)*4,R=d[i],G=d[i+1]; if(R>110&&R>G*1.45){minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
    const isO=(xx,yy)=>{if(xx<0||yy<0||xx>=W||yy>=Hh)return false;const i=(yy*W+xx)*4,R=d[i],G=d[i+1];return R>110&&R>G*1.45;}
    const seams=[];
    for(let y=minY+1;y<maxY-1;y++)for(let xx=minX+1;xx<maxX-1;xx++){
      const i=(y*W+xx)*4,R=d[i],G=d[i+1],B=d[i+2];
      if(!(R<95&&G<95&&B<95))continue;
      if(isO(xx-2,y)&&isO(xx+2,y)&&isO(xx,y-2)&&isO(xx,y+2)) seams.push([xx,y]);
    }
    if(seams.length===0) return {bbox:[minX,minY,maxX,maxY], seams:0, map:''};
    const gw=Math.ceil((maxX-minX)/10), gh=Math.ceil((maxY-minY)/10);
    const grid=new Array(gh).fill(0).map(()=>new Array(gw).fill(' '));
    for(const [x,y] of seams){ grid[Math.floor((y-minY)/10)][Math.floor((x-minX)/10)]='#'; }
    return {bbox:[minX,minY,maxX,maxY], seams:seams.length, map:grid.map(r=>r.join('')).join('\n')};
  });
  console.log('bbox '+JSON.stringify(res.bbox)+'  内部缝像素='+res.seams);
  if(res.map) console.log('--- 内部缝分布(一格=10px,左上为龙顶) ---\n'+res.map);
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});