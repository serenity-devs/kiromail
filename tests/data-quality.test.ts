import assert from "node:assert/strict";
import test from "node:test";
import { suggestEmailCorrection } from "../lib/email-quality";
import { importUsesListField, segmentUsesListField, templateUsesListField } from "../lib/list-field-dependencies";

test("email quality suggests only close common-domain corrections", () => {
  assert.equal(suggestEmailCorrection("ana@gmial.com"), "ana@gmail.com");
  assert.equal(suggestEmailCorrection("ana@outlok.com"), "ana@outlook.com");
  assert.equal(suggestEmailCorrection("ana@gmail.com"), null);
  assert.equal(suggestEmailCorrection("ana@empresa.example"), null);
});

test("list-field dependencies recognize segments, imports and template variables", () => {
  assert.equal(segmentUsesListField({ kind: "group", children: [{ field: "list_field", field_key: "equipo" }] }, "equipo"), true);
  assert.equal(segmentUsesListField({ field: "email" }, "equipo"), false);
  assert.equal(importUsesListField({ list_id: "list-1", mapping: { Equipo: "field:equipo" } }, "list-1", "equipo"), true);
  assert.equal(importUsesListField({ list_id: "list-2", mapping: { Equipo: "field:equipo" } }, "list-1", "equipo"), false);
  assert.equal(templateUsesListField("<p>{{ fields.equipo }}</p>", "equipo"), true);
  assert.equal(templateUsesListField("<p>{{ nombre }}</p>", "equipo"), false);
});
