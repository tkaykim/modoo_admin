/** DB enum 및 레거시 표기(super-admin 등)를 앱 표준 형태로 통일합니다. */
export type ProfileRole = 'admin' | 'factory' | 'super_admin' | 'marketing_manager' | 'marketing_analyst' | 'customer';

/** 주문·발주·공장 업무 API까지 접근 가능한 백오피스 역할. */
export const BACKOFFICE_PROFILE_ROLES: readonly ProfileRole[] = ['admin', 'factory', 'super_admin'];
/** 마케팅 영역(분석·마케팅 콘솔·주간 매출 목표)을 볼 수 있는 역할. analyst 는 열람 전용. */
export const MARKETING_AREA_ROLES: readonly ProfileRole[] = ['admin', 'super_admin', 'marketing_manager', 'marketing_analyst'];
/** 마케팅 영역에서 실행(광고 중단·재개·예산·소재 업로드·승인·목표 저장)까지 가능한 역할. */
export const MARKETING_WRITE_ROLES: readonly ProfileRole[] = ['admin', 'super_admin', 'marketing_manager'];
export const MODOO_ADMIN_APP_ROLES: readonly ProfileRole[] = [...BACKOFFICE_PROFILE_ROLES, 'marketing_manager', 'marketing_analyst'];

export function normalizeProfileRole(role: unknown): ProfileRole | null {
  if (role == null) return null;
  const raw =
    typeof role === 'string'
      ? role
      : typeof role === 'number' || typeof role === 'boolean'
        ? String(role)
        : null;
  if (raw === null || raw === '') return null;
  const r = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (r === 'superadmin' || r === 'super_admin') return 'super_admin';
  if (r === 'marketingmanager' || r === 'marketing_manager' || r === 'marketer') return 'marketing_manager';
  if (r === 'marketinganalyst' || r === 'marketing_analyst' || r === 'analyst') return 'marketing_analyst';
  if (r === 'admin') return 'admin';
  if (r === 'factory') return 'factory';
  if (r === 'customer') return 'customer';
  return null;
}

export function isAdminLike(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n === 'admin' || n === 'super_admin';
}

export function isSuperAdmin(role: unknown): boolean {
  return normalizeProfileRole(role) === 'super_admin';
}

export function isFactoryRole(role: unknown): boolean {
  return normalizeProfileRole(role) === 'factory';
}

export function isMarketingManagerRole(role: unknown): boolean {
  return normalizeProfileRole(role) === 'marketing_manager';
}

export function isMarketingAnalystRole(role: unknown): boolean {
  return normalizeProfileRole(role) === 'marketing_analyst';
}

/** 마케팅 영역 열람 가능(analyst 포함). */
export function canAccessMarketingArea(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n !== null && MARKETING_AREA_ROLES.includes(n);
}

/** 마케팅 영역 실행 가능(analyst 제외). 쓰기 API·실행 버튼은 반드시 이 판정을 쓴다. */
export function canExecuteMarketingActions(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n !== null && MARKETING_WRITE_ROLES.includes(n);
}

/** 주문·발주·공장 업무 접근 가능한 역할 */
export function isBackofficeOperatorRole(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n !== null && BACKOFFICE_PROFILE_ROLES.includes(n);
}

/** 모두관리 앱에 로그인 가능한 역할 */
export function isModooAdminAppRole(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n !== null && MODOO_ADMIN_APP_ROLES.includes(n);
}

export function assertBackofficeProfileRole(canonicalRole: ProfileRole | null): canonicalRole is 'admin' | 'factory' | 'super_admin' {
  return canonicalRole !== null && BACKOFFICE_PROFILE_ROLES.includes(canonicalRole);
}

export function assertModooAdminAppProfileRole(
  canonicalRole: ProfileRole | null,
): canonicalRole is 'admin' | 'factory' | 'super_admin' | 'marketing_manager' | 'marketing_analyst' {
  return canonicalRole !== null && MODOO_ADMIN_APP_ROLES.includes(canonicalRole);
}
