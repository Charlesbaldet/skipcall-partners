import { useState, useEffect } from 'react';
import { Search, ExternalLink, Globe, Users, Tag, X, Filter } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../components/LandingLayout';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#f8fafc', card: '#fff' };

const SECTORS_STATIC = [
  'SaaS / Logiciel', 'Conseil & Services', 'Finance & Fintech', 'RH & Recrutement',
  'Marketing & Communication', 'Immobilier', 'Commerce', 'Formation',
  'Juridique', 'Comptabilité', 'Industrie', 'Autre',
];


const SECTOR_TRANSLATIONS = {
  en: { 'SaaS / Logiciel': 'SaaS / Software', 'Conseil & Services': 'Consulting & Services', 'Finance & Fintech': 'Finance & Fintech', 'RH & Recrutement': 'HR & Recruitment', 'Marketing & Communication': 'Marketing & Communication', 'Immobilier': 'Real Estate', 'Commerce': 'Commerce', 'Formation': 'Training', 'Juridique': 'Legal', 'Comptabilité': 'Accounting', 'Industrie': 'Industry', 'Autre': 'Other' },
  es: { 'SaaS / Logiciel': 'SaaS / Software', 'Conseil & Services': 'Consultoría y Servicios', 'Finance & Fintech': 'Finanzas y Fintech', 'RH & Recrutement': 'RRHH y Reclutamiento', 'Marketing & Communication': 'Marketing y Comunicación', 'Immobilier': 'Inmobiliaria', 'Commerce': 'Comercio', 'Formation': 'Formación', 'Juridique': 'Jurídico', 'Comptabilité': 'Contabilidad', 'Industrie': 'Industria', 'Autre': 'Otro' },
  de: { 'SaaS / Logiciel': 'SaaS / Software', 'Conseil & Services': 'Beratung & Dienstleistungen', 'Finance & Fintech': 'Finanzen & Fintech', 'RH & Recrutement': 'HR & Recruiting', 'Marketing & Communication': 'Marketing & Kommunikation', 'Immobilier': 'Immobilien', 'Commerce': 'Handel', 'Formation': 'Ausbildung', 'Juridique': 'Recht', 'Comptabilité': 'Buchhaltung', 'Industrie': 'Industrie', 'Autre': 'Sonstiges' },
  it: { 'SaaS / Logiciel': 'SaaS / Software', 'Conseil & Services': 'Consulenza e Servizi', 'Finance & Fintech': 'Finanza e Fintech', 'RH & Recrutement': 'Risorse Umane', 'Marketing & Communication': 'Marketing e Comunicazione', 'Immobilier': 'Immobiliare', 'Commerce': 'Commercio', 'Formation': 'Formazione', 'Juridique': 'Legale', 'Comptabilité': 'Contabilità', 'Industrie': 'Industria', 'Autre': 'Altro' },
  nl: { 'SaaS / Logiciel': 'SaaS / Software', 'Conseil & Services': 'Advies & Diensten', 'Finance & Fintech': 'Financiën & Fintech', 'RH & Recrutement': 'HR & Werving', 'Marketing & Communication': 'Marketing & Communicatie', 'Immobilier': 'Vastgoed', 'Commerce': 'Handel', 'Formation': 'Opleiding', 'Juridique': 'Juridisch', 'Comptabilité': 'Boekhouding', 'Industrie': 'Industrie', 'Autre': 'Overig' },
  pt: { 'SaaS / Logiciel': 'SaaS / Software', 'Conseil & Services': 'Consultoria e Serviços', 'Finance & Fintech': 'Finanças e Fintech', 'RH & Recrutement': 'RH e Recrutamento', 'Marketing & Communication': 'Marketing e Comunicação', 'Immobilier': 'Imobiliário', 'Commerce': 'Comércio', 'Formation': 'Formação', 'Juridique': 'Jurídico', 'Comptabilité': 'Contabilidade', 'Industrie': 'Indústria', 'Autre': 'Outro' },
};

function PartnerCard({ partner }) {
  const { t, i18n } = useTranslation();
  const trSector = (s) => SECTOR_TRANSLATIONS[i18n.language]?.[s] || s;
  const initials = partner.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const color = partner.primary_color || C.p;
  return (
    <article style={{ background: C.card, borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column', gap: 14, transition: 'transform .2s, box-shadow .2s', overflow: 'hidden' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(5,150,105,.13)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)'; }}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          {partner.logo_url
            ? <img src={partner.logo_url} alt={partner.name} style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'contain', border: '1px solid #f1f5f9' }} />
            : <div style={{ width: 48, height: 48, borderRadius: 12, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color }}>{initials}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.s }}>{partner.name}</div>
            {partner.sector && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color, background: color + '15', borderRadius: 20, padding: '2px 10px', marginTop: 4 }}>
                <Tag size={10} /> {trSector(partner.sector)}
              </span>
            )}
          </div>
        </div>
        <p style={{ fontSize: 14, color: C.m, lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {partner.short_description}
        </p>
        {partner.icp && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.m, background: '#f8fafc', borderRadius: 8, padding: '6px 10px', marginTop: 12 }}>
            <Users size={12} color={C.p} />
            <span><strong style={{ color: C.s }}>{t("marketplace.target")}</strong> {partner.icp}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 24px 24px', marginTop: 'auto' }}>
        {partner.website && (
          <a href={partner.website} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, border: '1.5px solid ' + color, color, fontWeight: 600, fontSize: 13, textDecoration: 'none', transition: 'all .2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = color; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = color; }}>
            <Globe size={14} /> {t("marketplace.website")}
          </a>
        )}
        <a href={'/r/' + partner.slug}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(135deg,' + C.p + ',' + C.pl + ')', color: '#fff', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          <ExternalLink size={14} /> {t("marketplace.join")}
        </a>
      </div>
    </article>
  );
}

export default function MarketplacePage() {
  const { t, i18n } = useTranslation();
  const trSector = (s) => SECTOR_TRANSLATIONS[i18n.language]?.[s] || s;
  const [partners, setPartners] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSector, setActiveSector] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.getMarketplaceSectors()
      .then(d => setSectors(d.sectors || []))
      .catch(() => setSectors(SECTORS_STATIC));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (activeSector) params.sector = activeSector;
    if (search.length > 1) params.q = search;
    const t = setTimeout(() => {
      api.getMarketplace(params)
        .then(d => setPartners(d.partners || []))
        .catch(() => setPartners([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, activeSector]);

  const reset = () => { setSearch(''); setActiveSector(''); };
  const allSectors = sectors.length > 0 ? sectors : SECTORS_STATIC;

  return (
    <LandingLayout>
      <Helmet>
        <title>{t("marketplace.helmet_title")}</title>
        <meta name="description" content={t("marketplace.subtitle")} />
      </Helmet>

      {/* Hero — identique au Blog */}
      <div style={{ background: 'linear-gradient(135deg, ' + C.s + ' 0%, #1e293b 100%)', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', color: C.p, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            Marketplace
          </span>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff', margin: '0 0 16px', lineHeight: 1.1 }}>
            {t("marketplace.title")}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 17, margin: '0 0 36px', lineHeight: 1.6 }}>
            {t("marketplace.subtitle")}
            
          </p>
          {/* Search bar */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '6px 6px 6px 20px', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 560, margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,.25)' }}>
            <Search size={18} color={C.m} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("marketplace.search_ph")}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: C.s, fontFamily: 'inherit', background: 'transparent' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={16} color={C.m} />
              </button>
            )}
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: showFilters ? C.p : C.s, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              <Filter size={14} /> {t("marketplace.all")}{activeSector ? ' •' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Sector filters — identique aux catégories Blog */}
      {showFilters && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px' }}>
          <nav aria-label="Secteurs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 960, margin: '0 auto', alignItems: 'center' }}>
            <button
              onClick={() => setActiveSector('')}
              style={{ padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + (!activeSector ? C.p : '#e2e8f0'), background: !activeSector ? C.p : '#fff', color: !activeSector ? '#fff' : C.m, transition: 'all .2s' }}>{t("marketplace.all")}</button>
            {allSectors.map(s => (
              <button key={s} onClick={() => setActiveSector(activeSector === s ? '' : s)}
                style={{ padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + (activeSector === s ? C.p : '#e2e8f0'), background: activeSector === s ? C.p : '#fff', color: activeSector === s ? '#fff' : C.m, transition: 'all .2s' }}>
                {s}
              </button>
            ))}
            {(activeSector || search) && (
              <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626' }}>
                <X size={12} /> {t("marketplace.reset")}
              </button>
            )}
          </nav>
        </div>
      )}

      {/* Main content */}
      <main style={{ background: C.bg, minHeight: '60vh', padding: '48px 24px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Stats bar */}
          <p style={{ textAlign: 'center', color: C.m, fontSize: 14, margin: '0 0 32px' }}>
            {loading ? 'Chargement...' : (
              <><strong style={{ color: C.s }}>{partners.length}</strong>{' programme'}{partners.length !== 1 ? 's' : ''}{' trouvé'}{partners.length !== 1 ? 's' : ''}{activeSector ? ' dans "' + activeSector + '"' : ''}{search ? ' pour "' + search + '"' : ''}</>
            )}
          </p>

          {/* Cards grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 24 }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} style={{ background: C.card, borderRadius: 16, height: 240, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
                  <div style={{ padding: 24 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f1f5f9', marginBottom: 16 }} />
                    <div style={{ height: 14, background: '#f1f5f9', borderRadius: 4, marginBottom: 8, width: '60%' }} />
                    <div style={{ height: 12, background: '#f1f5f9', borderRadius: 4, width: '90%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : partners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', background: C.card, borderRadius: 20, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: C.s, margin: '0 0 8px' }}>Aucun résultat</h3>
              <p style={{ color: C.m, margin: '0 0 20px' }}>
                {(search || activeSector) ? t("marketplace.reset") : t("marketplace.no_result")}
              </p>
              {(search || activeSector) && (
                <button onClick={reset} style={{ padding: '10px 20px', borderRadius: 10, background: C.p, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                  {t("marketplace.see_all")}
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 24 }}>
              {partners.map(p => <PartnerCard key={p.id} partner={p} />)}
            </div>
          )}

          {/* CTA */}
          <div style={{ marginTop: 64, textAlign: 'center', background: 'linear-gradient(135deg,' + C.s + ',#1e293b)', borderRadius: 20, padding: '48px 24px' }}>
            <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>
              {t("marketplace.add_program")}
            </h2>
            <p style={{ color: '#94a3b8', margin: '0 0 24px', fontSize: 15 }}>
              {t("marketplace.add_program_sub")}
            </p>
            <a href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,' + C.p + ',' + C.pl + ')', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 8px 30px ' + C.p + '50' }}>
              {t("marketplace.add_program_cta")}
            </a>
          </div>
        </div>
      </main>
    </LandingLayout>
  );
}
