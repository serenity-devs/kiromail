import assert from "node:assert/strict";
import test from "node:test";
import { compileVisualEmail,defaultVisualTheme } from "../lib/email-template-compiler";
import { templateDiagnostics } from "../lib/template-service";

test("visual email compiler emits deterministic responsive presentation tables",()=>{
  const blocks=[{id:"title",type:"heading" as const,content:"Hola {{first_name}}"},{id:"cta",type:"button" as const,content:"Entrar",url:"https://example.com"}];
  const first=compileVisualEmail(blocks,defaultVisualTheme,"Preencabezado");const second=compileVisualEmail(blocks,defaultVisualTheme,"Preencabezado");
  assert.equal(first,second);assert.match(first,/role="presentation"/);assert.match(first,/@media only screen/);assert.match(first,/x-apple-disable-message-reformatting/);assert.match(first,/data-block-id="title"/);assert.match(first,/Hola {{first_name}}/);
});

test("visual email compiler rejects unsafe link protocols",()=>{
  const html=compileVisualEmail([{id:"cta",type:"button",content:"No",url:"javascript:alert(1)"}]);assert.doesNotMatch(html,/javascript:/);assert.match(html,/href="#"/);
});

test("template diagnostics report accessibility, compatibility and clipping risks",()=>{
  const html=`<div style="display:grid"><img src="http://example.com/a.png"><a href="#">Vacío</a>${"x".repeat(103000)}</div>`;
  const diagnostics=templateDiagnostics({subject:"Asunto",html_content:html,text_content:"Texto",variables_schema:{}});const codes=diagnostics.warnings.map(item=>item.code);
  assert.ok(codes.includes("image_alt_missing"));assert.ok(codes.includes("link_empty"));assert.ok(codes.includes("resource_http"));assert.ok(codes.includes("client_compatibility"));assert.ok(codes.includes("gmail_clip_risk"));
});
