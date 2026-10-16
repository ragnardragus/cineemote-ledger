-- Historical registration methods were not recorded; NULL means unknown.
CREATE TABLE emotes_consumer (
  id TEXT PRIMARY KEY NOT NULL,
  emote_name TEXT NOT NULL,
  url TEXT NOT NULL,
  consumer TEXT NOT NULL CHECK (length(trim(consumer)) > 0),
  createdWithUserCode INTEGER CHECK (createdWithUserCode IN (0, 1)),
  channelId TEXT NOT NULL REFERENCES channels(id)
);

INSERT INTO emotes_consumer (id, emote_name, url, consumer, createdWithUserCode, channelId)
SELECT id, emote_name, url, 'ragnardragus', NULL, channelId FROM emotes;

DROP TABLE emotes;
ALTER TABLE emotes_consumer RENAME TO emotes;
CREATE INDEX idx_emotes_channel_id ON emotes(channelId);
