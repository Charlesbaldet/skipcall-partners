import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
  { code: 'de', label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
];

/**
 * direction: 'down' (navbar / default) | 'up' (sidebar)
 * dark:      true = fond sombre (sidebar), false = fond blanc (navbar)
 */
export default function LanguageSwitcher({ style = {}, compact = false, direction = 'down', dark = false }) {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];
  const [open, setOpen] = useState(false);

  const select = (code) => { i18n.changeLanguage(code); setOpen(false); };

  const btnBorder  = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
  const btnBorderH = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  const btnColor   = dark ? '#94a3b8' : '#64748b';
  const dropBg     = dark ? '#1e293b' : '#ffffff';
  const dropBorder = dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
  const dropShadow = dark ? '0 8px 30px rgba(0,0,0,0.4)' : '0 8px 30px rgba(0,0,0,0.12)';
  const itemColor  = dark ? '#94a3b8' : '#64748b';
  const itemHover  = dark ? 'rgba(255,255,255,0.05)' : '#f8fafc';

  // Dropdown position : vers le bas (navbar) ou vers le haut (sidebar)
  const dropPos = direction === 'up'
    ? { bottom: 'calc(100% + 8px)', top: 'auto', left: 0 }
    : { top:    'calc(100% + 8px)', bottom: 'auto', left: 0 };

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'transparent',
          border: `1.5px solid ${btnBorder}`,
          borderRadius: 8,
          padding: compact ? '5px 8px' : '6px 12px',
          fontSize: 13,
          cursor: 'pointer',
          color: btnColor,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all .2s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = btnBorderH}
        onMouseLeave={e => e.currentTarget.style.borderColor = btnBorder}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>{current.flag}</span>
        {!compact && <span>{current.label}</span>}
        <span style={{ fontSize: 9, opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <>
          {/* Overlay pour fermer */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
          />
          <div style={{
            position: 'absolute',
            ...dropPos,
            zIndex: 999,
            background: dropBg,
            border: `1px solid ${dropBorder}`,
            borderRadius: 12,
            padding: '6px',
            minWidth: 160,
            boxShadow: dropShadow,
          }}>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => select(l.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: l.code === i18n.language ? 'rgba(5,150,105,0.12)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: l.code === i18n.language ? '#059669' : itemColor,
                  fontWeight: l.code === i18n.language ? 600 : 400,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => { if (l.code !== i18n.language) e.currentTarget.style.background = itemHover; }}
                onMouseLeave={e => { if (l.code !== i18n.language) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                <span>{l.label}</span>
                {l.code === i18n.language && <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
