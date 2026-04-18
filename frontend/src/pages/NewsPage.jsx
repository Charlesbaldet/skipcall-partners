import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Edit2, Trash2, BarChart2, Pin, Paperclip, X, Copy, Check,
  ChevronDown, ChevronUp, Save, Link as LinkIcon,
} from 'lucide-react';
import api from '../lib/api';
import ConfirmModal from '../components/ConfirmModal.jsx';

const C = {
  p: '#059669', s: '#0f172a', m: '#64748b', bg: '#f8fafc', card: '#fff',
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

const CATEGORIES = ['update', 'newsletter', 'event', 'product', 'promotion', 'commercial_kit'];

// ─── Video embed helpers ─────────────────────────────────────────────
function videoEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

// ─── Empty form template ─────────────────────────────────────────────
const EMPTY_FORM = {
  title: '', content: '', category: 'update',
  image_url: '', video_url: '', link_url: '', link_label: '',
  is_pinned: false, is_draft: false, is_kit: false,
  promo_code: '', promo_discount: '', promo_expires_at: '',
  published_at: '',
};

// ─── Page ────────────────────────────────────────────────────────────
export default function NewsPage() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | post.id
  const [form, setForm] = useState(EMPTY_FORM);
  const [attachmentsFor, setAttachmentsFor] = useState([]);
  const [saving, setSaving] = useState(false);
  const [statsModal, setStatsModal] = useState(null);
  const [socialsOpen, setSocialsOpen] = useState(false);
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.getNews(); setPosts(d.posts || []); } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setAttachmentsFor([]);
  };

  const startEdit = (post) => {
    setEditing(post.id);
    setForm({
      ...EMPTY_FORM,
      ...post,
      promo_expires_at: post.promo_expires_at ? post.promo_expires_at.slice(0, 16) : '',
      published_at: post.published_at ? post.published_at.slice(0, 16) : '',
    });
    // Load existing attachments via the partner single-post endpoint won't
    // work for admins (tenant check). We don't expose admin single-get but
    // we can lazy-load via delete/add operations. Populate from post list
    // metadata is fine for now; we'll fetch the real list via a minimal
    // side channel by re-querying the list after any change.
    setAttachmentsFor(post._attachments || []);
  };

  const cancel = () => { setEditing(null); setForm(EMPTY_FORM); setAttachmentsFor([]); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      // Normalize empty strings → null so the backend writes NULL.
      ['image_url','video_url','link_url','link_label','promo_code','promo_discount','promo_expires_at','published_at']
        .forEach(k => { if (!body[k]) body[k] = null; });
      if (editing === 'new') {
        await api.createNews(body);
      } else {
        await api.updateNews(editing, body);
      }
      await load();
      cancel();
    } catch (err) {
      alert(err.message || 'Error');
    }
    setSaving(false);
  };

  const remove = (id) => setDeleteId(id);
  const confirmRemove = async () => {
    if (!deleteId) return;
    try { await api.deleteNews(deleteId); await load(); }
    catch (err) { alert(err.message); }
    finally { setDeleteId(null); }
  };

  const addAttachment = async (data) => {
    if (editing === 'new') {
      alert('Save the post first before adding attachments.');
      return;
    }
    try {
      const d = await api.addNewsAttachment(editing, data);
      setAttachmentsFor(prev => [...prev, d.attachment]);
    } catch (err) { alert(err.message); }
  };
  const removeAttachment = async (attId) => {
    try {
      await api.deleteNewsAttachment(attId);
      setAttachmentsFor(prev => prev.filter(a => a.id !== attId));
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="fade-in">
      <ConfirmModal
        isOpen={!!deleteId}
        title={t('news.delete_confirm') || 'Supprimer'}
        message={t('news.delete_confirm_body') || t('news.delete_confirm')}
        confirmLabel={t('news.delete') || 'Supprimer'}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setDeleteId(null)}
      />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>{t('news.title')}</h1>
        {!editing && (
          <button onClick={startNew} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: C.p, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
            <Plus size={16} /> {t('news.new_post')}
          </button>
        )}
      </div>

      {/* Form */}
      {editing && (
        <PostForm
          form={form}
          setForm={setForm}
          attachments={attachmentsFor}
          addAttachment={addAttachment}
          removeAttachment={removeAttachment}
          onCancel={cancel}
          onSave={save}
          saving={saving}
          isNew={editing === 'new'}
        />
      )}

      {/* List */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>…</div>
      ) : posts.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 16, padding: 48, textAlign: 'center', color: C.m }}>
          {t('news.no_posts')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {posts.map(p => (
            <PostRow
              key={p.id}
              post={p}
              onEdit={() => startEdit(p)}
              onDelete={() => remove(p.id)}
              onStats={() => setStatsModal(p)}
            />
          ))}
        </div>
      )}

      {/* Stats modal */}
      {statsModal && <StatsModal post={statsModal} onClose={() => setStatsModal(null)} />}

      {/* Socials */}
      <CollapsibleCard
        open={socialsOpen} setOpen={setSocialsOpen}
        title={t('news.social_title')}
      >
        <SocialsEditor t={t} />
      </CollapsibleCard>

      {/* Engagement */}
      <CollapsibleCard
        open={engagementOpen} setOpen={setEngagementOpen}
        title={t('news.engagement')}
      >
        <EngagementTable t={t} />
      </CollapsibleCard>
    </div>
  );
}

// ─── Category badge ──────────────────────────────────────────────────
function CatBadge({ category, t }) {
  const c = CAT_COLORS[category] || CAT_COLORS.update;
  const label = t(`news.cat_${category === 'commercial_kit' ? 'kit' : category}`);
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

// ─── Post row ────────────────────────────────────────────────────────
function PostRow({ post, onEdit, onDelete, onStats }) {
  const { t } = useTranslation();
  const preview = (post.content || '').replace(/<[^>]+>/g, '').slice(0, 150);
  const pct = post.partner_count > 0
    ? Math.round((Number(post.read_count) / Number(post.partner_count)) * 100)
    : 0;
  const isScheduled = post.published_at && new Date(post.published_at) > new Date();

  return (
    <div style={{
      background: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
      padding: 18, display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 400px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <CatBadge category={post.category} t={t} />
          {post.is_pinned && <span title={t('news.pinned')}><Pin size={14} color="#f59e0b" /></span>}
          {post.is_draft && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: C.m }}>
              {t('news.draft').toUpperCase()}
            </span>
          )}
          {isScheduled && !post.is_draft && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#d97706' }}>
              {t('news.scheduled').toUpperCase()}
            </span>
          )}
          {Number(post.attachment_count) > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: C.m }}>
              <Paperclip size={12} /> {post.attachment_count}
            </span>
          )}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.s, marginBottom: 4 }}>{post.title}</div>
        <div style={{ fontSize: 13, color: C.m, lineHeight: 1.5 }}>{preview}{preview.length >= 150 ? '…' : ''}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
          {post.published_at ? new Date(post.published_at).toLocaleString() : ''}
        </div>
      </div>

      <div style={{ width: 180 }}>
        <div style={{ fontSize: 11, color: C.m, marginBottom: 4 }}>
          {t('news.partners_read', { read: post.read_count, total: post.partner_count })}
        </div>
        <div style={{ height: 6, background: C.light, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: C.p, width: `${pct}%`, transition: 'width .3s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <IconButton icon={BarChart2} label={t('news.read_stats')} onClick={onStats} />
        <IconButton icon={Edit2} label={t('news.edit_post')} onClick={onEdit} />
        <IconButton icon={Trash2} label={t('news.delete_post')} onClick={onDelete} color="#dc2626" />
      </div>
    </div>
  );
}

function IconButton({ icon: Icon, label, onClick, color = '#475569' }) {
  return (
    <button onClick={onClick} title={label} style={{
      background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '6px 10px', cursor: 'pointer', color, display: 'flex',
      alignItems: 'center', gap: 4, fontSize: 12,
    }}><Icon size={14} /></button>
  );
}

// ─── New / Edit form ────────────────────────────────────────────────
function PostForm({ form, setForm, attachments, addAttachment, removeAttachment, onCancel, onSave, saving, isNew }) {
  const { t } = useTranslation();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const isPromo = form.category === 'promotion';
  const isKit = form.category === 'commercial_kit';
  const embedUrl = videoEmbedUrl(form.video_url);

  // Attachment sub-form state
  const [att, setAtt] = useState({ filename: '', file_url: '', file_type: '' });
  const submitAtt = () => {
    if (!att.filename || !att.file_url) return;
    addAttachment(att);
    setAtt({ filename: '', file_url: '', file_type: '' });
  };

  const input = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
    color: C.s, boxSizing: 'border-box', outline: 'none',
  };
  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: C.m, marginBottom: 6 };

  return (
    <div style={{
      background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
      padding: 24, marginBottom: 24,
      borderLeft: isKit ? '4px solid #0891b2' : isPromo ? '4px solid #ef4444' : `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={label}>{t('news.edit_post')}</label>
          <input value={form.title} onChange={set('title')} placeholder={t('news.content')} style={{ ...input, fontSize: 16, fontWeight: 600 }} />
        </div>
        <div>
          <label style={label}>{t('news.content')}</label>
          <textarea value={form.content} onChange={set('content')} rows={8} style={{ ...input, minHeight: 200, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label style={label}>{t('news.category')}</label>
            <select value={form.category} onChange={set('category')} style={input}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{t(`news.cat_${c === 'commercial_kit' ? 'kit' : c}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>{t('news.image_url')}</label>
            <input value={form.image_url} onChange={set('image_url')} placeholder="https://…" style={input} />
          </div>
          <div>
            <label style={label}>{t('news.video_url')}</label>
            <input value={form.video_url} onChange={set('video_url')} placeholder="https://youtube.com/…" style={input} />
          </div>
        </div>

        {embedUrl && (
          <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
            <iframe
              src={embedUrl}
              title="video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={label}>{t('news.link_url')}</label>
            <input value={form.link_url} onChange={set('link_url')} placeholder="https://…" style={input} />
          </div>
          <div>
            <label style={label}>{t('news.link_label')}</label>
            <input value={form.link_label} onChange={set('link_label')} style={input} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Toggle checked={form.is_pinned} onChange={set('is_pinned')} label={t('news.pinned')} />
          <Toggle checked={form.is_draft} onChange={set('is_draft')} label={t('news.draft')} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={label}>{t('news.scheduled')}</label>
            <input type="datetime-local" value={form.published_at} onChange={set('published_at')} style={input} />
          </div>
        </div>

        {isPromo && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, padding: 16, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
            <div>
              <label style={label}>{t('news.promo_code')}</label>
              <input value={form.promo_code} onChange={set('promo_code')} style={input} />
            </div>
            <div>
              <label style={label}>{t('news.promo_discount')}</label>
              <input value={form.promo_discount} onChange={set('promo_discount')} style={input} />
            </div>
            <div>
              <label style={label}>{t('news.promo_expires')}</label>
              <input type="datetime-local" value={form.promo_expires_at} onChange={set('promo_expires_at')} style={input} />
            </div>
          </div>
        )}

        <div style={{ padding: 16, background: isKit ? '#ecfeff' : '#f8fafc', borderRadius: 12, border: `1px solid ${isKit ? '#a5f3fc' : C.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.s, marginBottom: 10 }}>
            {t('news.attachments')} ({attachments.length})
          </div>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {attachments.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#fff', borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <Paperclip size={13} color={C.m} />
                  <span style={{ fontSize: 13, color: C.s, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
                  {a.file_type && <span style={{ fontSize: 11, color: C.m }}>{a.file_type}</span>}
                  <button onClick={() => removeAttachment(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {isNew ? (
            <div style={{ fontSize: 12, color: C.m }}>Save the post first to add attachments.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 8 }}>
              <input placeholder={t('news.filename')} value={att.filename} onChange={e => setAtt(a => ({ ...a, filename: e.target.value }))} style={{ ...input, padding: '8px 12px' }} />
              <input placeholder={t('news.file_url')} value={att.file_url} onChange={e => setAtt(a => ({ ...a, file_url: e.target.value }))} style={{ ...input, padding: '8px 12px' }} />
              <input placeholder={t('news.file_type')} value={att.file_type} onChange={e => setAtt(a => ({ ...a, file_type: e.target.value }))} style={{ ...input, padding: '8px 12px' }} />
              <button onClick={submitAtt} style={{ padding: '8px 14px', borderRadius: 10, background: C.p, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                + {t('news.add_attachment')}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 10, background: '#f1f5f9', color: C.m, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {t('news.cancel')}
          </button>
          <button onClick={onSave} disabled={saving || !form.title || !form.content} style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: saving || !form.title || !form.content ? '#94a3b8' : C.p,
            color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Save size={14} /> {form.is_draft ? t('news.save') : t('news.publish')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={onChange} />
      <span style={{ fontSize: 13, color: C.s, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

// ─── Stats modal ─────────────────────────────────────────────────────
function StatsModal({ post, onClose }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.getNewsStats(post.id).then(setData).catch(() => setData({ read: [], not_read: [], total: 0, read_count: 0, percentage: 0 }));
  }, [post.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 20, width: 680, maxWidth: '100%', maxHeight: '85vh', overflow: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.m, marginBottom: 4 }}>{t('news.read_stats')}</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: C.s, margin: 0 }}>{post.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 8, cursor: 'pointer' }}><X size={14} /></button>
        </div>

        {data ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: C.s }}>
                <span>{t('news.partners_read', { read: data.read_count, total: data.total })}</span>
                <span style={{ fontWeight: 700 }}>{data.percentage}%</span>
              </div>
              <div style={{ height: 8, background: C.light, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: C.p, width: `${data.percentage}%` }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#16a34a', marginBottom: 8, textTransform: 'uppercase' }}>
                  {t('news.read_by')} ({data.read.length})
                </div>
                {data.read.length ? data.read.map(r => (
                  <div key={r.partner_id} style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.s }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: C.m }}>{new Date(r.read_at).toLocaleString()}</div>
                  </div>
                )) : <div style={{ color: C.m, fontSize: 13 }}>—</div>}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: C.m, marginBottom: 8, textTransform: 'uppercase' }}>
                  {t('news.not_read')} ({data.not_read.length})
                </div>
                {data.not_read.length ? data.not_read.map(r => (
                  <div key={r.partner_id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: C.s }}>{r.name}</div>
                  </div>
                )) : <div style={{ color: C.m, fontSize: 13 }}>—</div>}
              </div>
            </div>
          </>
        ) : <div style={{ padding: 32, textAlign: 'center', color: C.m }}>…</div>}
      </div>
    </div>
  );
}

// ─── Collapsible card wrapper ────────────────────────────────────────
function CollapsibleCard({ open, setOpen, title, children }) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 16 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: 18, background: 'none', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', fontWeight: 700, fontSize: 15, color: C.s,
      }}>
        <span>{title}</span>
        {open ? <ChevronUp size={18} color={C.m} /> : <ChevronDown size={18} color={C.m} />}
      </button>
      {open && <div style={{ padding: '0 18px 18px' }}>{children}</div>}
    </div>
  );
}

// ─── Socials editor ──────────────────────────────────────────────────
function SocialsEditor({ t }) {
  const [s, setS] = useState({
    social_linkedin: '', social_twitter: '', social_facebook: '',
    social_instagram: '', social_youtube: '', social_website: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSocials().then(d => setS(prev => ({ ...prev, ...d.socials }))).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try { await api.updateSocials(s); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (err) { alert(err.message); }
    setSaving(false);
  };

  const input = {
    width: '100%', padding: '9px 12px', borderRadius: 9,
    border: `1.5px solid ${C.border}`, fontSize: 13, color: C.s,
    boxSizing: 'border-box', outline: 'none',
  };

  const fields = [
    ['social_linkedin',  'LinkedIn'],
    ['social_twitter',   'Twitter / X'],
    ['social_facebook',  'Facebook'],
    ['social_instagram', 'Instagram'],
    ['social_youtube',   'YouTube'],
    ['social_website',   'Website'],
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 12 }}>
        {fields.map(([key, label]) => (
          <div key={key}>
            <div style={{ fontSize: 11, color: C.m, fontWeight: 600, marginBottom: 4 }}>{label}</div>
            <input value={s[key] || ''} onChange={e => setS(x => ({ ...x, [key]: e.target.value }))}
              placeholder="https://…" style={input} />
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving} style={{
        padding: '8px 16px', borderRadius: 10, border: 'none',
        background: saved ? '#16a34a' : C.p, color: '#fff',
        fontWeight: 600, fontSize: 13, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        {saved ? <><Check size={14} /> ✓</> : <>{t('news.social_save')}</>}
      </button>
    </div>
  );
}

// ─── Engagement analytics table ──────────────────────────────────────
function EngagementTable({ t }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.getNewsEngagement().then(setData).catch(() => setData({ partners: [], avg_engagement_pct: 0, most_read_posts: [], least_read_posts: [] })); }, []);

  if (!data) return <div style={{ padding: 24, color: C.m, textAlign: 'center' }}>…</div>;

  const top = data.partners[0];
  const bottom = data.partners[data.partners.length - 1];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <SummaryTile label={t('news.avg_engagement')} value={`${data.avg_engagement_pct}%`} />
        {top && <SummaryTile label={t('news.most_read')} value={top.name} sub={`${top.engagement_pct}%`} />}
        {bottom && <SummaryTile label={t('news.least_read')} value={bottom.name} sub={`${bottom.engagement_pct}%`} />}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {[t('partners.tbl_partner'), t('news.posts_read'), t('news.total_posts'), t('news.engagement_score'), t('news.last_read')].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.m, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.partners.map(p => (
              <tr key={p.partner_id} style={{ borderBottom: `1px solid ${C.light}` }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: C.s }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.m }}>{p.email}</div>
                </td>
                <td style={{ padding: '10px 12px', color: C.s }}>{p.posts_read}</td>
                <td style={{ padding: '10px 12px', color: C.m }}>{p.total_posts}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: p.engagement_pct >= 70 ? '#16a34a' : p.engagement_pct >= 40 ? '#f59e0b' : '#dc2626' }}>
                  {p.engagement_pct}%
                </td>
                <td style={{ padding: '10px 12px', color: C.m, fontSize: 12 }}>
                  {p.last_read_at ? new Date(p.last_read_at).toLocaleDateString() : t('news.never')}
                </td>
              </tr>
            ))}
            {data.partners.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: C.m }}>—</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, sub }) {
  return (
    <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.m, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.s }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.m, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
