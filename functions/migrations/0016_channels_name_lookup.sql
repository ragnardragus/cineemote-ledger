CREATE INDEX idx_channels_name_lookup ON channels(lower(trim(channelName)));
