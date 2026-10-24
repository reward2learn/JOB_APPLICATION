import test from "node:test";
import assert from "node:assert/strict";
import {
  pushDirectLobbyInvite,
  respondInboxInvite,
  publicInboxList
} from "../lib/snl-invite-inbox.js";

test("SNL inbox push and accept", async () => {
  const store = new Map();
  const getFn = async (path) => {
    if (!store.has(path)) throw Object.assign(new Error("not found"), { name: "BlobNotFoundError" });
    return { text: async () => store.get(path) };
  };
  const putFn = async (path, body) => {
    store.set(path, body);
  };

  const pushed = await pushDirectLobbyInvite(
    "user-b",
    { id: "user-a", name: "Alice" },
    { lobbyToken: "tok1234567890123456", joinUrl: "https://x/#snakes-ladders?snlInvite=tok" },
    { get: getFn, put: putFn }
  );
  assert.equal(pushed.ok, true);
  assert.ok(pushed.item.id);

  const accepted = await respondInboxInvite("user-b", pushed.item.id, "accept", {
    get: getFn,
    put: putFn
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.accepted, true);
  assert.match(accepted.joinUrl, /snlInvite/);

  const list = publicInboxList(await (async () => {
    const { loadInbox } = await import("../lib/snl-invite-inbox.js");
    return loadInbox("user-b", getFn);
  })());
  assert.equal(list.length, 0);
});
