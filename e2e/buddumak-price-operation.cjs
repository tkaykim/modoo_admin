// Authorized business operation: price only for the recently created buddumak mall.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const {createHash}=require('node:crypto');
require('dotenv').config({path:process.env.E2E_ENV_FILE||'.env.local',quiet:true});
const base='https://modoo-admin-gilt.vercel.app';const mallId='ba5d7556-ad79-4652-9f12-e83228d1fb18';const out='e2e/artifacts/partner-mall';
const preserved=p=>createHash('sha256').update(JSON.stringify({product_id:p.product_id,display_name:p.display_name,canvas_state:p.canvas_state,logo_placements:p.logo_placements,preview_url:p.preview_url,color_hex:p.color_hex,manufacturer_color_id:p.manufacturer_color_id})).digest('hex');
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();p.setDefaultTimeout(60000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(base+'/login?redirect=/partner_malls');await p.locator('input[type=email]').fill(process.env.E2E_ADMIN_EMAIL);await p.locator('input[type=password]').fill(process.env.E2E_ADMIN_PASSWORD);await p.getByRole('button',{name:'로그인',exact:true}).click();await p.waitForURL(u=>u.pathname==='/partner_malls');
  const read=async()=>{const r=await ctx.request.get(base+'/api/admin/partner-malls/products?partner_mall_id='+mallId);assert(r.ok());return (await r.json()).data;};
  const original=await read();assert.equal(original.length,2);assert(original.every(v=>v.display_name.includes('할머니의 부뚜막')));
  const previous=original.map(v=>({id:v.id,price:v.price,designHash:preserved(v)}));fs.mkdirSync(out,{recursive:true});if(!fs.existsSync(out+'/buddumak-before.json'))fs.writeFileSync(out+'/buddumak-before.json',JSON.stringify(previous,null,2));
  await p.goto(base+'/partner_malls/'+mallId);
  for(const item of original){await p.locator(`[data-mall-product-id="${item.id}"]`).getByRole('button',{name:'가격 수정',exact:true}).click();const modal=p.getByRole('dialog',{name:'상품 가격 수정',exact:true});await modal.getByLabel('판매가',{exact:true}).fill('11900');await p.screenshot({path:out+'/buddumak-price-editor.png'});await modal.getByRole('button',{name:'가격 저장',exact:true}).click();await modal.waitFor({state:'hidden'});}
  await p.reload();const after=await read();for(const item of after){assert.equal(item.price,11900);assert.equal(preserved(item),previous.find(v=>v.id===item.id).designHash);}
  await p.screenshot({path:out+'/buddumak-admin-prices.png'});
  const anon=await b.newContext({viewport:{width:390,height:844}});const c=await anon.newPage();c.setDefaultTimeout(60000);c.on('pageerror',e=>errors.push(e.message));
  await c.goto('https://www.modoouniform.com/mall/buddumak');const res=await anon.request.get('https://www.modoouniform.com/api/partner-mall/buddumak');assert(res.ok());const data=(await res.json()).data;assert.equal(data.id,mallId);assert.equal(data.partner_mall_products.length,2);assert(data.partner_mall_products.every(v=>v.price===11900));
  await c.getByRole('button',{name:/상세 보기$/}).first().click();await c.getByText('11,900원',{exact:true}).first().waitFor();await c.screenshot({path:out+'/buddumak-customer-price.png'});
  await c.getByRole('button',{name:'사이즈·수량 선택하고 주문하기',exact:true}).click();await c.locator('input[type=number]').first().fill('2');await c.getByRole('button',{name:'바로 구매하기',exact:true}).click();await c.waitForURL(u=>u.pathname==='/checkout');
  const cart=await c.evaluate(()=>JSON.parse(localStorage.getItem('modoo-cart-storage')||localStorage.getItem('cart-storage')||'null'));assert.equal(cart.state.items[0].pricePerItem,11900);assert.equal(cart.state.items[0].quantity,2);assert.equal(cart.state.items[0].partnerMallId,mallId);await c.screenshot({path:out+'/buddumak-checkout.png'});await anon.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/buddumak-price-result.json',JSON.stringify({mallId,updated:after.map(v=>({id:v.id,price:v.price})),designUnchanged:true,checkoutUnitPrice:11900,quantity:2,pageErrors:errors,completedAt:new Date().toISOString()},null,2));console.log('Buddumak two products priced at 11900, designs unchanged, customer checkout verified');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
