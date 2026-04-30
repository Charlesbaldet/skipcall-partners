// Imperative dialogs: showConfirm / showPrompt / showToast.
//
// Backs every native window.confirm / alert / prompt call site so the
// rest of the codebase doesn't have to plumb React state through
// every event handler. The API mirrors the native one in spirit:
//
//   const ok = await showConfirm({ title, message });
//   if (!ok) return;
//
//   const value = await showPrompt({ title, label, defaultValue });
//   if (value == null) return;
//
//   showToast('Saved.', 'success');
//
// A single <DialogsHost/> mounted near the App root listens to a
// module-level pub/sub bus and renders whatever is active.

import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, X } from 'lucide-react';
import ConfirmModal from './ConfirmModal.jsx';

// ─── Module-level bus ───────────────────────────────────────────────
// State + listeners live outside React so any code (helpers, async
// service callbacks, anywhere) can call show* without a hook.
let _id = 0;
const _state = {
  toasts: [],     // [{ id, text, type, ts }]
  confirm: null,  // { id, ...props, resolve }
  prompt: null,   // { id, ...props, resolve }
};
const _listeners = new Set();
function _emit() { for (const l of _listeners) l(_snapshot()); }
function _snapshot() {
  return {
    toasts: [..._state.toasts],
    confirm: _state.confirm,
    prompt: _state.prompt,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

export function showToast(text, type = 'info', durationMs = 4500) {
  if (!text) return;
  const id = ++_id;
  _state.toasts.push({ id, text: String(text), type, ts: Date.now() });
  _emit();
  if (durationMs > 0) {
    setTimeout(() => {
      _state.toasts = _state.toasts.filter(t => t.id !== id);
      _emit();
    }, durationMs);
  }
}
showToast.success = (text, ms) => showToast(text, 'success', ms);
showToast.error   = (text, ms) => showToast(text, 'error',   ms);
showToast.info    = (text, ms) => showToast(text, 'info',    ms);
showToast.warning = (text, ms) => showToast(text, 'warning', ms);

export function showConfirm({
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default', // 'default' | 'danger' | 'warning'
} = {}) {
  return new Promise((resolve) => {
    const id = ++_id;
    _state.confirm = {
      id,
      title: title || 'Confirmer',
      message,
      confirmLabel: confirmLabel || 'Confirmer',
      cancelLabel: cancelLabel || 'Annuler',
      variant,
      resolve: (value) => {
        if (_state.confirm && _state.confirm.id === id) {
          _state.confirm = null;
          _emit();
        }
        resolve(value);
      },
    };
    _emit();
  });
}

export function showPrompt({
  title,
  message,
  label,
  defaultValue = '',
  placeholder,
  confirmLabel,
  cancelLabel,
  required = true,
} = {}) {
  return new Promise((resolve) => {
    const id = ++_id;
    _state.prompt = {
      id,
      title: title || 'Saisir une valeur',
      message,
      label,
      defaultValue,
      placeholder,
      confirmLabel: confirmLabel || 'OK',
      cancelLabel: cancelLabel || 'Annuler',
      required,
      resolve: (value) => {
        if (_state.prompt && _state.prompt.id === id) {
          _state.prompt = null;
          _emit();
        }
        resolve(value);
      },
    };
    _emit();
  });
}

// ─── Host component ─────────────────────────────────────────────────
// Mount once near the App root. Subscribes to the module bus and
// renders whatever is active.
export function DialogsHost() {
  const [s, setS] = useState(_snapshot());
  useEffect(() => {
    _listeners.add(setS);
    return () => _listeners.delete(setS);
  }, []);

  return (
    <>
      <ToastList toasts={s.toasts} />
      {s.confirm && (
        <ConfirmModal
          isOpen={true}
          title={s.confirm.title}
          message={s.confirm.message}
          confirmLabel={s.confirm.confirmLabel}
          cancelLabel={s.confirm.cancelLabel}
          variant={s.confirm.variant}
          onConfirm={() => s.confirm.resolve(true)}
          onCancel={() => s.confirm.resolve(false)}
        />
      )}
      {s.prompt && (
        <PromptModalImpl prompt={s.prompt} />
      )}
    </>
  );
}

// ─── Toast renderer ────────────────────────────────────────────────
function ToastList({ toasts }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 4000,
      display: 'flex', flexDirection: 'column', gap: 10,
      maxWidth: 'min(420px, calc(100vw - 48px))',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => <Toast key={t.id} toast={t} />)}
    </div>
  );
}

function Toast({ toast }) {
  const palette = toast.type === 'error'
    ? { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', icon: AlertTriangle }
    : toast.type === 'success'
      ? { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534', icon: CheckCircle }
      : toast.type === 'warning'
        ? { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: AlertCircle }
        : { bg: '#f0f9ff', border: '#bae6fd', color: '#075985', icon: AlertCircle };
  const Icon = palette.icon;
  const dismiss = () => {
    _state.toasts = _state.toasts.filter(x => x.id !== toast.id);
    _emit();
  };
  return (
    <div role="status" style={{
      pointerEvents: 'auto',
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 14px', borderRadius: 12,
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color,
      fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
      boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
      animation: 'rb-toast-in .15s ease-out',
    }}>
      <style>{`@keyframes rb-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, lineHeight: 1.45 }}>{toast.text}</div>
      <button
        onClick={dismiss}
        aria-label="close"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 4, display: 'flex' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Prompt modal ──────────────────────────────────────────────────
function PromptModalImpl({ prompt }) {
  const [value, setValue] = useState(prompt.defaultValue || '');
  const canSubmit = !prompt.required || value.trim().length > 0;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') prompt.resolve(null);
      else if (e.key === 'Enter' && canSubmit) prompt.resolve(value.trim());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompt, value, canSubmit]);

  return (
    <div
      onClick={() => prompt.resolve(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 3500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        fontFamily: 'inherit',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: '#fff', borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 440,
          boxShadow: '0 25px 80px rgba(15,23,42,0.25)',
          color: '#0f172a',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>{prompt.title}</h3>
        {prompt.message && (
          <p style={{ margin: '0 0 14px', color: '#475569', fontSize: 14, lineHeight: 1.55 }}>
            {prompt.message}
          </p>
        )}
        {prompt.label && (
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
            {prompt.label}
          </label>
        )}
        <input
          autoFocus
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={prompt.placeholder}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '2px solid #e2e8f0', fontSize: 14,
            color: '#0f172a', boxSizing: 'border-box', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            onClick={() => prompt.resolve(null)}
            style={{
              padding: '10px 18px', borderRadius: 10,
              border: '1.5px solid #e2e8f0', background: '#fff',
              color: '#0f172a', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {prompt.cancelLabel}
          </button>
          <button
            onClick={() => prompt.resolve(value.trim())}
            disabled={!canSubmit}
            style={{
              padding: '10px 18px', borderRadius: 10,
              border: 'none', background: canSubmit ? '#059669' : '#94a3b8',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              boxShadow: canSubmit ? '0 6px 18px rgba(5,150,105,0.25)' : 'none',
            }}
          >
            {prompt.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
