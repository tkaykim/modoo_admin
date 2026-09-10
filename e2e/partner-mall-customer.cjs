const assert=require('node:assert/strict');
const { chromium }=require('playwright');
const fs=require('node:fs'); const path=require('node:path');
const out=path.resolve('e2e/artifacts/partner-mall');
(async()=>{
 const browser=await chromium.launch();
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 const p=await ctx.newPage(); const errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(60000);
 await p.route(/google-analytics|googletagmanager|facebook\.net|clarity\.ms/,r=>r.abort());
 try {
  await p.goto('http://localhost:3104/mall/e2e-design-mall');
  await p.getByRole('button',{name:'별도 저장한 운영 상품 상세 보기',exact:true}).waitFor();
  await p.screenshot({path:path.join(out,'06-customer-mall.png')});
  await p.getByRole('button',{name:'별도 저장한 운영 상품 상세 보기',exact:true}).click();
  await p.locator('canvas.lower-canvas').first().waitFor();
  await p.waitForFunction(()=>Array.from(document.querySelectorAll('canvas.lower-canvas')).length>=4);
  for(const side of ['앞면','뒷면','왼쪽','오른쪽']) {
    await p.getByRole('button',{name:side,exact:true}).first().click();
    await p.screenshot({path:path.join(out,`customer-side-${side}.png`)});
  }
  await p.screenshot({path:path.join(out,'07-customer-four-sides.png')});
  assert(await p.getByText('25,800원',{exact:true}).count()>0);
  await p.setViewportSize({width:390,height:844});
  await p.screenshot({path:path.join(out,'08-customer-mobile.png')});
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.getByRole('button',{name:'사이즈·수량 선택하고 주문하기',exact:true}).click();
  await p.getByRole('heading',{name:'옵션 선택',exact:true}).waitFor();
  await p.locator('input[type=number]').fill('2');
  await p.screenshot({path:path.join(out,'09-customer-quantity.png')});
  await p.getByRole('button',{name:'바로 구매하기',exact:true}).click();
  await p.waitForURL(u=>u.pathname==='/checkout');
  const cart=await p.evaluate(()=>JSON.parse(localStorage.getItem('modoo-cart-storage')||localStorage.getItem('cart-storage')||'null'));
  assert.equal(cart.state.items.length,1);
  assert.equal(cart.state.items[0].quantity,2);
  assert.equal(cart.state.items[0].pricePerItem,25800);
  assert.equal(Object.keys(cart.state.items[0].canvasState).length,4);
  assert(cart.state.items[0].partnerMallId);
  fs.writeFileSync(path.join(out,'checkout-cart.json'),JSON.stringify(cart,null,2));
  await p.screenshot({path:path.join(out,'10-customer-checkout.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'customer-result.json'),JSON.stringify({passed:['anonymous mall','copied product visible','all four side navigation','custom selling price','mobile no overflow','quantity selection','checkout arrival','four-side cart and mall attribution'],errors},null,2));
  console.log('Customer E2E passed');
 } catch(e) {await p.screenshot({path:path.join(out,'customer-failure.png')});fs.writeFileSync(path.join(out,'customer-failure.txt'),await p.locator('body').innerText());throw e;}
 finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
