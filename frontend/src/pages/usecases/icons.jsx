const PRIMARY = '#059669';
const LIGHT = '#10b981';

const wrap = { width: 28, height: 28 };
const wrapHero = { width: 72, height: 72 };

export function IconSaaS({ hero = false }) {
  const s = hero ? wrapHero : wrap;
  return (
    <svg viewBox="0 0 24 24" width={s.width} height={s.height} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
      <path d="M7 10l2 2 4-4" stroke={LIGHT} />
    </svg>
  );
}

export function IconConseil({ hero = false }) {
  const s = hero ? wrapHero : wrap;
  return (
    <svg viewBox="0 0 24 24" width={s.width} height={s.height} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21v-7a4 4 0 014-4h8a4 4 0 014 4v7" />
      <circle cx="12" cy="6" r="3" />
      <path d="M9 14h6" stroke={LIGHT} />
    </svg>
  );
}

export function IconStartup({ hero = false }) {
  const s = hero ? wrapHero : wrap;
  return (
    <svg viewBox="0 0 24 24" width={s.width} height={s.height} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.88-.88.92-2.32.01-3.24a2.21 2.21 0 00-3.01.24z" />
      <path d="M12 15l-3-3a11 11 0 017-7 11 11 0 014 4 11 11 0 01-7 7z" />
      <path d="M14.5 7.5a2 2 0 104 0 2 2 0 00-4 0z" stroke={LIGHT} />
    </svg>
  );
}

export function IconDistribution({ hero = false }) {
  const s = hero ? wrapHero : wrap;
  return (
    <svg viewBox="0 0 24 24" width={s.width} height={s.height} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="5" r="2" stroke={LIGHT} />
      <circle cx="19" cy="5" r="2" stroke={LIGHT} />
      <circle cx="5" cy="19" r="2" stroke={LIGHT} />
      <circle cx="19" cy="19" r="2" stroke={LIGHT} />
      <path d="M7 6l3 4M17 6l-3 4M7 18l3-4M17 18l-3-4" />
    </svg>
  );
}

export function IconMarketplace({ hero = false }) {
  const s = hero ? wrapHero : wrap;
  return (
    <svg viewBox="0 0 24 24" width={s.width} height={s.height} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9v10a2 2 0 002 2h14a2 2 0 002-2V9" />
      <path d="M3 9h18" stroke={LIGHT} />
      <path d="M9 13h6" />
    </svg>
  );
}

export function IconAgence({ hero = false }) {
  const s = hero ? wrapHero : wrap;
  return (
    <svg viewBox="0 0 24 24" width={s.width} height={s.height} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
      <path d="M6.5 6.5h0M17.5 17.5h0" stroke={LIGHT} />
    </svg>
  );
}

// Feature icons (reused across pages)
export function IconKanban() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="11" rx="1" />
      <rect x="17" y="4" width="5" height="14" rx="1" />
    </svg>
  );
}

export function IconCoin() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 8.5c-.7-1-1.9-1.5-3-1.5-1.9 0-3 1-3 2.5 0 3.5 6 2 6 5 0 1.5-1.2 2.5-3 2.5-1.3 0-2.4-.5-3-1.5" />
      <path d="M12 5v2M12 17v2" />
    </svg>
  );
}

export function IconSync() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 01-15 6.7L3 16" />
      <path d="M3 12a9 9 0 0115-6.7L21 8" />
      <path d="M21 3v5h-5M3 21v-5h5" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  );
}

export function IconEye() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconBell() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 004 0" />
    </svg>
  );
}

export function IconGift() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v9h14v-9" />
      <path d="M12 8v13" />
      <path d="M12 8C9 8 7 7 7 5a2 2 0 014 0c0 2 1 3 1 3s1-1 1-3a2 2 0 114 0c0 2-2 3-5 3z" />
    </svg>
  );
}

export function IconStore() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9v10a2 2 0 002 2h14a2 2 0 002-2V9" />
      <path d="M3 9h18M9 21v-6h6v6" />
    </svg>
  );
}

export function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h8v6a4 4 0 01-8 0V3z" />
      <path d="M8 5H5a2 2 0 002 4M16 5h3a2 2 0 01-2 4" />
      <path d="M10 14h4M10 21h4M12 14v7" />
    </svg>
  );
}

export function IconChart() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
}

export function IconLink() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" />
      <path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />
    </svg>
  );
}

export function IconPalette() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 100 20 3 3 0 002-5.5c-.5-.5-.5-1.5 0-2s1.5-.5 2 0A3 3 0 0022 12 10 10 0 0012 2z" />
      <circle cx="7" cy="10" r="1.2" />
      <circle cx="12" cy="7" r="1.2" />
      <circle cx="17" cy="10" r="1.2" />
    </svg>
  );
}

export function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 12l10 5 10-5M2 17l10 5 10-5" />
    </svg>
  );
}

export function IconReport() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

export function IconRocket() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M12 15l-3-3a11 11 0 017-7 11 11 0 014 4 11 11 0 01-7 7z" />
      <circle cx="15.5" cy="8.5" r="1.5" />
    </svg>
  );
}

export function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

export function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill={PRIMARY} />
    </svg>
  );
}
