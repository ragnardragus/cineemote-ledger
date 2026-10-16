ALTER TABLE emotes ADD COLUMN imageKey TEXT;
CREATE INDEX idx_emotes_image_key ON emotes(imageKey);

-- Includes in-flight uploads and failed deletions so they still count toward quota.
CREATE TABLE EmoteImage (
  ObjectKey TEXT PRIMARY KEY NOT NULL,
  Size INTEGER NOT NULL CHECK (Size BETWEEN 1 AND 1048576),
  CreationDate INTEGER NOT NULL DEFAULT (unixepoch())
);
