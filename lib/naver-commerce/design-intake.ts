import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase-admin';

type PaidOrderRow = {
  product_order_id: string;
  naver_order_id: string;
  product_order_status: string | null;
  claim_status: string | null;
  payment_date: string | null;
  origin_product_no: number | null;
  channel_product_no: number | null;
  local_product_id: string | null;
  product_name: string | null;
  option_name: string | null;
  option_manage_code: string | null;
  quantity: number | null;
  buyer_name: string | null;
  buyer_tel: string | null;
  receiver_tel1: string | null;
  receiver_tel2: string | null;
};

type ExistingClaimRow = {
  product_order_id: string;
  job_id: string;
};

type ExistingJobRow = {
  id: string;
  local_product_id: string | null;
  status: string;
};

export type NaverDesignIngestItem = {
  product_order_id: string;
  group_key: string;
  local_product_id: string | null;
  color_code: string | null;
  product_name: string;
  option_summary: string | null;
  quantity: number;
};

const DESIGN_INTAKE_PRODUCT_STATUSES = new Set(['PAYED']);
const TERMINAL_CLAIM_STATUSES = new Set(['CANCEL_DONE', 'RETURN_DONE']);

export function isDesignIntakeEligible(row: Pick<PaidOrderRow, 'payment_date' | 'product_order_status' | 'claim_status'>): boolean {
  if (!row.payment_date) return false;
  if (!row.product_order_status || !DESIGN_INTAKE_PRODUCT_STATUSES.has(row.product_order_status)) return false;
  if (row.claim_status && TERMINAL_CLAIM_STATUSES.has(row.claim_status)) return false;
  if (row.claim_status) return false;
  return true;
}

export function normalizeMobilePhone(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const digits = String(candidate ?? '').replace(/[^0-9]/g, '');
    if (/^010\d{8}$/.test(digits)) return digits;
  }
  return null;
}

export function extractNaverColorCode(optionManageCode: string | null, optionName: string | null): string | null {
  const codeParts = String(optionManageCode ?? '').split('|').map((part) => part.trim()).filter(Boolean);
  if (codeParts.length >= 4 && codeParts[1]) return codeParts[1];

  const displayColor = String(optionName ?? '').split(/\s*(?:\/|>|,)\s*/)[0]?.trim();
  return displayColor || null;
}

export function toDesignIngestItem(row: PaidOrderRow): NaverDesignIngestItem {
  const colorCode = extractNaverColorCode(row.option_manage_code, row.option_name);
  const productKey = row.local_product_id
    ?? (row.origin_product_no ? `origin:${row.origin_product_no}` : null)
    ?? (row.channel_product_no ? `channel:${row.channel_product_no}` : null)
    ?? `unmapped:${row.product_order_id}`;
  return {
    product_order_id: row.product_order_id,
    group_key: `${productKey}|${colorCode || '색상미확인'}`,
    local_product_id: row.local_product_id,
    color_code: colorCode,
    product_name: row.product_name?.trim() || '네이버 상품',
    option_summary: row.option_name?.trim() || null,
    quantity: Math.max(0, Number(row.quantity) || 0),
  };
}

function customerSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://modoouniform.com')
    .replace(/\/+$/, '');
}

async function selectInBatches<T>(
  fetchBatch: (ids: string[]) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  ids: string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 500) {
    const { data, error } = await fetchBatch(ids.slice(index, index + 500));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function actionableRows(admin: ReturnType<typeof createAdminClient>, rows: PaidOrderRow[]): Promise<PaidOrderRow[]> {
  const productOrderIds = rows.map((row) => row.product_order_id);
  const claims = await selectInBatches<ExistingClaimRow>(
    async (ids) => admin.from('naver_design_job_claims').select('product_order_id,job_id').in('product_order_id', ids),
    productOrderIds,
  );
  const claimByProductOrderId = new Map(claims.map((claim) => [claim.product_order_id, claim]));
  const jobIds = [...new Set(claims.map((claim) => claim.job_id))];
  const jobs = await selectInBatches<ExistingJobRow>(
    async (ids) => admin.from('naver_design_jobs').select('id,local_product_id,status').in('id', ids),
    jobIds,
  );
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  return rows.filter((row) => {
    const claim = claimByProductOrderId.get(row.product_order_id);
    if (!claim) return true;
    const job = jobById.get(claim.job_id);
    return Boolean(row.local_product_id && job?.status === 'needs_mapping' && !job.local_product_id);
  });
}

export async function ingestNaverPaidOrders(): Promise<{
  candidateOrders: number;
  sessionsCreated: number;
  jobsCreated: number;
  itemsClaimed: number;
  skipped?: string;
}> {
  const admin = createAdminClient();
  const intakeSinceRaw = process.env.NAVER_DESIGN_INTAKE_SINCE || '';
  const intakeSince = intakeSinceRaw ? new Date(intakeSinceRaw) : null;
  if (!intakeSince || Number.isNaN(intakeSince.getTime())) {
    return {
      candidateOrders: 0,
      sessionsCreated: 0,
      jobsCreated: 0,
      itemsClaimed: 0,
      skipped: 'NAVER_DESIGN_INTAKE_SINCE is missing or invalid',
    };
  }
  const { data, error } = await admin
    .from('naver_product_orders')
    .select('product_order_id,naver_order_id,product_order_status,claim_status,payment_date,origin_product_no,channel_product_no,local_product_id,product_name,option_name,option_manage_code,quantity,buyer_name,buyer_tel,receiver_tel1,receiver_tel2')
    .not('payment_date', 'is', null)
    .gte('payment_date', intakeSince.toISOString())
    .order('payment_date', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const eligibleRows: PaidOrderRow[] = [];
  for (const raw of (data ?? []) as PaidOrderRow[]) {
    if (isDesignIntakeEligible(raw)) eligibleRows.push(raw);
  }
  const pendingRows = await actionableRows(admin, eligibleRows);
  const groups = new Map<string, PaidOrderRow[]>();
  for (const raw of pendingRows) {
    const group = groups.get(raw.naver_order_id) ?? [];
    group.push(raw);
    groups.set(raw.naver_order_id, group);
  }

  let sessionsCreated = 0;
  let jobsCreated = 0;
  let itemsClaimed = 0;
  for (const [naverOrderId, rows] of groups) {
    const first = rows[0];
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const intakeUrl = `${customerSiteUrl()}/naver-design/${token}`;
    const notificationPhone = normalizeMobilePhone(first.buyer_tel, first.receiver_tel1, first.receiver_tel2);
    const { data: result, error: rpcError } = await admin.rpc('ingest_naver_design_order', {
      p_naver_order_id: naverOrderId,
      p_token_hash: tokenHash,
      p_intake_url: intakeUrl,
      p_buyer_name: first.buyer_name,
      p_buyer_phone: first.buyer_tel,
      p_receiver_phone: first.receiver_tel1 || first.receiver_tel2,
      p_notification_phone: notificationPhone,
      p_items: rows.map(toDesignIngestItem),
    });
    if (rpcError) throw rpcError;
    const summary = Array.isArray(result) ? result[0] : result;
    sessionsCreated += summary?.session_created ? 1 : 0;
    jobsCreated += Number(summary?.jobs_created) || 0;
    itemsClaimed += Number(summary?.items_claimed) || 0;
  }

  return { candidateOrders: groups.size, sessionsCreated, jobsCreated, itemsClaimed };
}
