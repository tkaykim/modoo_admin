import { getCreds, getDailyStats, listCampaigns } from '@/lib/naver-ads';
import { cachedMarketingRead, mapConcurrent } from './marketing-metrics';

/** Invoke only after marketing authorization; unavailable spend is never zero. */
export async function naverSpend(since: string, until: string, refresh = false) {
  const creds = getCreds();
  if (!creds) return { spend: null, collectedAt: null, error: '네이버 광고비 연결 미설정' };
  try {
    const result = await cachedMarketingRead(`channel:naver:${creds.customerId}:${since}:${until}`, async () => {
      const campaigns = await listCampaigns(creds);
      const spends = await mapConcurrent(campaigns, 3, async (campaign) => {
        const daily = await getDailyStats(creds, campaign.nccCampaignId, since, until);
        return daily.reduce((sum, row) => sum + Number(row.salesAmt ?? 0), 0);
      });
      return Math.round(spends.reduce((a, b) => a + b, 0));
    }, refresh);
    return { spend: result.value, collectedAt: result.collectedAt, error: null };
  } catch {
    return { spend: null, collectedAt: null, error: '네이버 광고비 조회 실패' };
  }
}
