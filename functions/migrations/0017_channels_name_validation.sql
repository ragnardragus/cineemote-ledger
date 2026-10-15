-- Validate new channels and renames without changing existing records.
CREATE TRIGGER channels_name_valid_insert BEFORE INSERT ON channels
WHEN length(NEW.channelName) NOT BETWEEN 1 AND 120
  OR NEW.channelName GLOB '*[^A-Za-z0-9]*'
BEGIN
  SELECT RAISE(ABORT, 'Channel name must contain only ASCII letters and digits');
END;

CREATE TRIGGER channels_name_valid_update BEFORE UPDATE OF channelName ON channels
WHEN length(NEW.channelName) NOT BETWEEN 1 AND 120
  OR NEW.channelName GLOB '*[^A-Za-z0-9]*'
BEGIN
  SELECT RAISE(ABORT, 'Channel name must contain only ASCII letters and digits');
END;
