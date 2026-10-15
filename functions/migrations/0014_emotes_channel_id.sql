CREATE TABLE emotes_channels (
  id TEXT PRIMARY KEY NOT NULL,
  emote_name TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  channelId TEXT NOT NULL REFERENCES channels(id)
);

INSERT INTO emotes_channels (id, emote_name, url, author, channelId)
SELECT id, emote_name, url, author,
  (SELECT id FROM channels WHERE lower(trim(channelName)) = 'globalce')
FROM emotes;

DROP TABLE emotes;
ALTER TABLE emotes_channels RENAME TO emotes;
CREATE INDEX idx_emotes_channel_id ON emotes(channelId);
