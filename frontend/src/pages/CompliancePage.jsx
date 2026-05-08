import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Shield, FileText, Lock, AlertTriangle, Package, Activity } from 'lucide-react';
import api from '../lib/api';

// /admin/compliance — superadmin SOC 2 / ISO 27001 evidence dashboard.
// Six KPI cards, fetched in one round-trip from
// GET /api/admin/compliance/dashboard.

function fmtUptime(s) {
  if (s == null) return '—';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((s % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const cardTitleStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const bigNumberStyle = {
  fontSize: 36,
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1,
  marginTop: 4,
};

const captionStyle = {
  fontSize: 12,
  color: '#94a3b8',
};

export default function CompliancePage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getComplianceDashboard()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({}); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const lastAuditDays = daysAgo(data?.last_audit_date);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <Helmet><title>{t('compliance.title', 'Conformité')} · RefBoost</title></Helmet>

      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
        {t('compliance.title', 'Conformité')}
      </h1>
      <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 28px' }}>
        {t('compliance.subtitle', 'Tableau de bord SOC 2 / ISO 27001 — preuves opérationnelles')}
      </p>

      {/* Responsive grid: 3 cols ≥1024px, 2 cols ≥640px, 1 col mobile */}
      <style>{`
        .rb-compliance-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .rb-compliance-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 1024px) {
          .rb-compliance-grid { grid-template-columns: 1fr 1fr 1fr; }
        }
      `}</style>

      <div className="rb-compliance-grid">
        {/* 1. Last security audit */}
        <div style={card}>
          <div style={cardTitleStyle}>
            <Shield size={14} color="#6366f1" />
            {t('compliance.card.last_audit', 'Dernier audit sécurité')}
          </div>
          <div style={bigNumberStyle}>
            {data?.last_audit_date || (loading ? '…' : 'n/a')}
          </div>
          <div style={captionStyle}>
            {lastAuditDays != null
              ? t('compliance.unit.days_ago', 'il y a {{count}} jours', { count: lastAuditDays })
              : ''}
          </div>
        </div>

        {/* 2. Audit log entries (30 days) */}
        <div style={card}>
          <div style={cardTitleStyle}>
            <FileText size={14} color="#0891b2" />
            {t('compliance.card.audit_entries', "Événements d'audit")}
          </div>
          <div style={bigNumberStyle}>
            {loading ? '…' : (data?.audit_entries_30d ?? 0).toLocaleString('fr-FR')}
          </div>
          <div style={captionStyle}>
            {t('compliance.unit.events_30d', 'sur 30 jours')}
          </div>
        </div>

        {/* 3. MFA adoption */}
        <div style={card}>
          <div style={cardTitleStyle}>
            <Lock size={14} color="#059669" />
            {t('compliance.card.mfa_adoption', 'Adoption MFA')}
          </div>
          <div style={bigNumberStyle}>
            {loading ? '…' : (data?.mfa_adoption_pct == null ? 'n/a' : `${data.mfa_adoption_pct}%`)}
          </div>
          <div style={captionStyle}>
            {data?.mfa_adoption_pct == null ? '' : t('compliance.unit.pct', '% des admins')}
          </div>
        </div>

        {/* 4. Failed logins (24h) */}
        <div style={card}>
          <div style={cardTitleStyle}>
            <AlertTriangle size={14} color="#dc2626" />
            {t('compliance.card.failed_logins', 'Échecs de connexion')}
          </div>
          <div style={{ ...bigNumberStyle, color: (data?.failed_logins_24h || 0) > 10 ? '#dc2626' : '#0f172a' }}>
            {loading ? '…' : (data?.failed_logins_24h ?? 0).toLocaleString('fr-FR')}
          </div>
          <div style={captionStyle}>
            {t('compliance.unit.events_24h', 'sur 24h')}
          </div>
        </div>

        {/* 5. npm vulnerabilities */}
        <div style={card}>
          <div style={cardTitleStyle}>
            <Package size={14} color="#f97316" />
            {t('compliance.card.npm_vulns', 'Vulnérabilités npm')}
          </div>
          <div style={bigNumberStyle}>
            {loading ? '…' : (data?.npm_vulns
              ? `${(data.npm_vulns.high || 0) + (data.npm_vulns.critical || 0)}`
              : 'n/a')}
          </div>
          <div style={captionStyle}>
            {data?.npm_vulns
              ? `${data.npm_vulns.critical || 0} ${t('compliance.unit.critical', 'critique')} · ${data.npm_vulns.high || 0} ${t('compliance.unit.high', 'haute')}`
              : ''}
          </div>
        </div>

        {/* 6. System uptime */}
        <div style={card}>
          <div style={cardTitleStyle}>
            <Activity size={14} color="#8b5cf6" />
            {t('compliance.card.uptime', 'Temps de fonctionnement')}
          </div>
          <div style={bigNumberStyle}>
            {loading ? '…' : fmtUptime(data?.uptime_s)}
          </div>
          <div style={captionStyle}>{/* uptime caption intentionally empty */}</div>
        </div>
      </div>
    </div>
  );
}
