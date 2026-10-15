import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, RotateCcw, Info } from 'lucide-react';
import api from '../lib/api';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { showToast } from '../components/Dialogs.jsx';

const TRASH_TTL_DAYS = 30;

function fmtMoney(n) {
  const num = parseFloat(n) || 0;
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num); }
  catch { return num.toFixed(2) + ' €'; }
}

function daysRemaining(deletedAt) {
  if (!deletedAt) return TRASH_TTL_DAYS;
  const deleted = new Date(deletedAt).getTime();
  const purgeAt = deleted + TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return Math.max(0, Math.ceil((purgeAt - now) / (1000 * 60 * 60 * 24)));
}

export default function TrashPage() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingPermanent, setPendingPermanent] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getTrash();
      setItems(d.items || []);
    } catch (err) {
      showToast.error(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (item) => {
    setBusy(true);
    try {
      await api.restoreTrashItem(item.type, item.id);
      showToast.success(t('trash.restored'));
      load();
    } catch (err) {
      showToast.error(err.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!pendingPermanent) return;
    setBusy(true);
    try {
      await api.permanentlyDeleteTrashItem(pendingPermanent.type, pendingPermanent.id);
      showToast.success(t('trash.permanently_deleted'));
      setPendingPermanent(null);
      load();
    } catch (err) {
      showToast.error(err.message || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0e1f18', letterSpacing: -0.5, marginBottom: 4 }}>
        {t('trash.title')}
      </h1>
      <p style={{ color: '#6e756c', marginBottom: 24, fontSize: 14 }}>
        {t('trash.subtitle')}
      </p>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#99a09a' }}>…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <Trash2 size={48} color="#ded8cb" style={{ margin: '0 auto 12px', display: 'block' }}/>
          <p style={{ color: '#99a09a', fontSize: 14 }}>{t('trash.empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => {
            const days = daysRemaining(item.deleted_at);
            const dateStr = new Date(item.deleted_at).toLocaleDateString(i18n.language || 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
            const title = item.prospect_company || item.prospect_name || '—';
            const isReferral = item.type === 'referral';
            const lowDays = days <= 5;
            return (
              <div
                key={`${item.type}-${item.id}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, border: '1px solid #ded8cb', borderRadius: 12,
                  background: '#fff',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0e1f18', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {title}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: isReferral ? '#eef1ea' : '#f3ead0',
                      color:      isReferral ? '#4338ca' : '#7a4a16',
                      textTransform: 'uppercase', letterSpacing: 0.4,
                    }}>
                      {isReferral ? 'Referral' : 'Commission'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6e756c' }}>
                    {t('trash.deleted_on', { date: dateStr })}
                    <span style={{ margin: '0 6px', color: '#cfc8b8' }}>·</span>
                    <span style={{ color: lowDays ? '#b23b2e' : '#6e756c', fontWeight: lowDays ? 600 : 400 }}>
                      {t('trash.days_remaining', { n: days })}
                    </span>
                  </div>
                  {item.amount != null && parseFloat(item.amount) > 0 && (
                    <div style={{ fontSize: 12, color: '#99a09a', marginTop: 2 }}>
                      {fmtMoney(item.amount)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handleRestore(item)}
                    disabled={busy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 10, border: 'none',
                      background: '#0e7a54', color: '#fff',
                      fontSize: 12, fontWeight: 700,
                      cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    <RotateCcw size={12}/> {t('trash.restore')}
                  </button>
                  <button
                    onClick={() => setPendingPermanent(item)}
                    disabled={busy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 10,
                      border: '1px solid #edc4bd', background: '#fff',
                      color: '#b23b2e', fontSize: 12, fontWeight: 600,
                      cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <Trash2 size={12}/> {t('trash.permanent_delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={!!pendingPermanent}
        title={t('trash.permanent_confirm_title')}
        message={t('trash.permanent_confirm_message')}
        confirmLabel={t('trash.permanent_confirm_delete')}
        cancelLabel={t('trash.cancel', { defaultValue: t('common.cancel', 'Annuler') })}
        variant="danger"
        loading={busy}
        onConfirm={confirmPermanentDelete}
        onCancel={() => setPendingPermanent(null)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#99a09a', fontSize: 12 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
          <span>{t('trash.permanent_confirm_message')}</span>
        </div>
      </ConfirmModal>
    </div>
  );
}
