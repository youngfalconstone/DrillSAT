import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...props,
});

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
);
export const BankIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
);
export const PracticeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2v4M16 2v4M8 11h8M8 15h5" /></svg>
);
export const PerfIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 20V12M12 20V4M19 20v-7" /></svg>
);
export const ToolsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14.7 6.3a4 4 0 0 0 5 5L13 18l-3-3 6.7-8.7z" /><path d="M3 21l6-6" /></svg>
);
export const SettingsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const HelpIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7" /><path d="M12 17h.01" /></svg>
);
export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>
);
export const BookmarkIcon = (p: SVGProps<SVGSVGElement> & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return <svg {...base(rest)} fill={filled ? 'currentColor' : 'none'}><path d="M6 3h12v18l-6-4-6 4z" /></svg>;
};
export const ChevronLeft = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M15 6l-6 6 6 6" /></svg>;
export const ChevronRight = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>;
export const ChevronDown = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>;
export const CalcIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v4M8 19h2M12 19h2" /></svg>
);
export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z" /></svg>
);
export const SparkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 12l5 5L20 7" /></svg>;
export const FlameIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-8 0 4-5 6-5 12a7 7 0 0 0 8 7z" /></svg>
);
export const Logo = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 2c-1.5 2.5-5 3.5-7 4 1 5 3 9 7 12 4-3 6-7 7-12-2-.5-5.5-1.5-7-4zm0 3.2c1 1.3 2.8 2 4.4 2.5-.8 3.3-2.2 6-4.4 8.1-2.2-2.1-3.6-4.8-4.4-8.1C9.2 7.2 11 6.5 12 5.2z" /></svg>
);
export const HighlightIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 11l-5 5v4h4l5-5" /><path d="M14 4l6 6-7 7-6-6z" /><path d="M3 21h8" /></svg>
);
export const StrikeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 12h18" /><path d="M6 17l2.5-10L11 17M7 13.5h3" strokeWidth={1.6} /><path d="M14 7h3a2 2 0 0 1 0 4h-3V7zm0 4h3.5a2 2 0 0 1 0 4H14v-4z" strokeWidth={1.6} /></svg>
);
export const FormulaIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h7M7.5 3.5v7M4 17h7M14 4l6 6M20 4l-6 6M14 16h6M17 13v.01M17 19v.01" /></svg>
);
export const FlagIcon = (p: SVGProps<SVGSVGElement> & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return <svg {...base(rest)} fill={filled ? 'currentColor' : 'none'}><path d="M5 21V4h11l-2 4 2 4H5" /></svg>;
};
export const TestIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8l1.5 1.5L12 7M8 14l1.5 1.5L12 13M14 8h2M14 14h2" /></svg>
);
export const RefreshIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
);
