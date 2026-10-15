ALTER TABLE Users
ADD COLUMN channelId TEXT REFERENCES channels(id);

CREATE INDEX idx_users_channel_id ON Users(channelId);
