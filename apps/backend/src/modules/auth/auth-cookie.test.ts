import assert from "node:assert/strict";
import test from "node:test";
import { readCookie } from "./auth-cookie";

test("reads only the requested cookie and decodes its value", () => {
  assert.equal(readCookie("other=x; egi_refresh_token=token%3Dvalue; last=y", "egi_refresh_token"), "token=value");
  assert.equal(readCookie("other=x", "egi_refresh_token"), undefined);
  assert.equal(readCookie("egi_refresh_token=%E0%A4", "egi_refresh_token"), undefined);
});
