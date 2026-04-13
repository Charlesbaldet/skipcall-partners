import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
];

export default function LanguageSwitcher({ style = {}, compact = false }) {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];
  const [open, setOpen] = useState(false);

  const select = (code) => { i18n.changeLanguage(code); setOpen(false); };

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'transparent', border: '1.5px solid rgba(255,255,255,0.15)',
          borderRadius: 8, padding: compact ? '5px 8px' : '6px 12px',
          fontSize: 13, cursor: 'pointer', color: '#94a3b8',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'all .2s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
      >
        <span style={{ fontSize: 15 }}>{current.flag}</span>
        {!compact && <span>{current.label}</span>}
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'absolute', bottom: '110%', left: 0, zIndex: 999,
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: '6px', minWidth: 160,
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          }}>
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => select(l.code)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 10px', borderRadius: 8,
                background: l.code === i18n.language ? 'rgba(5,150,105,0.2)' : 'transparent',
                border: 'none', cursor: 'pointer', color: l.code === i18n.language ? '#10b981' : '#94a3b8',
                fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
              }}
              onMouseEnter={e => { if (l.code !== i18n.language) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (l.code !== i18n.language) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
