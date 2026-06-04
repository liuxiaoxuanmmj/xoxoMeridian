import bcrypt from "bcryptjs";

const ROUNDS = 10;

// Pre-generated dummy hash for constant-time comparison when user doesn't exist.
// This prevents timing attacks that could reveal whether an email is registered.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash).catch(() => false);
}

// Perform a dummy bcrypt comparison to maintain constant timing
export function verifyPasswordDummy(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
}
