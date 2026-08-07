import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveStorageKey } from "@/lib/assets";
import { sql } from "@/lib/db";

export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const{id}=await context.params;const[asset]=await sql<{storage_key:string;mime_type:string;sha256:string}[]>`SELECT storage_key,mime_type,sha256 FROM assets WHERE id=${id}`;if(!asset)return new NextResponse("Not found",{status:404});if(request.headers.get("if-none-match")===`\"${asset.sha256}\"`)return new NextResponse(null,{status:304});try{const file=await readFile(resolveStorageKey(asset.storage_key));return new NextResponse(file,{headers:{"Content-Type":asset.mime_type,"Cache-Control":"public, max-age=31536000, immutable","ETag":`\"${asset.sha256}\"`,"X-Content-Type-Options":"nosniff"}});}catch{return new NextResponse("Not found",{status:404});}}
