import test from "node:test";
import assert from "node:assert/strict";
import {
  makeShareToken,
  publicSharePath,
  isValidShareToken,
  buildShareDocUrls,
  publishPublicShare
} from "../lib/application-share.js";
import { blobResultToText } from "../lib/user-settings.js";

test("makeShareToken produces valid path", () => {
  const t = makeShareToken();
  assert.ok(isValidShareToken(t));
  assert.match(publicSharePath(t), /^applications\/share\/.+\.json$/);
});

test("buildShareDocUrls", () => {
  const t = makeShareToken();
  const urls = buildShareDocUrls("https://apply4job.vercel.app", t);
  assert.ok(urls.letter.includes("doc=letter"));
  assert.ok(urls.cv.includes("doc=cv"));
  assert.ok(urls.letter.includes(encodeURIComponent(t)));
});

test("rejects short tokens", () => {
  assert.equal(publicSharePath("short"), null);
  assert.equal(isValidShareToken("short"), false);
});

test("publishPublicShare uses private blob access (private store)", async () => {
  const t = makeShareToken();
  let capturedOpts;
  await publishPublicShare(async (_path, _body, opts) => {
    capturedOpts = opts;
  }, t, { letterHTML: "<p>x</p>" });
  assert.equal(capturedOpts.access, "private");
});

/** @vercel/blob get() private shape — application-view must drain stream, not only .text() */
test("blobResultToText drains private get() stream (share view regression)", async () => {
  const payload = JSON.stringify({ letterHTML: "<p>hi</p>", cvHTML: "<div>cv</div>" });
  const bytes = new TextEncoder().encode(payload);
  let delivered = false;
  const stream = {
    getReader() {
      return {
        async read() {
          if (delivered) return { done: true, value: undefined };
          delivered = true;
          return { done: false, value: bytes };
        }
      };
    }
  };
  const text = await blobResultToText({ statusCode: 200, stream });
  assert.equal(JSON.parse(text).letterHTML, "<p>hi</p>");
});

test("naive .text()-only helper empties private get() (documents prior bug)", async () => {
  async function textOnly(result) {
    if (result === undefined || result === null) return "";
    if (typeof result === "string") return result;
    if (typeof result.text === "function") return await result.text();
    return "";
  }
  const stream = {
    getReader() {
      return {
        async read() {
          return { done: false, value: new TextEncoder().encode('{"ok":true}') };
        }
      };
    }
  };
  assert.equal(await textOnly({ statusCode: 200, stream }), "");
});
