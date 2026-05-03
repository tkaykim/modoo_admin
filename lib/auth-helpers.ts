/** DB enum 및 레거시 표기(super-admin 등)를 앱 표준 형태로 통일합니다. */
export type ProfileRole = 'admin' | 'factory' | 'super_admin' | 'customer';

/** 모두관리 접속 가능한 역할(정규화 후 문자열 목록과 동일해야 함). */
export const BACKOFFICE_PROFILE_ROLES: readonly ProfileRole[] = ['admin', 'factory', 'super_admin'];

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
  if (r === 'admin') return 'admin';
  if (r === 'factory') return 'factory';
  if (r === 'customer') return 'customer';
  return null;
}

export function isAdminLike(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n === 'admin' || n === 'super_admin';
}

/** 관리자 화면(대시보드 등) 접근 가능한 역할 */
export function isBackofficeOperatorRole(role: unknown): boolean {
  const n = normalizeProfileRole(role);
  return n !== null && BACKOFFICE_PROFILE_ROLES.includes(n);
}

export function assertBackofficeProfileRole(canonicalRole: ProfileRole | null): canonicalRole is 'admin' | 'factory' | 'super_admin' {
  return canonicalRole !== null && BACKOFFICE_PROFILE_ROLES.includes(canonicalRole);
}
