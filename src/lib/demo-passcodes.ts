// These gates protect demo navigation only; live accounts always use Supabase Auth.
export type ProtectedRole = "manager" | "accountant";
export interface Credential {
  salt: string;
  verifier: string;
  revision: string;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const credentialKey = (role: ProtectedRole) =>
  "gather-demo-passcode-v1-" + role;
const initial: Record<ProtectedRole, Credential> = {
  manager: {
    salt: "3241b8cfe52a660c722e4ef166715771",
    verifier:
      "11e9651fdc27095c7f2e3368ea8aeb3325a348aea384dc848b280787f1cc18f2",
    revision: "initial-v1",
  },
  accountant: {
    salt: "0a168b9ad35710489076c81a9cfe5557",
    verifier:
      "e39a005978ded57548f6f51e55ba746ce0b59fb1dd512a81d318c7028240625c",
    revision: "initial-v1",
  },
};
export function credential(
  storage: StorageLike,
  role: ProtectedRole,
): Credential {
  const raw = storage.getItem(credentialKey(role));
  if (!raw) return initial[role];
  const saved = JSON.parse(raw) as Credential;
  if (
    !/^[a-f0-9]{32}$/.test(saved.salt) ||
    !/^[a-f0-9]{64}$/.test(saved.verifier) ||
    !saved.revision
  )
    throw Error(
      "The local passcode record is damaged. Restore this browser’s demo settings.",
    );
  return saved;
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function derive(passcode: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBytes = Uint8Array.from(salt.match(/../g)!, (h) => parseInt(h, 16));
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltBytes,
          iterations: 120000,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    ),
  );
}
export async function verifyPasscode(
  storage: StorageLike,
  role: ProtectedRole,
  passcode: string,
) {
  if (passcode.length > 128) return false;
  const c = credential(storage, role),
    actual = await derive(passcode, c.salt);
  let difference = 0;
  for (let i = 0; i < c.verifier.length; i++)
    difference |= c.verifier.charCodeAt(i) ^ actual.charCodeAt(i);
  return difference === 0;
}
export async function rotatePasscode(
  storage: StorageLike,
  role: ProtectedRole,
  current: string,
  next: string,
  confirmation: string,
) {
  if (next.length < 4 || next.length > 128 || !next.trim())
    throw Error("Choose a passcode between 4 and 128 characters.");
  if (next !== confirmation) throw Error("The new passcodes do not match.");
  if (!(await verifyPasscode(storage, role, current)))
    throw Error("Current passcode is incorrect.");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))),
    value = {
      salt,
      verifier: await derive(next, salt),
      revision: crypto.randomUUID(),
    };
  storage.setItem(credentialKey(role), JSON.stringify(value));
  return value;
}
