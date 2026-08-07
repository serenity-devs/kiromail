import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { readContent } from "@/lib/content-storage";
import { sql } from "@/lib/db";

export async function GET(request:Request,context:{params:Promise<{id:string;recipientId:string}>}){
  const principal=await authenticateApiRequest(request,"campaigns:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const {id,recipientId}=await context.params;const part=new URL(request.url).searchParams.get("part")==="text"?"text":"html";
  const [message]=await sql<{html_blob_id:string|null;text_blob_id:string|null}[]>`
    SELECT m.html_blob_id,m.text_blob_id FROM campaign_recipients r JOIN outbound_messages m ON m.id=r.outbound_message_id
    WHERE r.id=${recipientId} AND r.campaign_id=${id}
  `;if(!message)return NextResponse.json({error:{code:"not_found",message:"Destinatario no encontrado"}},{status:404});const blobId=part==="html"?message.html_blob_id:message.text_blob_id;
  if(!blobId)return NextResponse.json({error:{code:"content_unavailable",message:"Contenido no disponible"}},{status:410});
  try{const stored=await readContent(blobId);if(!stored)return NextResponse.json({error:{code:"content_unavailable",message:"Contenido no disponible"}},{status:410});return new Response(new Uint8Array(stored.content),{headers:{"Content-Type":part==="html"?"text/html; charset=utf-8":"text/plain; charset=utf-8","Content-Security-Policy":"default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; frame-ancestors 'self'","X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});}catch(error){console.error(error);return NextResponse.json({error:{code:"content_unavailable",message:"No se pudo recuperar el contenido"}},{status:503});}
}
