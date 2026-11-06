import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('./boarding-envelope/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context = await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out}});
const page = await context.newPage();
const kind=process.argv[2] || 'elevator';
const reverse=process.argv.includes('reverse');
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
if (process.argv.includes('preview')) {
  await page.goto(`http://localhost:5175/preview?devFixture&connector=${kind}`);
  await page.locator('select[aria-label="Route start"]').selectOption('motion-lab-ground::spawn');
  await page.locator('select[aria-label="Route destination"]').selectOption('motion-lab-mezzanine::spawn');
  await page.waitForTimeout(8000);
  await writeFile(`${out}/actual-preview.json`, JSON.stringify({url:page.url(),errors,text:await page.locator('body').innerText(),requests:await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/api.*draft/.test(e.name)).map(e=>e.name))},null,2));
  await page.screenshot({path:`${out}/actual-preview.png`});
  await writeFile(`${out}/${kind}-${reverse?'down':'up'}-video-path.txt`,page.video().path ? await page.video().path() : 'unavailable');
await context.close();await browser.close();process.exit(0);
}
await page.goto(`http://localhost:5175/preview?motionLab&connector=${kind}`);
await page.locator('select').nth(2).selectOption(reverse?'motion-lab-mezzanine-west-entry':'motion-lab-ground-west-entry');
await page.locator('select').nth(3).selectOption(reverse?'motion-lab-ground-west-entry':'motion-lab-mezzanine-west-entry');
await page.getByRole('button',{name:'Find route',exact:true}).click();
await page.getByRole('button',{name:'Start shared auto-walk',exact:true}).waitFor();
const ready=await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent==='Start shared auto-walk')?.disabled,{},{timeout:12000}).then(()=>true).catch(()=>false);
if(!ready){
 await writeFile(`${out}/${kind}-route-blocker.json`,JSON.stringify({url:page.url(),errors,text:await page.locator('body').innerText()},null,2));
 await page.screenshot({path:`${out}/${kind}-route-blocker.png`});
 await writeFile(`${out}/${kind}-${reverse?'down':'up'}-video-path.txt`,page.video().path ? await page.video().path() : 'unavailable');
await context.close();await browser.close();process.exit(0);
}
await page.evaluate(()=>{window.blockers=[];window.samples=[];window.addEventListener("walk-physics-sample",e=>window.samples.push(e.detail));window.addEventListener('walk-physics-blocker',e=>window.blockers.push(e.detail));});
await page.getByRole('button',{name:'Start shared auto-walk',exact:true}).click();
await page.waitForFunction(()=>/Route complete|Arrived|Connector traversal stopped|Connector route is blocked|door interlock rejected|auto-walk stopped/i.test(document.body.innerText), {}, {timeout:60000}).catch(()=>{});
await writeFile(`${out}/${kind}-${reverse?'down':'up'}.json`,JSON.stringify({url:page.url(),errors,observations:await page.evaluate(()=>({text:document.body.innerText,blockers:window.blockers,samples:window.samples}))},null,2));
await page.screenshot({path:`${out}/${kind}-${reverse?'down':'up'}.png`});
await writeFile(`${out}/${kind}-${reverse?'down':'up'}-video-path.txt`,page.video().path ? await page.video().path() : 'unavailable');
await context.close();await browser.close();

