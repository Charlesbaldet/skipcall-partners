import { Pencil, X as XIcon } from 'lucide-react';

// Pill badge showing published / draft state next to an editor's title.
// Used by both MarketplaceEditorPage and FormBuilderPage so the visual
// stays in sync across editors. Rendered on its own line under the
// subtitle (left-aligned) with a small coloured dot for extra glance-
// ability.
export function StatusBadge({ published, publishedLabel, draftLabel }) {
  const fg = published ? '#059669' : '#64748b';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 999,
      background: published ? '#f0fdf4' : '#f1f5f9',
      color: fg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />
      {published ? publishedLabel : draftLabel}
    </span>
  );
}

// Floating top-right pill used to enter / leave an editor's edit mode.
// `isOpen` flips the visual to the white "close" state. Pages that
// don't have a close state (e.g. Formulaire, where the pill simply
// jumps to the Champs tab) just leave `isOpen` undefined / false.
export function EditPill({ onClick, isOpen = false, openLabel, closeLabel, primary = '#059669', border = '#e2e8f0' }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute', top: 16, right: 24, zIndex: 10,
        padding: '6px 16px', borderRadius: 8,
        background: isOpen ? '#fff' : primary,
        border: isOpen ? `1px solid ${border}` : 'none',
        color: isOpen ? '#0f172a' : '#fff',
        fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        boxShadow: isOpen ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      {isOpen ? <XIcon size={13} /> : <Pencil size={13} />}
      {isOpen ? closeLabel : openLabel}
    </button>
  );
}
