import test from "node:test";
import assert from "node:assert/strict";
import { receiptSubject } from "./signup_service.ts";

test("donor signup chooses a receipt message while volunteer signup gets a welcome", () => {
  assert.equal(receiptSubject({ email: "a@example.org", password: "long-password", name: "Ava", donorReceipt: true }), "Your first donor receipt");
  assert.equal(receiptSubject({ email: "a@example.org", password: "long-password", name: "Ava", donorReceipt: false }), "Welcome to the volunteer community");
});
