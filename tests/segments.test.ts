import assert from "node:assert/strict";
import test from "node:test";
import { buildSegmentFilter } from "../lib/segments";

test("segment filters parameterize values", () => {
  const result = buildSegmentFilter([{ field: "email", operator: "contains", value: "example.com" }, { field: "status", operator: "is", value: "active" }], "all");
  assert.equal(result.values.join(","), "example.com,active");
  assert.match(result.where, /\$1/);
  assert.match(result.where, /\$2/);
  assert.doesNotMatch(result.where, /example\.com/);
});

test("empty segment matches all contacts", () => {
  assert.deepEqual(buildSegmentFilter([], "all"), { where: "TRUE", values: [] });
});

test("typed nested segments compile list fields without interpolating values", () => {
  const result=buildSegmentFilter({kind:"group",match:"all",children:[
    {kind:"rule",field:"list_field",field_key:"equipo_preferido",field_type:"select",list_id:"list-id",operator:"is",value:"Betis"},
    {kind:"group",match:"any",children:[
      {kind:"rule",field:"created_at",operator:"after",value:"2026-01-01"},
      {kind:"rule",field:"campaign_activity",operator:"clicked",value:"campaign-id"},
    ]},
  ]});
  assert.deepEqual(result.values,["list-id","equipo_preferido","Betis","2026-01-01","campaign-id"]);
  assert.match(result.where,/custom_values/);
  assert.match(result.where,/ OR /);
  assert.doesNotMatch(result.where,/Betis|equipo_preferido|campaign-id/);
});

test("campaign activity can be limited to a parameterized day window",()=>{
  const result=buildSegmentFilter([{kind:"rule",field:"campaign_activity",operator:"opened",value:"campaign-id",within_days:30}]);
  assert.deepEqual(result.values,["campaign-id",30]);
  assert.match(result.where,/opened_at>=now\(\)-\(\$2::int\*interval '1 day'\)/);
  assert.doesNotMatch(result.where,/campaign-id/);
});

test("negative campaign activity negates the whole time-windowed existence check",()=>{
  const result=buildSegmentFilter([{kind:"rule",field:"campaign_activity",operator:"not_clicked",value:"campaign-id",within_days:14}]);
  assert.deepEqual(result.values,["campaign-id",14]);
  assert.match(result.where,/NOT \(EXISTS/);
  assert.match(result.where,/clicked_at>=now\(\)-\(\$2::int\*interval '1 day'\)/);
});
