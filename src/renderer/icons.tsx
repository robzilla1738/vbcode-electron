import type { ReactNode } from "react";

/** Small inline SVG icons for desktop chrome (Codex / OpenCode style). */

type IconProps = { className?: string; size?: number };

function Svg({
  size = 14,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2.5 4.25A1.25 1.25 0 0 1 3.75 3h2.2L7.3 4.5h5A1.25 1.25 0 0 1 13.5 5.75v5.5A1.25 1.25 0 0 1 12.25 12.5h-8.5A1.25 1.25 0 0 1 2.5 11.25v-7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconFolderOpen(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2.5 5.5V4.25A1.25 1.25 0 0 1 3.75 3h2.1L7.2 4.5h5.05A1.25 1.25 0 0 1 13.5 5.75v.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.75 6.5h10.1l-.85 5.1a1.25 1.25 0 0 1-1.23 1.05H4.83a1.25 1.25 0 0 1-1.23-1.05L2.75 6.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconContinue(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3.5 8a4.5 4.5 0 1 0 1.2-3.05"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3.5 3.5v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="3.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.2 10.2 13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChevron({ open, className, size = 14 }: IconProps & { open?: boolean }) {
  return (
    <Svg size={size} className={`icon-chevron${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}>
      <path d="M6 4.5 9.5 8 6 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4.5 2.75h4.2L11.5 5.55V13.25H4.5V2.75Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.5 2.75V5.75H11.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconCommand(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5.25 3.5H4.5A1.5 1.5 0 1 0 6 5v6a1.5 1.5 0 1 1-1.5 1.5h.75M10.75 3.5h.75A1.5 1.5 0 1 1 10 5v6a1.5 1.5 0 1 0 1.5 1.5h-.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconJobs(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3.5h10v3H3zM3 9.5h10v3H3z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="M5 5h.01M5 11h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function IconSidebar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.75" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6.25 3v10" stroke="currentColor" strokeWidth="1.35" />
    </Svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="3.5" r="1.15" fill="currentColor" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.15" fill="currentColor" />
    </Svg>
  );
}

export function IconPanel(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.75" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.35" />
      <path d="M9.5 3v10" stroke="currentColor" strokeWidth="1.35" />
    </Svg>
  );
}
