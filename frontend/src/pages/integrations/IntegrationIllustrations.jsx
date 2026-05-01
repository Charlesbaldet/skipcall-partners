// Inline SVG illustrations for each /integrations/:slug "Aperçu"
// section. viewBox-based so they scale to whatever container width;
// height is fixed via the `height` prop (default 300). Flat design,
// RefBoost green plus the partner's brand color. No external assets
// — everything lives in this file so the edge bundle stays small.

const RB = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#94a3b8', light: '#ecfdf5' };

function Frame({ children, height = 300, viewBox = '0 0 600 300' }) {
  return (
    <svg
      role="img"
      aria-hidden="true"
      width="100%"
      height={height}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', maxWidth: '100%' }}
    >
      {children}
    </svg>
  );
}

// ─── Notion — RefBoost fields ↔ Notion properties mapping ──────────
export function NotionIllustration({ height }) {
  return (
    <Frame height={height} viewBox="0 0 600 300">
      <rect x="0" y="0" width="600" height="300" fill="#fafbfc" />
      {/* RefBoost panel */}
      <rect x="40" y="40" width="220" height="220" rx="12" fill="#fff" stroke="#e2e8f0" />
      <rect x="56" y="58" width="80" height="18" rx="4" fill={RB.light} />
      <text x="62" y="71" fontFamily="system-ui" fontSize="10" fontWeight="700" fill={RB.p}>RefBoost</text>
      {[
        { y: 96, label: 'prospect_name' },
        { y: 130, label: 'prospect_company' },
        { y: 164, label: 'deal_value' },
        { y: 198, label: 'status' },
      ].map(r => (
        <g key={r.y}>
          <rect x="56" y={r.y} width="188" height="22" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
          <circle cx="68" cy={r.y + 11} r="3" fill={RB.p} />
          <text x="78" y={r.y + 14.5} fontFamily="ui-monospace, monospace" fontSize="11" fill="#0f172a">{r.label}</text>
        </g>
      ))}

      {/* Mapping arrows */}
      {[107, 141, 175, 209].map((y, i) => (
        <g key={y}>
          <path d={`M260 ${y} L340 ${y}`} stroke={i % 2 === 0 ? RB.p : '#0f172a'} strokeWidth="2" strokeDasharray="4 3" markerEnd={`url(#arrow${i % 2})`} />
        </g>
      ))}

      {/* Notion panel */}
      <rect x="340" y="40" width="220" height="220" rx="12" fill="#fff" stroke="#e2e8f0" />
      <rect x="356" y="58" width="60" height="18" rx="4" fill="#f1f5f9" />
      <text x="362" y="71" fontFamily="system-ui" fontSize="10" fontWeight="700" fill="#0f172a">Notion</text>
      {[
        { y: 96, label: 'Name', icon: 'A' },
        { y: 130, label: 'Company', icon: 'B' },
        { y: 164, label: 'Value', icon: '#' },
        { y: 198, label: 'Stage', icon: '⌘' },
      ].map(r => (
        <g key={r.y}>
          <rect x="356" y={r.y} width="188" height="22" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
          <text x="362" y={r.y + 14} fontFamily="ui-monospace, monospace" fontSize="11" fill="#475569">{r.icon}</text>
          <text x="380" y={r.y + 14.5} fontFamily="system-ui" fontSize="11" fill="#0f172a">{r.label}</text>
        </g>
      ))}

      <defs>
        <marker id="arrow0" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill={RB.p} />
        </marker>
        <marker id="arrow1" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#0f172a" />
        </marker>
      </defs>
    </Frame>
  );
}

// ─── HubSpot — pipeline → HubSpot Deals sync ──────────────────────
export function HubspotIllustration({ height }) {
  const HS = '#ff7a59';
  const stages = ['Qualifié', 'Réunion', 'Proposition', 'Gagné'];
  return (
    <Frame height={height} viewBox="0 0 600 300">
      <rect x="0" y="0" width="600" height="300" fill="#fafbfc" />

      {/* RefBoost pipeline (top) */}
      <text x="40" y="55" fontFamily="system-ui" fontSize="11" fontWeight="700" fill={RB.p}>PIPELINE REFBOOST</text>
      {stages.map((s, i) => (
        <g key={i} transform={`translate(${40 + i * 130}, 70)`}>
          <rect width="115" height="56" rx="10" fill="#fff" stroke="#e2e8f0" />
          <rect width="115" height="6" rx="3" fill={RB.p} />
          <text x="12" y="28" fontFamily="system-ui" fontSize="11" fontWeight="600" fill="#0f172a">{s}</text>
          <text x="12" y="44" fontFamily="system-ui" fontSize="9" fill={RB.m}>{(i + 1) * 3} deals</text>
        </g>
      ))}

      {/* Sync arrows down (alternating colors to show bidirectional) */}
      {[0, 1, 2, 3].map(i => (
        <g key={i} transform={`translate(${100 + i * 130}, 130)`}>
          <path d="M0 0 L0 32" stroke={RB.p} strokeWidth="2" />
          <path d="M-4 26 L0 32 L4 26" stroke={RB.p} strokeWidth="2" fill="none" />
          <path d="M-12 0 L-12 32" stroke={HS} strokeWidth="2" />
          <path d="M-16 6 L-12 0 L-8 6" stroke={HS} strokeWidth="2" fill="none" />
        </g>
      ))}

      {/* HubSpot pipeline (bottom) */}
      <text x="40" y="185" fontFamily="system-ui" fontSize="11" fontWeight="700" fill={HS}>HUBSPOT DEALS</text>
      {stages.map((s, i) => (
        <g key={i} transform={`translate(${40 + i * 130}, 200)`}>
          <rect width="115" height="56" rx="10" fill="#fff" stroke="#e2e8f0" />
          <rect width="115" height="6" rx="3" fill={HS} />
          <text x="12" y="28" fontFamily="system-ui" fontSize="11" fontWeight="600" fill="#0f172a">{s}</text>
          <circle cx="100" cy="40" r="6" fill={HS} opacity="0.15" />
          <circle cx="100" cy="40" r="3" fill={HS} />
        </g>
      ))}
    </Frame>
  );
}

// ─── Salesforce — Opportunity mapping ─────────────────────────────
export function SalesforceIllustration({ height }) {
  const SF = '#00a1e0';
  return (
    <Frame height={height} viewBox="0 0 600 300">
      <rect x="0" y="0" width="600" height="300" fill="#fafbfc" />

      {/* RefBoost referral card */}
      <rect x="40" y="60" width="200" height="170" rx="14" fill="#fff" stroke="#e2e8f0" />
      <rect x="40" y="60" width="200" height="40" rx="14" fill={RB.light} />
      <text x="56" y="86" fontFamily="system-ui" fontSize="12" fontWeight="700" fill={RB.p}>Referral RefBoost</text>
      <text x="56" y="124" fontFamily="system-ui" fontSize="11" fill="#0f172a">Acme Corp</text>
      <text x="56" y="142" fontFamily="system-ui" fontSize="10" fill={RB.m}>Jean Dupont · Directeur achats</text>
      <text x="56" y="170" fontFamily="system-ui" fontSize="14" fontWeight="800" fill={RB.p}>12 500 €</text>
      <text x="56" y="186" fontFamily="system-ui" fontSize="10" fill={RB.m}>Stage : Proposition</text>
      <rect x="56" y="200" width="60" height="18" rx="9" fill={RB.p} opacity="0.1" />
      <text x="62" y="213" fontFamily="system-ui" fontSize="9" fontWeight="700" fill={RB.p}>Synced</text>

      {/* Cloud sync */}
      <g transform="translate(280, 130)">
        <ellipse cx="20" cy="20" rx="22" ry="14" fill={SF} opacity="0.12" />
        <ellipse cx="20" cy="20" rx="14" ry="9" fill={SF} opacity="0.25" />
        <text x="20" y="26" textAnchor="middle" fontFamily="system-ui" fontSize="20" fill={SF}>↔</text>
      </g>

      {/* Salesforce Opportunity card */}
      <rect x="360" y="60" width="200" height="170" rx="14" fill="#fff" stroke="#e2e8f0" />
      <rect x="360" y="60" width="200" height="40" rx="14" fill="#e6f6fc" />
      <text x="376" y="86" fontFamily="system-ui" fontSize="12" fontWeight="700" fill={SF}>Opportunity</text>
      <text x="376" y="124" fontFamily="system-ui" fontSize="11" fill="#0f172a">Acme Corp</text>
      <text x="376" y="142" fontFamily="system-ui" fontSize="10" fill={RB.m}>Account · Contact lié</text>
      <text x="376" y="170" fontFamily="system-ui" fontSize="14" fontWeight="800" fill={SF}>$12,500</text>
      <text x="376" y="186" fontFamily="system-ui" fontSize="10" fill={RB.m}>Stage : Proposal</text>
      <rect x="376" y="200" width="74" height="18" rx="9" fill={SF} opacity="0.1" />
      <text x="382" y="213" fontFamily="system-ui" fontSize="9" fontWeight="700" fill={SF}>Bidirectional</text>
    </Frame>
  );
}

// ─── Qonto — payment flow (Approved → SEPA → Paid) ─────────────────
export function QontoIllustration({ height }) {
  const Q = '#d4a015';
  const labels = [
    { title: 'Approuvée', sub: 'Commission validée', color: RB.p },
    { title: 'SEPA + SCA', sub: 'Virement Qonto', color: Q },
    { title: 'Payé', sub: 'Preuve email', color: '#16a34a' },
  ];
  return (
    <Frame height={height} viewBox="0 0 600 300">
      <rect x="0" y="0" width="600" height="300" fill="#fafbfc" />

      {/* Connecting line */}
      <line x1="100" y1="150" x2="500" y2="150" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4" />

      {labels.map((l, i) => (
        <g key={i} transform={`translate(${100 + i * 200 - 50}, 100)`}>
          <circle cx="50" cy="50" r="32" fill="#fff" stroke={l.color} strokeWidth="3" />
          <text x="50" y="58" textAnchor="middle" fontFamily="system-ui" fontSize="22" fontWeight="800" fill={l.color}>{i + 1}</text>
          {/* Step icon */}
          {i === 0 && (
            <text x="50" y="48" textAnchor="middle" fontFamily="system-ui" fontSize="18" fill={l.color}>✓</text>
          )}
          {i === 1 && (
            <g transform="translate(38, 38)">
              <rect x="0" y="0" width="24" height="14" rx="2" fill="none" stroke={l.color} strokeWidth="2" />
              <line x1="0" y1="6" x2="24" y2="6" stroke={l.color} strokeWidth="2" />
            </g>
          )}
          {i === 2 && (
            <text x="50" y="48" textAnchor="middle" fontFamily="system-ui" fontSize="22" fill={l.color}>€</text>
          )}
          <text x="50" y="115" textAnchor="middle" fontFamily="system-ui" fontSize="13" fontWeight="700" fill="#0f172a">{l.title}</text>
          <text x="50" y="132" textAnchor="middle" fontFamily="system-ui" fontSize="11" fill={RB.m}>{l.sub}</text>
        </g>
      ))}

      {/* Phone (SCA) badge above step 2 */}
      <g transform="translate(284, 35)">
        <rect width="32" height="48" rx="5" fill="#fff" stroke={Q} strokeWidth="2" />
        <rect x="4" y="8" width="24" height="28" fill={Q} opacity="0.15" />
        <circle cx="16" cy="42" r="2" fill={Q} />
        <text x="16" y="22" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="700" fill={Q}>SCA</text>
        <text x="16" y="32" textAnchor="middle" fontFamily="system-ui" fontSize="14" fill={Q}>📱</text>
      </g>
    </Frame>
  );
}

// ─── Google SSO — sign-in → dashboard ─────────────────────────────
export function GoogleSsoIllustration({ height }) {
  return (
    <Frame height={height} viewBox="0 0 600 300">
      <rect x="0" y="0" width="600" height="300" fill="#fafbfc" />

      {/* Google sign-in button */}
      <g transform="translate(60, 110)">
        <rect width="220" height="60" rx="12" fill="#fff" stroke="#e2e8f0" />
        {/* Google G logo (simplified) */}
        <g transform="translate(20, 18)">
          <path d="M12 0a12 12 0 1 0 11.4 16H12v-6h17a14 14 0 1 1-3.6-13.4l-4.4 4.4a8 8 0 1 0 1.5 8.6h-9V6h13" fill="none" />
          <path d="M22 12.5a10 10 0 0 1-2 5.7l-4-3a5 5 0 0 0 1-2.7h5z" fill="#4285f4" />
          <path d="M12 17a5 5 0 0 1-4.7-3.3L3 16.4A10 10 0 0 0 12 22a10 10 0 0 0 6.4-2.3l-4-3.1A5 5 0 0 1 12 17z" fill="#34a853" />
          <path d="M7.3 13.7a5 5 0 0 1 0-3.4L3 7A10 10 0 0 0 3 16.4l4.3-2.7z" fill="#fbbc04" />
          <path d="M12 7a5.4 5.4 0 0 1 3.8 1.5l3.5-3.5A10 10 0 0 0 12 2 10 10 0 0 0 3 7l4.3 3.3A5 5 0 0 1 12 7z" fill="#ea4335" />
        </g>
        <text x="62" y="38" fontFamily="system-ui" fontSize="14" fontWeight="600" fill="#0f172a">Se connecter avec Google</text>
      </g>

      {/* Arrow */}
      <g transform="translate(290, 130)">
        <line x1="0" y1="20" x2="60" y2="20" stroke={RB.p} strokeWidth="3" />
        <path d="M52 12 L62 20 L52 28" stroke={RB.p} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Dashboard mockup */}
      <g transform="translate(360, 70)">
        <rect width="200" height="160" rx="12" fill="#fff" stroke="#e2e8f0" />
        <rect width="200" height="28" rx="12" fill={RB.s} />
        <circle cx="14" cy="14" r="3" fill="#ef4444" />
        <circle cx="26" cy="14" r="3" fill="#f59e0b" />
        <circle cx="38" cy="14" r="3" fill="#10b981" />
        <text x="100" y="18" textAnchor="middle" fontFamily="system-ui" fontSize="9" fill="#cbd5e1">refboost.io/dashboard</text>
        <rect x="14" y="40" width="80" height="12" rx="3" fill={RB.light} />
        <rect x="14" y="58" width="172" height="40" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
        <rect x="22" y="64" width="50" height="6" rx="2" fill={RB.p} opacity="0.5" />
        <rect x="22" y="76" width="80" height="14" rx="3" fill={RB.p} opacity="0.2" />
        <rect x="14" y="106" width="84" height="40" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
        <rect x="102" y="106" width="84" height="40" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
      </g>

      {/* Lock icon (security) */}
      <g transform="translate(170, 220)">
        <circle r="14" fill="#ecfdf5" />
        <text y="5" textAnchor="middle" fontFamily="system-ui" fontSize="14" fill={RB.p}>🔒</text>
      </g>
      <text x="190" y="225" fontFamily="system-ui" fontSize="10" fill={RB.m}>Zéro mot de passe à gérer</text>
    </Frame>
  );
}

export const ILLUSTRATION_BY_SLUG = {
  notion: NotionIllustration,
  hubspot: HubspotIllustration,
  salesforce: SalesforceIllustration,
  qonto: QontoIllustration,
  'google-sso': GoogleSsoIllustration,
};
