const { query } = require('../db');
const crypto = require('crypto');

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
      const { rows: [tenant] } = await query(
        `INSERT INTO tenants (name, slug, primary_color, secondary_color, accent_color, revenue_model)
         VALUES ('Skipcall', 'skipcall', '#059669', '#10b981', NULL, 'CA')
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
        ('tier_change',            TRUE)
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

  console.log(' Migrations completed');

  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

module.exports = { runMigrations };
