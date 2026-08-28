-- Additive only. Does not touch the Express session table.
-- If a user already has more than one active subscription (race leftovers),
-- keep the newest row active and mark older ones inactive so the unique
-- index can be created. No rows are deleted.

UPDATE subscriptions AS s
SET active = false
WHERE s.active = true
  AND EXISTS (
    SELECT 1
    FROM subscriptions AS newer
    WHERE newer.user_id = s.user_id
      AND newer.active = true
      AND (
        newer.created_at > s.created_at
        OR (newer.created_at IS NOT DISTINCT FROM s.created_at AND newer.id > s.id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_active_per_user
  ON subscriptions (user_id)
  WHERE active = true;
