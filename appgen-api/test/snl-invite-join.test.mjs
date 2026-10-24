import test from "node:test";
import assert from "node:assert/strict";
import {
  createInviteRecord,
  publicInvitePayload,
  tryJoinInvite
} from "../lib/snl-invite.js";

test("same account gets next slot when each tab sends a distinct playerKey", () => {
  let invite = createInviteRecord({
    token: "abcdefghijklmnopqrstuv",
    hostId: "user-a",
    hostName: "Host",
    origin: "https://example.com",
    playerKey: "tab-host-key-12345"
  });

  const tab2 = tryJoinInvite(invite, {
    userId: "user-a",
    userName: "Host again",
    playerKey: "tab-guest-key-67890"
  });
  assert.equal(tab2.ok, true);
  invite = tab2.invite;
  assert.equal(invite.players.length, 2);
  assert.equal(invite.players[0].slot, 0);
  assert.equal(invite.players[1].slot, 1);
  assert.equal(invite.players[1].accountId, "user-a");

  const hostView = publicInvitePayload(invite, "user-a", { playerKey: "tab-host-key-12345" });
  const guestView = publicInvitePayload(invite, "user-a", { playerKey: "tab-guest-key-67890" });
  assert.equal(hostView.mySlot, 0);
  assert.equal(guestView.mySlot, 1);
  assert.equal(hostView.dualSeat, true);
  assert.equal(guestView.dualSeat, true);
});

test("rejoin same tab reuses seat via playerKey", () => {
  let invite = createInviteRecord({
    token: "abcdefghijklmnopqrstuv",
    hostId: "user-a",
    hostName: "Host",
    origin: "https://example.com",
    playerKey: "tab-host-key-12345"
  });
  const again = tryJoinInvite(invite, {
    userId: "user-a",
    userName: "Host",
    playerKey: "tab-host-key-12345"
  });
  assert.equal(again.ok, true);
  assert.equal(again.invite.players.length, 1);
});
