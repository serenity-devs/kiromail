import assert from "node:assert/strict";
import test from "node:test";
import { buildSesChecks,senderIsAllowed,type SesCheckInput } from "../lib/deliverability";

function fixture():SesCheckInput{return{
  account:{production_access:true,sending_enabled:true,enforcement_status:"HEALTHY"},
  identities:[{name:"example.com",type:"DOMAIN",sending_enabled:true,verification_status:"SUCCESS",verified_for_sending:true,dkim_status:"SUCCESS",dkim_signing_enabled:true,mail_from_domain:"bounce.example.com",mail_from_status:"SUCCESS",configuration_set:null}],
  configurationSets:[
    {name:"marketing",destinations:[{name:"sns",enabled:true,event_types:["SEND","DELIVERY","BOUNCE","COMPLAINT","REJECT","DELIVERY_DELAY","RENDERING_FAILURE"],sns_topic_arn:"arn:aws:sns:eu-west-1:1:events"}]},
    {name:"transactional",destinations:[{name:"sns",enabled:true,event_types:["SEND","DELIVERY","BOUNCE","COMPLAINT","REJECT","DELIVERY_DELAY","RENDERING_FAILURE"],sns_topic_arn:"arn:aws:sns:eu-west-1:1:events"}]},
  ],
  settings:{default_from_email:"news@example.com",ses_marketing_configuration_set:"marketing",ses_transactional_configuration_set:"transactional",ses_tracking_source:"local"},
  appUrl:"https://mail.example.com",
  allowedTopicArns:["arn:aws:sns:eu-west-1:1:events"],
};}

test("SES production checklist passes its enforceable controls",()=>{
  const checks=buildSesChecks(fixture());
  assert.equal(checks.find(item=>item.key==="sender_identity")?.status,"pass");
  assert.equal(checks.find(item=>item.key==="dkim")?.status,"pass");
  assert.equal(checks.find(item=>item.key==="mail_from")?.status,"pass");
  assert.equal(checks.find(item=>item.key==="configuration_sets")?.status,"pass");
  assert.equal(checks.find(item=>item.key==="event_destination")?.status,"pass");
  assert.equal(checks.find(item=>item.key==="sns_topics")?.status,"pass");
  assert.equal(checks.find(item=>item.key==="tracking_source")?.status,"pass");
});

test("checklist catches sandbox, missing events and duplicate interaction tracking",()=>{
  const input=fixture();input.account.production_access=false;input.configurationSets[0].destinations[0].event_types.push("OPEN");
  input.configurationSets[1].destinations[0].event_types=input.configurationSets[1].destinations[0].event_types.filter(item=>item!=="COMPLAINT");
  const checks=buildSesChecks(input);
  assert.equal(checks.find(item=>item.key==="production_access")?.status,"warning");
  assert.equal(checks.find(item=>item.key==="event_destination")?.status,"fail","each channel must publish the complete required event set");
  assert.equal(checks.find(item=>item.key==="tracking_source")?.status,"warning");
});

test("sender allowlist accepts the default identity and explicit domains only",()=>{
  const settings={default_from_email:"hola@example.com",allowed_sender_domains:["news.example.com"]};
  assert.equal(senderIsAllowed("hola@example.com",settings),true);
  assert.equal(senderIsAllowed("editor@news.example.com",settings),true);
  assert.equal(senderIsAllowed("editor@example.com",settings),false);
  assert.equal(senderIsAllowed("editor@evil-example.com",settings),false);
});
