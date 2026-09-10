import RevenueGoals from '@/components/revenue-goals/RevenueGoals';

export const metadata = { title: '주간 매출 목표 | 모두의 유니폼 관리자' };

// AdminLayout 은 app/layout.tsx 가 전역으로 감싼다 — 페이지에서 다시 감싸면 이중 권한체크로 튕긴다(2026-09-10 실측).
export default function RevenueGoalsPage() {
  return <RevenueGoals />;
}
