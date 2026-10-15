CREATE TABLE emotes_uuid (
  id TEXT PRIMARY KEY NOT NULL,
  emote_name TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL
);

-- UUID v4 para cada registro, com versão e variante no formato padrão.
INSERT INTO emotes_uuid (id, emote_name, url, author, channel)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2, 3) || '-' ||
  substr('89ab', (random() & 3) + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2, 3) || '-' ||
  lower(hex(randomblob(6))),
  emote_name, url, author, channel
FROM emotes;

DROP TABLE emotes;
ALTER TABLE emotes_uuid RENAME TO emotes;
