CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===================== USERS & AUTH =====================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trial_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 days'),
  last_seen_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- ===================== API SETTINGS =====================

CREATE TABLE IF NOT EXISTS unoapi_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  token TEXT NOT NULL,
  s3_enabled BOOLEAN DEFAULT false,
  s3_endpoint TEXT,
  s3_access_key TEXT,
  s3_secret_key TEXT,
  s3_bucket TEXT,
  s3_region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS evolution_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  instance_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS evolution_go_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  instance_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS chatwoot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  api_token TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- ===================== WUZAPI =====================

CREATE TABLE IF NOT EXISTS wuzapi_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL DEFAULT 'https://wuzapi.bigcreditos.com.br',
  admin_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS wuzapi_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  settings_id UUID REFERENCES wuzapi_settings(id) ON DELETE CASCADE,
  user_token TEXT NOT NULL,
  phone TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (settings_id, user_token)
);

CREATE INDEX IF NOT EXISTS idx_wuzapi_instances_user ON wuzapi_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_wuzapi_instances_settings ON wuzapi_instances(settings_id);

-- ===================== USER DATA =====================

CREATE TABLE IF NOT EXISTS user_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  phone TEXT,
  profile_name TEXT,
  source TEXT DEFAULT 'unoapi',
  status TEXT DEFAULT 'connecting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, instance_name)
);

CREATE INDEX IF NOT EXISTS idx_user_instances_user ON user_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_instances_instance_name ON user_instances(instance_name);
CREATE INDEX IF NOT EXISTS idx_user_instances_source ON user_instances(source);

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_key ON user_settings(user_id, key);

CREATE TABLE IF NOT EXISTS blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

CREATE TABLE IF NOT EXISTS phone_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_phone TEXT NOT NULL,
  mapped_phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, original_phone)
);

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  media_type TEXT DEFAULT 'text',
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- ===================== MEDIA =====================

CREATE TABLE IF NOT EXISTS media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('audio', 'sticker', 'image', 'video', 'document')),
  url TEXT NOT NULL,
  filename TEXT,
  duration_seconds INTEGER,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_library_user_type ON media_library(user_id, media_type, created_at DESC);

-- ===================== SHORT LINKS =====================

CREATE TABLE IF NOT EXISTS short_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  phone TEXT NOT NULL,
  message TEXT,
  click_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_short_links_user ON short_links(user_id);
CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);

CREATE TABLE IF NOT EXISTS link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  ip TEXT,
  country TEXT,
  country_code TEXT,
  city TEXT,
  region TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  user_agent TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks(clicked_at DESC);

-- ===================== MESSAGES & CONVERSATIONS =====================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  profile_picture TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_name, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_conversations_instance_phone ON conversations(instance_name, phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  message_id TEXT,
  from_me BOOLEAN NOT NULL DEFAULT false,
  phone_number TEXT NOT NULL,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  media_caption TEXT,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_messages_instance ON messages(instance_name);

-- ===================== SYSTEM =====================

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

-- Seed shared evolution
INSERT INTO system_settings (key, value)
VALUES ('shared_evolution', '{"baseUrl":"","apiKey":"","enabled":false}')
ON CONFLICT (key) DO NOTHING;

-- Seed unoapi defaults
INSERT INTO system_settings (key, value)
VALUES ('unoapi', '{"baseUrl":"","token":"","enabled":false}')
ON CONFLICT (key) DO NOTHING;

-- ===================== UPDATED AT TRIGGERS =====================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON profiles;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS system_settings_touch_updated_at ON system_settings;
CREATE TRIGGER system_settings_touch_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS unoapi_settings_touch_updated_at ON unoapi_settings;
CREATE TRIGGER unoapi_settings_touch_updated_at BEFORE UPDATE ON unoapi_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS evolution_settings_touch_updated_at ON evolution_settings;
CREATE TRIGGER evolution_settings_touch_updated_at BEFORE UPDATE ON evolution_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS evolution_go_settings_touch_updated_at ON evolution_go_settings;
CREATE TRIGGER evolution_go_settings_touch_updated_at BEFORE UPDATE ON evolution_go_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS chatwoot_settings_touch_updated_at ON chatwoot_settings;
CREATE TRIGGER chatwoot_settings_touch_updated_at BEFORE UPDATE ON chatwoot_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS ai_settings_touch_updated_at ON ai_settings;
CREATE TRIGGER ai_settings_touch_updated_at BEFORE UPDATE ON ai_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS wuzapi_settings_touch_updated_at ON wuzapi_settings;
CREATE TRIGGER wuzapi_settings_touch_updated_at BEFORE UPDATE ON wuzapi_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS user_settings_touch_updated_at ON user_settings;
CREATE TRIGGER user_settings_touch_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS message_templates_touch_updated_at ON message_templates;
CREATE TRIGGER message_templates_touch_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS user_instances_touch_updated_at ON user_instances;
CREATE TRIGGER user_instances_touch_updated_at BEFORE UPDATE ON user_instances FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS conversations_touch_updated_at ON conversations;
CREATE TRIGGER conversations_touch_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS short_links_touch_updated_at ON short_links;
CREATE TRIGGER short_links_touch_updated_at BEFORE UPDATE ON short_links FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
