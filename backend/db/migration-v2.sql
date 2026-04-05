-- ============================================
-- Skipcall Partners v2 Migration
-- Features: IBAN, Messaging, Payment tracking
-- ============================================

-- ─── 1. Add IBAN fields to partners ───
ALTER TABLE partners ADD COLUMN IF NOT EXISTS iban VARCHAR(34);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS bic VARCHAR(11);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS account_holder VARCHAR(255);

-- ─── 2. Add payment tracking fields to commissions ───
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS mollie_payment_id VARCHAR(255);
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- ─── 3. Add engagement field to referrals ───
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS engagement VARCHAR(20) DEFAULT 'monthly'
  CHECK (engagement IN ('monthly', 'quarterly', 'yearly'));

-- ─── 4. Messages table for internal messaging ───
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. Conversations table ───
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject VARCHAR(500) NOT NULL,
  partner_id UUID REFERENCES partners(id),
  created_by UUID NOT NULL REFERENCES users(id),
  is_archived BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. Conversation participants ───
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

-- Add FK from messages to conversations
ALTER TABLE messages ADD CONSTRAINT fk_messages_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- ─── 7. Indexes ───
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_partner ON conversations(partner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);

-- ─── 8. Add unique constraint on commissions referral_id for upsert ───
-- (only if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commissions_referral_id_key'
  ) THEN
    ALTER TABLE commissions ADD CONSTRAINT commissions_referral_id_key UNIQUE (referral_id);
  END IF;
END $$;
