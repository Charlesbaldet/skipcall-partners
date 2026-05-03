import { useTranslation } from 'react-i18next';

// Reusable pagination strip used by /blog and /marketplace.
// Renders nothing when totalPages <= 1 so callers don't have to
// gate it themselves. Page-number buttons collapse to first / last
// + a window of ±2 around current with ellipses on each side once
// totalPages > 7 — keeps the strip narrow even when the blog
// passes 50 articles. Handlers receive the new page number; the
// caller is responsible for any URL / scroll side-effects.

const C = { p: '#059669', s: '#0f172a', m: '#64748b', border: '#e5e7eb' };

const baseBtn = {
  height: 40, padding: '0 12px',
  borderRadius: 10, border: `1px solid ${C.border}`,
  background: '#fff', color: C.m,
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background-color .15s, color .15s, border-color .15s',
};
const numBtn = { ...baseBtn, width: 40, padding: 0 };
const activeBtn = { ...numBtn, background: C.p, borderColor: C.p, color: '#fff', fontWeight: 600 };
const ellipsis = { width: 32, color: C.m, textAlign: 'center', fontWeight: 500, userSelect: 'none' };
const disabledBtn = { ...baseBtn, opacity: 0.35, cursor: 'not-allowed' };

// Build the page-number sequence: 1 … (current-2)..(current+2) … last
// with no duplicates. Returns an array of either numbers or the
// literal '…' marker.
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set([1, total, current - 1, current, current + 1]);
  // Keep first window touching index 1 and last touching `total`
  // tight (don't ellipsis 1↔3).
  if (current <= 3) [2, 3, 4].forEach(n => out.add(n));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(n => out.add(n));
  const sorted = [...out].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (sorted[i + 1] != null && sorted[i + 1] - sorted[i] > 1) result.push('…');
  }
  return result;
}

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  const { t } = useTranslation();
  if (!totalPages || totalPages <= 1) return null;

  const goPrev = () => currentPage > 1 && onPageChange(currentPage - 1);
  const goNext = () => currentPage < totalPages && onPageChange(currentPage + 1);
  const window = pageWindow(currentPage, totalPages);

  return (
    <nav
      aria-label={t('pagination.label', 'Pagination')}
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: 6, margin: '48px 0 16px', flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={currentPage === 1}
        aria-label={t('pagination.previous', 'Précédent')}
        style={currentPage === 1 ? disabledBtn : baseBtn}
        onMouseEnter={e => { if (currentPage !== 1) e.currentTarget.style.background = '#f8fafc'; }}
        onMouseLeave={e => { if (currentPage !== 1) e.currentTarget.style.background = '#fff'; }}
      >
        ← {t('pagination.previous', 'Précédent')}
      </button>

      {window.map((p, i) => p === '…' ? (
        <span key={'el-' + i} style={ellipsis}>…</span>
      ) : (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          aria-current={p === currentPage ? 'page' : undefined}
          aria-label={t('pagination.page', 'Page') + ' ' + p}
          style={p === currentPage ? activeBtn : numBtn}
          onMouseEnter={e => { if (p !== currentPage) e.currentTarget.style.background = '#f8fafc'; }}
          onMouseLeave={e => { if (p !== currentPage) e.currentTarget.style.background = '#fff'; }}
        >
          {p}
        </button>
      ))}

      <button
        type="button"
        onClick={goNext}
        disabled={currentPage === totalPages}
        aria-label={t('pagination.next', 'Suivant')}
        style={currentPage === totalPages ? disabledBtn : baseBtn}
        onMouseEnter={e => { if (currentPage !== totalPages) e.currentTarget.style.background = '#f8fafc'; }}
        onMouseLeave={e => { if (currentPage !== totalPages) e.currentTarget.style.background = '#fff'; }}
      >
        {t('pagination.next', 'Suivant')} →
      </button>
    </nav>
  );
}
