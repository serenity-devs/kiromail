import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSignalDimension,classifyEmailClientSignal } from "../lib/report-client-signals";

test("email client taxonomy classifies only explicit reliable signatures",()=>{
  assert.deepEqual(classifyEmailClientSignal("GoogleImageProxy"),{client:"Gmail (proxy)",device:null});
  assert.deepEqual(classifyEmailClientSignal("Microsoft Outlook Windows NT 10.0"),{client:"Microsoft Outlook",device:"Escritorio"});
  assert.deepEqual(classifyEmailClientSignal("Mozilla/5.0 AppleWebKit Safari"),{client:null,device:null});
});

test("client breakdown stays hidden for small or weakly classified samples",()=>{
  const small=aggregateSignalDimension(Array(19).fill("Apple Mail"));assert.equal(small.available,false);
  const weak=aggregateSignalDimension([...Array(16).fill("Apple Mail"),...Array(5).fill(null)]);assert.equal(weak.available,false);
  const reliable=aggregateSignalDimension([...Array(15).fill("Apple Mail"),...Array(5).fill("Microsoft Outlook")]);
  assert.equal(reliable.available,true);assert.equal(reliable.groups.length,2);assert.equal(reliable.groups[0].share,.75);
});
