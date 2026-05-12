import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, Check } from 'lucide-react';
import { Highlight } from '../lib/searchUI.jsx';

// Searchable partner filter combobox. Replaces native <select> on
// pages where the partner list can grow past 15-20 entries (no
// scroll fatigue, no missing search). Data is fully client-side —
// the parent passes the already-loaded `partners` array; we don't
// fetch.
//
// Selection is single-value:
//   value = '' or 'all'  → "Tous les partenaires" (alias both work)
//   value = <partner.id> → that partner
//
// API contract mirrors the native select it replaces:
//   <PartnerCombobox
//     value={filters.partner_id}
//     partners={partners}
//     onChange={(id) => setFilters(...)}
//     allLabel={t('referrals.all_partners')}
//   />
export default function PartnerCombobox({
  value,
  partners = [],
  onChange,
  allLabel,
  placeholder,
  width = 220,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Treat empty string + 'all' interchangeably so the parent doesn't
  // have to special-case either value.
  const selectedId = value && value !== 'all' ? value : '';
  const selectedPartner = useMemo(
    () => partners.find(p => p.id === selectedId) || null,
    [partners, selectedId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    );
  }, [partners, query]);

  // Click-outside closes the dropdown. We capture in the bubble
  // phase so the trigger button's onClick still fires before this
  // listener tears down.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const triggerLabel = selectedPartner
    ? selectedPartner.name
    : (allLabel || t('common.all_partners', 'Tous les partenaires'));

  const handleSelect = (id) => {
    setOpen(false);
    setQuery('');
    onChange(id || 'all');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', width }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '8px 14px', borderRadius: 10,
          border: '2px solid #e2e8f0', background: '#fff',
          color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {triggerLabel}
        </span>
        <ChevronDown size={14} color="#94a3b8" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, left: 0,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,0.10)', zIndex: 100,
          maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          {/* "Tous les partenaires" sits above the search input so
              it stays one click away even when the partner list is
              long. */}
          <button type="button" onClick={() => handleSelect('all')}
            style={{
              padding: '10px 12px', textAlign: 'left', border: 'none',
              background: !selectedPartner ? '#f0fdf4' : '#fff',
              color: '#0f172a', fontSize: 13, fontWeight: !selectedPartner ? 600 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: '1px solid #f1f5f9',
            }}>
            {!selectedPartner && <Check size={13} color="#059669" />}
            <span style={{ marginLeft: !selectedPartner ? 0 : 21 }}>
              {allLabel || t('common.all_partners', 'Tous les partenaires')}
            </span>
          </button>

          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid #f1f5f9' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder || t('common.search_partner', 'Rechercher un partenaire…')}
              style={{
                width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a',
                fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 12px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
                {t('common.no_partner_found', 'Aucun partenaire trouvé')}
              </div>
            ) : filtered.map(p => {
              const active = p.id === selectedId;
              return (
                <button key={p.id} type="button" onClick={() => handleSelect(p.id)}
                  style={{
                    width: '100%', padding: '9px 12px', textAlign: 'left',
                    border: 'none', background: active ? '#f0fdf4' : '#fff',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: '1px solid #f8fafc',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#fafbfc'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#fff'; }}
                >
                  {active && <Check size={13} color="#059669" />}
                  <div style={{ minWidth: 0, marginLeft: active ? 0 : 21 }}>
                    <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <Highlight text={p.name} query={query} />
                    </div>
                    {p.email && (
                      <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Highlight text={p.email} query={query} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
