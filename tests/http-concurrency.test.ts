import assert from "node:assert/strict";
import test from "node:test";
import { HttpPreconditionError, requireIfMatch, resourceEtag, versionedJson } from "../lib/http-concurrency";

test("HTTP concurrency builds a strong resource-scoped ETag and extracts its revision", () => {
    const etag = resourceEtag("list-field", "list-id/field-id", 17);
    assert.equal(etag,'"list-field:list-id/field-id:17"');
    const request = new Request("http://localhost/resource", { headers: { "If-Match": etag } });
    assert.equal(requireIfMatch(request, "list-field", "list-id/field-id"),17);
});

test("HTTP concurrency distinguishes a missing precondition from a stale validator", () => {
    assert.throws(()=>requireIfMatch(new Request("http://localhost/resource"),"list","id"),(error:unknown)=>error instanceof HttpPreconditionError&&error.status===428&&error.code==="precondition_required");
    assert.throws(()=>requireIfMatch(new Request("http://localhost/resource",{headers:{"If-Match":'"list:id:1"'}}),"list","other"),(error:unknown)=>error instanceof HttpPreconditionError&&error.status===412&&error.code==="precondition_failed");
});

test("versioned JSON can disable conditional caching while retaining its ETag", async () => {
    const etag = resourceEtag("list", "id", 3);
    const request = new Request("http://localhost/api/v1/lists/id", { headers: { "If-None-Match": etag } });
    const response = versionedJson(request,{id:"id"},"list","id",3,200,{cache:"no-store"});
    assert.equal(response.status,200);
    assert.equal(response.headers.get("Cache-Control"),"no-store");
    assert.equal(response.headers.get("ETag"),etag);
    assert.deepEqual(await response.json(),{id:"id",etag});
});
