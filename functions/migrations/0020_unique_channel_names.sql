-- Do not merge ownership automatically if two creators already use the same name.
-- Abort the migration atomically; those conflicts need an explicit owner decision.
CREATE TABLE _channel_owner_check (
  conflicting_channel_owners INTEGER NOT NULL CHECK (conflicting_channel_owners = 0)
);
INSERT INTO _channel_owner_check
SELECT COUNT(*) FROM (
  SELECT lower(trim(channels.channelName)) FROM Users
  JOIN channels ON channels.id = Users.channelId
  WHERE Users.Role = 'CREATOR'
  GROUP BY lower(trim(channels.channelName)) HAVING COUNT(*) > 1
);
DROP TABLE _channel_owner_check;

-- Prefer the UUID already owned by a creator; otherwise choose a stable UUID.
CREATE TABLE _channel_canonical (oldId TEXT PRIMARY KEY, canonicalId TEXT NOT NULL);
INSERT INTO _channel_canonical (oldId, canonicalId)
SELECT original.id, (
  SELECT candidate.id FROM channels AS candidate
  WHERE lower(trim(candidate.channelName)) = lower(trim(original.channelName))
  ORDER BY EXISTS (SELECT 1 FROM Users WHERE Users.channelId = candidate.id AND Role = 'CREATOR') DESC,
    candidate.id
  LIMIT 1
) FROM channels AS original;

UPDATE emotes SET channelId = (
  SELECT canonicalId FROM _channel_canonical WHERE oldId = emotes.channelId
) WHERE channelId IN (SELECT oldId FROM _channel_canonical WHERE oldId <> canonicalId);

DELETE FROM AuthSession WHERE UserId IN (
  SELECT Id FROM Users WHERE channelId IN (SELECT oldId FROM _channel_canonical WHERE oldId <> canonicalId)
);
UPDATE Users SET channelId = (
  SELECT canonicalId FROM _channel_canonical WHERE oldId = Users.channelId
) WHERE channelId IN (SELECT oldId FROM _channel_canonical WHERE oldId <> canonicalId);

DELETE FROM channels WHERE id IN (SELECT oldId FROM _channel_canonical WHERE oldId <> canonicalId);
DROP TABLE _channel_canonical;
DROP INDEX idx_channels_name_lookup;
CREATE UNIQUE INDEX idx_channels_name_unique ON channels(lower(trim(channelName)));
CREATE UNIQUE INDEX idx_users_channel_owner ON Users(channelId) WHERE channelId IS NOT NULL;
