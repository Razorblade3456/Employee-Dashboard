import { test } from "node:test";
import assert from "node:assert/strict";
import {
  credential,
  credentialKey,
  rotatePasscode,
  verifyPasscode,
  StorageLike,
} from "../src/lib/demo-passcodes";
const storage = (): StorageLike => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};
test("manager/accountant default passcodes are role-specific", async () => {
  const s = storage();
  assert.equal(await verifyPasscode(s, "manager", "1234"), true);
  assert.equal(await verifyPasscode(s, "accountant", "5678"), true);
  assert.equal(await verifyPasscode(s, "manager", "5678"), false);
  assert.equal(await verifyPasscode(s, "accountant", "1234"), false);
  assert.equal(await verifyPasscode(s, "manager", "wrong"), false);
});
test("passcode changes require the old code and matching confirmation", async () => {
  const s = storage();
  await assert.rejects(
    () => rotatePasscode(s, "manager", "bad", "2468", "2468"),
    /incorrect/,
  );
  await assert.rejects(
    () => rotatePasscode(s, "manager", "1234", "2468", "nope"),
    /match/,
  );
  await assert.rejects(
    () => rotatePasscode(s, "manager", "1234", "12", "12"),
    /between/,
  );
  assert.equal(await verifyPasscode(s, "manager", "1234"), true);
});
test("changed passcodes persist as salted hashes and invalidate the former code", async () => {
  const s = storage(),
    original = credential(s, "manager");
  await rotatePasscode(s, "manager", "1234", "2468", "2468");
  assert.notEqual(credential(s, "manager").revision, original.revision);
  assert.equal(await verifyPasscode(s, "manager", "1234"), false);
  assert.equal(await verifyPasscode(s, "manager", "2468"), true);
  assert.equal(await verifyPasscode(s, "accountant", "5678"), true);
  assert.equal(s.getItem(credentialKey("manager"))!.includes("2468"), false);
});
