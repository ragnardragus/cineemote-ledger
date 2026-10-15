INSERT INTO channels (id, channelName)
SELECT 'f52342cb-2356-4ce5-99ea-0e28b860bb8a', 'GlobalCE'
WHERE NOT EXISTS (
  SELECT 1 FROM channels WHERE lower(trim(channelName)) = 'globalce'
);
