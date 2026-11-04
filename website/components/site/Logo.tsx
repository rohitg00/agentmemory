import s from "./Logo.module.css";

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={s.logo}>
      <defs>
        <linearGradient id="am-hot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff7a17" />
          <stop offset="100%" stopColor="#ff8f5e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <rect x="14" y="40" width="36" height="5" rx="2.5" fill="var(--bg)" opacity="0.22" />
      <rect x="14" y="33" width="36" height="5" rx="2.5" fill="var(--bg)" opacity="0.36" />
      <rect x="14" y="26" width="36" height="5" rx="2.5" fill="var(--bg)" opacity="0.52" />
      <rect x="14" y="19" width="36" height="5" rx="2.5" fill="url(#am-hot)" />
      <circle cx="22" cy="21.5" r="1.8" fill="#fff" />
      <circle cx="32" cy="21.5" r="1.8" fill="#fff" />
      <circle cx="42" cy="21.5" r="1.8" fill="#fff" />
      <g className={s.lines} stroke="#ff7a17" strokeWidth="1.4" strokeLinecap="round">
        <line x1="22" y1="19" x2="32" y2="12" pathLength="1" />
        <line x1="32" y1="19" x2="32" y2="12" pathLength="1" />
        <line x1="42" y1="19" x2="32" y2="12" pathLength="1" />
      </g>
      <circle className={s.point} cx="32" cy="11" r="3" fill="url(#am-hot)" />
      <circle className={s.ring} cx="32" cy="11" r="5" fill="none" stroke="#ff7a17" strokeWidth="0.9" opacity="0.5" />
      <circle cx="25" cy="28.5" r="1" fill="currentColor" opacity="0.5" />
      <circle cx="39" cy="28.5" r="1" fill="currentColor" opacity="0.5" />
      <circle cx="32" cy="35.5" r="0.8" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
