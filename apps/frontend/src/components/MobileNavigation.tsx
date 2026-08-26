import Link from "next/link";
import type { ComponentType, CSSProperties } from "react";
import type { NavigationItem } from "@/lib/mobile-navigation";
import {
  IconAlert,
  IconDashboard,
  IconGlobe,
  IconLogout,
  IconMore,
  IconTasks,
  IconUsers,
} from "./icons";

type IconComponent = ComponentType<{ className?: string }>;

const ICONS: Record<NavigationItem["icon"], IconComponent> = {
  dashboard: IconDashboard,
  tasks: IconTasks,
  "my-work": IconTasks,
  projects: IconGlobe,
  "user-stories": IconTasks,
  incidents: IconAlert,
  users: IconUsers,
  menu: IconMore,
  logout: IconLogout,
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Badge({ value }: { value?: number }) {
  if (!value || value < 1) return null;
  return <span className="nav-badge">{value > 99 ? "99+" : value}</span>;
}

export function NavigationIcon({ item }: { item: NavigationItem }) {
  const Icon = ICONS[item.icon];
  return (
    <span className="nav-icon" aria-hidden>
      <Icon />
    </span>
  );
}

export function MobileBottomNav({ items, pathname }: { items: NavigationItem[]; pathname: string }) {
  if (items.length === 0) return null;
  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="Navigasi utama"
      style={{ "--mobile-nav-count": items.length } as CSSProperties}
    >
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`mobile-nav-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="mobile-nav-icon-wrap">
              <NavigationIcon item={item} />
              <Badge value={item.badge} />
            </span>
            <span className="mobile-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTopNav({ items, pathname }: { items: NavigationItem[]; pathname: string }) {
  if (items.length === 0) return null;
  return (
    <nav
      className="mobile-top-nav"
      aria-label="Navigasi utama"
      style={{ "--mobile-nav-count": items.length } as CSSProperties}
    >
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`mobile-top-nav-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <NavigationIcon item={item} />
            <span>{item.label}</span>
            <Badge value={item.badge} />
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNavigationSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      <div className="mobile-top-nav mobile-nav-skeleton" aria-label="Memuat navigasi utama" style={{ "--mobile-nav-count": count } as CSSProperties}>
        {Array.from({ length: count }, (_, index) => <span key={index} />)}
      </div>
      <div className="mobile-bottom-nav mobile-nav-skeleton" aria-label="Memuat navigasi utama" style={{ "--mobile-nav-count": count } as CSSProperties}>
        {Array.from({ length: count }, (_, index) => <span key={index} />)}
      </div>
    </>
  );
}

export function MobileMenuPage({
  items,
  pathname,
  onLogout,
}: {
  items: NavigationItem[];
  pathname: string;
  onLogout: () => void;
}) {
  return (
    <section className="mobile-menu-page" aria-labelledby="mobile-menu-title">
      <div className="mobile-menu-heading">
        <span className="eyebrow">Akses cepat</span>
        <h2 id="mobile-menu-title">Menu</h2>
        <p className="muted">Buka fitur tambahan dan pengaturan akun.</p>
      </div>
      <div className="mobile-menu-list">
        {items.map((item) => {
          const active = item.href ? isActivePath(pathname, item.href) : false;
          const content = (
            <>
              <span className="mobile-menu-item-icon"><NavigationIcon item={item} /></span>
              <span className="mobile-menu-item-copy">
                <strong>{item.label}</strong>
                {item.key === "incidents" ? <span>Gangguan yang perlu diperhatikan</span> : null}
                {item.key === "projects" ? <span>Project yang menjadi tanggung jawab Anda</span> : null}
                {item.key === "users" ? <span>Kelola akun dan akses platform</span> : null}
                {item.key === "logout" ? <span>Keluar dari akun ini</span> : null}
              </span>
              <Badge value={item.badge} />
              {item.key !== "logout" ? <span className="mobile-menu-chevron" aria-hidden>›</span> : null}
            </>
          );
          if (item.key === "logout") {
            return <button key={item.key} type="button" className="mobile-menu-item logout" onClick={onLogout}>{content}</button>;
          }
          return <Link key={item.key} href={item.href} className={`mobile-menu-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{content}</Link>;
        })}
      </div>
    </section>
  );
}
