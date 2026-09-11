/* Run only for an explicitly authorized production deployment. Creates a synthetic
 * canary mall, never an order, and deletes that exact canary after verification. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
require('dotenv').config({path:process.env.E2E_ENV_FILE||'.env.local',quiet:true});
const base=process.env.ADMIN_BASE_URL||'https://modoo-admin-gilt.vercel.app';
const customer=process.env.CUSTOMER_BASE_URL||'https://www.modoouniform.com';
const out=path.resolve('e2e/artifacts/partner-mall');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 const p=await ctx.newPage();p.setDefaultTimeout(60000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const slug='e2e-design-'+Date.now();let mallId;let cleanup=false;let deleted=false;const passed=[];
 const json=async r=>{assert(r.ok(),`API ${r.status()}: ${(await r.text()).slice(0,250)}`);return r.json();};
 const products=async()=> (await json(await ctx.request.get(base+'/api/admin/partner-malls/products?partner_mall_id='+mallId))).data;
 try {
  await p.goto(base+'/login?redirect=/partner_malls');
  await p.locator('input[type=email]').fill(process.env.E2E_ADMIN_EMAIL);await p.locator('input[type=password]').fill(process.env.E2E_ADMIN_PASSWORD);
  await p.getByRole('button',{name:'로그인',exact:true}).click();await p.waitForURL(u=>u.pathname==='/partner_malls');
  const catalog=(await json(await ctx.request.get(base+'/api/admin/products'))).data;
  const product=catalog.find(v=>v.is_active!==false&&v.configuration?.length===4&&v.size_options?.length);
  assert(product,'Active four-side product with sizes exists');
  await p.getByRole('button',{name:'파트너몰 생성',exact:true}).click();
  await p.getByLabel('파트너몰 이름',{exact:true}).fill('[E2E 검증 완료 후 비공개] 전체 면 디자인');
  await p.getByLabel('몰 주소',{exact:true}).fill(slug);
  await p.getByRole('button',{name:'새 디자인',exact:true}).click();
  await p.getByRole('button').filter({has:p.getByText(product.title,{exact:true})}).first().click();
  await p.getByText('4개 면 준비 완료',{exact:true}).waitFor();
  for(const name of ['앞면','뒷면','왼쪽','오른쪽']){await p.getByRole('button',{name,exact:true}).click();await p.getByTitle('텍스트 추가',{exact:true}).click();}
  await p.getByLabel('상품명',{exact:true}).fill('E2E 네 면 검증 상품');await p.getByLabel('판매가',{exact:true}).fill('24200');
  await p.screenshot({path:path.join(out,'production-four-sides.png')});
  await p.getByRole('button',{name:'편집 완료',exact:true}).click();
  const created=p.waitForResponse(r=>r.url()===base+'/api/admin/partner-malls'&&r.request().method()==='POST');
  await p.getByRole('button',{name:'파트너몰 저장',exact:true}).click();
  mallId=(await json(await created)).data.id;
  fs.writeFileSync(path.join(out,'production-canary.json'),JSON.stringify({mallId,slug,status:'testing'},null,2));
  await p.getByRole('dialog',{name:'파트너몰 생성',exact:true}).waitFor({state:'hidden'});
  const initial=await products();assert.equal(initial.length,1);const original=initial[0];
  assert.equal(original.price,24200);assert.equal(Object.keys(original.canvas_state).length,4);
  for(const state of Object.values(original.canvas_state))assert.equal(JSON.parse(state).objects.length,1);
  passed.push('production new mall and four-side persistence');
  await p.goto(base+'/partner_malls/'+mallId);
  const card=p.locator('.group').filter({has:p.getByText('E2E 네 면 검증 상품',{exact:true})}).last();await card.hover();await card.getByTitle('편집',{exact:true}).click();
  await p.getByText('4개 면 준비 완료',{exact:true}).waitFor();await p.getByRole('button',{name:'오른쪽',exact:true}).click();await p.getByTitle('텍스트 추가',{exact:true}).click();
  await p.getByLabel('상품명',{exact:true}).fill('E2E 별도 저장 상품');await p.getByRole('button',{name:'별도 상품으로 저장',exact:true}).click();
  await p.getByRole('dialog',{name:'파트너몰 전체 면 편집'}).waitFor({state:'hidden'});
  let stored=await products();assert.equal(stored.length,2);assert.deepEqual(stored.find(v=>v.id===original.id),original);
  const copy=stored.find(v=>v.id!==original.id);assert.equal(JSON.parse(copy.canvas_state.right).objects.length,2);
  passed.push('production independent copy and original unchanged');
  await p.reload();await p.setViewportSize({width:390,height:844});
  const copyCard=p.locator('.group').filter({has:p.getByText('E2E 별도 저장 상품',{exact:true})}).last();await copyCard.getByRole('button',{name:'편집',exact:true}).click();
  await p.getByText('4개 면 준비 완료',{exact:true}).waitFor();await p.getByRole('button',{name:'왼쪽',exact:true}).click();await p.getByTitle('텍스트 추가',{exact:true}).click();await p.getByLabel('판매가',{exact:true}).fill('25800');
  await p.getByRole('button',{name:'수정 저장',exact:true}).click();await p.getByRole('dialog',{name:'파트너몰 전체 면 편집'}).waitFor({state:'hidden'});
  stored=await products();assert.equal(stored.length,2);const updated=stored.find(v=>v.id===copy.id);assert.equal(updated.price,25800);assert.equal(JSON.parse(updated.canvas_state.left).objects.length,2);
  passed.push('production mobile reload and update');
  const designBeforePrice=structuredClone(updated.canvas_state);
  await copyCard.getByRole('button',{name:'가격 수정',exact:true}).click();
  const pricing=p.getByRole('dialog',{name:'상품 가격 수정',exact:true});await pricing.getByLabel('판매가',{exact:true}).fill('11900');await pricing.getByRole('button',{name:'가격 저장',exact:true}).click();await pricing.waitFor({state:'hidden'});
  const repriced=(await products()).find(v=>v.id===copy.id);assert.equal(repriced.price,11900);assert.deepEqual(repriced.canvas_state,designBeforePrice);passed.push('production price-only update preserves design');
  await p.setViewportSize({width:1440,height:1000});await p.getByRole('button',{name:'비활성',exact:true}).click();await p.getByRole('button',{name:'활성',exact:true}).waitFor();
  const anon=await browser.newContext({viewport:{width:1440,height:1000}});const c=await anon.newPage();c.setDefaultTimeout(60000);c.on('pageerror',e=>errors.push(e.message));
  await c.route('**/api/analytics/track',r=>r.fulfill({status:204}));
  await c.route(/google-analytics|googletagmanager|facebook\.net|clarity\.ms/,r=>r.abort());
  await c.goto(customer+'/mall/'+slug);await c.getByRole('button',{name:'E2E 별도 저장 상품 상세 보기',exact:true}).click();
  await c.waitForFunction(()=>document.querySelectorAll('canvas.lower-canvas').length>=4);
  for(const name of ['앞면','뒷면','왼쪽','오른쪽']){await c.getByRole('button',{name,exact:true}).first().click();}
  assert(await c.getByText('11,900원',{exact:true}).count());await c.screenshot({path:path.join(out,'production-customer.png')});
  await c.setViewportSize({width:390,height:844});assert(await c.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await c.getByRole('button',{name:'사이즈·수량 선택하고 주문하기',exact:true}).click();await c.getByRole('heading',{name:'옵션 선택',exact:true}).waitFor();
  await c.locator('input[type=number]').first().fill('2');await c.getByRole('button',{name:'바로 구매하기',exact:true}).click();await c.waitForURL(u=>u.pathname==='/checkout');
  const cart=await c.evaluate(()=>JSON.parse(localStorage.getItem('modoo-cart-storage')||localStorage.getItem('cart-storage')||'null'));
  assert.equal(cart.state.items.length,1);const item=cart.state.items[0];assert.equal(item.quantity,2);assert.equal(item.pricePerItem,11900);assert.equal(item.partnerMallId,mallId);assert.equal(Object.keys(item.canvasState).length,4);
  await c.screenshot({path:path.join(out,'production-checkout.png')});passed.push('production anonymous four-side preview, mobile quantity, checkout and mall attribution');
  await anon.close();assert.deepEqual(errors,[]);
 } catch(e){await p.screenshot({path:path.join(out,'production-failure.png')});throw e;}
 finally {
  if(mallId){const response=await ctx.request.patch(base+'/api/admin/partner-malls',{data:{id:mallId,is_active:false}});cleanup=response.ok();if(cleanup)assert.equal((await response.json()).data.is_active,false);}
  if(mallId&&cleanup){const response=await ctx.request.delete(base+'/api/admin/partner-malls?id='+mallId);deleted=response.ok();if(deleted){const remaining=(await json(await ctx.request.get(base+'/api/admin/partner-malls'))).data;assert(!remaining.some(m=>m.id===mallId));assert.equal((await products()).length,0);}}
  fs.writeFileSync(path.join(out,'production-result.json'),JSON.stringify({passed,mallId,slug,inactive:cleanup,deleted,pageErrors:errors,completedAt:new Date().toISOString()},null,2));
  await browser.close();if(mallId&&!deleted)throw new Error('Canary mall cleanup failed');
 }
 console.log(JSON.stringify({passed,mallId,deleted,pageErrors:errors}));
})().catch(e=>{console.error(e);process.exitCode=1});
