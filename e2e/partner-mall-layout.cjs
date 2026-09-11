const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
require('dotenv').config({path:process.env.E2E_ENV_FILE||'.env.local',quiet:true});
const base=process.env.ADMIN_BASE_URL||'http://localhost:3113';const before=process.env.LAYOUT_BEFORE==='1';
const out=path.resolve('e2e/artifacts/partner-mall/layout');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext();const p=await ctx.newPage();p.setDefaultTimeout(60000);
 const errors=[];const writes=[];const results=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/admin/**',r=>{if(r.request().method()!=='GET'){writes.push(r.request().url());return r.abort();}return r.continue();});
 try{
  await p.goto(base+'/login?redirect=/partner_malls');await p.locator('input[type=email]').fill(process.env.E2E_ADMIN_EMAIL);await p.locator('input[type=password]').fill(process.env.E2E_ADMIN_PASSWORD);await p.getByRole('button',{name:'로그인',exact:true}).click();await p.waitForURL(u=>u.pathname==='/partner_malls');
  const malls=await ctx.request.get(base+'/api/admin/partner-malls');assert(malls.ok());const mallId=process.env.E2E_MALL_ID||(await malls.json()).data.find(m=>m.partner_mall_products?.length)?.id;assert(mallId);
  for(const size of [{width:1920,height:1080},{width:1440,height:900},{width:1280,height:720},{width:390,height:844}]){
   await p.setViewportSize(size);await p.goto(base+'/partner_malls/'+mallId);
   await p.getByRole('button',{name:'제품 추가',exact:true}).waitFor();await p.evaluate(()=>window.scrollTo(0,600));
   await p.getByRole('button',{name:'제품 추가',exact:true}).click();const dialog=p.getByRole('dialog',{name:'파트너몰 상품 추가',exact:true});
   await dialog.getByRole('button',{name:'다음',exact:true}).waitFor();
   await dialog.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
   await p.screenshot({path:path.join(out,`${before?'before':'after'}-add-${size.width}.png`)});
   const metrics=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,viewport:{w:innerWidth,h:innerHeight},bodyOverflow:getComputedStyle(document.body).overflow,scrolls:[...el.querySelectorAll('*')].filter(e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1).map(e=>({tag:e.tagName,classes:e.className})),wide:document.documentElement.scrollWidth>innerWidth};});
   results.push({size,metrics});
   if(!before){assert(metrics.x>=0&&metrics.y>=0&&metrics.right<=size.width+1&&metrics.bottom<=size.height+1);assert.equal(metrics.wide,false);assert.equal(metrics.bodyOverflow,'hidden');assert.equal(metrics.scrolls.length,1,'Only the dialog content scrolls');
    const footer=await dialog.locator('footer').boundingBox();const scroll=dialog.locator('[data-mall-scroll]');
    await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);await p.screenshot({path:path.join(out,`after-add-bottom-${size.width}.png`)});
    assert.deepEqual(await dialog.locator('footer').boundingBox(),footer);assert(await dialog.getByRole('button',{name:'다음',exact:true}).isVisible());
    await dialog.getByRole('button',{name:'다음',exact:true}).click();await dialog.getByText('2 /',{exact:false}).waitFor();
    assert(await scroll.evaluate(e=>e.scrollTop<32),'Pagination returns to the first row');
    await dialog.getByRole('button',{name:'취소',exact:true}).focus();await p.keyboard.press('Tab');
    assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'닫기','Keyboard focus stays in the modal when save is disabled');
   }
   await dialog.getByRole('button',{name:'닫기',exact:true}).click();
   if(!before)assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'visible');
  }
  if(!before){
   await p.setViewportSize({width:1440,height:900});await p.goto(base+'/partner_malls');const designResponse=p.waitForResponse(r=>r.url().includes('/api/admin/designs?limit=12&page=1&search=')&&r.status()===200);await p.getByRole('button',{name:'파트너몰 생성',exact:true}).click();
   const creator=p.getByRole('dialog',{name:'파트너몰 생성',exact:true});await creator.getByRole('button',{name:'다음',exact:true}).waitFor();
   await p.screenshot({path:path.join(out,'after-creator.png')});
   const designs=(await (await designResponse).json()).data;
   const design=designs.find(d=>d.product_id&&d.title&&Object.keys(d.canvas_state||{}).length===4);assert(design);
   await creator.getByRole('button').filter({has:p.getByText(design.title,{exact:true})}).first().click();await p.getByText('4개 면 준비 완료',{exact:true}).waitFor();
   assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');
   await p.screenshot({path:path.join(out,'after-editor.png')});
   await p.getByRole('button',{name:'편집 완료',exact:true}).click();await creator.getByRole('heading',{name:'진열할 상품 1개'}).waitFor();
   assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'hidden','Closing nested editor retains scroll lock');
   await p.screenshot({path:path.join(out,'after-draft.png')});
   await creator.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'visible');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);fs.writeFileSync(path.join(out,before?'before.json':'after.json'),JSON.stringify({base,results,errors,writes},null,2));console.log('Layout audit passed:',base);
 }catch(e){await p.screenshot({path:path.join(out,'failure.png')});throw e;}finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
