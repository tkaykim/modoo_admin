/* Local-only PostgREST/Auth fixture: all writes stay in process memory. */
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const port = Number(process.env.FIXTURE_PORT || 3199);
const base = `http://127.0.0.1:${port}`;
const uid = '10000000-0000-4000-8000-000000000001';
const pid = '20000000-0000-4000-8000-000000000001';
const user = { id: uid, email: 'mall-test@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { name: '테스트 관리자' }, app_metadata: { provider: 'email' }, created_at: new Date().toISOString() };
const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+86400, iat: Math.floor(Date.now()/1000) })).toString('base64url'), 'fixture-signature'].join('.');
const sides = ['front','back','left','right'].map((id,i) => ({ id, name: ['앞면','뒷면','왼쪽','오른쪽'][i], imageUrl: `${base}/shirt.png`, printArea: { x: 110, y: 80, width: 280, height: 340 }, realLifeDimensions: { width: 500, height: 500 }, zoomScale: 1 }));
const product = { id: pid, title: 'E2E 4면 티셔츠', product_code: 'E2E-4SIDE', base_price: 12000, category: 'tshirt', configuration: sides, thumbnail_image_link: [`${base}/shirt.png`], is_active: true, size_options: [{ label: 'L', size_code: 'L' }], discount_rates: [] };
const color = { id: '30000000-0000-4000-8000-000000000001', name: '네이비', hex: '#203060', color_code: '031' };
const source = { id: '40000000-0000-4000-8000-000000000001', user_id: uid, product_id: pid, title: '기존 확정 4면 디자인', color_selections: { productColor: '#203060' }, canvas_state: Object.fromEntries(sides.map((s,i)=>[s.id, i%2 ? JSON.stringify({ version:'7.0.0', productColor:'#203060', objects:[{ type:'IText', text:`SOURCE-${s.id}`, fontSize:22, fontFamily:'Arial', fill:['#ff0000','#00aa00','#0000ff','#aa00aa'][i], left:150, top:180, scaleX:1, scaleY:1, originX:'left', originY:'top', data:{ id:`source-${s.id}` } }] }) : { version:'7.0.0', productColor:'#203060', objects:[{ type:'IText', text:`SOURCE-${s.id}`, fontSize:22, fontFamily:'Arial', fill:['#ff0000','#00aa00','#0000ff','#aa00aa'][i], left:150, top:180, scaleX:1, scaleY:1, originX:'left', originY:'top', data:{ id:`source-${s.id}` } }] }])), preview_url: `${base}/shirt.png`, price_per_item: 99999, custom_fonts: [], product, user: { id: uid, name: '테스트 고객' } };
const db = { profiles: [{ ...user, role:'admin', name:'테스트 관리자' }], products:[product], saved_designs:[source], product_colors:[{ id:'50000000-0000-4000-8000-000000000001', product_id:pid, manufacturer_color_id:color.id, manufacturer_colors:color, is_active:true, sort_order:0 }], partner_malls:[], partner_mall_products:[], product_calibrations:[], partner_mall_assets:[] };
let failNextWrite = false;
const writes = [];
const send = (res,status,data,headers={}) => { res.writeHead(status, {'Content-Type':'application/json',...headers}); res.end(JSON.stringify(data)); };
const server = http.createServer(async (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','*'); res.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS'); res.setHeader('Access-Control-Expose-Headers','content-range');
  if(req.method==='OPTIONS') { res.writeHead(204); return res.end(); }
  const u=new URL(req.url,base); let raw=''; for await(const chunk of req) raw+=chunk; const body=raw ? JSON.parse(raw) : null;
  if(u.pathname==='/shirt.png') { const png=await sharp(Buffer.from('<svg width="500" height="500" xmlns="http://www.w3.org/2000/svg"><path d="M150 35 L210 20 Q250 65 290 20 L350 35 L475 140 L390 205 L355 170 L355 470 L145 470 L145 170 L110 205 L25 140 Z" fill="#eeeeee" stroke="#555" stroke-width="4"/></svg>')).png().toBuffer(); res.writeHead(200,{'Content-Type':'image/png'}); return res.end(png); }
  if(u.pathname==='/__state') return send(res,200,{db,writes});
  if(u.pathname==='/__reset') { db.partner_malls=[]; db.partner_mall_products=[]; writes.length=0; failNextWrite=false; return send(res,200,{ok:true}); }
  if(u.pathname==='/__fail') { failNextWrite=true; return send(res,200,{ok:true}); }
  if(u.pathname==='/auth/v1/token') return send(res,200,{ access_token:jwt,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:86400,user });
  if(u.pathname==='/auth/v1/user') return req.headers.authorization?.includes(jwt) ? send(res,200,user) : send(res,401,{msg:'Invalid token'});
  if(u.pathname.startsWith('/auth/')) return send(res,200,{});
  const table=u.pathname.split('/')[3];
  if(u.pathname==='/rest/v1/rpc/admin_search_saved_design_ids') return send(res,200,{total:1,ids:[source.id]});
  if(!u.pathname.startsWith('/rest/v1/')) return send(res,404,{});
  if(!db[table]) db[table]=[];
  const filter=(row)=>[...u.searchParams].every(([key,val])=>{
    if(['select','order','limit','offset','on_conflict'].includes(key)) return true;
    if(val.startsWith('eq.')) return String(row[key])===val.slice(3);
    if(val.startsWith('neq.')) return String(row[key])!==val.slice(4);
    if(val.startsWith('in.')) return val.slice(4,-1).split(',').map(v=>v.replaceAll('"','')).includes(row[key]);
    return true;
  });
  let rows;
  if(req.method==='POST' || req.method==='PATCH') {
    if(failNextWrite && table==='partner_mall_products') { failNextWrite=false; return send(res,500,{message:'Injected product write failure'}); }
    writes.push({table,method:req.method,body});
    if(req.method==='PATCH') { rows=db[table].filter(filter); rows.forEach(row=>Object.assign(row,body)); }
    else { rows=(Array.isArray(body)?body:[body]).map(row=>{ const existing=db[table].find(r=>r.id===row.id); if(existing) { if(req.headers.prefer?.includes('resolution=merge-duplicates')) Object.assign(existing,row); return existing; } const created={id:randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...row}; if(table==='partner_malls') created.share_token=randomUUID(); db[table].push(created); return created; }); }
  } else rows=db[table].filter(filter);
  const total=rows.length;
  rows=structuredClone(rows);
  if(table==='partner_malls' && u.searchParams.get('select')?.includes('partner_mall_products')) rows=rows.map(row=>({...row,partner_mall_products:db.partner_mall_products.filter(p=>p.partner_mall_id===row.id).map(p=>({...p,product})),partner_mall_assets:[],attributed_salesman:null}));
  if(table==='partner_mall_products' && u.searchParams.get('select')?.includes('product:products')) rows=rows.map(row=>({...row,product}));
  const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||rows.length); rows=rows.slice(offset,offset+limit);
  const single=req.headers.accept?.includes('application/vnd.pgrst.object');
  if(req.method==='HEAD') { res.writeHead(200,{'content-range':`0-${Math.max(0,total-1)}/${total}`}); return res.end(); }
  send(res,200,single?(rows[0]||null):rows,{'content-range':`0-${Math.max(0,total-1)}/${total}`});
});
server.listen(port,'127.0.0.1',()=>console.log(`Mall fixture listening ${base}`));
