import { parsePasswordRecord } from './password.js'

// Usado apenas pelo script administrativo, não por uma rota pública.
export function provisionSql(username, record) {
  if (typeof username !== 'string' || !username.trim() || username.length > 64 || !parsePasswordRecord(record)) {
    throw new Error('Credencial administrativa inválida')
  }
  const name = username.trim().replaceAll("'", "''")
  const id = crypto.randomUUID()
  return `INSERT INTO Users (Id, Username, PasswordHash, Role) VALUES ('${id}', '${name}', '${record}', 'ADMIN')
ON CONFLICT (Username) DO UPDATE SET PasswordHash = excluded.PasswordHash;
DELETE FROM AuthSession WHERE UserId IN (SELECT Id FROM Users WHERE Username = '${name}');
DELETE FROM LoginThrottle WHERE Bucket = '${name.toLowerCase()}';
`
}
