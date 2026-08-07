import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { env } from "./config";

export type ImageInfo={mimeType:"image/jpeg"|"image/png"|"image/gif"|"image/webp";extension:".jpg"|".png"|".gif"|".webp";width:number|null;height:number|null};
export type AssetInfo={mimeType:string;extension:string;width:number|null;height:number|null};

function uint24le(buffer:Buffer,offset:number){return buffer[offset]|(buffer[offset+1]<<8)|(buffer[offset+2]<<16);}

export function inspectImage(buffer:Buffer):ImageInfo|null{
  if(buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return{mimeType:"image/png",extension:".png",width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
  if(buffer.length>=10&&(buffer.subarray(0,6).toString("ascii")==="GIF87a"||buffer.subarray(0,6).toString("ascii")==="GIF89a"))return{mimeType:"image/gif",extension:".gif",width:buffer.readUInt16LE(6),height:buffer.readUInt16LE(8)};
  if(buffer.length>=30&&buffer.subarray(0,4).toString("ascii")==="RIFF"&&buffer.subarray(8,12).toString("ascii")==="WEBP"){
    const kind=buffer.subarray(12,16).toString("ascii");
    if(kind==="VP8X"&&buffer.length>=30)return{mimeType:"image/webp",extension:".webp",width:uint24le(buffer,24)+1,height:uint24le(buffer,27)+1};
    if(kind==="VP8 "&&buffer.length>=30&&buffer[23]===0x9d&&buffer[24]===0x01&&buffer[25]===0x2a)return{mimeType:"image/webp",extension:".webp",width:buffer.readUInt16LE(26)&0x3fff,height:buffer.readUInt16LE(28)&0x3fff};
    if(kind==="VP8L"&&buffer.length>=25&&buffer[20]===0x2f){const bits=buffer.readUInt32LE(21);return{mimeType:"image/webp",extension:".webp",width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
    return{mimeType:"image/webp",extension:".webp",width:null,height:null};
  }
  if(buffer.length>=4&&buffer[0]===0xff&&buffer[1]===0xd8){let offset=2;while(offset+9<buffer.length){if(buffer[offset]!==0xff){offset++;continue;}const marker=buffer[offset+1];if(marker===0xd9||marker===0xda)break;const size=buffer.readUInt16BE(offset+2);if(size<2)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&offset+8<buffer.length)return{mimeType:"image/jpeg",extension:".jpg",width:buffer.readUInt16BE(offset+7),height:buffer.readUInt16BE(offset+5)};offset+=2+size;}return{mimeType:"image/jpeg",extension:".jpg",width:null,height:null};
  }
  return null;
}

export function inspectAsset(buffer:Buffer,declaredType:string):AssetInfo|null{const image=inspectImage(buffer);if(image)return image;if(buffer.length>=5&&buffer.subarray(0,5).toString("ascii")==="%PDF-"&&declaredType==="application/pdf")return{mimeType:"application/pdf",extension:".pdf",width:null,height:null};const textTypes:Record<string,string>={"text/plain":".txt","text/csv":".csv","text/calendar":".ics"};if(textTypes[declaredType]&&!buffer.includes(0))return{mimeType:declaredType,extension:textTypes[declaredType],width:null,height:null};return null;}

export function prepareAsset(buffer:Buffer,declaredType:string){const info=inspectAsset(buffer,declaredType);if(!info)throw new Error("El archivo no es una imagen, PDF, TXT, CSV o calendario válido");if(declaredType&&declaredType!==info.mimeType)throw new Error("El contenido del archivo no coincide con su tipo MIME");const id=randomUUID();const storageKey=`assets/${id}${info.extension}`;return{id,storageKey,absolutePath:resolveStorageKey(storageKey),sha256:createHash("sha256").update(buffer).digest("hex"),...info};}
export const prepareImage=prepareAsset;

export function resolveStorageKey(storageKey:string){const root=path.resolve(env.uploadDir);const target=path.resolve(root,storageKey);if(!target.startsWith(`${root}${path.sep}`))throw new Error("Ruta de activo no válida");return target;}

export type AssetUsage={assetId:string;blockId:string};
export function collectAssetUsages(document:unknown):AssetUsage[]{if(!document||typeof document!=="object")return[];const blocks=(document as{blocks?:unknown}).blocks;if(!Array.isArray(blocks))return[];const result:AssetUsage[]=[];for(const item of blocks){if(!item||typeof item!=="object")continue;const block=item as{id?:unknown;asset_id?:unknown};if(typeof block.asset_id==="string"&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(block.asset_id))result.push({assetId:block.asset_id,blockId:typeof block.id==="string"?block.id:""});}return result;}
