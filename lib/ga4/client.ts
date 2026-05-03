import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { GoogleAuth } from 'google-auth-library';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

let envLoaded = false;
function ensureEnv() {
  if (envLoaded) return;
  envLoaded = true;
  // Next.js 런타임에선 자동 로드되므로 CLI 등 비-Next 환경에서만 dotenv 사용.
  if (!process.env.NEXT_RUNTIME) {
    const envPath = resolve(process.cwd(), '.env.local');
    if (existsSync(envPath)) loadEnv({ path: envPath });
  }
}

let cachedClient: BetaAnalyticsDataClient | null = null;
let cachedProperty: string | null = null;

function init() {
  ensureEnv();
  const propertyId = process.env.GA4_MODOO_APP_PROPERTY_ID;
  if (!propertyId) {
    throw new Error('GA4_MODOO_APP_PROPERTY_ID is not set');
  }

  const authMode = process.env.GA4_AUTH_MODE?.toLowerCase();
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const oauthClientId = process.env.GA4_OAUTH_CLIENT_ID;
  const oauthClientSecret = process.env.GA4_OAUTH_CLIENT_SECRET;
  const oauthRefreshToken = process.env.GA4_OAUTH_REFRESH_TOKEN;

  let clientOpts: ConstructorParameters<typeof BetaAnalyticsDataClient>[0] = {};
  if (oauthRefreshToken && oauthClientId && oauthClientSecret) {
    // OAuth user creds via refresh token (Vercel 등 SA 거부 환경용).
    const auth = new GoogleAuth({
      credentials: {
        type: 'authorized_user',
        client_id: oauthClientId,
        client_secret: oauthClientSecret,
        refresh_token: oauthRefreshToken,
      },
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    clientOpts = { auth };
  } else if (authMode === 'adc') {
    // ADC 모드: SA 키 경로를 무시하고 gcloud user creds 사용.
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  } else if (keyFile && existsSync(keyFile)) {
    clientOpts = { keyFilename: keyFile };
  }

  cachedClient = new BetaAnalyticsDataClient(clientOpts);
  cachedProperty = `properties/${propertyId}`;
}

export function getGa4(): BetaAnalyticsDataClient {
  if (!cachedClient) init();
  return cachedClient!;
}

export function getProperty(): string {
  if (!cachedProperty) init();
  return cachedProperty!;
}
