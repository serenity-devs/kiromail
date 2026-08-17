import assert from "node:assert/strict";
import test from "node:test";
import { buildSegmentFilter, explainSegment } from "../lib/segments";

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

test("date-only between ranges include both complete calendar dates",()=>{
  const result=buildSegmentFilter([{kind:"rule",field:"created_at",operator:"between",value:"2026-08-01",value_to:"2026-08-17"}]);
  assert.deepEqual(result.values,["2026-08-01","2026-08-17"]);
  assert.match(result.where,/::timestamptz::date BETWEEN \$1::date AND \$2::date/);
});

test("between ranges with timestamps preserve exact inclusive bounds",()=>{
  const result=buildSegmentFilter([{kind:"rule",field:"created_at",operator:"between",value:"2026-08-01T12:00:00Z",value_to:"2026-08-17T18:00:00Z"}]);
  assert.deepEqual(result.values,["2026-08-01T12:00:00Z","2026-08-17T18:00:00Z"]);
  assert.match(result.where,/::timestamptz BETWEEN \$1::timestamptz AND \$2::timestamptz/);
});

test("date range explanations show both inclusive dates",()=>{
  const explanation=explainSegment({kind:"rule",field:"created_at",operator:"between",value:"2026-08-01",value_to:"2026-08-17"});
  assert.equal(explanation,"created_at between 2026-08-01 y 2026-08-17 (ambas fechas incluidas)");
});
