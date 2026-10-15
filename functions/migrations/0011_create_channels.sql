CREATE TABLE channels (
  id TEXT PRIMARY KEY NOT NULL,
  channelName TEXT NOT NULL CHECK (length(trim(channelName)) > 0)
);
