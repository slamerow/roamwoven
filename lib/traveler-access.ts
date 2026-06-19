import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

export type TravelerPasswordVerificationResult =
  | "disabled"
  | "missing_hash"
  | "valid"
  | "invalid";

export function hashTravelerPassword(password: string) {
  const iterations = 210000;
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString(
    "hex"
  );

  return `pbkdf2_sha256:${iterations}:${salt}:${hash}`;
}

export function verifyTravelerPassword({
  password,
  passwordEnabled,
  passwordHash,
}: {
  password: string;
  passwordEnabled: boolean;
  passwordHash: string | null;
}): TravelerPasswordVerificationResult {
  if (!passwordEnabled) {
    return "disabled";
  }

  if (!passwordHash) {
    return "missing_hash";
  }

  const normalizedPassword = password.trim();

  if (!normalizedPassword) {
    return "invalid";
  }

  const [algorithm, iterationsRaw, salt, hash] = passwordHash.split(":");

  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !salt || !hash) {
    return "invalid";
  }

  const iterations = Number(iterationsRaw);

  if (!Number.isInteger(iterations) || iterations < 100000) {
    return "invalid";
  }

  const actualHash = pbkdf2Sync(
    normalizedPassword,
    salt,
    iterations,
    32,
    "sha256"
  ).toString("hex");
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(actualHash, "hex");

  if (expected.length !== actual.length) {
    return "invalid";
  }

  return timingSafeEqual(expected, actual) ? "valid" : "invalid";
}
