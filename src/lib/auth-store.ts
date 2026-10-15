import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';

export type Owner = { email: string; name: string };
export const AUTH_COOKIE = 'redaction_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_SESSIONS = 20;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const SCRYPT_OPTIONS = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const DATA_DIRECTORY = process.env.RSS_DATA_DIR ? path.resolve(process.env.RSS_DATA_DIR) : path.join(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIRECTORY, 'auth.json');
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PASSWORD_HASH_PATTERN = /^[a-f0-9]{128}$/;
const INVALID_CREDENTIALS = 'Connexion impossible. Vérifiez vos identifiants et réessayez.';

type StoredOwner = Owner & { passwordSalt: string; passwordHash: string };
type Session = { hash: string; createdAt: number; expiresAt: number };
type LoginAttempts = { count: number; startedAt: number };
type AuthData = { version: 1; owner: StoredOwner; sessions: Session[]; loginAttempts?: LoginAttempts };

export class AuthRateLimitError extends Error {
  readonly status = 429;
  constructor(public readonly retryAfter: number) { super(INVALID_CREDENTIALS); this.name = 'AuthRateLimitError'; }
}
export class AuthValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthValidationError'; }
}
export class AuthStorageError extends Error {
  constructor() { super('Le stockage de l’authentification est indisponible.'); this.name = 'AuthStorageError'; }
}

// Keep one queue across route bundles and development hot reloads. As with the
// editorial store, this file store requires a single Node.js server process.
const authGlobal = globalThis as typeof globalThis & { __rssPressAuthQueue?: Promise<void> };
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = (authGlobal.__rssPressAuthQueue || Promise.resolve()).then(operation);
  authGlobal.__rssPressAuthQueue = result.then(() => undefined, () => undefined);
  return result;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new AuthValidationError('Une adresse e-mail valide est requise.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email)) throw new AuthValidationError('Une adresse e-mail valide est requise (254 caractères maximum).');
  return email;
}
function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new AuthValidationError('Votre nom est requis.');
  const name = value.trim();
  if (!name || Array.from(name).length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new AuthValidationError('Votre nom doit contenir entre 1 et 80 caractères.');
  return name;
}
function validPassword(password: unknown): password is string {
  if (typeof password !== 'string' || password.length > 512) return false;
  const length = Array.from(password).length;
  return length >= 15 && length <= 128;
}
function publicOwner(owner: StoredOwner): Owner { return { email: owner.email, name: owner.name }; }
function finiteTimestamp(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

function parseAuthData(value: unknown): AuthData {
  if (!object(value) || value.version !== 1 || !object(value.owner) || !Array.isArray(value.sessions)) throw new AuthStorageError();
  const owner = value.owner;
  try {
    if (normalizeEmail(owner.email) !== owner.email || normalizeName(owner.name) !== owner.name) throw new AuthStorageError();
  } catch { throw new AuthStorageError(); }
  if (typeof owner.passwordSalt !== 'string' || !HASH_PATTERN.test(owner.passwordSalt) || typeof owner.passwordHash !== 'string' || !PASSWORD_HASH_PATTERN.test(owner.passwordHash)) throw new AuthStorageError();
  if (value.sessions.length > MAX_SESSIONS || value.sessions.some(session => !object(session) || typeof session.hash !== 'string' || !HASH_PATTERN.test(session.hash) || !finiteTimestamp(session.createdAt) || !finiteTimestamp(session.expiresAt) || session.expiresAt <= session.createdAt)) throw new AuthStorageError();
  if (value.loginAttempts !== undefined && (!object(value.loginAttempts) || !Number.isSafeInteger(value.loginAttempts.count) || (value.loginAttempts.count as number) < 0 || (value.loginAttempts.count as number) > MAX_LOGIN_ATTEMPTS || !finiteTimestamp(value.loginAttempts.startedAt))) throw new AuthStorageError();
  return value as unknown as AuthData;
}
async function readAuthFile(): Promise<AuthData | null> {
  try {
    // Do not follow an auth file replaced by a symbolic link.
    const stat = await fs.lstat(AUTH_FILE);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new AuthStorageError();
    return parseAuthData(JSON.parse(await fs.readFile(AUTH_FILE, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new AuthStorageError();
  }
}
async function writeAuthFile(data: AuthData): Promise<void> {
  const temporary = path.join(DATA_DIRECTORY, `.auth-${process.pid}-${randomUUID()}.tmp`);
  try {
    await fs.mkdir(DATA_DIRECTORY, { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.chmod(temporary, 0o600);
    await fs.rename(temporary, AUTH_FILE);
  } catch { throw new AuthStorageError(); }
  finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
}
function passwordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, 'hex'), 64, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key)));
}
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function purgeExpired(data: AuthData, now: number): boolean {
  const previousLength = data.sessions.length;
  data.sessions = data.sessions.filter(session => session.expiresAt > now);
  return previousLength !== data.sessions.length;
}

export function getOwner(): Promise<Owner | null> {
  return serialize(async () => {
    const data = await readAuthFile();
    return data ? publicOwner(data.owner) : null;
  });
}

/** Local installation/reset only. Never expose this operation as a public API. */
export async function setupOwner(input: Owner & { password: string }, options: { reset?: boolean } = {}): Promise<Owner> {
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.name);
  if (!validPassword(input.password)) throw new AuthValidationError('Le mot de passe doit contenir entre 15 et 128 caractères.');
  return serialize(async () => {
    const previous = await readAuthFile();
    if (previous && !options.reset) throw new AuthValidationError('Un compte existe déjà. Utilisez --reset pour le remplacer et révoquer ses sessions.');
    const passwordSalt = randomBytes(32).toString('hex');
    const hash = await passwordHash(input.password, passwordSalt);
    const owner = { email, name, passwordSalt, passwordHash: hash.toString('hex') };
    await writeAuthFile({ version: 1, owner, sessions: [] });
    return publicOwner(owner);
  });
}

export function authenticateOwner(email: string, password: string): Promise<Owner | null> {
  return serialize(async () => {
    const data = await readAuthFile();
    if (!data) return null;
    const now = Date.now();
    if (!data.loginAttempts || now - data.loginAttempts.startedAt >= LOGIN_WINDOW_MS) data.loginAttempts = { count: 0, startedAt: now };
    if (data.loginAttempts.count >= MAX_LOGIN_ATTEMPTS) throw new AuthRateLimitError(Math.max(1, Math.ceil((data.loginAttempts.startedAt + LOGIN_WINDOW_MS - now) / 1000)));
    // Count before hashing and persist even interrupted attempts. All submitted
    // addresses share the owner's limit, so changing an address cannot bypass it.
    data.loginAttempts.count++;
    purgeExpired(data, now);
    await writeAuthFile(data);
    let normalizedEmail = '';
    try { normalizedEmail = normalizeEmail(email); } catch { /* Invalid credentials follow the same response path. */ }
    const acceptablePassword = validPassword(password);
    // Always perform the costly comparison, including unknown e-mail addresses.
    const candidate = await passwordHash(acceptablePassword ? password : 'invalid-password-input', data.owner.passwordSalt);
    const matches = timingSafeEqual(candidate, Buffer.from(data.owner.passwordHash, 'hex'));
    if (!matches || !acceptablePassword || normalizedEmail !== data.owner.email) return null;
    delete data.loginAttempts;
    await writeAuthFile(data);
    return publicOwner(data.owner);
  });
}

export function createSession(): Promise<{ token: string; expiresAt: number }> {
  return serialize(async () => {
    const data = await readAuthFile();
    if (!data) throw new AuthValidationError('Le compte propriétaire doit être configuré avant la connexion.');
    const now = Date.now();
    purgeExpired(data, now);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_TTL_SECONDS * 1000;
    data.sessions.push({ hash: tokenHash(token), createdAt: now, expiresAt });
    data.sessions = data.sessions.slice(-MAX_SESSIONS);
    await writeAuthFile(data);
    return { token, expiresAt };
  });
}

export function getSession(token: string | undefined): Promise<Owner | null> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return Promise.resolve(null);
  return serialize(async () => {
    const data = await readAuthFile();
    if (!data) return null;
    const changed = purgeExpired(data, Date.now());
    if (changed) await writeAuthFile(data);
    const hash = tokenHash(token);
    return data.sessions.some(session => timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(session.hash, 'hex'))) ? publicOwner(data.owner) : null;
  });
}

export function revokeSession(token: string | undefined): Promise<void> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return Promise.resolve();
  return serialize(async () => {
    const data = await readAuthFile();
    if (!data) return;
    const hash = tokenHash(token);
    const originalLength = data.sessions.length;
    const now = Date.now();
    data.sessions = data.sessions.filter(session => session.expiresAt > now && session.hash !== hash);
    if (data.sessions.length !== originalLength) await writeAuthFile(data);
  });
}
