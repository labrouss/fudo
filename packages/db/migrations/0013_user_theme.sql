-- 0013: each user's theme (a theme id from themes/, or 'system' to follow the operating system).
ALTER TABLE users ADD COLUMN theme text;
