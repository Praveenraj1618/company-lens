import assert from "node:assert/strict";
import test from "node:test";
import worker from "../dist/server/index.js";

test("production Worker exports fetch and scheduled handlers and renders the intelligence workspace", async () => {
  assert.equal(typeof worker.fetch,"function");
  assert.equal(typeof worker.scheduled,"function");
  const response=await worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/<title>Company Lens/);
  assert.match(html,/Intelligence overview/);
  assert.match(html,/All Aster Mobility stories/);
  assert.match(html,/Story timeline/);
  assert.doesNotMatch(html,/Starter Project|codex-preview/);
});
