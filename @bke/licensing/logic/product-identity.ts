import { createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalIdentity(value: string, code = "INVALID_DEVICE_ID"): string {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length < 16 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(code);
  return normalized;
}

export function deviceIdentity(deviceId: string): Readonly<{
  deviceId: string;
  deviceHash: string;
  machineIdHint: string;
}> {
  const normalized = canonicalIdentity(deviceId);
  return Object.freeze({
    deviceId: normalized,
    deviceHash: sha256(normalized),
    machineIdHint: normalized.slice(-8),
  });
}
