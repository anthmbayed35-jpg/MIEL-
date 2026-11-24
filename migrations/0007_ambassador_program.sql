-- Ambassador program: accounts, onboarding, attribution, payout requests, bonuses, missions, kits, resources, announcements, notifications.
-- Purely additive: the existing affiliates / orders / payouts keep every row and every value. An affiliate IS an ambassador (one table).
ALTER TABLE affiliates ADD COLUMN password_hash TEXT;
ALTER TABLE affiliates ADD COLUMN terms_version INTEGER;
ALTER TABLE affiliates ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE affiliates ADD COLUMN payout_details TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN leaderboard_optout INTEGER NOT NULL DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN last_login_at TEXT;
ALTER TABLE affiliates ADD COLUMN rules_read_at TEXT;

ALTER TABLE affiliate_applications ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliate_applications ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliate_applications ADD COLUMN terms_version INTEGER;
ALTER TABLE affiliate_applications ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE affiliate_applications ADD COLUMN admin_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliate_applications ADD COLUMN affiliate_id TEXT REFERENCES affiliates(id);
ALTER TABLE affiliate_applications ADD COLUMN decided_at TEXT;

ALTER TABLE orders ADD COLUMN attribution TEXT CHECK (attribution IN ('code','link'));
ALTER TABLE orders ADD COLUMN heard_from TEXT;

-- invite and password-reset links (only the hash is stored; one use; the invite lives 7 days)
CREATE TABLE ambassador_tokens (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  kind TEXT NOT NULL CHECK (kind IN ('invite','reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ambassador_tokens_affiliate ON ambassador_tokens(affiliate_id);

-- ambassador login sessions: completely separate from the admin sessions
CREATE TABLE ambassador_sessions (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX ambassador_sessions_affiliate ON ambassador_sessions(affiliate_id);

-- link visits per ambassador per day (counts only, no personal data)
CREATE TABLE ref_clicks (
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (affiliate_id, day)
);

CREATE TABLE payout_requests (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','rejected','cancelled')),
  note TEXT NOT NULL DEFAULT '',
  payout_id TEXT REFERENCES affiliate_payouts(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT
);
CREATE INDEX payout_requests_status ON payout_requests(status, created_at);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward_cents INTEGER NOT NULL DEFAULT 0 CHECK (reward_cents >= 0),
  reward_text TEXT NOT NULL DEFAULT '',
  month TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE mission_submissions (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  proof_url TEXT NOT NULL DEFAULT '',
  proof_file TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT
);
CREATE INDEX mission_submissions_status ON mission_submissions(status, created_at);
CREATE INDEX mission_submissions_affiliate ON mission_submissions(affiliate_id, mission_id);

-- bonuses (mission rewards): paid out together with the commissions by the next payout
CREATE TABLE affiliate_bonuses (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL DEFAULT '',
  submission_id TEXT REFERENCES mission_submissions(id),
  payout_id TEXT REFERENCES affiliate_payouts(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX affiliate_bonuses_submission ON affiliate_bonuses(submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX affiliate_bonuses_affiliate ON affiliate_bonuses(affiliate_id, payout_id);

CREATE TABLE kit_requests (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  kind TEXT NOT NULL CHECK (kind IN ('starter','monthly')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','shipped','delivered')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX kit_requests_affiliate ON kit_requests(affiliate_id, created_at);

CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  file_name TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX notifications_affiliate ON notifications(affiliate_id, read_at, created_at);
