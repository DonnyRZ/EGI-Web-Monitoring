import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.12" />
    </IconBase>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 3.4 2.7 19.2a1.35 1.35 0 0 0 1.17 2.05h16.26a1.35 1.35 0 0 0 1.17-2.05L12 3.4Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M12 9.2v5" />
      <path d="M12 16.8h.01" />
    </IconBase>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" fill="currentColor" fillOpacity="0.12" />
      <path d="M3.75 12h16.5" />
      <path d="M12 3.75c2.2 2.4 3.3 5.2 3.3 8.25s-1.1 5.85-3.3 8.25" />
      <path d="M12 3.75c-2.2 2.4-3.3 5.2-3.3 8.25s1.1 5.85 3.3 8.25" />
    </IconBase>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="7.5" r="3.25" fill="currentColor" fillOpacity="0.12" />
      <path d="M3.5 19.5v-.75a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v.75" />
      <circle cx="17" cy="8.5" r="2.5" fill="currentColor" fillOpacity="0.12" />
      <path d="M20.5 19.5v-.5a4 4 0 0 0-3-3.87" />
    </IconBase>
  );
}

export function IconBell(props: IconProps) {
  return (
    <IconBase size={18} {...props}>
      <path
        d="M6.2 9a5.8 5.8 0 1 1 11.6 0c0 3.2.7 4.7 1.5 6.1.3.5-.1 1.2-.7 1.2H5.4c-.6 0-1-.7-.7-1.2.8-1.4 1.5-2.9 1.5-6.1Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <IconBase size={20} {...props}>
      <path d="M4.5 7h15" />
      <path d="M4.5 12h15" />
      <path d="M4.5 17h15" />
    </IconBase>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <IconBase size={16} {...props}>
      <path d="M14 4.5h5.5V10" />
      <path d="M10 14 19.5 4.5" />
      <path d="M19.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H11" />
    </IconBase>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M9.5 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v11.6a1.7 1.7 0 0 0 1.7 1.7h3.3"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M15 16.5 19.5 12 15 7.5" />
      <path d="M19.2 12H9.5" />
    </IconBase>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <IconBase size={16} strokeWidth={1.9} {...props}>
      <path d="m6.5 9 5.5 5.5L17.5 9" />
    </IconBase>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <IconBase size={16} strokeWidth={2} {...props}>
      <path d="M20 6.5 9.5 17 4.5 12" />
    </IconBase>
  );
}
