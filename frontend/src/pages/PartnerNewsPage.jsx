import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pin, Paperclip, ExternalLink, Copy, Check, Calendar, Tag,
  Linkedin, Twitter, Facebook, Instagram, Youtube, Globe,
} from 'lucide-react';
import api from '../lib/api';

const C = {
  p: '#059669', s: '#0f172a', m: '#64748b', card: '#fff',
  border: '#e2e8f0', light: '#f1f5f9',
};

const CAT_COLORS = {
  update:        { bg: '#dbeafe', color: '#3b82f6', border: '#bfdbfe' },
  newsletter:    { bg: '#ede9fe', color: '#8b5cf6', border: '#ddd6fe' },
  event:         { bg: '#fef3c7', color: '#f59e0b', border: '#fde68a' },
  product:       { bg: '#d1fae5', color: '#059669', border: '#a7f3d0' },
  promotion:     { bg: '#fee2e2', color: '#ef4444', border: '#fecaca' },
  commercial_kit:{ bg: '#cffafe', color: '#0891b2', border: '#a5f3fc' },
};

function videoEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

function expiresIn(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { expired: true };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return { days, hours };
}

function humanSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export default function PartnerNewsPage() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [programFilter, setProgramFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [attachmentsByPost, setAttachmentsByPost] = useState({});

  useEffect(() => {
    api.getPartnerNews().then(d => setPosts(d.posts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Lazy-load attachments for posts that have any
  useEffect(() => {
    for (const p of posts) {
      if (Number(p.attachment_count) > 0 && !(p.id in attachmentsByPost)) {
        api.getPartnerNewsPost(p.id)
          .then(d => setAttachmentsByPost(prev => ({ ...prev, [p.id]: d.attachments || [] })))
          .catch(() => {});
      }
    }
  }, [posts, attachmentsByPost]);

  const programs = useMemo(() => {
    const m = new Map();
    posts.forEach(p => { if (!m.has(p.tenant_id)) m.set(p.tenant_id, { id: p.tenant_id, name: p.tenant_name, logo: p.tenant_logo }); });
    return [...m.values()];
  }, [posts]);

  const filtered = posts.filter(p =>
    (!programFilter || p.tenant_id === programFilter) &&
    (!categoryFilter || p.category === categoryFilter)
  );

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>{t('news.title')}</h1>
      </div>

      {/* Filter bar */}
      {programs.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <select value={programFilter} onChange={e => setProgramFilter(e.target.value)} style={selectStyle()}>
            <option value="">{t('news.all_programs')}</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle()}>
            <option value="">{t('news.all_categories')}</option>
            {Object.keys(CAT_COLORS).map(c => <option key={c} value={c}>{t(`news.cat_${c === 'commercial_kit' ? 'kit' : c}`)}</option>)}
          </select>
        </div>
      )}

      {/* Program social links row */}
      {programs.map(p => <ProgramSocials key={p.id} program={p} />)}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.m }}>…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 16, padding: 48, textAlign: 'center', color: C.m, border: `1px solid ${C.border}` }}>
          {t('news.no_posts')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map(post => (
            <PostCard
              key={post.id}
              post={post}
              attachments={attachmentsByPost[post.id] || []}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function selectStyle() {
  return {
    padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${C.border}`,
    background: C.card, fontSize: 13, fontWeight: 500, color: C.s,
    cursor: 'pointer', outline: 'none',
  };
}

// ─── Program socials row ─────────────────────────────────────────────
function ProgramSocials({ program }) {
  const [socials, setSocials] = useState(null);
  useEffect(() => {
    api.getProgramSocials(program.id).then(d => setSocials(d.socials || {})).catch(() => setSocials({}));
  }, [program.id]);

  if (!socials) return null;
  const links = [
    ['social_linkedin',  Linkedin,  '#0a66c2'],
    ['social_twitter',   Twitter,   '#1d9bf0'],
    ['social_facebook',  Facebook,  '#1877f2'],
    ['social_instagram', Instagram, '#e4405f'],
    ['social_youtube',   Youtube,   '#ff0000'],
    ['social_website',   Globe,     C.p],
  ].filter(([k]) => socials[k]);

  if (!links.length) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12, background: '#f8fafc', borderRadius: 12, border: `1px solid ${C.border}` }}>
      {program.logo && <img src={program.logo} alt={program.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />}
      <span style={{ fontWeight: 600, fontSize: 13, color: C.s, flex: 1 }}>{program.name}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {links.map(([key, Icon, color]) => (
          <a key={key} href={socials[key]} target="_blank" rel="noopener noreferrer"
            style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = color + '10'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
            <Icon size={15} />
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Post card ───────────────────────────────────────────────────────
function PostCard({ post, attachments, t }) {
  const isPromo = post.category === 'promotion';
  const isKit = post.category === 'commercial_kit' || post.is_kit;
  const c = CAT_COLORS[post.category] || CAT_COLORS.update;
  const embedUrl = videoEmbedUrl(post.video_url);

  return (
    <article style={{
      background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
      borderLeft: isPromo ? '3px solid #ef4444' : isKit ? '3px solid #0891b2' : `1px solid ${C.border}`,
      padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {post.tenant_logo ? (
          <img src={post.tenant_logo} alt={post.tenant_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: C.m }}>
            {post.tenant_name?.[0] || '?'}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.s }}>{post.tenant_name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{post.published_at ? new Date(post.published_at).toLocaleString() : ''}</div>
        </div>
        <span style={{ padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700 }}>
          {t(`news.cat_${post.category === 'commercial_kit' ? 'kit' : post.category}`)}
        </span>
        {post.is_pinned && <Pin size={14} color="#f59e0b" />}
      </div>

      {isKit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontWeight: 700, color: '#0891b2', fontSize: 13 }}>
           {t('news.commercial_kit')}
        </div>
      )}

      {/* Title + content */}
      <h2 style={{ fontSize: 18, fontWeight: 800, color: C.s, margin: '0 0 10px' }}>{post.title}</h2>
      <div style={{ fontSize: 15, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
        {post.content}
      </div>

      {/* Promotion badge */}
      {isPromo && (
        <PromoSection post={post} t={t} />
      )}

      {/* Video */}
      {embedUrl && (
        <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 14 }}>
          <iframe
            src={embedUrl} title="video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      )}

      {/* Image */}
      {post.image_url && !embedUrl && (
        <img src={post.image_url} alt="" style={{ width: '100%', maxHeight: 400, objectFit: 'cover', borderRadius: 12, marginBottom: 14, display: 'block' }} />
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{ marginBottom: 14, padding: isKit ? 14 : 0, background: isKit ? '#f0fdff' : 'transparent', borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.m, textTransform: 'uppercase', marginBottom: 8 }}>{t('news.attachments')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map(a => (
              <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, textDecoration: 'none', color: C.s }}>
                <Paperclip size={14} color={C.m} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
                {a.file_size && <span style={{ fontSize: 11, color: C.m }}>{humanSize(a.file_size)}</span>}
                <ExternalLink size={13} color={C.m} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* CTA link */}
      {post.link_url && (
        <a href={post.link_url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, background: C.p, color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          {post.link_label || t('news.link_url')} <ExternalLink size={14} />
        </a>
      )}
    </article>
  );
}

// ─── Promotion section with copyable code + countdown ────────────────
function PromoSection({ post, t }) {
  const [copied, setCopied] = useState(false);
  const exp = expiresIn(post.promo_expires_at);

  const copy = () => {
    if (!post.promo_code) return;
    try { navigator.clipboard.writeText(post.promo_code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div style={{ padding: 16, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {post.promo_code && (
        <button onClick={copy} style={{
          padding: '10px 18px',
          background: '#fff', color: '#dc2626',
          border: '2px dashed #ef4444', borderRadius: 10,
          fontWeight: 800, fontSize: 16, letterSpacing: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'monospace',
        }}>
          {post.promo_code}
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
      {post.promo_discount && (
        <span style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>{post.promo_discount}</span>
      )}
      {exp && (
        exp.expired ? (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{t('news.promo_expires')} —</span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#b91c1c' }}>
            <Calendar size={12} /> {t('news.promo_expires_in')} {exp.days}d {exp.hours}h
          </span>
        )
      )}
      {!post.promo_code && !post.promo_discount && !exp && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontWeight: 600, fontSize: 13 }}>
          <Tag size={14} /> {t('news.cat_promotion')}
        </span>
      )}
    </div>
  );
}
