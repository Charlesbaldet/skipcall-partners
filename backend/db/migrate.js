const { query, getClient } = require('../db');
const crypto = require('crypto');
const logger = require('../services/logger');

async function runMigrations() {
  try {
    // v3 tables
    await query(`CREATE TABLE IF NOT EXISTS partner_applications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(50),
      company_website VARCHAR(500),
      company_size VARCHAR(50),
      motivation TEXT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`CREATE TABLE IF NOT EXISTS user_invitations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'commercial')),
      token VARCHAR(255) UNIQUE NOT NULL,
      invited_by UUID NOT NULL REFERENCES users(id),
      accepted_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // v4: API Keys table
    await query(`CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(64) UNIQUE NOT NULL,
      key_prefix VARCHAR(20) NOT NULL,
      partner_id UUID REFERENCES partners(id),
      created_by UUID NOT NULL REFERENCES users(id),
      is_active BOOLEAN DEFAULT true,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // v5: Add referral_code to partners
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partners' AND column_name = 'referral_code') THEN
        ALTER TABLE partners ADD COLUMN referral_code VARCHAR(20) UNIQUE;
      END IF;
    END $$`);

    // v5: Add source to referrals
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'source') THEN
        ALTER TABLE referrals ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
      END IF;
    END $$`);

    // Generate referral codes for partners that don't have one
    const { rows: partners } = await query('SELECT id, name FROM partners WHERE referral_code IS NULL');
    for (const p of partners) {
      const code = p.name.replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
      try {
        await query('UPDATE partners SET referral_code = $1 WHERE id = $2', [code, p.id]);
      } catch (e) { /* skip if duplicate */ }
    }

    // Indexes
    await query('CREATE INDEX IF NOT EXISTS idx_applications_status ON partner_applications(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_applications_email ON partner_applications(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token)');
    await query('CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_invitations(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)');
    await query('CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON partners(referral_code)');

    // UNIQUE constraints
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_referral_id_unique') THEN
        ALTER TABLE commissions ADD CONSTRAINT commissions_referral_id_unique UNIQUE (referral_id);
      END IF;
    END $$`);

    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_email_unique') THEN
        ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_email_unique UNIQUE (email);
      END IF;
    END $$`);

    // v6: Tenant appearance columns (white-label)
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'accent_color') THEN ALTER TABLE tenants ADD COLUMN accent_color VARCHAR(20); END IF; END $$`);
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'logo_url') THEN ALTER TABLE tenants ADD COLUMN logo_url TEXT; END IF; END $$`);
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'settings') THEN ALTER TABLE tenants ADD COLUMN settings JSONB; END IF; END $$`);

    // v7: Programme — tenant_levels + level_threshold_type
    await query(`CREATE TABLE IF NOT EXISTS tenant_levels (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      min_threshold NUMERIC(15, 2) NOT NULL DEFAULT 0,
      commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10,
      color VARCHAR(20),
      icon VARCHAR(10),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'level_threshold_type') THEN ALTER TABLE tenants ADD COLUMN level_threshold_type VARCHAR(20) DEFAULT 'deals'; END IF; END $$`);
    await query('CREATE INDEX IF NOT EXISTS idx_tenant_levels_tenant ON tenant_levels(tenant_id, position)');

    // v8: Bump old #059669 (emerald-600) to #047857 (emerald-700) for WCAG AA accessibility
    // Only affects tenants still on the old default, not custom colors.
    await query(`UPDATE tenants SET primary_color = '#047857' WHERE primary_color = '#059669' OR primary_color IS NULL`);
    await query(`UPDATE tenants SET accent_color = NULL WHERE accent_color = '#f97316'`);

    // v9: Revert to landing green — user prefers brand consistency
    await query(`UPDATE tenants SET primary_color = '#059669' WHERE primary_color = '#047857' OR primary_color IS NULL`);

    // v10: Force landing green on ALL tenants (user explicit request)
    // Clears any residual custom colors (lime #1ace0d, purple #8b5cf6, etc.)
    await query(`UPDATE tenants SET primary_color = '#059669', secondary_color = '#10b981', accent_color = NULL`);

    
    // ─── v14: apply endpoint rate limit (distributed, multi-worker safe) ───
    await query(`
      CREATE TABLE IF NOT EXISTS apply_rate_limits (
        ip VARCHAR(45) PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        reset_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_apply_rate_limits_reset ON apply_rate_limits (reset_at)`);
    
    // ─── v15: tenant revenue model (MRR / ARR / CA / Other) ───
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS revenue_model VARCHAR(20) DEFAULT 'CA'`);
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revenue_model_check') THEN
          ALTER TABLE tenants ADD CONSTRAINT revenue_model_check CHECK (revenue_model IN ('MRR', 'ARR', 'CA', 'Other'));
        END IF;
      END $$;
    `);

    
  // ─── v16: Password reset tokens ───
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(128) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token)');
  await query('CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id)');

  // ─── v16: must_change_password column (backup if admin.js migration removed) ───
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false');

  // ─── Seed: auto-populate empty DB (staging / fresh installs) ───
  // Only runs if no tenant exists — safe to keep in production (noop when data exists)
  try {
    const { rows: tenants } = await query('SELECT id FROM tenants LIMIT 1');
    if (tenants.length === 0) {
      console.log(' Empty DB detected — running seed...');
      const bcrypt = require('bcryptjs');
      // J4 — seed initial marque is_founder=TRUE puisqu'il crée
      // littéralement le 1er tenant (= fondateur par définition).
      // L'unique partial index `tenants_founder_uidx` garantit qu'il
      // restera le seul à pouvoir avoir is_founder=TRUE.
      const { rows: [tenant] } = await query(
        `INSERT INTO tenants (name, slug, primary_color, secondary_color, accent_color, revenue_model, is_founder)
         VALUES ('Skipcall', 'skipcall', '#059669', '#10b981', NULL, 'CA', TRUE)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`
      );
      const hash = await bcrypt.hash('RefBoost2026!', 12);
      await query(
        `INSERT INTO users (email, password_hash, full_name, role, tenant_id, must_change_password)
         VALUES ('admin@skipcall.com', $1, 'Admin Skipcall', 'admin', $2, true)
         ON CONFLICT (email) DO NOTHING`,
        [hash, tenant.id]
      );
      console.log(' Seed complete — admin@skipcall.com / RefBoost2026! (must change on first login)');
    }
  } catch (seedErr) {
    console.warn('[seed] Skipped:', seedErr.message);
  }

  
  // ─── v17: Blog posts table ───
  await query(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slug VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      excerpt TEXT,
      content TEXT NOT NULL DEFAULT '',
      author VARCHAR(255) DEFAULT 'RefBoost',
      category VARCHAR(100),
      tags TEXT[] DEFAULT '{}',
      cover_image_url TEXT,
      published BOOLEAN DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      meta_title VARCHAR(70),
      meta_description VARCHAR(160),
      reading_time_minutes INTEGER DEFAULT 5
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)');
  await query('CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published, published_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category)');

  
  // ─── v18: Marketplace columns on tenants ───
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sector VARCHAR(100)`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website VARCHAR(255)`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS icp TEXT`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description TEXT`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN DEFAULT false`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tenants_marketplace ON tenants(marketplace_visible) WHERE marketplace_visible = true`);
  console.log('[marketplace] v18 columns added to tenants');

  // ─── v18b: Notion status-value mapping ───
  // Maps RefBoost canonical stage slugs (new/contacted/qualified/
  // proposal/won/lost) to the names of the customer's Notion Status
  // or Select property options. Without this, pushing { status: 'new' }
  // to a Notion DB whose status options are "Prospect" / "Signé" etc.
  // fails because Status options are fixed. Shape:
  //   { "new": "Prospect", "contacted": "En cours", "won": "Signé", … }
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notion_status_mapping JSONB DEFAULT '{}'::jsonb`);

  // ─── v18c: Universal CRM link columns on referrals ──────────────────
  // The HubSpot + Notion sync code already reads/writes the sibling-
  // object ids (hubspot_contact_id, hubspot_company_id, notion_*) but
  // those columns were never actually migrated anywhere. On a fresh
  // DB every sync would 500. This block makes them real and adds the
  // dedicated per-CRM "top-level record" ids + the unified
  // crm_link_status flag the pipeline card uses to badge synced
  // referrals.
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS hubspot_deal_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS hubspot_company_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS notion_page_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS notion_transaction_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS notion_contact_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS notion_company_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS salesforce_opportunity_id TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS crm_link_status TEXT`);
  // Backfill: any row that already carries a crm_deal_id (set by the
  // pre-split HubSpot/Salesforce push path) gets mirrored into the
  // new provider-specific column based on the tenant's active
  // integration. Cheaper one-liner than a data migration script —
  // idempotent because COALESCE leaves already-populated rows alone.
  await query(`
    UPDATE referrals r SET hubspot_deal_id = COALESCE(r.hubspot_deal_id, r.crm_deal_id)
      FROM crm_integrations i
     WHERE i.tenant_id = r.tenant_id AND i.provider = 'hubspot' AND i.is_active = TRUE
       AND r.crm_deal_id IS NOT NULL AND r.hubspot_deal_id IS NULL
  `).catch(() => {});
  await query(`
    UPDATE referrals r SET salesforce_opportunity_id = COALESCE(r.salesforce_opportunity_id, r.crm_deal_id)
      FROM crm_integrations i
     WHERE i.tenant_id = r.tenant_id AND i.provider = 'salesforce' AND i.is_active = TRUE
       AND r.crm_deal_id IS NOT NULL AND r.salesforce_opportunity_id IS NULL
  `).catch(() => {});
  console.log('[crm] v18c referral link columns ready');

  // ─── v18d: Distinct contact-person fields on referrals ──────────────
  // Up to now prospect_name served as both the card header AND a
  // stand-in for the contact's full name depending on how each
  // tenant used the form. The UI is splitting them: prospect_name
  // stays the deal / company header (what the Kanban card shows
  // and what Notion's Transactions Title is set to), while these
  // two new columns carry the actual contact person's name, which
  // feeds the Notion Contacts tab and a new Contact section on the
  // referral card. Both optional — existing rows keep working with
  // the old single-field flow until an admin re-edits them.
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS contact_first_name TEXT`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS contact_last_name  TEXT`);
  console.log('[referrals] v18d contact_first_name + contact_last_name ready');

  // ─── v18e: last_pull_at on crm_integrations ───────────────────────
  // Cross-provider column for the scheduled nightly-pull worker. Lets
  // every CRM pull (Notion today, HubSpot/Salesforce next) ask Notion/
  // HubSpot's /query endpoint for "pages modified since" a known
  // watermark, so a 21:00 Paris run only fetches the delta — not the
  // whole database each night. Tenants.notion_last_sync stays around
  // for back-compat; we update both until the old column can be
  // dropped.
  await query(`ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS last_pull_at TIMESTAMPTZ`);
  console.log('[crm] v18e crm_integrations.last_pull_at ready');

  // ─── v19: Outgoing webhooks ───
  await query(`CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_id) WHERE is_active = true`);

  await query(`CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    success BOOLEAN DEFAULT false,
    attempts INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE success = false AND next_retry_at IS NOT NULL`);
  console.log('[webhooks] v19 tables ready');

  // ─── v20: Commission status overhaul + invoice upload ──────────────
  // Replace the legacy 3-state status (pending/approved/paid) with the
  // new 4-state lifecycle that mirrors the real workflow:
  //   pending_approval   → admin must approve the calculated commission
  //   awaiting_invoice   → approved, waiting for the partner to upload
  //                        their invoice PDF
  //   pending_validation → invoice received, admin must validate before
  //                        paying
  //   paid               → final
  // approval_status stays in place for the 'rejected' flag; everything
  // else collapses into status.
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS invoice_url TEXT`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS invoice_uploaded_at TIMESTAMPTZ`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS invoice_filename TEXT`);
  await query(`ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_status_check`);
  // Migrate existing rows BEFORE the new CHECK constraint goes in,
  // otherwise we'd fail to attach it on a populated table.
  await query(`
    UPDATE commissions
       SET status = CASE
         WHEN status = 'paid' THEN 'paid'
         WHEN approval_status = 'pending_approval' THEN 'pending_approval'
         WHEN approval_status = 'rejected' THEN 'pending_approval'
         WHEN status IN ('approved', 'pending', 'to_approve') THEN 'awaiting_invoice'
         ELSE 'pending_approval'
       END
     WHERE status NOT IN ('pending_approval','awaiting_invoice','pending_validation','paid')
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_status_check_v2') THEN
        ALTER TABLE commissions ADD CONSTRAINT commissions_status_check_v2
          CHECK (status IN ('pending_approval', 'awaiting_invoice', 'pending_validation', 'paid'));
      END IF;
    END $$
  `);
  // approval_status default no longer used by new commissions, but the
  // column stays around so 'rejected' rows keep their flag.
  console.log('[commissions] v20 status lifecycle + invoice columns ready');

  // ─── v21: Partner bank_name column for the new Settings tab ───
  await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS bank_name TEXT`);

  // ─── v22: Qonto banking integration ─────────────────────────────────
  // Per-tenant payment provider config (currently Qonto-only). Stored
  // separately from crm_integrations so a CRM disconnect can never
  // accidentally drop a banking connection. Tokens come from the
  // OAuth code exchange; bank_account_id is what the admin picks
  // among the organization's accounts to debit transfers from.
  await query(`
    CREATE TABLE IF NOT EXISTS payment_integrations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'qonto',
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMPTZ,
      organization_slug TEXT,
      bank_account_id TEXT,
      bank_account_iban TEXT,
      bank_account_label TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, provider)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_payment_integrations_tenant ON payment_integrations(tenant_id) WHERE is_active = TRUE`);

  // Per-commission Qonto bookkeeping. The transfer_id is the link to
  // the SEPA transfer in Qonto so we can poll its status; the rest is
  // surface for the admin/partner UI (so we don't have to refetch
  // everything from Qonto every render).
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS qonto_transfer_id TEXT`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS qonto_attachment_id TEXT`);
  // Qonto requires X-Qonto-Idempotency-Key on every transfer POST.
  // We persist the key per-commission so a retry after a network blip
  // reuses the same key — Qonto then returns the original transfer
  // instead of creating a duplicate one.
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS qonto_idempotency_key TEXT`);
  // Qonto returns HTTP 428 with code=sca_required when a transfer
  // needs the admin to approve it via SCA in their Qonto app. We
  // persist the sca_session_token returned in that 428 response so
  // the polling worker can retry the same POST (with the idempotency
  // key + X-Qonto-SCA-Session-Token header) until Qonto either
  // accepts the transfer (admin approved) or hard-fails it.
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS qonto_sca_session_token TEXT`);
  // Stores the EXACT POST body Qonto rejected with 428 sca_required.
  // The replay flow re-POSTs this verbatim with the
  // X-Qonto-Sca-Session-Token header after the admin approves on
  // their phone. Per Qonto docs, the replay must be byte-identical
  // to the original — anything reconstructed from current row state
  // could drift (different beneficiary lookup result, etc.).
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS qonto_request_body JSONB`);
  // One-off cleanup: previous releases stored the raw 428 JSON body
  // in payment_error, which then rendered verbatim on the card. SCA
  // is not an error — clear those rows so the new card UI can pick
  // them up as "SCA en attente" instead of red.
  await query(`UPDATE commissions SET payment_error = NULL WHERE payment_error ILIKE '%sca_required%'`).catch(() => {});
  // Same cleanup for stale qonto_attachment_id values left behind
  // by earlier flows where the attachment was uploaded under a
  // different OAuth grant or before attachment.write scope was
  // restored. Those IDs no longer resolve on Qonto's side, so a
  // bulk transfer that references them 422s on every line. We null
  // them on every commission that hasn't actually been paid yet —
  // pay attempts will re-upload fresh.
  await query(`UPDATE commissions SET qonto_attachment_id = NULL WHERE qonto_attachment_id IS NOT NULL AND status <> 'paid'`).catch(() => {});

  // Bound the SCA-replay loop. Without a counter the polling worker
  // hammers Qonto forever on commissions Qonto never actually
  // created (typically a 422 on the first POST that we mistook for
  // an SCA challenge). After 3 failed retries we reset the row to
  // pending_validation so the admin can either retry by hand or
  // abandon the payment.
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS qonto_retry_count INTEGER DEFAULT 0`);
  // Qonto's VOP (Verification of Payee) proof token, returned alongside
  // the SCA challenge on a 428. Newer Qonto API versions require this
  // token in the VOP-Proof-Token header on the SCA replay POST — without
  // it the replay 422s. We persist it next to qonto_sca_session_token
  // so the replay paths (/confirm-sca + reconcile orphan branch) can
  // forward it.
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS qonto_vop_proof_token TEXT`);
  // One-shot cleanup of stuck rows: any commission carrying
  // payment_initiated_at but no qonto_transfer_id has nothing in
  // Qonto's hands — let the admin start over.
  await query(`
    UPDATE commissions
       SET payment_initiated_at = NULL,
           qonto_sca_session_token = NULL,
           qonto_idempotency_key = NULL,
           qonto_retry_count = 0
     WHERE payment_initiated_at IS NOT NULL
       AND qonto_transfer_id IS NULL
       AND status <> 'paid'
  `).catch(() => {});

  // Broader cleanup for the bulk-endpoint failures from the previous
  // releases: any non-paid commission that's carrying a payment_error
  // gets fully reset (attachment id, error, initiated-at, transfer
  // id) so the admin can hit Pay again on a clean slate.
  await query(`
    UPDATE commissions
       SET qonto_attachment_id = NULL,
           payment_error = NULL,
           payment_initiated_at = NULL,
           qonto_transfer_id = NULL,
           qonto_sca_session_token = NULL,
           qonto_idempotency_key = NULL,
           qonto_retry_count = 0,
           status = 'pending_validation'
     WHERE status <> 'paid'
       AND payment_error IS NOT NULL
  `).catch(() => {});

  // Belt-and-suspenders: same cleanup for sca_replay_max_retries_exceeded
  // even when the broader sweep above missed a row (e.g. it was added
  // after the prior migration ran). Bound the next reconcile tick by
  // re-arming the retry budget too.
  await query(`
    UPDATE commissions
       SET payment_error = NULL,
           qonto_retry_count = 0,
           payment_initiated_at = NULL,
           qonto_sca_session_token = NULL,
           qonto_idempotency_key = NULL,
           qonto_transfer_id = NULL
     WHERE payment_error = 'sca_replay_max_retries_exceeded'
  `).catch(() => {});
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMPTZ`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_reference TEXT`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_error TEXT`);
  await query(`CREATE INDEX IF NOT EXISTS idx_commissions_qonto_transfer ON commissions(qonto_transfer_id) WHERE qonto_transfer_id IS NOT NULL`);
  console.log('[payments] v22 Qonto integration tables ready');

  // ─── v23: i18n content columns ───
  // Per-language columns so marketplace listings (tenants), partner
  // descriptions and blog articles can be served localized. The
  // base column (short_description / title / content / excerpt /
  // meta_description) stays the canonical FR copy and is the
  // fallback whenever the target-language column is NULL/empty —
  // see backend/middleware/i18n-lang.js + the localizedCol() helper
  // in routes/blog.js. Idempotent ADD COLUMN IF NOT EXISTS.
  // Mirrors backend/db/migrate_i18n_content.sql which can still be
  // run by hand against an external Postgres if needed; running this
  // block on Railway means new deploys self-heal.
  for (const lang of ['en', 'es', 'de', 'it', 'nl', 'pt']) {
    await query(`ALTER TABLE tenants     ADD COLUMN IF NOT EXISTS short_description_${lang} TEXT`);
  }
  await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS description TEXT`);
  for (const lang of ['en', 'es', 'de', 'it', 'nl', 'pt']) {
    await query(`ALTER TABLE partners    ADD COLUMN IF NOT EXISTS description_${lang} TEXT`);
    await query(`ALTER TABLE blog_posts  ADD COLUMN IF NOT EXISTS title_${lang} TEXT`);
    await query(`ALTER TABLE blog_posts  ADD COLUMN IF NOT EXISTS content_${lang} TEXT`);
    await query(`ALTER TABLE blog_posts  ADD COLUMN IF NOT EXISTS meta_description_${lang} TEXT`);
    await query(`ALTER TABLE blog_posts  ADD COLUMN IF NOT EXISTS excerpt_${lang} TEXT`);
  }
  console.log('[i18n] v23 per-language content columns ready');

  // ─── v24: marketplace_settings (rich page content per tenant) ───
  // One row per tenant carrying the WYSIWYG marketplace page content:
  // hero copy, ideal-client tags, why-join bullets, condition cards,
  // client references, additional info, plus the block ordering /
  // visibility array. Existing tenant-level marketplace fields
  // (sector, website, icp, short_description, marketplace_visible)
  // stay on `tenants` so the /marketplace listing endpoint keeps
  // working — this table only owns the rich page content.
  await query(`
    CREATE TABLE IF NOT EXISTS marketplace_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      page_headline TEXT,
      page_description TEXT,
      ideal_client TEXT,
      ideal_client_tags TEXT[] DEFAULT '{}',
      why_join JSONB DEFAULT '[]',
      commission_blocks JSONB DEFAULT '[]',
      client_references JSONB DEFAULT '[]',
      additional_info JSONB DEFAULT '[]',
      page_blocks JSONB DEFAULT '["hero","tiers","conditions","about","ideal_client","why_join","references","additional_info","cta"]',
      page_description_i18n JSONB DEFAULT '{}',
      ideal_client_i18n JSONB DEFAULT '{}',
      why_join_i18n JSONB DEFAULT '{}',
      commission_blocks_i18n JSONB DEFAULT '{}',
      client_references_i18n JSONB DEFAULT '{}',
      additional_info_i18n JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_marketplace_settings_tenant ON marketplace_settings(tenant_id)`);
  // v25: localized tags. Tags are user-generated content
  // (e.g. "Equipes commerciales") so they need to ride the same
  // _i18n side-table flow as page_description / ideal_client.
  await query(`ALTER TABLE marketplace_settings ADD COLUMN IF NOT EXISTS ideal_client_tags_i18n JSONB DEFAULT '{}'`);
  console.log('[marketplace] v24 page-content table ready');

  // v26: notification_preferences — promoted from a manual SQL file
  // (backend/db/migrate_notification_prefs.sql) into the auto-migrate
  // flow so new event types ship with every deploy. The table is
  // idempotent; the INSERT … ON CONFLICT pattern lets us seed new
  // events for existing tenants without disturbing prior toggles.
  await query(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    in_app BOOLEAN NOT NULL DEFAULT TRUE,
    email  BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(tenant_id, event_type)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notification_prefs_tenant ON notification_preferences(tenant_id)`);
  // Seed defaults for every (tenant × event). Existing rows are kept
  // verbatim thanks to ON CONFLICT DO NOTHING; only the new event
  // types land. New event types in this list:
  //   commission_approved, payment_completed, payment_failed,
  //   invoice_submitted, commission_deleted, marketplace_application,
  //   tier_change.
  await query(`
    INSERT INTO notification_preferences (tenant_id, event_type, in_app, email)
    SELECT t.id, ev.event_type, TRUE, ev.email_default
      FROM tenants t
      CROSS JOIN (VALUES
        ('new_referral',           TRUE),
        ('new_application',        TRUE),
        ('referral_update',        TRUE),
        ('commission',             TRUE),
        ('news',                   FALSE),
        ('deal_won',               TRUE),
        ('access_revoked',         TRUE),
        ('commission_approved',    TRUE),
        ('payment_completed',      TRUE),
        ('payment_failed',         TRUE),
        ('invoice_submitted',      TRUE),
        ('commission_deleted',     TRUE),
        ('marketplace_application',TRUE),
        ('tier_change',            TRUE),
        ('new_form_lead',          TRUE)
      ) AS ev(event_type, email_default)
    ON CONFLICT (tenant_id, event_type) DO NOTHING
  `);
  console.log('[notifications] v26 prefs table + new event types seeded');

  // v27: forfait engagement type + periods multiplier on referrals,
  // engagement metadata on commissions so the commissions kanban can
  // display the breakdown that produced the amount. Also a one-time
  // normalisation of legacy English engagement values
  // (monthly/quarterly/yearly) to the new French keys
  // (mensuel/trimestriel/annuel) — the UI now writes the French
  // values so without this step old rows would render as the
  // fallback "(default)" label.
  await query(`ALTER TABLE referrals    ADD COLUMN IF NOT EXISTS engagement_periods INTEGER DEFAULT 1`);
  await query(`ALTER TABLE commissions  ADD COLUMN IF NOT EXISTS engagement_type    VARCHAR(20)`);
  await query(`ALTER TABLE commissions  ADD COLUMN IF NOT EXISTS engagement_periods INTEGER DEFAULT 1`);
  await query(`UPDATE referrals SET engagement = 'mensuel'    WHERE engagement = 'monthly'`);
  await query(`UPDATE referrals SET engagement = 'trimestriel' WHERE engagement = 'quarterly'`);
  await query(`UPDATE referrals SET engagement = 'annuel'      WHERE engagement = 'yearly'`);
  console.log('[engagement] v27 forfait + engagement_periods + normalised legacy keys');

  // v28: per-deal commission rate override. Pending deals normally
  // pick up their commission rate live from the partner's current
  // tier (computed in GET /referrals from tenant_levels), so a
  // Silver → Gold promotion automatically reflects on every open
  // deal. When the admin wants to negotiate a custom rate on one
  // specific deal, commission_overridden flips to true and
  // commission_rate_override holds the bespoke value — the tier
  // stops driving that one row.
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_overridden BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_rate_override NUMERIC(5,2)`);
  console.log('[commission] v28 commission_overridden + rate override columns');

  // v29: soft-delete on referrals + commissions. Rows with
  // deleted_at IS NOT NULL are hidden from every list/read query and
  // can be restored from the Corbeille for 30 days. The daily cleanup
  // worker permanently removes rows whose deleted_at is older than
  // that window. deleted_by is the UUID of the user who issued the
  // soft delete (users.id is UUID).
  await query(`ALTER TABLE referrals   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE referrals   ADD COLUMN IF NOT EXISTS deleted_by UUID`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS deleted_by UUID`);
  await query(`CREATE INDEX IF NOT EXISTS idx_referrals_deleted_at   ON referrals(deleted_at)   WHERE deleted_at IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_commissions_deleted_at ON commissions(deleted_at) WHERE deleted_at IS NOT NULL`);
  console.log('[trash] v29 soft-delete columns + partial indexes');

  // v30: public REST API plumbing.
  //   - api_keys: permissions[] (default ['read']) + rate_limit_per_minute
  //     (default 60) + revoked_at (nullable). The legacy `is_active`
  //     column stays — both flags are checked at auth time so existing
  //     keys keep working.
  //   - referrals + partners: external_id (CRM-side identifier) so
  //     POST endpoints can be idempotent. Partial unique index per
  //     (tenant_id, external_id) — non-null only — lets tenants reuse
  //     external ids across each other and lets multiple NULLs coexist.
  await query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT ARRAY['read']`);
  await query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER DEFAULT 60`);
  await query(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ`);
  await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)`);
  await query(`ALTER TABLE partners  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_external_id_tenant ON referrals(tenant_id, external_id) WHERE external_id IS NOT NULL`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_external_id_tenant  ON partners(tenant_id, external_id)  WHERE external_id IS NOT NULL`);
  console.log('[publicApi] v30 api_keys.permissions + rate_limit + external_id columns');

  // v31: VAT support on partner payouts.
  //   - partners: tax_subject (default false → legacy behaviour, no VAT
  //     applied), tax_country (ISO-3166 alpha-2), tax_rate (e.g. 20.00),
  //     tax_id (optional intracom number, free-form within a sane size).
  //   - commissions: amount_ht / tax_rate_applied / amount_tax /
  //     amount_ttc — snapshot taken at payout time so the breakdown
  //     stays correct even if the partner's VAT status changes later.
  //
  //  Backfill assumes the legacy `commissions.amount` was already net of
  //  VAT (RefBoost paid HT) so amount_ht = amount, tax_rate = 0,
  //  amount_tax = 0, amount_ttc = amount. Backfilling on first run only:
  //  the WHERE amount_ht IS NULL clause skips rows already populated by
  //  a prior payout.
  // Each of v31 / v32 / v33 gets its own try/catch so one block's
  // failure (deadlock, transient FK issue, etc.) doesn't silently
  // skip the next on the same boot. The earlier blocks (v3–v30)
  // stay under the outer try at the bottom — they've been running
  // cleanly for a long time. Pattern for any new migration: wrap
  // individually, log "[migrate.vXX] failed: …", let the loop
  // continue.
  try {
    await query(`ALTER TABLE partners
      ADD COLUMN IF NOT EXISTS tax_subject BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS tax_country CHAR(2),
      ADD COLUMN IF NOT EXISTS tax_rate    DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS tax_id      VARCHAR(64)`);
    await query(`ALTER TABLE commissions
      ADD COLUMN IF NOT EXISTS amount_ht        DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS tax_rate_applied DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS amount_tax       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS amount_ttc       DECIMAL(12,2)`);
    await query(`UPDATE commissions
                    SET amount_ht        = amount,
                        tax_rate_applied = 0,
                        amount_tax       = 0,
                        amount_ttc       = amount
                  WHERE amount_ht IS NULL`);
    console.log('[vat] v31 partners.tax_* + commissions.amount_(ht|tax|ttc) + backfill');
  } catch (err) {
    console.error('[migrate.v31] failed:', err.message);
  }

  // v32: data migration — backfill VAT on old commissions where the
  // partner is now tax_subject = true but the commission row still
  // has tax_rate_applied = 0 (created before the routes/referrals.js
  // INSERT was taught to read partner.tax_subject in 99b848c).
  //
  // Strict one-shot via the new `migrations` table. Won't fire again
  // even if a partner toggles tax_subject later — deliberate
  // hand-off to the admin (Settings → Coordonnées bancaires) so a
  // future status change can't silently rewrite historical commission
  // rows. The WHERE filter is still tight (commission must be at
  // rate=0), so already-decomposed rows are never touched.
  try {
    await query(`CREATE TABLE IF NOT EXISTS migrations (
      name VARCHAR(100) PRIMARY KEY,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const VAT_MIG_KEY = 'backfill_vat_from_partner_v1';
    const { rows: vatDone } = await query(
      'SELECT 1 FROM migrations WHERE name = $1',
      [VAT_MIG_KEY]
    );
    if (vatDone.length === 0) {
      const { rowCount: vatRows } = await query(`
        UPDATE commissions c
           SET tax_rate_applied = p.tax_rate,
               amount_ht        = COALESCE(c.amount_ht, c.amount),
               amount_tax       = ROUND(COALESCE(c.amount_ht, c.amount) * p.tax_rate / 100, 2),
               amount_ttc       = ROUND(COALESCE(c.amount_ht, c.amount) * (1 + p.tax_rate / 100.0), 2)
          FROM partners p
         WHERE c.partner_id = p.id
           AND c.deleted_at IS NULL
           AND p.tax_subject = true
           AND p.tax_rate > 0
           AND (c.tax_rate_applied IS NULL OR c.tax_rate_applied = 0)
      `);
      await query(
        'INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
        [VAT_MIG_KEY]
      );
      console.log(`[vat] v32 backfill_vat_from_partner_v1: ${vatRows} commission(s) updated`);
    }
  } catch (err) {
    console.error('[migrate.v32] failed:', err.message);
  }

  // v33: billing details on tenants. Used on the partner-side
  // /partner/payments page so partners can address their invoice
  // to the right legal entity, and on the admin-side Settings →
  // Entreprise tab where the admin enters the values once.
  try {
    await query(`ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS billing_company_name VARCHAR(200),
      ADD COLUMN IF NOT EXISTS billing_address      VARCHAR(300),
      ADD COLUMN IF NOT EXISTS billing_city         VARCHAR(100),
      ADD COLUMN IF NOT EXISTS billing_postal_code  VARCHAR(20),
      ADD COLUMN IF NOT EXISTS billing_country      VARCHAR(100) DEFAULT 'France',
      ADD COLUMN IF NOT EXISTS billing_siret        VARCHAR(20)`);
    console.log('[billing] v33 tenants.billing_* columns');
  } catch (err) {
    console.error('[migrate.v33] failed:', err.message);
  }

  // v34: onboarding checklist state on tenants. The checklist itself
  // is computed dynamically from the tenant's data on every read
  // (see routes/onboarding.js); these two columns only persist the
  // admin's explicit dismiss + a sticky "you finished it" timestamp.
  try {
    await query(`ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS onboarding_dismissed    BOOLEAN DEFAULT FALSE`);
    console.log('[onboarding] v34 tenants.onboarding_* columns');
  } catch (err) {
    console.error('[migrate.v34] failed:', err.message);
  }

  // v35: Pennylane accounting integration. Complements the existing
  // Qonto payment flow by auto-creating a supplier invoice in the
  // admin's Pennylane workspace whenever a commission is approved,
  // and marking the same invoice paid once Qonto confirms the SEPA
  // transfer settled. Per-tenant token + global enable flag on
  // tenants; per-row pointers on commissions and partners so we
  // don't re-create the same supplier or duplicate the invoice on
  // a retry.
  try {
    await query(`ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS pennylane_api_token TEXT,
      ADD COLUMN IF NOT EXISTS pennylane_enabled   BOOLEAN DEFAULT FALSE`);
    await query(`ALTER TABLE commissions
      ADD COLUMN IF NOT EXISTS pennylane_invoice_id  VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pennylane_supplier_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pennylane_status      VARCHAR(50)`);
    await query(`ALTER TABLE partners
      ADD COLUMN IF NOT EXISTS pennylane_supplier_id VARCHAR(100)`);
    console.log('[pennylane] v35 tenants/commissions/partners pennylane_* columns');
  } catch (err) {
    console.error('[migrate.v35] failed:', err.message);
  }

  // v36: composite indexes for the hot list queries identified in
  // the load-readiness audit (2026-05-07). Each one targets a
  // multi-column WHERE that was scanning sequentially because no
  // single existing index covered all the predicates.
  //
  //   referrals    — list filters by (tenant_id, partner_id, status)
  //                  and excludes soft-deleted rows on every read.
  //   commissions  — same shape; payment polling worker also hits
  //                  this index when sweeping pending settlements.
  //   notifications — sidebar polls "my unread" + ORDER BY created_at
  //                   DESC.
  //   users         — login + reset-token lookups by (tenant_id,
  //                   email).
  //   api_keys      — authenticated by key_hash; partial filter on
  //                   active rows skips the soft-deleted/revoked
  //                   subset.
  //
  // All wrapped in their own try block so a failure (e.g. a column
  // doesn't exist on a stale schema) doesn't poison v37+.
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_referrals_tenant_partner_status
                   ON referrals(tenant_id, partner_id, status)
                   WHERE deleted_at IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_commissions_tenant_partner_status
                   ON commissions(tenant_id, partner_id, status)
                   WHERE deleted_at IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created
                   ON notifications(user_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_tenant_email
                   ON users(tenant_id, email)`);
    // api_keys partial — only the rows the auth middleware ever cares
    // about. The legacy idx_api_keys_hash covers full-table lookups;
    // this one fast-paths the hot loop in apiKeyAuth that filters by
    // key_hash AND is_active.
    await query(`CREATE INDEX IF NOT EXISTS idx_api_keys_active_hash
                   ON api_keys(key_hash)
                   WHERE is_active = TRUE`);
    console.log('[load] v36 composite indexes ready');
  } catch (err) {
    console.error('[migrate.v36] failed:', err.message);
  }

  // v37: tenant scoping on conversations.
  //
  // Bug history: the conversations table was created in
  // migration-v2.sql WITHOUT a tenant_id column — only created_by
  // (a users.id reference). The legacy superadmin teardown handled
  // this by using `tenant_id = $1 OR created_by IN (users from
  // tenant)`, but every other route (the messaging listing, the
  // GET /:id/messages, the unread badge counter) silently joined
  // via conversation_participants → user_id without any tenant
  // gate. A user with the same email re-invited as a partner in a
  // second tenant ended up with one users.id row and participant
  // rows in conversations from BOTH tenants — the listing then
  // surfaced cross-tenant messages.
  //
  // Fix: add tenant_id, backfill from created_by's users.tenant_id
  // for every existing row, and index it. The route fixes that
  // actually filter on the column ship in the same release.
  try {
    await query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await query(`UPDATE conversations c
                    SET tenant_id = u.tenant_id
                   FROM users u
                  WHERE u.id = c.created_by
                    AND c.tenant_id IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_conversations_tenant
                   ON conversations(tenant_id)`);
    console.log('[messaging] v37 conversations.tenant_id added + backfilled');
  } catch (err) {
    console.error('[migrate.v37] failed:', err.message);
  }

  // v38: tenant scoping on notifications.
  //
  // Same shape of bug as v37 conversations: the notifications table
  // (created in migrate_news.sql) was keyed by user_id only, with no
  // tenant_id column. A users.id is global — one row per email,
  // many user_roles — so a partner re-invited with the same email
  // in two programs got notifications fanned out under one user_id
  // visible to both tenant contexts. The sidebar feed then mixed
  // both tenants' updates.
  //
  // Backfill priority: news_post_id (carries the post's tenant) wins
  // when present; remaining rows fall back to the user's currently-
  // active tenant (imperfect — historically a row could have been
  // generated when the user was on a different tenant, but the only
  // alternative is to drop the row entirely). Both stages skip rows
  // where tenant_id is already set so the migration is idempotent.
  try {
    await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await query(`UPDATE notifications n
                    SET tenant_id = np.tenant_id
                   FROM news_posts np
                  WHERE np.id = n.news_post_id
                    AND n.tenant_id IS NULL`);
    await query(`UPDATE notifications n
                    SET tenant_id = u.tenant_id
                   FROM users u
                  WHERE u.id = n.user_id
                    AND n.tenant_id IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_created
                   ON notifications(tenant_id, user_id, created_at DESC)`);
    console.log('[notifications] v38 tenant_id added + backfilled');
  } catch (err) {
    console.error('[migrate.v38] failed:', err.message);
  }

  // v39: tenant scoping on notification_queue (the email-send audit
  // log written by services/resend.js sendAndLog). The table only
  // carries (recipient_email, template, payload, sent, sent_at, …)
  // today — admin queries against it for "what did we send for my
  // tenant?" can't be filtered. Adds the column and a partial index
  // for the typical "recent fails per tenant" lookup. Backfill via
  // recipient_email → users.tenant_id where the recipient is also a
  // user; rows where the recipient isn't a known user (cold-outreach
  // emails, public application replies) stay NULL.
  try {
    await query(`ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await query(`UPDATE notification_queue nq
                    SET tenant_id = u.tenant_id
                   FROM users u
                  WHERE LOWER(u.email) = LOWER(nq.recipient_email)
                    AND nq.tenant_id IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notification_queue_tenant_sent_at
                   ON notification_queue(tenant_id, sent_at DESC)`);
    console.log('[email-log] v39 notification_queue.tenant_id added + backfilled');
  } catch (err) {
    console.error('[migrate.v39] failed:', err.message);
  }

  // v40: public status page incidents. Tracked manually by superadmins
  // (no auto-detection yet) so customers visiting /status see the same
  // human-written timeline they'd get from a Slack post-mortem.
  // Severity / status enums are kept as VARCHAR rather than CHECK
  // constraints so the wording can evolve without a migration.
  try {
    await query(`CREATE TABLE IF NOT EXISTS status_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'minor',
      status VARCHAR(20) NOT NULL DEFAULT 'investigating',
      description TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_status_incidents_started ON status_incidents(started_at DESC)`);
    console.log('[status] v40 status_incidents table ready');
  } catch (err) {
    console.error('[migrate.v40] failed:', err.message);
  }

  // v41: GDPR Article 17 — soft delete on users + partners. The
  // /api/auth/delete-account endpoint stamps deleted_at = NOW(); the
  // 30-day cron permanently purges anything beyond that window. We
  // also flag is_active = false on partners so the access-revoked
  // session check in /auth/me kicks the user out immediately, even
  // before the JWT itself expires.
  try {
    await query(`ALTER TABLE users    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_deleted_at
                   ON users(deleted_at)
                   WHERE deleted_at IS NOT NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_partners_deleted_at
                   ON partners(deleted_at)
                   WHERE deleted_at IS NOT NULL`);
    console.log('[gdpr] v41 users/partners.deleted_at added');
  } catch (err) {
    console.error('[migrate.v41] failed:', err.message);
  }

  // v42: audit_logs hardening for ISO 27001 A.12.4 / SOC 2 CC6.
  //
  // The table itself already exists (created by db/migrate-security.js
  // with resource_type/resource_id columns). The new logAudit service
  // writes the same row but under entity_type/entity_id — the names
  // the spec uses everywhere else. Add those columns alongside the
  // legacy pair so both shapes coexist and old queries keep working
  // until callers migrate. Idempotent: ADD COLUMN IF NOT EXISTS only
  // touches the schema on first deploy.
  try {
    await query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      user_id UUID,
      user_email VARCHAR(255),
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(50),
      resource_id UUID,
      entity_type VARCHAR(50),
      entity_id UUID,
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50)`);
    await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
                   ON audit_logs(tenant_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
                   ON audit_logs(action, created_at DESC)`);
    console.log('[audit] v42 audit_logs entity_type/entity_id columns ready');
  } catch (err) {
    console.error('[migrate.v42] failed:', err.message);
  }

  // v43: TOTP two-factor authentication on the users table.
  //
  //   mfa_secret        — AES-encrypted TOTP shared secret (utils/crypto.js).
  //                       Set on /auth/mfa/setup, never returned to the
  //                       client after that. Cleared on /auth/mfa/disable.
  //   mfa_enabled       — flips to TRUE only after the user types a valid
  //                       6-digit code in /auth/mfa/verify, so a partial
  //                       enrolment never strands the user out of their
  //                       account.
  //   mfa_backup_codes  — 8 single-use bcrypt-hashed recovery codes that
  //                       let the user log in if they lose their TOTP
  //                       device. Each match is removed from the array.
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[]`);
    console.log('[mfa] v43 users.mfa_* columns ready');
  } catch (err) {
    console.error('[migrate.v43] failed:', err.message);
  }

  // v44: PostgreSQL row-level security as defence-in-depth on every
  // tenant-scoped table. Runs ENABLE only (not FORCE) so existing
  // queries from owner connections keep working when RLS_ENABLED is
  // unset; FORCE would block the Railway default connection (which is
  // table owner) regardless of the env flag, breaking startup. The
  // authenticate middleware sets app.current_tenant_id /
  // app.current_role per-request when RLS_ENABLED=true, and the
  // tenant_isolation policy gates reads accordingly. Each table's
  // block is wrapped in its own try so one failure (e.g. a
  // pre-existing policy with a different USING expression) doesn't
  // abort the rest.
  const RLS_TABLES = [
    'referrals', 'commissions', 'partners', 'messages', 'conversations',
    'news_posts', 'notifications', 'audit_logs',
  ];
  for (const table of RLS_TABLES) {
    try {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
      await query(`CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))`);
      await query(`DROP POLICY IF EXISTS superadmin_bypass ON ${table}`);
      await query(`CREATE POLICY superadmin_bypass ON ${table}
        USING (current_setting('app.current_role', true) = 'superadmin')`);
      console.log(`[rls] v44 ${table} policies ready`);
    } catch (err) {
      console.error(`[migrate.v44.${table}] failed:`, err.message);
    }
  }

  // v45: token_version on users — gives the "Sign out everywhere"
  // panic button (Settings → Profil) a way to invalidate every
  // outstanding JWT in one UPDATE. The authenticate middleware
  // compares jwt.token_version against users.token_version on each
  // request; a bump forces a fresh login.
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`);
    console.log('[security] v45 users.token_version ready');
  } catch (err) {
    console.error('[migrate.v45] failed:', err.message);
  }

  // v46: billing / Stripe subscription columns on tenants. Previously
  // lived in db/migrate_billing.sql (deleted in this commit); porting
  // the columns here so a fresh deploy picks them up automatically.
  // Idempotent — safe to run repeatedly (ADD COLUMN IF NOT EXISTS +
  // UPDATE WHERE NULL).
  try {
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'starter'`);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(200)`);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(200)`);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_partner_limit INTEGER DEFAULT 3`);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ`);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_ends_at TIMESTAMPTZ`);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'active'`);
    await query(`UPDATE tenants SET plan = 'starter' WHERE plan IS NULL`);
    await query(`UPDATE tenants SET plan_partner_limit = 3 WHERE plan_partner_limit IS NULL`);
    await query(`UPDATE tenants SET payment_status = 'active' WHERE payment_status IS NULL`);
    console.log('[billing] v46 tenants.plan + stripe columns ready');
  } catch (err) {
    console.error('[migrate.v46] failed:', err.message);
  }

  // v47: partner-registration forms. Lets tenants create a single
  // form that their partners share via per-partner tokens;
  // submissions create a referral attributed to the right partner.
  // This étape only lays down the schema — the builder UI, public
  // form, embed, and funnel stats arrive in étapes 2-6.
  //
  //   forms                — one row per tenant (V1 cap, enforced by
  //                          a partial UNIQUE index on tenant_id
  //                          WHERE deleted_at IS NULL so a tenant can
  //                          soft-delete and start over)
  //   form_fields          — fields the builder created, scoped to a
  //                          single form. tenant_id is denormalised
  //                          so RLS policies can match without
  //                          traversing the form_id FK chain.
  //   form_partner_tokens  — random per-partner token ('prt_…') that
  //                          identifies which partner a submission
  //                          belongs to when the prospect lands on
  //                          /f/<id>?p=<token>.
  //   referrals.form_id    — nullable FK so form-originated referrals
  //                          carry their source. ON DELETE SET NULL
  //                          preserves referral history if a tenant
  //                          ever hard-deletes its form.
  //
  // Also extends users.role to include 'system' for the lazy-created
  // synthetic user that owns form-originated referrals (forms are
  // anonymous, so referrals.submitted_by — NOT NULL — points to a
  // per-tenant system user with is_active = FALSE). The 5
  // super-admin counts that don't already filter on is_active get an
  // explicit role != 'system' guard in routes/superadmin.js in the
  // same commit.
  try {
    await query(`CREATE TABLE IF NOT EXISTS forms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      thank_you_message TEXT,
      default_lead_handling VARCHAR(20) NOT NULL DEFAULT 'partner_managed'
        CHECK (default_lead_handling IN ('partner_managed', 'client_prospect')),
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_tenant_active
                   ON forms(tenant_id) WHERE deleted_at IS NULL`);

    await query(`CREATE TABLE IF NOT EXISTS form_fields (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      step INTEGER NOT NULL CHECK (step IN (1, 2, 3)),
      order_index INTEGER NOT NULL DEFAULT 0,
      type VARCHAR(30) NOT NULL CHECK (type IN (
        'text_short', 'text_long', 'email', 'phone', 'dropdown',
        'multi_select', 'radio', 'date', 'number', 'appointment'
      )),
      label VARCHAR(500) NOT NULL,
      placeholder VARCHAR(500),
      required BOOLEAN NOT NULL DEFAULT FALSE,
      options JSONB,
      config JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_form_fields_form_step
                   ON form_fields(form_id, step, order_index)`);

    await query(`CREATE TABLE IF NOT EXISTS form_partner_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      token VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (form_id, partner_id)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_form_partner_tokens_token
                   ON form_partner_tokens(token)`);

    await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES forms(id) ON DELETE SET NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_referrals_form_id
                   ON referrals(form_id) WHERE form_id IS NOT NULL`);

    // Extend users.role CHECK to allow 'system'. DROP-then-ADD
    // because Postgres has no ALTER CHECK. The new constraint is a
    // superset of the existing one (set by migrate-security.js with
    // 'superadmin' included), so every existing row still passes —
    // no data migration needed.
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await query(`ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'commercial', 'partner', 'superadmin', 'system'))`);

    console.log('[forms] v47 forms + form_fields + form_partner_tokens + referrals.form_id + users.role(system) ready');
  } catch (err) {
    console.error('[migrate.v47] failed:', err.message);
  }

  // v47b: RLS defence-in-depth on the new form tables. Same shape as
  // v44 (ENABLE only — not FORCE — so the table-owner Railway
  // connection continues to bypass when RLS_ENABLED is unset;
  // tenant_isolation + superadmin_bypass policies). form_fields and
  // form_partner_tokens carry a denormalised tenant_id specifically
  // so the policy can match without joining through form_id.
  const RLS_FORM_TABLES = ['forms', 'form_fields', 'form_partner_tokens'];
  for (const table of RLS_FORM_TABLES) {
    try {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
      await query(`CREATE POLICY tenant_isolation ON ${table}
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))`);
      await query(`DROP POLICY IF EXISTS superadmin_bypass ON ${table}`);
      await query(`CREATE POLICY superadmin_bypass ON ${table}
        USING (current_setting('app.current_role', true) = 'superadmin')`);
      console.log(`[rls] v47 ${table} policies ready`);
    } catch (err) {
      console.error(`[migrate.v47.${table}] failed:`, err.message);
    }
  }

  // v48: dynamic step count on forms. The original v47 design hard-
  // capped step at 3 via a CHECK constraint on form_fields.step; users
  // pushed back almost immediately because some flows want a single
  // step (lightweight lead capture) and others want up to 5 (qualifying
  // questionnaires). We add a per-form step_count column (default 3 so
  // existing forms stay where they are) and widen form_fields.step's
  // CHECK to allow 1..5.
  try {
    await query(`ALTER TABLE forms ADD COLUMN IF NOT EXISTS step_count INTEGER NOT NULL DEFAULT 3`);
    await query(`ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_step_count_check`);
    await query(`ALTER TABLE forms ADD CONSTRAINT forms_step_count_check CHECK (step_count BETWEEN 1 AND 5)`);
    await query(`ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_step_check`);
    await query(`ALTER TABLE form_fields ADD CONSTRAINT form_fields_step_check CHECK (step BETWEEN 1 AND 5)`);
    console.log('[forms] v48 forms.step_count + step range expanded to 1..5');
  } catch (err) {
    console.error('[migrate.v48] failed:', err.message);
  }

  // v49: per-IP rate limit table for the public form-submit endpoint.
  // Modelled after apply_rate_limits (the partner-application limiter)
  // but kept in its own table so the two surfaces don't share a
  // counter — a bot hitting /api/applications/apply shouldn't deplete
  // the quota a real prospect would later hit on /api/f/<id>/submit.
  try {
    await query(`CREATE TABLE IF NOT EXISTS form_submit_rate_limits (
      ip VARCHAR(45) PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      reset_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_form_submit_rate_limits_reset
                   ON form_submit_rate_limits(reset_at)`);
    console.log('[forms] v49 form_submit_rate_limits ready');
  } catch (err) {
    console.error('[migrate.v49] failed:', err.message);
  }

  // v50: appointment moves from "yet another field type" to a
  // dedicated form-level setting (one URL per form, rendered as an
  // iframe on the thank-you screen). Adds a per-field `field_role`
  // tag so the submission mapping can target legacy referrals
  // columns deterministically instead of falling back to label
  // keyword heuristics — and so the builder can flag "standard"
  // fields when the user tries to delete one.
  //
  // Data migration runs in the same block: for every form that
  // currently has at least one type='appointment' field, we copy
  // the URL from the FIRST such field (by step + order_index) into
  // forms.appointment_url, flip appointment_enabled to TRUE, then
  // delete every appointment field on that form. Logged per form
  // so a multi-appointment regression (shouldn't happen but might)
  // is visible in the Railway logs.
  try {
    await query(`ALTER TABLE forms ADD COLUMN IF NOT EXISTS appointment_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE forms ADD COLUMN IF NOT EXISTS appointment_url TEXT`);
    await query(`ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS field_role VARCHAR(50)`);
    // Index for the restore-defaults lookup which queries by
    // (form_id, field_role).
    await query(`CREATE INDEX IF NOT EXISTS idx_form_fields_form_role
                   ON form_fields(form_id, field_role) WHERE field_role IS NOT NULL`);

    // Surface forms that still have appointment fields then iterate.
    const { rows: formsWithAppt } = await query(
      `SELECT DISTINCT form_id FROM form_fields WHERE type = 'appointment'`
    );
    for (const { form_id } of formsWithAppt) {
      const { rows: appts } = await query(
        `SELECT id, config FROM form_fields
          WHERE form_id = $1 AND type = 'appointment'
          ORDER BY step ASC, order_index ASC, created_at ASC`,
        [form_id]
      );
      if (!appts.length) continue;
      const firstUrl = appts[0].config?.appointment_url || null;
      if (firstUrl) {
        await query(
          `UPDATE forms SET appointment_enabled = TRUE, appointment_url = $1, updated_at = NOW()
            WHERE id = $2 AND deleted_at IS NULL`,
          [firstUrl, form_id]
        );
      }
      await query(`DELETE FROM form_fields WHERE form_id = $1 AND type = 'appointment'`, [form_id]);
      const dropped = appts.length - 1;
      console.log(`[forms] v50: migrated appointment from form ${form_id}${dropped > 0 ? ' (kept first, dropped ' + dropped + ' others)' : ''}`);
    }
    console.log('[forms] v50 appointment-as-setting + field_role ready');
  } catch (err) {
    console.error('[migrate.v50] failed:', err.message);
  }

  // v51: funnel instrumentation for the public form. One row per
  // event (form_view / form_start / step_complete / field_abandon /
  // form_submit). session_id is generated client-side and persisted
  // to sessionStorage so every event from the same visit can be
  // stitched together. partner_token captures attribution; field_id
  // is set on field_abandon. tenant_id is denormalised so the v44
  // RLS pattern applies without traversing form_id.
  //
  // Volume note: we expect order-of-magnitude < 1k events / form /
  // day at MVP scale. Direct GROUP BY queries are fine; pre-
  // aggregation can come if a tenant hits five-digit daily traffic.
  try {
    await query(`CREATE TABLE IF NOT EXISTS form_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      partner_token VARCHAR(64),
      session_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(32) NOT NULL CHECK (event_type IN (
        'form_view', 'form_start', 'step_complete', 'field_abandon', 'form_submit'
      )),
      step_index INTEGER,
      field_id UUID REFERENCES form_fields(id) ON DELETE SET NULL,
      user_agent TEXT,
      ip INET,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_form_events_form_created
                   ON form_events(form_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_form_events_session
                   ON form_events(session_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_form_events_form_partner_type
                   ON form_events(form_id, partner_token, event_type)`);
    // RLS — same pattern as v47b. Owner connection bypasses unless
    // RLS_ENABLED is set; auth-driven app.current_tenant_id gates
    // reads to the form's tenant; superadmin bypasses everything.
    try {
      await query(`ALTER TABLE form_events ENABLE ROW LEVEL SECURITY`);
      await query(`DROP POLICY IF EXISTS tenant_isolation ON form_events`);
      await query(`CREATE POLICY tenant_isolation ON form_events
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))`);
      await query(`DROP POLICY IF EXISTS superadmin_bypass ON form_events`);
      await query(`CREATE POLICY superadmin_bypass ON form_events
        USING (current_setting('app.current_role', true) = 'superadmin')`);
    } catch (rlsErr) {
      console.error('[migrate.v51.rls] failed:', rlsErr.message);
    }
    console.log('[forms] v51 form_events table ready');
  } catch (err) {
    console.error('[migrate.v51] failed:', err.message);
  }

  // v51b: dedicated per-IP rate-limit table for the event endpoint.
  // Separate from form_submit_rate_limits (5/h) because events are
  // expected to burst at 60/min during a normal funnel completion.
  try {
    await query(`CREATE TABLE IF NOT EXISTS form_event_rate_limits (
      ip VARCHAR(45) PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      reset_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_form_event_rate_limits_reset
                   ON form_event_rate_limits(reset_at)`);
    console.log('[forms] v51b form_event_rate_limits ready');
  } catch (err) {
    console.error('[migrate.v51b] failed:', err.message);
  }

  // v52: GDPR Article 17 — extend self-deletion from partners-only
  // (already shipped in v41) to admin owners of a tenant client. Two
  // moving pieces:
  //   - tenants.deleted_at: soft-delete column. Read paths already
  //     filter by tenant_id matching the authenticated user, so a
  //     soft-deleted tenant just disappears from view; the daily
  //     purge worker will hard-delete past the 30-day window.
  //   - account_deletion_feedback: structured reason + free-text
  //     captured at deletion time. Surfaced in super-admin later.
  try {
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NOT NULL`);

    await query(`CREATE TABLE IF NOT EXISTS account_deletion_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
      partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason_code VARCHAR(32) NOT NULL CHECK (reason_code IN ('price', 'features', 'competitor', 'no_need', 'other')),
      free_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_account_deletion_feedback_created
                   ON account_deletion_feedback(created_at DESC)`);
    console.log('[gdpr] v52 tenants.deleted_at + account_deletion_feedback ready');
  } catch (err) {
    console.error('[migrate.v52] failed:', err.message);
  }

  // v53: Pipedrive connector — id columns on referrals + partners so a
  // pushed/upserted entity can be resolved deterministically on the
  // next sync. The integration config itself (tokens, api_domain,
  // pipeline_id, webhook auth) lives inside crm_integrations.settings
  // under provider='pipedrive'; nothing new on tenants here. All
  // ADD COLUMN IF NOT EXISTS — re-runnable. Brief called this "v48"
  // but that slot is taken by forms.step_count from a prior cycle;
  // bumped to v53 (the next free slot after the v52 GDPR block above).
  try {
    await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS pipedrive_deal_id VARCHAR(50)`);
    await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS pipedrive_person_id VARCHAR(50)`);
    await query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS pipedrive_organization_id VARCHAR(50)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_referrals_pipedrive_deal_id
                   ON referrals(pipedrive_deal_id) WHERE pipedrive_deal_id IS NOT NULL`);
    await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS pipedrive_organization_id VARCHAR(50)`);
    await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS pipedrive_person_id VARCHAR(50)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_partners_pipedrive_org_id
                   ON partners(pipedrive_organization_id) WHERE pipedrive_organization_id IS NOT NULL`);
    console.log('[pipedrive] v53 referrals/partners pipedrive_* columns + indexes ready');
  } catch (err) {
    console.error('[migrate.v53] failed:', err.message);
  }

  // v54: phase E1 of the event-driven recurring-commission rework.
  // SCHEMA-ONLY — zero behavioural change. The new columns are all
  // nullable / defaulted to the legacy-behaviour values, so every
  // existing read path keeps working unmodified. Activation happens
  // later (E2+) by flipping tenants.recurring_billing_enabled to TRUE
  // on a per-tenant basis; until then `is_recurring = FALSE` everywhere
  // and the recurring branches stay dormant.
  //
  // Model:
  //   - commission_revisions: append-only audit of every change to a
  //     commission's deal_value / rate / VAT snapshot. revision_index = 1
  //     is the initial creation; subsequent rows are upsell/downsell
  //     amendments. The existing commissions row is NEVER mutated for
  //     historical revisions — already-paid amounts stay accurate
  //     against the revision they were paid on.
  //   - commissions.is_recurring: FALSE = legacy one-shot
  //     (forfait/mensuel/trimestriel/annuel × periods, single row,
  //     no recurring cycle). TRUE = lives as long as the deal is
  //     `won`, future cycles billed against the latest revision.
  //   - commissions.is_perpetual: meaningful only when is_recurring;
  //     TRUE = "à vie" (no end), FALSE = bounded by engagement_until.
  //   - commissions.engagement_until: optional terminal date for
  //     bounded recurring commissions. NULL when perpetual or legacy.
  //   - commissions.current_revision_index: pointer to the active
  //     row in commission_revisions; backfilled to 1.
  //   - tenants.recurring_billing_enabled: tenant-level feature flag,
  //     OFF by default. Every recurring-billing code path will gate
  //     on this so non-opted-in tenants keep the legacy behaviour
  //     byte-for-byte.
  //
  // Backfill: one revision row per pre-existing commission, mirroring
  // the v31 VAT-backfill semantics (legacy rows treated as tax_rate=0
  // and ttc=ht=amount). The `NOT EXISTS` guard makes the backfill
  // idempotent — re-running the migration over an already-backfilled
  // database inserts zero rows.
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS commission_revisions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
        revision_index INTEGER NOT NULL,
        deal_value NUMERIC(12,2) NOT NULL,
        rate NUMERIC(5,2) NOT NULL,
        amount_ht NUMERIC(12,2) NOT NULL,
        tax_rate_applied NUMERIC(5,2) NOT NULL DEFAULT 0,
        amount_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
        amount_ttc NUMERIC(12,2) NOT NULL,
        effective_date DATE NOT NULL,
        reason TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (commission_id, revision_index)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_commission_revisions_commission_effective
                   ON commission_revisions(commission_id, effective_date)`);

    await query(`ALTER TABLE commissions
                   ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
                   ADD COLUMN IF NOT EXISTS is_perpetual BOOLEAN NOT NULL DEFAULT FALSE,
                   ADD COLUMN IF NOT EXISTS engagement_until DATE,
                   ADD COLUMN IF NOT EXISTS current_revision_index INTEGER NOT NULL DEFAULT 1`);

    await query(`ALTER TABLE tenants
                   ADD COLUMN IF NOT EXISTS recurring_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE`);

    const { rowCount: revisionsBackfilled } = await query(`
      INSERT INTO commission_revisions
        (commission_id, revision_index, deal_value, rate,
         amount_ht, tax_rate_applied, amount_tax, amount_ttc,
         effective_date, reason, created_by, created_at)
      SELECT c.id,
             1,
             c.deal_value,
             c.rate,
             COALESCE(c.amount_ht,  c.amount),
             COALESCE(c.tax_rate_applied, 0),
             COALESCE(c.amount_tax, 0),
             COALESCE(c.amount_ttc, c.amount),
             COALESCE(c.created_at::date, NOW()::date),
             'initial',
             NULL,
             COALESCE(c.created_at, NOW())
        FROM commissions c
       WHERE NOT EXISTS (
         SELECT 1 FROM commission_revisions cr
          WHERE cr.commission_id = c.id AND cr.revision_index = 1
       )
    `);
    console.log(`[recurring] v54 commission_revisions + commissions.is_recurring/is_perpetual/engagement_until/current_revision_index + tenants.recurring_billing_enabled ready · backfilled ${revisionsBackfilled} initial revisions`);
  } catch (err) {
    console.error('[migrate.v54] failed:', err.message);
  }

  // v55: phase E2 (refonte) — commission longevity moves from the deal
  // to the TIER (partner level). E2 first put the "à vie / limité X
  // mois" selector on the deal modal, but that conflated two things:
  //   - the deal's billing cadence (mensuel/trim/annuel × periods),
  //     which is a property of the deal itself
  //   - the commission's longevity (how long RefBoost keeps paying
  //     the partner for this deal), which is a PROGRAMME-level policy
  //     that depends on the partner's tier
  // The correct model: configure longevity on each tenant_level. The
  // commission then captures the partner's tier-driven longevity ONCE
  // at the won transition (v56 + utils/longevitySnapshot) and never
  // recalculates after. (An earlier cut tried a dynamic resolver that
  // re-evaluated against the partner's CURRENT tier on every read —
  // that was reverted in E2-bis; the field columns added here remain
  // the authoritative snapshot.)
  //
  //   tenant_levels.longevity_mode  : 'limited' | 'lifetime'
  //   tenant_levels.longevity_months: INT (only meaningful when mode='limited')
  //
  // Defaults: every existing level is backfilled to ('limited', 12).
  // Mirrored in the front-end via the new Programme tab UI; non-opted
  // tenants (recurring_billing_enabled=false) never see this field.
  // Idempotent — ADD COLUMN IF NOT EXISTS + UPDATE only the freshly-
  // backfilled rows where longevity_mode is NULL.
  try {
    await query(`ALTER TABLE tenant_levels
                   ADD COLUMN IF NOT EXISTS longevity_mode   VARCHAR(20),
                   ADD COLUMN IF NOT EXISTS longevity_months INTEGER`);
    const { rowCount: tiersBackfilled } = await query(`
      UPDATE tenant_levels
         SET longevity_mode   = 'limited',
             longevity_months = 12
       WHERE longevity_mode IS NULL
    `);
    console.log(`[recurring] v55 tenant_levels.longevity_mode + longevity_months ready · backfilled ${tiersBackfilled} legacy levels to ('limited', 12)`);
  } catch (err) {
    console.error('[migrate.v55] failed:', err.message);
  }

  // v56: E2-bis — commission longevity becomes a SNAPSHOT FIXED AT
  // WON. The dynamic resolver from the first E2 refonte cut
  // (resolveCommissionLongevity called against the partner's current
  // tier at every read) is removed; the commission row's
  // is_perpetual / engagement_until columns from v54 become the
  // single source of truth, frozen at the won transition. Tier
  // promotions/demotions after won do NOT touch existing commissions
  // any more — they only affect deals won AFTER the change.
  //
  // tier_at_won is a tiny audit field: the human-readable tier name
  // captured at won, surfaced in the Programme audit trail. Pre-v56
  // recurring commissions stay at NULL (we can't backfill it
  // accurately — the partner's then-current tier is not deterministic
  // from current row state) and the UI degrades to showing just
  // is_perpetual / engagement_until without the tier badge.
  try {
    await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS tier_at_won TEXT`);
    console.log('[recurring] v56 commissions.tier_at_won ready');
  } catch (err) {
    console.error('[migrate.v56] failed:', err.message);
  }

  // v57: E4 — won→lost workflow for active recurring commissions.
  // When a deal moves to "lost" and the recurring commission is
  // past pending_approval, the legacy path either DELETEd a
  // pending_approval row silently or 400'd with commission_locked.
  // E4 introduces 'cancelled' status + an admin arbitrage step:
  // pay the last engagement cycle, or confirm cessation. The
  // commission is NEVER physically deleted from this path —
  // 'cancelled' preserves the row, its revisions, and its snapshot
  // longevity for audit. cancelled_resolved gates the row out of
  // the "to-arbitrate" admin queue once the admin has decided.
  //
  // The status CHECK constraint must accept the new value, so we
  // swap commissions_status_check_v2 → _v3 with 'cancelled'
  // appended. Idempotent: existence guards + IF NOT EXISTS on the
  // new columns.
  try {
    await query(`ALTER TABLE commissions
                   ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ,
                   ADD COLUMN IF NOT EXISTS cancelled_reason   TEXT,
                   ADD COLUMN IF NOT EXISTS cancelled_resolved BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_status_check_v2') THEN
          ALTER TABLE commissions DROP CONSTRAINT commissions_status_check_v2;
        END IF;
      END $$
    `);
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_status_check_v3') THEN
          ALTER TABLE commissions ADD CONSTRAINT commissions_status_check_v3
            CHECK (status IN ('pending_approval', 'awaiting_invoice', 'pending_validation', 'paid', 'cancelled'));
        END IF;
      END $$
    `);
    console.log("[recurring] v57 commissions.cancelled_at/_reason/_resolved + status accepts 'cancelled' ready");
  } catch (err) {
    console.error('[migrate.v57] failed:', err.message);
  }

  // v58: E5 — event-driven renewal worker. Adds cycle_index to
  // commissions so we can chain renewals deterministically and
  // recurring_renewal_trigger to tenants so each tenant picks
  // between paid-confirmed and purely-temporal renewals.
  //
  // The unique partial index is the IDEMPOTENCE backbone: a
  // concurrent poll can't double-insert cycle N+1, the DB rejects
  // the second attempt with 23505 which the worker swallows.
  //
  // Backfill: every pre-E5 commission becomes cycle_index=1
  // (= initial cycle). NOT NULL DEFAULT 1 does the job for new rows;
  // the explicit UPDATE catches any pre-existing 0 / NULL that
  // somehow slipped past the default.
  try {
    await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS cycle_index INTEGER NOT NULL DEFAULT 1`);
    const { rowCount: cycleBackfilled } = await query(
      `UPDATE commissions SET cycle_index = 1 WHERE cycle_index IS NULL OR cycle_index = 0`
    );
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS commissions_referral_cycle_uidx
        ON commissions(referral_id, cycle_index) WHERE deleted_at IS NULL
    `);
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS recurring_renewal_trigger VARCHAR(20) DEFAULT 'on_paid'`);
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_renewal_trigger_check') THEN
          ALTER TABLE tenants ADD CONSTRAINT tenants_renewal_trigger_check
            CHECK (recurring_renewal_trigger IN ('on_paid', 'temporal'));
        END IF;
      END $$
    `);
    console.log(`[recurring] v58 cycle_index + recurring_renewal_trigger ready · backfilled ${cycleBackfilled} commissions to cycle_index=1`);
  } catch (err) {
    console.error('[migrate.v58] failed:', err.message);
  }

  // v59: phase F1 — paie groupée par partenaire (schéma de fondation).
  // SCHEMA-ONLY — zéro changement comportemental. Aucun code applicatif
  // ne lit/écrit ces colonnes en F1 ; la mécanique de batch (sélection
  // des commissions, agrégation, paiement groupé, upload facture
  // partenaire au total) arrive en F2+. Tous les tenants restent en
  // cadence 'unitary' par défaut, ce qui préserve byte-for-byte le
  // flux pay-qonto / upload-invoice actuel.
  //
  // Model:
  //   - commission_payout_batches: 1 row = 1 paie groupée destinée à
  //     un partenaire pour une période (YYYY-MM mensuel, YYYY-Q1..Q4
  //     trimestriel). Statut métier indépendant de celui d'une
  //     commission — le _v3 actuel (pending_approval/awaiting_invoice/
  //     pending_validation/paid/cancelled) reste valable et n'est pas
  //     touché. exception=TRUE = batch ad-hoc 1 commission ("Payer
  //     hors batch"), non soumis à l'unicité (tenant, partner, period).
  //   - tenants.payout_cadence: 'unitary' (= comportement actuel,
  //     défaut) | 'monthly' | 'quarterly'. Le sélecteur Paramètres →
  //     Commission le persiste ; aucun worker ne le consomme en F1.
  //   - commissions.payout_batch_id: nullable FK. NULL = commission
  //     traitée à l'unité (comportement actuel). F2+ attachera les
  //     commissions éligibles à leur batch.
  //
  // Idempotence: CREATE ... IF NOT EXISTS partout + gates pg_constraint
  // pour les CHECK + UPDATE backfill défensif (le DEFAULT 'unitary'
  // fait le travail sur ADD COLUMN, l'UPDATE rattrape un éventuel run
  // partiellement crashé qui aurait posé la colonne sans DEFAULT).
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS commission_payout_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
        period TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_review',
        total_amount_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_amount_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_amount_ttc NUMERIC(12,2) NOT NULL DEFAULT 0,
        invoice_url TEXT,
        invoice_filename TEXT,
        invoice_uploaded_at TIMESTAMPTZ,
        qonto_transfer_id TEXT,
        qonto_request_body JSONB,
        payment_initiated_at TIMESTAMPTZ,
        payment_completed_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        payment_error TEXT,
        exception BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_payout_batches_status_check_v1') THEN
          ALTER TABLE commission_payout_batches ADD CONSTRAINT commission_payout_batches_status_check_v1
            CHECK (status IN ('pending_review','awaiting_invoice','ready_to_pay','paid','cancelled'));
        END IF;
      END $$
    `);
    await query(`CREATE INDEX IF NOT EXISTS commission_payout_batches_tenant_partner
                   ON commission_payout_batches(tenant_id, partner_id) WHERE deleted_at IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS commission_payout_batches_status
                   ON commission_payout_batches(tenant_id, status) WHERE deleted_at IS NULL`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS commission_payout_batches_uidx
                   ON commission_payout_batches(tenant_id, partner_id, period)
                   WHERE exception = FALSE AND deleted_at IS NULL`);

    await query(`ALTER TABLE tenants
                   ADD COLUMN IF NOT EXISTS payout_cadence TEXT NOT NULL DEFAULT 'unitary'`);
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_payout_cadence_check') THEN
          ALTER TABLE tenants ADD CONSTRAINT tenants_payout_cadence_check
            CHECK (payout_cadence IN ('unitary','monthly','quarterly'));
        END IF;
      END $$
    `);
    const { rowCount: cadenceBackfilled } = await query(
      `UPDATE tenants SET payout_cadence = 'unitary' WHERE payout_cadence IS NULL`
    );

    await query(`ALTER TABLE commissions
                   ADD COLUMN IF NOT EXISTS payout_batch_id UUID REFERENCES commission_payout_batches(id) ON DELETE SET NULL`);
    await query(`CREATE INDEX IF NOT EXISTS commissions_payout_batch_idx
                   ON commissions(payout_batch_id) WHERE deleted_at IS NULL AND payout_batch_id IS NOT NULL`);

    console.log(`[payout] v59 commission_payout_batches + tenants.payout_cadence + commissions.payout_batch_id ready · backfilled ${cadenceBackfilled} tenants to 'unitary'`);
  } catch (err) {
    console.error('[migrate.v59] failed:', err.message);
  }

  // v60: phase F2a-FIX — la table commission_payout_batches livrée en
  // v59 oubliait la colonne payment_reference, qui est référencée par
  // le SELECT du worker reconcileBatchTransfers et par l'UPDATE post-
  // SEPA dans pay-qonto (routes/payouts.js). L'absence faisait planter
  // le worker toutes les ~5 min ("column b.payment_reference does not
  // exist"). ADD COLUMN IF NOT EXISTS = idempotent ; aucune valeur à
  // backfiller (la table n'a aucun batch existant en prod).
  try {
    await query(`ALTER TABLE commission_payout_batches ADD COLUMN IF NOT EXISTS payment_reference TEXT`);
    console.log('[payout] v60 commission_payout_batches.payment_reference ready');
  } catch (err) {
    console.error('[migrate.v60] failed:', err.message);
  }

  // v61: phase F2a-FIX2 — patch préventif des colonnes Qonto restantes
  // sur commission_payout_batches que la création de table v59 avait
  // oubliées. Audit grep exhaustif de routes/payouts.js (cf. récap
  // F2a-FIX2) : seules ces 2 colonnes manquaient encore. Sans elles,
  // pay-qonto crasherait au premier clic admin sur un batch
  // ready_to_pay (UPDATE sur qonto_idempotency_key + qonto_sca_session_token
  // à payouts.js:543 et :576). ADD COLUMN IF NOT EXISTS = idempotent ;
  // aucune valeur à backfiller (la table reste vide d'usage pré-fix).
  try {
    await query(`ALTER TABLE commission_payout_batches ADD COLUMN IF NOT EXISTS qonto_idempotency_key TEXT`);
    await query(`ALTER TABLE commission_payout_batches ADD COLUMN IF NOT EXISTS qonto_sca_session_token TEXT`);
    console.log('[payout] v61 commission_payout_batches.qonto_idempotency_key + qonto_sca_session_token ready');
  } catch (err) {
    console.error('[migrate.v61] failed:', err.message);
  }

  // v62: phase G1 — business model hybride (MRR + setup one-shot).
  // Schéma-only, zéro changement comportemental :
  //   - tenants.business_model = 'mrr_only' (défaut) | 'hybrid'
  //   - tenant_levels.setup_rate : % appliqué au setup_value au won
  //     (NULL si tenant en mrr_only ou tier sans setup)
  //   - referrals.setup_value : montant HT one-shot du contrat client
  //     final (NULL si pas applicable)
  //   - commissions.setup_amount_ht + mrr_amount_ht : split des deux
  //     composantes. Sur cycle 1 hybride, les 2 sont renseignés ;
  //     sur cycles 2+, mrr_amount_ht uniquement (le setup est one-shot).
  //     amount_ht reste la source de vérité agrégée (= setup + mrr).
  //     Pour mrr_only, les 2 nouvelles colonnes restent NULL et le
  //     legacy amount_ht conserve son rôle.
  //
  // Anti-régression : tous les tenants existants tombent sur le défaut
  // 'mrr_only', les colonnes nullable restent NULL, tous les SELECT
  // existants qui lisent amount_ht continuent à fonctionner sans
  // modification. ADD COLUMN IF NOT EXISTS = idempotent.
  try {
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_model TEXT NOT NULL DEFAULT 'mrr_only'`);
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_business_model_check') THEN
          ALTER TABLE tenants ADD CONSTRAINT tenants_business_model_check
            CHECK (business_model IN ('mrr_only', 'hybrid'));
        END IF;
      END $$
    `);
    await query(`ALTER TABLE tenant_levels ADD COLUMN IF NOT EXISTS setup_rate NUMERIC(5,2)`);
    await query(`ALTER TABLE referrals    ADD COLUMN IF NOT EXISTS setup_value NUMERIC(12,2)`);
    await query(`ALTER TABLE commissions
                   ADD COLUMN IF NOT EXISTS setup_amount_ht NUMERIC(12,2),
                   ADD COLUMN IF NOT EXISTS mrr_amount_ht   NUMERIC(12,2)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tenants_business_model
                   ON tenants(business_model) WHERE business_model = 'hybrid'`);
    console.log("[hybrid] v62 tenants.business_model + tenant_levels.setup_rate + referrals.setup_value + commissions.setup_amount_ht/mrr_amount_ht ready");
  } catch (err) {
    console.error('[migrate.v62] failed:', err.message);
  }

  // v63: phase H1 — ajout du 3ème mode 'forfait_tjm' (one-shot pur,
  // pas de récurrence ni longévité). Rename 'mrr_only' → 'mrr' pour
  // cohérence sémantique (3 modes parallèles plutôt que 2 opposés).
  // Migration legacy : un tenant existant avec revenue_model='CA'
  // (sélecteur Branding pré-H1) est basculé en 'forfait_tjm' — la
  // sémantique "CA" est explicitement non-récurrente. ARR / Other
  // tombent sur 'mrr' (default safe). 'hybrid' est PRÉSERVÉ (le mapping
  // ne touche que les rows déjà à 'mrr' post step-2).
  //
  // La colonne legacy tenants.revenue_model est CONSERVÉE (consommée
  // encore par publicApi, marketplace, superadmin, accountExport,
  // commissionFormula, frontend rLabel). Sa désactivation se fait
  // côté UI ITEM 4 (sélecteur Branding supprimé) — déprécié, mais
  // accessible en lecture pour ne pas casser les consumers tiers.
  try {
    await query(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_business_model_check`);
    // Le DEFAULT v62 était 'mrr_only' — incompatible avec le nouveau
    // CHECK ci-dessous. On le bascule sur 'mrr' AVANT de poser la
    // contrainte sinon un INSERT futur sans business_model explicite
    // crasherait.
    await query(`ALTER TABLE tenants ALTER COLUMN business_model SET DEFAULT 'mrr'`);
    const { rowCount: renamed } = await query(
      `UPDATE tenants SET business_model = 'mrr' WHERE business_model = 'mrr_only'`
    );
    const { rowCount: forfaitMigrated } = await query(
      `UPDATE tenants
          SET business_model = 'forfait_tjm'
        WHERE business_model = 'mrr'
          AND revenue_model = 'CA'`
    );
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_business_model_check') THEN
          ALTER TABLE tenants ADD CONSTRAINT tenants_business_model_check
            CHECK (business_model IN ('mrr', 'hybrid', 'forfait_tjm'));
        END IF;
      END $$
    `);
    console.log(`[hybrid] v63 business_model 3-mode constraint ready · renamed ${renamed} mrr_only→mrr · migrated ${forfaitMigrated} CA→forfait_tjm`);
  } catch (err) {
    console.error('[migrate.v63] failed:', err.message);
  }

  // v64: phase J2 — email verification obligatoire pour les nouveaux
  // signups publics. Anti-régression : TOUS les users existants sont
  // backfillés avec email_verified_at = created_at (ou NOW() si
  // created_at est NULL). Si le backfill rate, un user existant se
  // retrouverait bloqué au login post-J2 (403 email_not_verified) —
  // d'où le UPDATE défensif IS NULL juste après l'ADD COLUMN. Doit
  // s'exécuter avant que le code J2 du handler login ne soit déployé.
  try {
    await query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
        ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS email_verification_attempts INTEGER NOT NULL DEFAULT 0
    `);
    const { rowCount: backfilled } = await query(`
      UPDATE users
         SET email_verified_at = COALESCE(created_at, NOW())
       WHERE email_verified_at IS NULL
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
        ON users(email_verification_token)
        WHERE email_verification_token IS NOT NULL
    `);
    console.log(`[security] v64 users.email_verification columns ready · backfilled ${backfilled} existing users to verified`);
  } catch (err) {
    console.error('[migrate.v64] failed:', err.message);
  }

  // v65: phase J3.1 — colonne tenants.excluded_from_stats.
  // Permet de masquer les sandbox démo / archives des agrégats stats
  // super-admin (/api/super-admin/stats + /timeline) sans pour autant
  // les retirer de la liste tenants (/api/super-admin/tenants reste
  // accessible pour gestion). DEFAULT FALSE = aucun tenant existant
  // n'est exclu, opt-in par UPDATE ciblé. Idempotent.
  try {
    await query(`ALTER TABLE tenants
                   ADD COLUMN IF NOT EXISTS excluded_from_stats BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log('[meta] v65 tenants.excluded_from_stats ready');
  } catch (err) {
    console.error('[migrate.v65] failed:', err.message);
  }

  // v66: phase J4 — flag tenants.is_founder pour identifier le tenant
  // système fondateur sans hardcoder le slug 'skipcall'. Casse le
  // couplage business/system : le slug reste user-facing (URLs publiques)
  // tandis que is_founder devient le marqueur système (tenantMiddleware
  // fallback, invite-superadmin attach, protection DELETE).
  //
  // Transaction unique (BEGIN/COMMIT) — ALTER + CREATE INDEX + UPDATE
  // ensemble pour éviter tout état semi-cassé si l'un échoue.
  // Idempotent : safe à rejouer (IF NOT EXISTS partout + UPDATE
  // garde-fou is_founder = FALSE évite double marquage).
  try {
    const founderClient = await getClient();
    try {
      await founderClient.query('BEGIN');
      await founderClient.query(`ALTER TABLE tenants
                                    ADD COLUMN IF NOT EXISTS is_founder BOOLEAN NOT NULL DEFAULT FALSE`);
      await founderClient.query(`CREATE UNIQUE INDEX IF NOT EXISTS tenants_founder_uidx
                                    ON tenants (is_founder) WHERE is_founder = TRUE`);
      await founderClient.query(`COMMENT ON COLUMN tenants.is_founder IS
        'TRUE pour le tenant système fondateur (singleton garanti par tenants_founder_uidx). Utilisé par tenantMiddleware fallback, invite-superadmin attach, et protection DELETE. NE PAS supprimer ce tenant.'`);
      await founderClient.query(
        `UPDATE tenants SET is_founder = TRUE
          WHERE id = '1a93f0fc-de5b-413b-beed-f18350dd9583'
            AND slug = 'skipcall'
            AND is_founder = FALSE`
      );
      await founderClient.query('COMMIT');
      const { rows: [founderRow] } = await founderClient.query(
        `SELECT name, slug FROM tenants WHERE is_founder = TRUE LIMIT 1`
      );
      if (founderRow) {
        console.log(`[v66] is_founder column ready. Founder tenant: ${founderRow.name} (${founderRow.slug})`);
      } else {
        console.log('[v66] is_founder column ready. No founder marked yet (expected on fresh DB before seed).');
      }
    } catch (e) {
      try { await founderClient.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      founderClient.release();
    }
  } catch (err) {
    console.error('[migrate.v66] failed:', err.message);
  }

  logger.info('Migrations completed');

  } catch (err) {
    logger.error('Migration error', { error: err.message });
  }
}

module.exports = { runMigrations };
