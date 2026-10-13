-- 0011: each user's interface language (BCP 47 code, e.g. "el"); NULL = follow the browser.
ALTER TABLE users ADD COLUMN locale text CHECK (locale IS NULL OR locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
