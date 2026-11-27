const { chromium }=require('playwright');
const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
(async()=>{
  const exe=path.join(process.env.USERPROFILE||'','AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe');
  const browser=await chromium.launch({headless:true,executablePath:fs.existsSync(exe)?exe:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(pathToFileURL(path.join(__dirname,'template_scene.html')).href);
  await page.waitForFunction(()=>window.__pipelineStatus?.ready);await page.waitForTimeout(500);
  const status=await page.evaluate(()=>window.__pipelineStatus);
  await page.screenshot({path:path.join(__dirname,'pipeline_preview.png')});await browser.close();
  console.log(JSON.stringify({pass:errors.length===0&&status.glErrors.length===0,errors,status},null,2));
  if(errors.length||status.glErrors.length)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
