import assert from "node:assert/strict";
import test from "node:test";
import { openApiDocument } from "../lib/openapi";

test("OpenAPI document exposes the implemented public contract", () => {
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.ok(Object.keys(openApiDocument.paths).length >= 77);
  for (const path of [
    "/api/v1/lists",
    "/api/v1/lists/{id}/duplicate",
    "/api/v1/templates",
    "/api/v1/templates/{id}/duplicate",
    "/api/v1/campaigns/{id}/launch",
    "/api/v1/campaigns/{id}/actions",
    "/api/v1/campaigns/{id}/duplicate",
    "/api/v1/campaigns/{id}/experiment",
    "/api/v1/campaigns/{id}/experiment/actions",
    "/api/v1/campaigns/{id}/report",
    "/api/v1/campaigns/{id}/report/export",
    "/api/v1/reports/campaigns",
    "/api/v1/reports/transactional",
    "/api/v1/reports/audience",
    "/api/v1/deliverability",
    "/api/v1/deliverability/actions",
    "/api/events/ses",
    "/api/v1/operations",
    "/api/v1/operations/actions",
    "/api/auth/mfa",
    "/api/health/live",
    "/api/health/ready",
    "/api/metrics",
    "/api/v1/transactional/send",
    "/api/v1/transactional/batch",
    "/api/v1/transactional/batches/{id}",
    "/api/v1/transactional/messages/{id}/retry",
    "/api/v1/imports",
    "/api/v1/exports/{id}/download",
    "/api/v1/webhooks",
    "/api/v1/contacts/bulk",
    "/api/v1/contacts/{id}/export",
    "/api/v1/suppressions",
    "/api/v1/segments",
    "/api/v1/segments/{id}",
    "/api/v1/segments/{id}/duplicate",
    "/api/v1/segments/preview",
    "/api/v1/assets",
    "/api/v1/assets/{id}",
    "/api/v1/assets/{id}/content",
    "/api/v1/reusable-blocks",
    "/api/v1/templates/{id}/versions/{versionId}/restore",
    "/api/v1/jobs/{id}",
    "/api/users",
    "/api/auth/sessions",
  ]) assert.ok(path in openApiDocument.paths, `Missing documented path ${path}`);
  assert.doesNotThrow(() => JSON.stringify(openApiDocument));
});

test("session revocation documents one device or every other device", () => {
  const operation = openApiDocument.paths["/api/auth/sessions"].delete as {
    requestBody: {
      content: {
        "application/json": {
          schema: {
            oneOf: Array<{ properties: { all_others?: { const: boolean } } }>;
          };
        };
      };
    };
  };
  const schema = operation.requestBody.content["application/json"].schema;
  assert.equal(schema.oneOf.length, 2);
  assert.equal(schema.oneOf[1].properties.all_others?.const, true);
});

test("every documented operation declares auth and responses", () => {
  const methods = new Set(["get", "post", "patch", "put", "delete"]);
  for (const [path, pathItem] of Object.entries(openApiDocument.paths)) {
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!methods.has(method)) continue;
      const operation = rawOperation as Record<string, unknown>;
      assert.equal(typeof operation.summary, "string", `${method.toUpperCase()} ${path} has no summary`);
      assert.ok(Array.isArray(operation.security), `${method.toUpperCase()} ${path} has no security declaration`);
      assert.equal(typeof operation.responses, "object", `${method.toUpperCase()} ${path} has no responses`);
    }
  }
});
