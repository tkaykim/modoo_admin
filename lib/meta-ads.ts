// Meta Marketing API (Graph API) 클라이언트.
// 광고 계정의 캠페인 메타데이터와 일자별 인사이트(spend/impressions/clicks 등)를 조회한다.

const VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

function getCreds() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token) throw new Error('META_ACCESS_TOKEN is not set');
  if (!account) throw new Error('META_AD_ACCOUNT_ID is not set');
  // 사용자가 act_ 접두사 없이 입력해도 동작하도록 정규화
  const normalized = account.startsWith('act_') ? account : `act_${account}`;
  return { token, account: normalized };
}

const BASE = () => `https://graph.facebook.com/${VERSION}`;

type FbError = { error: { message: string; type?: string; code?: number; fbtrace_id?: string } };

async function metaFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = getCreds();
  const url = new URL(`${BASE()}${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Meta API non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || (json as FbError)?.error) {
    const err = (json as FbError).error;
    const msg = err?.message || `HTTP ${res.status}`;
    const code = err?.code ? ` [code ${err.code}]` : '';
    const trace = err?.fbtrace_id ? ` (trace ${err.fbtrace_id})` : '';
    throw new Error(`Meta API error${code}: ${msg}${trace}`);
  }
  return json as T;
}

async function metaPost<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = getCreds();
  const url = new URL(`${BASE()}${path}`);
  const body = new URLSearchParams();
  body.set('access_token', token);
  for (const [k, v] of Object.entries(params)) body.set(k, v);

  const res = await fetch(url.toString(), { method: 'POST', body });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Meta API non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || (json as FbError)?.error) {
    const err = (json as FbError).error;
    const msg = err?.message || `HTTP ${res.status}`;
    const code = err?.code ? ` [code ${err.code}]` : '';
    const trace = err?.fbtrace_id ? ` (trace ${err.fbtrace_id})` : '';
    throw new Error(`Meta API error${code}: ${msg}${trace}`);
  }
  return json as T;
}

type Paged<T> = { data: T[]; paging?: { next?: string; cursors?: { before?: string; after?: string } } };

async function fetchAllPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = null;
  let firstParams: Record<string, string> | null = params;
  while (true) {
    let resp: Paged<T>;
    if (nextUrl) {
      const r = await fetch(nextUrl);
      const t = await r.text();
      resp = JSON.parse(t) as Paged<T>;
      const e = (resp as unknown as FbError).error;
      if (e) throw new Error(`Meta API error: ${e.message}`);
    } else {
      resp = await metaFetch<Paged<T>>(path, firstParams!);
      firstParams = null;
    }
    all.push(...(resp.data ?? []));
    if (resp.paging?.next) {
      nextUrl = resp.paging.next;
    } else {
      break;
    }
  }
  return all;
}

// ── Public API ───────────────────────────────────────────────

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  effective_status?: string;
};

export async function fetchCampaigns(): Promise<MetaCampaign[]> {
  const { account } = getCreds();
  return fetchAllPages<MetaCampaign>(`/${account}/campaigns`, {
    fields: 'id,name,status,objective,effective_status',
    limit: '200',
  });
}

export type MetaAdSet = {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  campaign_id?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
};

export async function fetchAdSets(): Promise<MetaAdSet[]> {
  const { account } = getCreds();
  return fetchAllPages<MetaAdSet>(`/${account}/adsets`, {
    fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal',
    limit: '200',
  });
}

export type MetaCreativeAssetFeedSpec = {
  images?: Array<{ hash?: string; url?: string }>;
  videos?: Array<{ video_id?: string; thumbnail_url?: string }>;
  bodies?: Array<{ text?: string }>;
  titles?: Array<{ text?: string }>;
  link_urls?: Array<{ website_url?: string; display_url?: string }>;
};

export type MetaCreative = {
  id: string;
  name?: string;
  image_hash?: string;
  thumbnail_url?: string;
  video_id?: string;
  object_story_spec?: {
    link_data?: { message?: string; name?: string; image_hash?: string; picture?: string; link?: string };
    video_data?: { message?: string; title?: string; image_url?: string; video_id?: string };
  };
  asset_feed_spec?: MetaCreativeAssetFeedSpec;
};

export type MetaAd = {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
  adset?: { id?: string; name?: string };
  campaign?: { id?: string; name?: string };
  creative?: MetaCreative;
};

export async function fetchAdsWithCreatives(): Promise<MetaAd[]> {
  const { account } = getCreds();
  return fetchAllPages<MetaAd>(`/${account}/ads`, {
    fields:
      'id,name,status,effective_status,adset_id,campaign_id,adset{id,name},campaign{id,name},creative{id,name,image_hash,thumbnail_url,video_id,object_story_spec,asset_feed_spec}',
    limit: '200',
  });
}

export type MetaAction = { action_type: string; value: string };

export type MetaAdInsight = {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: MetaAction[];
};

export async function fetchAdInsights(sinceYmd: string, untilYmd: string): Promise<MetaAdInsight[]> {
  const { account } = getCreds();
  return fetchAllPages<MetaAdInsight>(`/${account}/insights`, {
    level: 'ad',
    time_range: JSON.stringify({ since: sinceYmd, until: untilYmd }),
    fields:
      'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,reach,cpc,cpm,ctr,frequency,actions,action_values,purchase_roas',
    limit: '500',
  });
}

export type MetaAdSetInsight = Omit<MetaAdInsight, 'ad_id' | 'ad_name'>;

export async function fetchAdSetInsights(sinceYmd: string, untilYmd: string): Promise<MetaAdSetInsight[]> {
  const { account } = getCreds();
  return fetchAllPages<MetaAdSetInsight>(`/${account}/insights`, {
    level: 'adset',
    time_range: JSON.stringify({ since: sinceYmd, until: untilYmd }),
    fields:
      'adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,reach,cpc,cpm,ctr,frequency,actions,action_values,purchase_roas',
    limit: '500',
  });
}

export type MetaAdImage = {
  hash: string;
  url?: string;
  permalink_url?: string;
  width?: number;
  height?: number;
  name?: string;
};

export async function fetchAdImages(hashes: string[]): Promise<Record<string, MetaAdImage>> {
  const unique = Array.from(new Set(hashes.filter(Boolean)));
  if (unique.length === 0) return {};
  const { account } = getCreds();
  const rows = await fetchAllPages<MetaAdImage>(`/${account}/adimages`, {
    hashes: JSON.stringify(unique),
    fields: 'hash,url,permalink_url,width,height,name',
    limit: '200',
  });
  return Object.fromEntries(rows.map((row) => [row.hash, row]));
}

export async function updateAdStatus(adId: string, status: 'ACTIVE' | 'PAUSED') {
  return metaPost<{ success?: boolean }>(`/${adId}`, { status });
}

export async function updateAdSetBudget(adSetId: string, dailyBudgetKrw: number) {
  return metaPost<{ success?: boolean }>(`/${adSetId}`, { daily_budget: String(Math.round(dailyBudgetKrw)) });
}

export type MetaUploadedImage = {
  hash: string;
  url?: string;
};

export type MetaUploadedVideo = {
  id: string;
};

export type MetaCreatedCreative = {
  id: string;
};

export type MetaCreatedAd = {
  id: string;
};

function modooPageId() {
  return process.env.META_PAGE_ID || process.env.META_PAGE_ID_MODOO || '463978760454420';
}

function modooInstagramUserId() {
  return process.env.META_INSTAGRAM_USER_ID || process.env.META_IG_USER_ID || process.env.META_INSTAGRAM_USER_ID_MODOO || '';
}

async function metaFormPost<T>(path: string, form: FormData): Promise<T> {
  const { token } = getCreds();
  form.set('access_token', token);

  const res = await fetch(`${BASE()}${path}`, { method: 'POST', body: form });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Meta API non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || (json as FbError)?.error) {
    const err = (json as FbError).error;
    const msg = err?.message || `HTTP ${res.status}`;
    const code = err?.code ? ` [code ${err.code}]` : '';
    const trace = err?.fbtrace_id ? ` (trace ${err.fbtrace_id})` : '';
    throw new Error(`Meta API error${code}: ${msg}${trace}`);
  }
  return json as T;
}

export async function uploadAdImageBytes(fileName: string, bytes: Buffer): Promise<MetaUploadedImage> {
  const { account } = getCreds();
  const safeName = fileName.trim() || `marketing_image_${Date.now()}`;
  const resp = await metaPost<{ images?: Record<string, MetaUploadedImage> }>(`/${account}/adimages`, {
    bytes: bytes.toString('base64'),
    name: safeName,
  });
  const image = resp.images?.[safeName] || Object.values(resp.images ?? {})[0];
  if (!image?.hash) throw new Error('Meta 이미지 업로드 응답에 hash가 없습니다.');
  return image;
}

export async function uploadAdVideoBytes(fileName: string, bytes: Buffer, mimeType: string): Promise<MetaUploadedVideo> {
  const { account } = getCreds();
  const form = new FormData();
  form.set('title', fileName.trim() || `marketing_video_${Date.now()}`);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  form.set('source', new Blob([arrayBuffer], { type: mimeType || 'video/mp4' }), fileName);
  const resp = await metaFormPost<{ id?: string; video_id?: string }>(`/${account}/advideos`, form);
  const id = resp.id || resp.video_id;
  if (!id) throw new Error('Meta 영상 업로드 응답에 video id가 없습니다.');
  return { id };
}

export async function createImageAdCreative(input: {
  name: string;
  imageHash: string;
  message: string;
  headline?: string;
  linkUrl: string;
  ctaType?: string;
  pageId?: string;
}): Promise<MetaCreatedCreative> {
  const { account } = getCreds();
  const linkData: Record<string, unknown> = {
    link: input.linkUrl,
    message: input.message,
    image_hash: input.imageHash,
    call_to_action: { type: input.ctaType || 'SEE_DETAILS', value: { link: input.linkUrl } },
  };
  if (input.headline) linkData.name = input.headline;

  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId || modooPageId(),
    link_data: linkData,
  };
  const instagramUserId = modooInstagramUserId();
  if (instagramUserId) objectStorySpec.instagram_user_id = instagramUserId;

  return metaPost<MetaCreatedCreative>(`/${account}/adcreatives`, {
    name: input.name,
    object_story_spec: JSON.stringify(objectStorySpec),
  });
}

export async function createVideoAdCreative(input: {
  name: string;
  videoId: string;
  message: string;
  title?: string;
  linkUrl: string;
  ctaType?: string;
  pageId?: string;
}): Promise<MetaCreatedCreative> {
  const { account } = getCreds();
  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId || modooPageId(),
    video_data: {
      video_id: input.videoId,
      message: input.message,
      title: input.title || input.name,
      call_to_action: { type: input.ctaType || 'SEE_DETAILS', value: { link: input.linkUrl } },
    },
  };
  const instagramUserId = modooInstagramUserId();
  if (instagramUserId) objectStorySpec.instagram_user_id = instagramUserId;

  return metaPost<MetaCreatedCreative>(`/${account}/adcreatives`, {
    name: input.name,
    object_story_spec: JSON.stringify(objectStorySpec),
  });
}

export async function createPausedAd(input: {
  name: string;
  adSetId: string;
  creativeId: string;
}): Promise<MetaCreatedAd> {
  const { account } = getCreds();
  return metaPost<MetaCreatedAd>(`/${account}/ads`, {
    name: input.name,
    adset_id: input.adSetId,
    status: 'PAUSED',
    creative: JSON.stringify({ creative_id: input.creativeId }),
  });
}

export type MetaInsightDaily = {
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  campaign_id: string;
  campaign_name?: string;
  spend: string; // Meta returns numbers as strings
  impressions: string;
  clicks: string;
  reach?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
};

export async function fetchInsightsDaily(sinceYmd: string, untilYmd: string): Promise<MetaInsightDaily[]> {
  const { account } = getCreds();
  return fetchAllPages<MetaInsightDaily>(`/${account}/insights`, {
    level: 'campaign',
    time_increment: '1',
    time_range: JSON.stringify({ since: sinceYmd, until: untilYmd }),
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,cpc,cpm,ctr',
    limit: '500',
  });
}

export type AccountSummary = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

export async function fetchAccountSummary(sinceYmd: string, untilYmd: string): Promise<AccountSummary> {
  const { account } = getCreds();
  const resp = await metaFetch<Paged<{ spend: string; impressions: string; clicks: string; reach: string; actions?: MetaAction[]; action_values?: MetaAction[] }>>(
    `/${account}/insights`,
    {
      level: 'account',
      time_range: JSON.stringify({ since: sinceYmd, until: untilYmd }),
      fields: 'spend,impressions,clicks,reach,actions,action_values',
    },
  );
  const row = resp.data?.[0];
  return {
    spend: Number(row?.spend ?? 0),
    impressions: Number(row?.impressions ?? 0),
    clicks: Number(row?.clicks ?? 0),
    reach: Number(row?.reach ?? 0),
    actions: row?.actions,
    action_values: row?.action_values,
  };
}

// 헬퍼: days → since/until (KST 기준 오늘 포함 N일)
export function rangeFromDays(days: number): { since: string; until: string } {
  const now = new Date();
  const tzOffsetMs = 9 * 60 * 60 * 1000; // KST
  const today = new Date(now.getTime() + tzOffsetMs);
  const since = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(today) };
}
