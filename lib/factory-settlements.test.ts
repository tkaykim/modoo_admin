import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {withFactorySettlements,withOrderFactorySettlements} from './factory-settlements';
const items=[{id:'a',assigned_manufacturer_id:'one',factory_amount:999,factory_unit_price:99}, {id:'b',assigned_manufacturer_id:'two',factory_amount:888}];
function client(error?:{code:string}) {
 const ids:string[][]=[];
 const db={from:(table:string)=>{assert.equal(table,'order_item_factory_settlements');return{select:()=>({in:async(_key:string,keys:string[])=>{ids.push(keys);return{data:keys.map(id=>({order_item_id:id,factory_amount:123,factory_unit_price:12})),error};}})};}};
 return {db:db as unknown as SupabaseClient,ids};
}
for(const role of ['admin','customer','marketing_manager','marketing_analyst',undefined]) test(`${role} receives no settlement fields and makes no private query`,async()=>{
 const c=client();const rows=await withFactorySettlements(c.db,items,{role});
 assert.equal(c.ids.length,0);assert.ok(rows.every(i=>!('factory_amount' in i)&&!('factory_unit_price' in i)));
});
test('factory query and returned values are restricted to own assignment',async()=>{
 const c=client();const rows=await withFactorySettlements(c.db,items,{role:'factory',manufacturer_id:'one'});
 assert.deepEqual(c.ids,[['a']]);assert.equal(rows[0].factory_amount,123);assert.ok(!('factory_amount' in rows[1]));
});
test('factory without affiliation has no access',async()=>{
 const c=client();await withFactorySettlements(c.db,items,{role:'factory'});assert.equal(c.ids.length,0);
});
test('super admin sees actual preserved settlements',async()=>{
 const c=client();const rows=await withFactorySettlements(c.db,items,{role:'super_admin'});assert.equal(rows[1].factory_unit_price,12);
});
test('unknown database errors fail closed',async()=>{
 const c=client({code:'42501'});await assert.rejects(withFactorySettlements(c.db,items,{role:'super_admin'}));
});
test('deployment fallback never includes another factory price',async()=>{
 const c=client({code:'PGRST205'});const rows=await withFactorySettlements(c.db,items,{role:'factory',manufacturer_id:'one'});
 assert.equal(rows[0].factory_amount,999);assert.ok(!('factory_amount' in rows[1]));
});
test('orders also strip legacy order-level price',async()=>{
 const c=client();const rows=await withOrderFactorySettlements(c.db,[{factory_amount:1000,order_items:items}],{role:'admin'});
 assert.equal(Object.hasOwn(rows[0],'factory_amount'),false);assert.ok(!('factory_amount' in rows[0].order_items[0]));
});
