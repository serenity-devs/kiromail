import assert from "node:assert/strict";
import test from "node:test";
import { transactionalInputSchema } from "../lib/transactional-schema";
import { headerText } from "../lib/validation";

test("mail headers reject CRLF and null injection",()=>{
  assert.equal(headerText(1,998).safeParse("Asunto normal").success,true);
  assert.equal(headerText(1,998).safeParse("Asunto\r\nBcc: victim@example.com").success,false);
  assert.equal(headerText(1,998).safeParse("Asunto\0oculto").success,false);
});

test("transactional input applies header validation to subject, names and attachments",()=>{
  const base={to:{email:"client@example.com",name:"Cliente"},subject:"Confirmación",html:"<p>Ok</p>"};
  assert.equal(transactionalInputSchema.safeParse(base).success,true);
  assert.equal(transactionalInputSchema.safeParse({...base,subject:"Ok\nBcc: bad@example.com"}).success,false);
  assert.equal(transactionalInputSchema.safeParse({...base,attachments:[{asset_id:"00000000-0000-4000-8000-000000000001",filename:"safe.pdf\r\nX-Test: 1"}]}).success,false);
  assert.doesNotThrow(()=>JSON.stringify(base));
});
