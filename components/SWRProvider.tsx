'use client';

import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/fetcher';

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 10000,
        revalidateOnFocus: false,
        // 기본값은 무제한 재시도다. 라우트가 계속 5xx를 내면 화면을 열어둔 내내 재시도가 쌓이고,
        // 재시도마다 인증·DB 호출이 따라붙는다. 3회로 끊는다.
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
