import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../components/LandingLayout.jsx';

// Public status surface. Polls /api/health every 30s for live state
// and /api/health/incidents once on mount for the recent history.
// Both endpoints are mounted before the rate limiter so a slow API
// never blocks the status page itself — that would defeat the
// purpose. Designed to render even when fetch fails: every status
// indicator falls back to "unknown" / red so an outage is visible.

function formatUptime(seconds, t) {
  if (typeof seconds !== 'number' || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}${t('statusPage.unit_day', 'j')} ${h}${t('statusPage.unit_hour', 'h')}`;
  if (h > 0) return `${h}${t('statusPage.unit_hour', 'h')} ${m}${t('statusPage.unit_min', 'm')}`;
  return `${m}${t('statusPage.unit_min', 'min')}`;
}

function StatusDot({ color, size = 12 }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 0 4px ${color}22`,
      }}
    />
  );
}

const COLORS = {
  ok: '#10b981',
  warn: '#f59e0b',
  err: '#ef4444',
  unknown: '#94a3b8',
};

function severityColor(sev) {
  if (sev === 'critical') return COLORS.err;
  if (sev === 'major') return COLORS.warn;
  return '#64748b';
}

function StatusCard({ label, value, color, sub }) {
  return (
    <div style={{
      flex: '1 1 200px',
      minWidth: 200,
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <StatusDot color={color} size={10} />
        <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</span>
      </div>
      <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>{value}</div>
      {sub && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function StatusPage() {
  const { t, i18n } = useTranslation();
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        const r = await fetch('/api/health', { credentials: 'omit' });
        const data = await r.json().catch(() => null);
        if (cancelled) return;
        setHealth(data);
        setHealthError(!r.ok);
      } catch {
        if (!cancelled) {
          setHealth(null);
          setHealthError(true);
        }
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health/incidents', { credentials: 'omit' })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setIncidents(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setIncidents([]); });
    return () => { cancelled = true; };
  }, []);

  // Aggregate banner colour: green only when API + DB both report ok.
  const dbStatus = health?.database?.status;
  const apiOk = !healthError && health && dbStatus === 'ok';
  const bannerColor = apiOk ? COLORS.ok : COLORS.err;
  const bannerLabel = apiOk ? t('statusPage.all_ok') : t('statusPage.incident');

  const apiColor = healthError ? COLORS.err : (health ? COLORS.ok : COLORS.unknown);
  const dbColor = dbStatus === 'ok' ? COLORS.ok : (dbStatus === 'error' ? COLORS.err : COLORS.unknown);

  const visibleIncidents = (incidents || []).slice(0, 10);
  const dateLocale = i18n.language || 'fr';

  return (
    <LandingLayout>
      <Helmet>
        <title>{t('statusPage.title')} · RefBoost</title>
        <meta name="description" content={t('statusPage.title')} />
      </Helmet>
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '60px 24px 80px', fontFamily: 'inherit', color: '#0f172a' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.2, margin: '0 0 8px' }}>
          {t('statusPage.title')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, margin: '0 0 32px' }}>
          {t('statusPage.subtitle', 'Disponibilité en temps réel des services RefBoost.')}
        </p>

        {/* Big banner */}
        <div style={{
          background: '#fff',
          border: `1px solid ${bannerColor}33`,
          borderLeft: `4px solid ${bannerColor}`,
          borderRadius: 14,
          padding: '24px 28px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <StatusDot color={bannerColor} size={16} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{bannerLabel}</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
              {t('statusPage.last_check', 'Dernière vérification')} · {new Date().toLocaleTimeString(dateLocale)}
            </div>
          </div>
        </div>

        {/* Status cards */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 40 }}>
          <StatusCard
            label={t('statusPage.api')}
            value={apiColor === COLORS.ok ? t('statusPage.all_ok') : t('statusPage.incident')}
            color={apiColor}
            sub={health?.memory ? `${health.memory.heap_mb} MB` : undefined}
          />
          <StatusCard
            label={t('statusPage.database')}
            value={dbColor === COLORS.ok ? t('statusPage.all_ok') : t('statusPage.incident')}
            color={dbColor}
            sub={typeof health?.database?.latency_ms === 'number' ? `${health.database.latency_ms} ms` : undefined}
          />
          <StatusCard
            label={t('statusPage.uptime')}
            value={formatUptime(health?.uptime_s, t)}
            color={COLORS.ok}
          />
          <StatusCard
            label={t('statusPage.last_deploy')}
            value={health?.version || '—'}
            color={COLORS.ok}
          />
        </div>

        {/* Incident history */}
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, margin: '0 0 16px' }}>
          {t('statusPage.history')}
        </h2>
        {visibleIncidents.length === 0 ? (
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 28,
            color: '#64748b',
            fontSize: 14,
            textAlign: 'center',
          }}>
            {t('statusPage.empty')}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleIncidents.map(inc => {
              const start = inc.started_at ? new Date(inc.started_at) : null;
              const end = inc.resolved_at ? new Date(inc.resolved_at) : null;
              return (
                <li key={inc.id} style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '16px 20px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <StatusDot color={severityColor(inc.severity)} size={10} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{inc.title}</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.6,
                      color: severityColor(inc.severity),
                      background: severityColor(inc.severity) + '15',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}>
                      {t(`status.severity.${inc.severity}`, inc.severity)}
                    </span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.6,
                      color: '#64748b',
                      background: '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}>
                      {t(`status.incident_status.${inc.status}`, inc.status)}
                    </span>
                  </div>
                  {inc.description && (
                    <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.6, margin: '10px 0 0' }}>{inc.description}</div>
                  )}
                  <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>
                    {start ? start.toLocaleString(dateLocale) : '—'}
                    {end ? ` → ${end.toLocaleString(dateLocale)}` : ''}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </LandingLayout>
  );
}
