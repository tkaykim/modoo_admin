const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
require('dotenv').config({path:'.env.local',quiet:true});
const base=process.env.ADMIN_BASE_URL||'http://localhost:3103';
(async()=>{
 const browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const p=await ctx.newPage();p.setDefaultTimeout(60000);
 const errors=[];const blocked=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/admin/**',r=>{ if(r.request().method()!=='GET'){blocked.push(r.request().url());return r.abort();}return r.continue();});
 try{
  await p.goto(base+'/login?redirect=/partner_malls');
  await p.locator('input[type=email]').fill(process.env.E2E_ADMIN_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_ADMIN_PASSWORD);
  await p.getByRole('button',{name:'로그인',exact:true}).click();
  await p.waitForURL(u=>u.pathname==='/partner_malls');
  const result=await ctx.request.get(base+'/api/admin/designs?limit=12&page=1');assert.equal(result.status(),200);
  const design=(await result.json()).data.find(d=>d.product_id && d.title && Object.keys(d.canvas_state||{}).length===4);
  assert(design);
  const before=(await (await ctx.request.get(`${base}/api/admin/designs/${design.id}`)).json()).data;
  await p.getByRole('button',{name:'파트너몰 생성',exact:true}).click();
  await p.getByRole('button').filter({has:p.getByText(design.title,{exact:true})}).first().click();
  await p.getByText('4개 면 준비 완료',{exact:true}).waitFor();
  await p.screenshot({path:path.resolve('e2e/artifacts/partner-mall/real-source-readonly.png')});
  await p.getByRole('button',{name:'편집 취소',exact:true}).click();
  await p.getByRole('button',{name:'닫기',exact:true}).click();
  const after=(await (await ctx.request.get(`${base}/api/admin/designs/${design.id}`)).json()).data;
  assert.deepEqual(after,before);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync('e2e/artifacts/partner-mall/real-readonly-result.json',JSON.stringify({passed:true,configuredSides:4,sourceUnchanged:true,adminWrites:0,pageErrors:errors},null,2));
  console.log('Real auth + actual saved design four-side import passed, source unchanged, no writes');
 }catch(e){await p.screenshot({path:path.resolve('e2e/artifacts/partner-mall/real-readonly-failure.png')});throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
