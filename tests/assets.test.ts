import assert from "node:assert/strict";
import test from "node:test";
import { collectAssetUsages,inspectAsset,inspectImage } from "../lib/assets";

test("image inspection trusts file signatures and reads PNG dimensions",()=>{const image=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(image);image.writeUInt32BE(640,16);image.writeUInt32BE(320,20);assert.deepEqual(inspectImage(image),{mimeType:"image/png",extension:".png",width:640,height:320});});

test("asset usages are collected only from valid visual blocks",()=>{assert.deepEqual(collectAssetUsages({blocks:[{id:"hero",asset_id:"11111111-1111-4111-8111-111111111111"},{id:"bad",asset_id:"not-an-id"}]}),[{assetId:"11111111-1111-4111-8111-111111111111",blockId:"hero"}]);});

test("safe attachment documents require matching signatures and MIME",()=>{assert.deepEqual(inspectAsset(Buffer.from("%PDF-1.7\nexample"),"application/pdf"),{mimeType:"application/pdf",extension:".pdf",width:null,height:null});assert.equal(inspectAsset(Buffer.from("MZ executable"),"application/pdf"),null);});
