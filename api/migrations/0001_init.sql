CREATE TABLE homes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL CONSTRAINT homes_id_unique UNIQUE,
  name TEXT NOT NULL CONSTRAINT homes_name_valid CHECK (length(trim(name)) BETWEEN 1 AND 100)
);

CREATE TABLE members (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL CONSTRAINT members_id_unique UNIQUE,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL CONSTRAINT members_name_valid CHECK (length(trim(name)) BETWEEN 1 AND 100),
  CONSTRAINT members_home_fk FOREIGN KEY (home_id) REFERENCES homes(id),
  CONSTRAINT members_home_identity UNIQUE (id, home_id)
);
CREATE INDEX members_home_order ON members(home_id, sequence);

CREATE TABLE bills (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL CONSTRAINT bills_id_unique UNIQUE,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL CONSTRAINT bills_title_valid CHECK (length(trim(title)) BETWEEN 1 AND 100),
  total_cents INTEGER NOT NULL CONSTRAINT bills_total_valid
    CHECK (typeof(total_cents) = 'integer' AND total_cents > 0 AND total_cents <= 9007199254740991),
  created_at TEXT NOT NULL,
  CONSTRAINT bills_home_fk FOREIGN KEY (home_id) REFERENCES homes(id),
  CONSTRAINT bills_home_identity UNIQUE (id, home_id)
);
CREATE INDEX bills_home_order ON bills(home_id, sequence);

CREATE TABLE shares (
  id TEXT PRIMARY KEY NOT NULL,
  bill_id TEXT NOT NULL,
  home_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CONSTRAINT shares_amount_valid
    CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0 AND amount_cents <= 9007199254740991),
  paid_at TEXT,
  payment_key TEXT,
  CONSTRAINT shares_bill_member_unique UNIQUE (bill_id, member_id),
  CONSTRAINT shares_bill_home_fk FOREIGN KEY (bill_id, home_id) REFERENCES bills(id, home_id),
  CONSTRAINT shares_member_home_fk FOREIGN KEY (member_id, home_id) REFERENCES members(id, home_id),
  CONSTRAINT shares_payment_consistent CHECK (
    (paid_at IS NULL AND payment_key IS NULL) OR
    (paid_at IS NOT NULL AND payment_key IS NOT NULL AND length(trim(payment_key)) > 0)
  )
);
CREATE INDEX shares_member_unpaid ON shares(member_id) WHERE paid_at IS NULL;

-- This also protects direct SQL inserts and concurrent membership changes.
CREATE TRIGGER bills_require_members BEFORE INSERT ON bills
WHEN NOT EXISTS (SELECT 1 FROM members WHERE home_id = NEW.home_id)
BEGIN
  SELECT RAISE(ABORT, 'Home has no members');
END;
