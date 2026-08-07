import assert from "node:assert/strict";
import test from "node:test";
import { HttpPreconditionError, requireIfMatch, resourceEtag } from "../lib/http-concurrency";

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
