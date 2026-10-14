CREATE TABLE emotes (
  id INTEGER PRIMARY KEY,
  emote_name TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL
);
