// 영업사원 관리 공용 상수 & 타입 (modoo_admin)
// DB salesman_grade_levels 테이블의 시드와 일치해야 한다.

export type GradeLevel =
  | 'LV0' | 'LV1' | 'LV2' | 'LV3' | 'LV4' | 'LV5'
  | 'LV6' | 'LV7' | 'LV8' | 'LV9' | 'LV10';

export const GRADE_LEVELS: GradeLevel[] = [
  'LV0', 'LV1', 'LV2', 'LV3', 'LV4', 'LV5', 'LV6', 'LV7', 'LV8', 'LV9', 'LV10',
];

export const SALESMAN_STATUSES = ['pending', 'active', 'dormant', 'churned'] as const;
export type SalesmanStatus = typeof SALESMAN_STATUSES[number];

export interface GradeLevelRow {
  level: GradeLevel;
  label: string;
  commission_rate: number;
  monthly_revenue_threshold: number;
  maintain_threshold?: number | null;
  display_order: number;
  description?: string | null;
}

export interface GradePolicy {
  id: 1;
  evaluation_window_months: number;
  manual_lock_months: number;
  demotion_grace_periods: number;
  demotion_max_steps: number;
  dormant_inactive_months: number;
  churned_inactive_months: number;
  default_maintain_ratio: number;
  auto_reevaluation_enabled: boolean;
  updated_at: string;
}

export type GradeChangeReason =
  | 'auto_promote'
  | 'auto_demote'
  | 'auto_grace'
  | 'manual_set'
  | 'auto_dormant'
  | 'auto_churn'
  | 'manual_unlock'
  | 'admin_override';

export interface GradeChange {
  id: string;
  salesman_id: string;
  prev_level: string | null;
  new_level: string;
  reason: string; // GradeChangeReason 또는 'initial_registration'/'manual_change' 등 트리거 기본값
  evaluation_window_months: number | null;
  evaluated_avg_revenue: number | null;
  evaluated_periods: string[] | null;
  changed_by: string | null;
  note: string | null;
  changed_at: string;
}

export interface SalesmanProfile {
  id: string;
  user_id: string;
  salesman_code: string;
  grade: GradeLevel;
  status: SalesmanStatus;
  display_name: string | null;
  phone: string | null;
  joined_at: string;
  last_active_at: string | null;
  mentor_id: string | null;
  note: string | null;
  grade_locked_until: string | null;
  grade_locked_by: string | null;
  grade_locked_reason: string | null;
  last_grade_evaluated_at: string | null;
  consecutive_below_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface SalesmanListItem extends SalesmanProfile {
  email: string | null;
  this_month_revenue: number;
  this_month_commission: number;
  active_team_count: number;
  active_partner_mall_count: number;
  mentor_display_name: string | null;
  last_revenue_period: string | null;
  inactive_months: number;
}

export function isValidGradeLevel(value: unknown): value is GradeLevel {
  return typeof value === 'string' && (GRADE_LEVELS as string[]).includes(value);
}

export function isValidStatus(value: unknown): value is SalesmanStatus {
  return typeof value === 'string' && (SALESMAN_STATUSES as readonly string[]).includes(value);
}

export function currentYearMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function periodToRange(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) throw new Error(`Invalid period: ${period}`);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, end };
}
