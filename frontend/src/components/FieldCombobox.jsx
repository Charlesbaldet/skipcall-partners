import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, Check } from 'lucide-react';

// Searchable single-select combobox for Pipedrive field lists. Drops
// in as a replacement for a native <select> on the Pipedrive config
// modal: the lists can grow into the hundreds once custom fields
// pile up, and a flat <select> stops being scannable after about 20.
//
// Differences vs the existing PartnerCombobox:
//   - Items split into two visual sections (Standards / Custom) based
//     on the `is_custom` flag the Pipedrive API surfaces.
//   - No avatar / no subtitle.
//   - Custom-field badge to the right of the row.
//   - "— Non mappé —" option pinned at the top.
//   - Yellow highlight on matches (search-input feedback) rather than
//     the green tint used by the global Highlight helper — keeps it
//     visually distinct in this dense modal.
//
// API:
//   <FieldCombobox
//     value={fieldMap[refField] || ''}
//     fields={fields}                 // [{ key, name, is_custom, ... }]
//     onChange={(key) => setMap(...)}
//     unmappedLabel={t('pipedrive.statuses_unmapped')}
//     placeholder={t('pipedrive.field_search_placeholder')}
//     disabled={...}
//   />

// Yellow highlight — yellow so it doesn't blend with the green Save
// button or the active-tab underline. Escapes regex metachars on the
// query so punctuation doesn't blow up the RegExp constructor.
function HighlightYellow({ text, query }) {
  if (!text || !query || query.length < 1) return text || null;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp('(' + safe + ')', 'ig');
    const parts = String(text).split(re);
    return (
      <>
        {parts.map((p, i) =>
          re.test(p)
            ? <mark key={i} style={{ background: 'rgba(250, 204, 21, 0.35)', color: 'inherit', padding: 0, borderRadius: 2 }}>{p}</mark>
            : <span key={i}>{p}</span>
        )}
      </>
    );
  } catch {
    return text;
  }
}

export default function FieldCombobox({
  value,
  fields = [],
  onChange,
  unmappedLabel,
  placeholder,
  disabled = false,
  width = '100%',
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Index across the flat sequence of selectable rows (unmapped + standards + custom).
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const itemRefs = useRef([]);

  const unmappedText = unmappedLabel || t('pipedrive.statuses_unmapped', '— Non mappé —');
  const placeholderText = placeholder || t('pipedrive.field_search_placeholder', 'Rechercher un champ…');

  // Filtered + grouped. We intentionally do not memoise the grouped
  // shape under a separate key — the cost of the filter is trivial
  // even at a few hundred fields, and over-memoising adds noise.
  const { standards, custom, flatList } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (f) => {
      if (!q) return true;
      return (f.name || '').toLowerCase().includes(q) || (f.key || '').toLowerCase().includes(q);
    };
    const standards = [];
    const custom = [];
    for (const f of fields) {
      if (!matches(f)) continue;
      if (f.is_custom) custom.push(f);
      else standards.push(f);
    }
    // Flat list mirrors the visual order (unmapped → standards → custom)
    // so keyboard nav indices map 1:1 to rendered rows.
    const flat = [{ key: '', name: unmappedText, _virtualUnmapped: true }, ...standards, ...custom];
    return { standards, custom, flatList: flat };
  }, [fields, query, unmappedText]);

  const selectedField = useMemo(
    () => fields.find(f => f.key === value),
    [fields, value]
  );
  const triggerLabel = selectedField ? selectedField.name : unmappedText;

  // ─── Open / close lifecycle ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Focus search on open and reset query + selection cursor.
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      // Pre-select the currently-selected field if visible, else first row.
      const idx = flatList.findIndex(f => f.key === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active row scrolled into view as the user navigates.
  useEffect(() => {
    if (!open) return;
    const node = itemRefs.current[activeIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const handleSelect = (key) => {
    setOpen(false);
    setQuery('');
    onChange(key || '');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(flatList.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatList[activeIndex];
      if (target) handleSelect(target.key);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const trigger = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #e2e8f0', background: disabled ? '#f8fafc' : '#fff',
    color: '#0f172a', fontSize: 13, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, opacity: disabled ? 0.7 : 1,
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={trigger}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedField ? '#0f172a' : '#94a3b8' }}>
          {triggerLabel}
        </span>
        <ChevronDown
          size={14} color="#94a3b8"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(15,23,42,0.10)', zIndex: 100,
            maxHeight: 320, display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Search input */}
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid #f1f5f9' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={onKeyDown}
              placeholder={placeholderText}
              style={{
                width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a',
                fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Unmapped option — always at the top, regardless of search */}
            <ComboItem
              innerRef={el => (itemRefs.current[0] = el)}
              active={activeIndex === 0}
              selected={!value}
              onMouseEnter={() => setActiveIndex(0)}
              onClick={() => handleSelect('')}
              label={unmappedText}
              isUnmapped
            />

            {standards.length === 0 && custom.length === 0 && (
              <div style={{ padding: '14px 12px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
                {t('pipedrive.field_no_results', 'Aucun champ trouvé')}
              </div>
            )}

            {standards.length > 0 && (
              <>
                <SectionHeader label={t('pipedrive.field_section_standards', 'Standards')} />
                {standards.map((f, i) => {
                  const flatIdx = 1 + i;
                  return (
                    <ComboItem
                      key={f.key}
                      innerRef={el => (itemRefs.current[flatIdx] = el)}
                      active={activeIndex === flatIdx}
                      selected={value === f.key}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={() => handleSelect(f.key)}
                      label={f.name}
                      query={query}
                    />
                  );
                })}
              </>
            )}

            {custom.length > 0 && (
              <>
                <SectionHeader label={t('pipedrive.field_section_custom', 'Personnalisés')} />
                {custom.map((f, i) => {
                  const flatIdx = 1 + standards.length + i;
                  return (
                    <ComboItem
                      key={f.key}
                      innerRef={el => (itemRefs.current[flatIdx] = el)}
                      active={activeIndex === flatIdx}
                      selected={value === f.key}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={() => handleSelect(f.key)}
                      label={f.name}
                      query={query}
                      badge={t('pipedrive.field_custom_badge', 'personnalisé')}
                    />
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{
      padding: '6px 12px 4px', fontSize: 10, fontWeight: 600,
      color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5,
      background: '#fff', position: 'sticky', top: 0,
    }}>
      {label}
    </div>
  );
}

// `innerRef` is a normal callback prop (no forwardRef ceremony needed
// here — we only call scrollIntoView on the node, no imperative API).
function ComboItem({ innerRef, active, selected, onMouseEnter, onClick, label, query, badge, isUnmapped }) {
  return (
    <button
      type="button"
      ref={innerRef}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        width: '100%', padding: '8px 12px', textAlign: 'left',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: active ? '#f1f5f9' : (selected ? '#f0fdf4' : '#fff'),
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid #fafbfc',
      }}
    >
      {selected && !isUnmapped && <Check size={13} color="#059669" style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: isUnmapped ? '#94a3b8' : '#0f172a', fontStyle: isUnmapped ? 'italic' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: selected && !isUnmapped ? 0 : 21 }}>
        {query ? <HighlightYellow text={label} query={query} /> : label}
      </div>
      {badge && (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 999,
          background: '#f1f5f9', color: '#64748b', flexShrink: 0,
        }}>{badge}</span>
      )}
    </button>
  );
}
