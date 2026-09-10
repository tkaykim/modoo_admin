require('dotenv').config({path:'.env.local',quiet:true});
const {createClient}=require('@supabase/supabase-js');
(async()=>{
 const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const {data,error}=await s.from('saved_designs').select('id,product_id,canvas_state,custom_fonts,product:products(configuration)').order('created_at',{ascending:false}).limit(10);
 if(error) throw error;
 console.log(JSON.stringify(data.map(d=>({id:d.id,product_id:d.product_id,configuredSides:d.product?.configuration?.length,states:Object.entries(d.canvas_state||{}).map(([side,v])=>{try{const p=typeof v==='string'?JSON.parse(v):v;return {side,type:typeof v,objects:p?.objects?.length,keys:Object.keys(p||{})}}catch{return{side,invalid:true}}}),fonts:d.custom_fonts?.length})),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
