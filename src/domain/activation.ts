import crypto from "node:crypto";

const ACTIVATION_CODE_HASH = "5fb3819e1731dfa8d2bcdc728442fd5d2ae7f632a16e9572d731d2d97f466852";

export function isActivationCodeValid(code: string): boolean {
  const actualHash = crypto.createHash("sha256").update(code, "utf8").digest();
  const expectedHash = Buffer.from(ACTIVATION_CODE_HASH, "hex");
  return actualHash.length === expectedHash.length && crypto.timingSafeEqual(actualHash, expectedHash);
}
