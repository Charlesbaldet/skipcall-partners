import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronDown } from 'lucide-react';

// Format a Date as YYYY-MM-DD in local time (calendar-day, not UTC).
function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildPresets(t) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sub = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const startOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  const endOfQuarter = (d) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0);

  const lastMonthRef = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastQuarterRef = new Date(today.getFullYear(), today.getMonth() - 3, 1);

  return [
    { key: 'today', label: t('dashboard.today'), startDate: fmt(today), endDate: fmt(today) },
    { key: 'last_7_days', label: t('dashboard.last_7_days'), startDate: fmt(sub(6)), endDate: fmt(today) },
    { key: 'last_30_days', label: t('dashboard.last_30_days'), startDate: fmt(sub(29)), endDate: fmt(today) },
    { key: 'this_month', label: t('dashboard.this_month'), startDate: fmt(startOfMonth(today)), endDate: fmt(today) },
    { key: 'last_month', label: t('dashboard.last_month'), startDate: fmt(startOfMonth(lastMonthRef)), endDate: fmt(endOfMonth(lastMonthRef)) },
    { key: 'this_quarter', label: t('dashboard.this_quarter'), startDate: fmt(startOfQuarter(today)), endDate: fmt(today) },
    { key: 'last_quarter', label: t('dashboard.last_quarter'), startDate: fmt(startOfQuarter(lastQuarterRef)), endDate: fmt(endOfQuarter(lastQuarterRef)) },
    { key: 'this_year', label: t('dashboard.this_year'), startDate: fmt(new Date(today.getFullYear(), 0, 1)), endDate: fmt(today) },
    { key: 'last_12_months', label: t('dashboard.last_12_months'), startDate: fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1)), endDate: fmt(today) },
    { key: 'since_beginning', label: t('dashboard.since_beginning'), startDate: null, endDate: null },
  ];
}

// Localised "12 nov. 2026 → 1 mai 2026" label for the trigger button.
function formatRangeLabel(range, locale) {
  if (!range) return null;
  const opt = { day: 'numeric', month: 'short', year: 'numeric' };
  const fmtOne = (s) => new Date(s + 'T00:00:00').toLocaleDateString(locale, opt);
  return `${fmtOne(range.startDate)} → ${fmtOne(range.endDate)}`;
}

export default function DateRangePicker({ value, onChange }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value?.startDate || '');
  const [draftEnd, setDraftEnd] = useState(value?.endDate || '');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Reset drafts when opening so users see the current applied range.
  useEffect(() => {
    if (open) {
      setDraftStart(value?.startDate || '');
      setDraftEnd(value?.endDate || '');
    }
  }, [open, value]);

  const presets = buildPresets(t);
  const triggerLabel = formatRangeLabel(value, i18n.language) || t('dashboard.since_beginning');

  const applyPreset = (p) => {
    if (p.startDate == null) {
      onChange(null);
    } else {
      onChange({ startDate: p.startDate, endDate: p.endDate });
    }
    setOpen(false);
  };

  const apply = () => {
    if (draftStart && draftEnd) {
      // Allow flipped inputs without complaint.
      const a = draftStart <= draftEnd ? draftStart : draftEnd;
      const b = draftStart <= draftEnd ? draftEnd : draftStart;
      onChange({ startDate: a, endDate: b });
    } else {
      onChange(null);
    }
    setOpen(false);
  };

  const activePresetKey = (() => {
    if (!value) return 'since_beginning';
    return presets.find(p => p.startDate === value.startDate && p.endDate === value.endDate)?.key || null;
  })();

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0',
          cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <Calendar size={14} color="#64748b" />
        <span>{triggerLabel}</span>
        <ChevronDown size={14} color="#94a3b8" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.10)', zIndex: 50,
          display: 'flex', minWidth: 460, fontFamily: 'inherit',
        }}>
          {/* Shortcuts */}
          <div style={{ borderRight: '1px solid #f1f5f9', padding: 12, minWidth: 180 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, padding: '0 8px' }}>
              {t('dashboard.shortcuts')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {presets.map(p => {
                const active = activePresetKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p)}
                    style={{
                      textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                      border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                      fontFamily: 'inherit',
                      background: active ? '#ecfdf5' : 'transparent',
                      color: active ? '#059669' : '#334155',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date inputs */}
          <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input
                type="date"
                value={draftStart}
                max={draftEnd || undefined}
                onChange={(e) => setDraftStart(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', color: '#0f172a' }}
              />
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>→</span>
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => setDraftEnd(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', color: '#0f172a' }}
              />
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                  background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('dashboard.cancel')}
              </button>
              <button
                type="button"
                onClick={apply}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('dashboard.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
