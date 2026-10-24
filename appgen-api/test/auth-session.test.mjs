import test from "node:test";
import assert from "node:assert/strict";
import {
  signSession,
  verifySession,
  publicUser
} from "../lib/auth-session.js";

test("sign and verify session round-trip", () => {
  const secret = "test-secret-do-not-use-in-prod";
  const now = Math.floor(Date.now() / 1000);
  const token = signSession(
    { sub: "g-123", email: "a@b.co", name: "Ada", picture: "", exp: now + 3600 },
    secret
  );
  const user = verifySession(token, secret);
  assert.equal(user.sub, "g-123");
  assert.equal(user.email, "a@b.co");
  assert.deepEqual(publicUser(user), {
    id: "g-123",
    email: "a@b.co",
    name: "Ada",
    picture: null
  });
});

test("verify rejects tampered token", () => {
  const secret = "test-secret-do-not-use-in-prod";
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({ sub: "x", email: "", name: "", picture: "", exp: now + 60 }, secret);
  assert.equal(verifySession(token + "x", secret), null);
  assert.equal(verifySession(token, "other"), null);
});
