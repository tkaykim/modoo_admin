/** DB enum 및 레거시 표기(super-admin 등)를 앱 표준 형태로 통일합니다. */
export type ProfileRole = 'admin' | 'factory' | 'super_admin' | 'marketing_manager' | 'customer';

/** 주문·발주·공장 업무 API까지 접근 가능한 백오피스 역할. */
export const BACKOFFICE_PROFILE_ROLES: readonly ProfileRole[] = ['admin', 'factory', 'super_admin'];
export const MODOO_ADMIN_APP_ROLES: readonly ProfileRole[] = [...BACKOFFICE_PROFILE_ROLES, 'marketing_manager'];

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

export function canAccessMarketingArea(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n === 'admin' || n === 'super_admin' || n === 'marketing_manager';
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
): canonicalRole is 'admin' | 'factory' | 'super_admin' | 'marketing_manager' {
  return canonicalRole !== null && MODOO_ADMIN_APP_ROLES.includes(canonicalRole);
}
