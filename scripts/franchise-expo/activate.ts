import { createClient } from '@supabase/supabase-js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const client = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: malls, error: readError } = await client
    .from('partner_malls')
    .select('id,name,source_key,is_active,slug,share_token')
    .like('source_key', 'franchise-coex:84:%')
    .order('name');
  if (readError) throw new Error(readError.message);
  if (!malls || malls.length !== 76) throw new Error(`프랜차이즈 박람회 몰 ${malls?.length || 0}/76개 확인됨`);

  const inactive = malls.filter((mall) => !mall.is_active);
  console.log(`대상 ${malls.length}개, 현재 비활성 ${inactive.length}개`);
  if (!commit) {
    console.log('--commit을 붙이면 대상 76개 몰을 즉시 활성화합니다.');
    return;
  }

  const { data: updated, error: updateError } = await client
    .from('partner_malls')
    .update({ is_active: true })
    .like('source_key', 'franchise-coex:84:%')
    .select('id,is_active');
  if (updateError) throw new Error(updateError.message);
  if (!updated || updated.length !== 76 || updated.some((mall) => !mall.is_active)) {
    throw new Error(`활성화 결과 검증 실패: ${updated?.length || 0}개`);
  }
  console.log('활성화 완료: 76개 파트너몰에서 바로 제품을 확인하고 주문할 수 있습니다.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
