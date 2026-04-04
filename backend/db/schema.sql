-- Skipcall Referral Platform - Database Schema
-- Run this on your PostgreSQL database to set up all tables

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users & Auth ───
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'commercial', 'partner')),
  partner_id UUID,  -- NULL for internal users, set for partners
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Partners ───
CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  company_website VARCHAR(500),
  commission_rate DECIMAL(5,2) DEFAULT 10.00,  -- percentage
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link users to partners
ALTER TABLE users ADD CONSTRAINT fk_users_partner 
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;

-- ─── Referrals ───
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Partner info
  partner_id UUID NOT NULL REFERENCES partners(id),
  submitted_by UUID NOT NULL REFERENCES users(id),
  
  -- Prospect info
  prospect_name VARCHAR(255) NOT NULL,
  prospect_email VARCHAR(255) NOT NULL,
  prospect_phone VARCHAR(50),
  prospect_company VARCHAR(255) NOT NULL,
  prospect_role VARCHAR(255),
  
  -- Qualification
  recommendation_level VARCHAR(10) NOT NULL CHECK (recommendation_level IN ('hot', 'warm', 'cold')),
  notes TEXT,
  
  -- Pipeline tracking
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'meeting', 'proposal', 'won', 'lost')),
  deal_value DECIMAL(12,2) DEFAULT 0,
  assigned_to UUID REFERENCES users(id),  -- commercial assigned
  lost_reason TEXT,
  
  -- Dates
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ  -- when won or lost
);

-- ─── Referral Activity Log ───
CREATE TABLE referral_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,  -- 'status_change', 'note_added', 'value_updated', 'assigned'
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Commissions ───
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id UUID NOT NULL REFERENCES referrals(id),
  partner_id UUID NOT NULL REFERENCES partners(id),
  amount DECIMAL(12,2) NOT NULL,
  rate DECIMAL(5,2) NOT NULL,  -- snapshot of commission rate at time of deal
  deal_value DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Email Notifications Queue ───
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  template VARCHAR(50) NOT NULL,  -- 'new_referral', 'status_update', 'deal_won'
  payload JSONB NOT NULL DEFAULT '{}',
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ───
CREATE INDEX idx_referrals_partner ON referrals(partner_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referrals_assigned ON referrals(assigned_to);
CREATE INDEX idx_referrals_created ON referrals(created_at DESC);
CREATE INDEX idx_activities_referral ON referral_activities(referral_id);
CREATE INDEX idx_commissions_partner ON commissions(partner_id);
CREATE INDEX idx_commissions_status ON commissions(status);
CREATE INDEX idx_notification_queue_sent ON notification_queue(sent, created_at);

-- ─── Updated_at trigger ───
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_referrals_updated BEFORE UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Seed: Default admin user (password: skipcall2026!) ───
-- Hash generated with bcrypt, 12 rounds
-- You MUST change this password after first login
INSERT INTO users (email, password_hash, full_name, role) VALUES
  ('admin@skipcall.com', '$2b$12$LJ3m4ys8Kn.EXAMPLE_HASH_REPLACE_ME', 'Admin Skipcall', 'admin');
