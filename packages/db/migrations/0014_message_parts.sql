-- 0014: server-generated texts as translatable message parts (see packages/shared/src/messages.ts).
-- The English text columns stay (logs, API clients, rows written before this version).
ALTER TABLE monitors      ADD COLUMN last_message_parts jsonb;
ALTER TABLE check_results ADD COLUMN message_parts jsonb;
ALTER TABLE state_changes ADD COLUMN message_parts jsonb;
ALTER TABLE incidents     ADD COLUMN title_parts jsonb;
ALTER TABLE applications  ADD COLUMN summary_parts jsonb;
ALTER TABLE assets        ADD COLUMN summary_parts jsonb;
