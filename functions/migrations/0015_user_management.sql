-- Revoke sessions while replacing the referenced table.
DELETE FROM AuthSession;

CREATE TABLE Users_new (
  Id TEXT PRIMARY KEY NOT NULL,
  Username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  PasswordHash TEXT NOT NULL,
  Role TEXT NOT NULL CHECK (Role IN ('ADMIN', 'CREATOR')),
  Active INTEGER NOT NULL DEFAULT 1 CHECK (Active IN (0, 1)),
  CreationDate TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  channelId TEXT REFERENCES channels(id),
  CHECK (Role = 'CREATOR' OR channelId IS NULL)
);

INSERT INTO Users_new (Id, Username, PasswordHash, Role, Active, CreationDate, channelId)
SELECT Id, Username, PasswordHash, CASE WHEN Role = 'USER' THEN 'CREATOR' ELSE Role END,
  Active, CreationDate, CASE WHEN Role = 'USER' THEN channelId ELSE NULL END
FROM Users;

DROP TABLE Users;
ALTER TABLE Users_new RENAME TO Users;
CREATE INDEX idx_users_channel_id ON Users(channelId);

CREATE TRIGGER users_role_immutable BEFORE UPDATE OF Role ON Users
WHEN NEW.Role <> OLD.Role
BEGIN SELECT RAISE(ABORT, 'User role cannot be changed'); END;

CREATE TRIGGER users_admin_no_delete BEFORE DELETE ON Users
WHEN OLD.Role = 'ADMIN'
BEGIN SELECT RAISE(ABORT, 'Administrators cannot be deleted'); END;
