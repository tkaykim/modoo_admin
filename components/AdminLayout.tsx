'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Package, Users, BarChart3, Menu, X, ShoppingBag, MessageSquare, Factory, LayoutDashboard, Palette, Ticket, Building2, ChevronDown, Printer, ClipboardList, FileText, Truck, LineChart, UserCheck, Wallet, Receipt, TrendingUp } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type AdminRole = 'admin' | 'factory' | 'super_admin';

type NavLink = {
  type: 'link';
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AdminRole[];
};

type NavChild = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  type: 'section';
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  roles: AdminRole[];
  children: NavChild[];
};

type NavItem = NavLink | NavSection;

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: '핵심 관리',
    items: [
      { type: 'link', href: '/dashboard', label: '대시보드', icon: LayoutDashboard, roles: ['admin', 'super_admin'] },
      { type: 'link', href: '/analytics', label: '분석', icon: LineChart, roles: ['admin', 'super_admin'] },
      { type: 'link', href: '/orders', label: '주문 관리', icon: BarChart3, roles: ['admin', 'factory', 'super_admin'] },
      { type: 'link', href: '/purchase-orders', label: '발주 관리', icon: ClipboardList, roles: ['admin', 'super_admin'] },
      { type: 'link', href: '/products', label: '제품 관리', icon: Package, roles: ['admin', 'super_admin'] },
      { type: 'link', href: '/invoices', label: '거래명세서', icon: FileText, roles: ['admin', 'super_admin'] },
      { type: 'link', href: '/shipping', label: '택배 관리', icon: Truck, roles: ['admin', 'super_admin'] },
    ],
  },
  {
    label: '상품 & 생산',
    items: [
      { type: 'link', href: '/designs', label: '디자인 관리', icon: Palette, roles: ['admin', 'super_admin'] },
      // { type: 'link', href: '/print-methods', label: '인쇄 방식', icon: Printer, roles: ['admin', 'super_admin'] },
      { type: 'link', href: '/factories', label: '공장 관리', icon: Factory, roles: ['admin', 'super_admin'] },
    ],
  },
  {
    label: '판매 & 프로모션',
    items: [
      {
        type: 'section',
        label: '공동구매',
        icon: ShoppingBag,
        roles: ['admin', 'super_admin'],
        children: [
          { href: '/cobuy/requests', label: '요청 관리' },
          { href: '/cobuy/sessions', label: '세션 관리' },
          { href: '/cobuy/presets', label: '프리셋 관리' },
        ],
      },
      { type: 'link', href: '/partner_malls', label: '파트너몰 관리', icon: Building2, roles: ['admin', 'super_admin'] },
      { type: 'link', href: '/coupons', label: '쿠폰 관리', icon: Ticket, roles: ['admin', 'super_admin'] },
    ],
  },
  {
    label: '사이트 관리',
    items: [
      {
        type: 'section',
        label: '콘텐츠',
        icon: MessageSquare,
        roles: ['admin', 'super_admin'],
        children: [
          { href: '/content/reviews', label: '리뷰' },
          { href: '/content/examples', label: '제작 사례' },
          { href: '/content/banners', label: '히어로 배너' },
          { href: '/content/popup-banners', label: '팝업 배너' },
          { href: '/content/announcements', label: '공지' },
          { href: '/content/faqs', label: 'FAQ' },
          { href: '/content/inquiries', label: '문의' },
          { href: '/content/chatbot', label: '챗봇 문의' },
        ],
      },
      { type: 'link', href: '/users', label: '사용자 관리', icon: Users, roles: ['admin', 'factory', 'super_admin'] },
    ],
  },
  {
    label: '영업 조직 (프로토타입)',
    items: [
      { type: 'link', href: '/salespersons', label: '영업사원 관리', icon: UserCheck, roles: ['admin', 'super_admin'] },
    ],
  },
  {
    label: '재무 (Finance)',
    items: [
      { type: 'link', href: '/finance', label: '재무 대시보드', icon: Wallet, roles: ['super_admin'] },
      { type: 'link', href: '/finance/costs', label: '제품 원가표', icon: Package, roles: ['super_admin'] },
      { type: 'link', href: '/finance/print-costs', label: '인쇄비 시세표', icon: Printer, roles: ['super_admin'] },
      { type: 'link', href: '/finance/shipping', label: '내부 배송비', icon: Truck, roles: ['super_admin'] },
      { type: 'link', href: '/finance/profit', label: '손익 리포트', icon: TrendingUp, roles: ['super_admin'] },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLoginRoute = pathname?.startsWith('/login') ?? false;
  const isPublicRoute = pathname?.startsWith('/shared/') ?? false;
  const isEditorRoute = pathname?.startsWith('/editor') ?? false;
  const skipAuth = isLoginRoute || isPublicRoute;
  const skipLayout = skipAuth || isEditorRoute;

  const { authStatus, user, logout } = useAdminAuth({ skip: skipAuth });

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Skip layout for login and public routes
  if (skipAuth) {
    return <>{children}</>;
  }

  // Show loading while checking auth
  if (authStatus !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">권한 확인 중...</p>
        </div>
      </div>
    );
  }

  // Full-screen layout for editor (auth checked, no sidebar)
  if (isEditorRoute) {
    return <>{children}</>;
  }

  const role = (user?.role === 'admin' || user?.role === 'factory' || user?.role === 'super_admin') ? user.role : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 h-12">
        <div className="h-full px-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              aria-label={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/dashboard" className="min-w-0">
              <Image src="/modoo_logo.png" alt="modoo" width={100} height={24} unoptimized className="h-6 w-auto" />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs text-gray-600 truncate max-w-[40ch]">
              {user?.name || user?.email}
            </div>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/20 bg-opacity-50 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`
            fixed top-12 left-0 h-[calc(100vh-3rem)] bg-white border-r border-gray-200 z-30
            transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            w-64 overflow-y-auto
          `}
        >
          <nav className="p-2 space-y-3">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter((item) => !role || item.roles.includes(role));
              if (visibleItems.length === 0) return null;
              return (
                <div key={group.label}>
                  <div className="px-2 pb-0.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) =>
                      item.type === 'section' ? (
                        <SidebarSection
                          key={item.label}
                          label={item.label}
                          icon={item.icon}
                          pathname={pathname}
                          onLinkClick={() => setSidebarOpen(false)}
                          children={item.children}
                        />
                      ) : (
                        <SidebarLink
                          key={item.href}
                          href={item.href}
                          icon={item.icon}
                          label={item.label}
                          active={pathname === item.href || (pathname ?? '').startsWith(`${item.href}/`)}
                          onClick={() => setSidebarOpen(false)}
                        />
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 p-3 lg:ml-64">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-2 py-1.5 rounded-md font-medium text-sm transition-colors
        ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}
      `}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {label}
    </Link>
  );
}

function SidebarSection({
  label,
  icon: Icon,
  children,
  pathname,
  onLinkClick,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: NavChild[];
  pathname: string | null;
  onLinkClick: () => void;
}) {
  const hasActiveChild = children.some(
    (child) => pathname === child.href || (pathname ?? '').startsWith(`${child.href}/`)
  );
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors ${
          hasActiveChild ? 'text-blue-700' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {Icon && <Icon className="w-4 h-4" />}
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 mt-0.5">
          {children.map((child) => (
            <SidebarLink
              key={child.href}
              href={child.href}
              icon={child.icon}
              label={child.label}
              active={pathname === child.href || (pathname ?? '').startsWith(`${child.href}/`)}
              onClick={onLinkClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
