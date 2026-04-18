import { useEffect } from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';

// Reusable confirmation modal. Replaces window.confirm() everywhere so
// the tone matches the rest of RefBoost: white card, rounded, branded
// buttons, keyboard-dismissable.
//
// variants:
//   'danger'  → red CTA (delete / destructive)
//   'warning' → amber CTA (non-destructive but needs attention)
//   'default' → green CTA (primary brand)
//
// Use `children` for rich body content (lists, highlighted dates, etc.)
// — passing a plain string via `message` is fine for simple cases.
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
  children,
}) {
  // Close on Escape. Bind the listener only while the modal is open so
  // we don't eat Escape events for other dialogs.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const palette = variant === 'danger'
    ? { accent: '#dc2626', accentHover: '#b91c1c', soft: '#fef2f2', softBorder: '#fecaca', icon: AlertTriangle }
    : variant === 'warning'
      ? { accent: '#d97706', accentHover: '#b45309', soft: '#fffbeb', softBorder: '#fde68a', icon: AlertCircle }
      : { accent: '#059669', accentHover: '#047857', soft: '#f0fdf4', softBorder: '#bbf7d0', icon: AlertCircle };
  const Icon = palette.icon;

  return (
    <div
      onClick={() => !loading && onCancel?.()}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        fontFamily: 'inherit',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          width: '100%', maxWidth: 420,
          boxShadow: '0 25px 80px rgba(15,23,42,0.25)',
          color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: palette.soft, border: `1px solid ${palette.softBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={20} color={palette.accent}/>
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</h3>
        </div>

        {message && (
          <div style={{ color: '#475569', fontSize: 14, lineHeight: 1.55, marginBottom: 20 }}>
            {message}
          </div>
        )}
        {children && (
          <div style={{ color: '#475569', fontSize: 14, lineHeight: 1.55, marginBottom: 20 }}>
            {children}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 10,
              border: '1.5px solid #e2e8f0', background: '#fff',
              color: '#0f172a', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 10,
              border: 'none', background: palette.accent,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              boxShadow: `0 6px 18px ${palette.accent}33`,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
