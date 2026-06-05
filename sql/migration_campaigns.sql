-- ===================== CAMPAIGNS =====================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','running','paused','completed','error','cancelled')),
  settings JSONB NOT NULL DEFAULT '{}',
  schedule JSONB,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  replied_count INTEGER NOT NULL DEFAULT 0,
  current_index INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  data JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','replied')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(campaign_id, status);

CREATE TABLE IF NOT EXISTS campaign_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_type TEXT DEFAULT 'text',
  media_url TEXT,
  media_caption TEXT,
  media_filename TEXT,
  title TEXT,
  footer TEXT,
  buttons JSONB,
  link_url TEXT,
  section JSONB,
  cards JSONB,
  msg_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_messages_campaign ON campaign_messages(campaign_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS campaigns_touch_updated_at ON campaigns;
CREATE TRIGGER campaigns_touch_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
