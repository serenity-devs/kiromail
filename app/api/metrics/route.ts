import { NextResponse } from "next/server";
import { env } from "@/lib/config";
import { getCurrentSession } from "@/lib/auth";
import { operationsDashboard } from "@/lib/operations";
import { sql } from "@/lib/db";

function metric(name:string,value:number|string,labels:Record<string,string>={}){const suffix=Object.keys(labels).length?`{${Object.entries(labels).map(([key,item])=>`${key}="${item.replaceAll('"','\\"')}"`).join(",")}}`:"";return `${name}${suffix} ${value}`;}

export async function GET(request:Request){
  const authorization=request.headers.get("authorization")??"";
  const token=authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const session=env.metricsToken?null:await getCurrentSession();
  if((env.metricsToken&&token!==env.metricsToken)||(!env.metricsToken&&session?.user.role!=="admin"))return new NextResponse("Unauthorized",{status:401});
  const dashboard=await operationsDashboard();
  const states=await sql<{kind:string;status:string;count:number}[]>`SELECT kind,status,count(*)::int AS count FROM outbound_messages GROUP BY kind,status`;
  const[httpErrors]=await sql<{count:number}[]>`SELECT COALESCE(sum(requests),0)::bigint AS count FROM request_metric_minutes WHERE status_class=5 AND minute>now()-interval '1 hour'`;
  const lines=["# HELP kiromail_up Application metrics endpoint is available","# TYPE kiromail_up gauge",metric("kiromail_up",1)];
  for(const[queue,counts]of Object.entries(dashboard.queues))for(const[state,value]of Object.entries(counts as Record<string,number>))lines.push(metric("kiromail_queue_jobs",value,{queue,state}));
  for(const worker of dashboard.workers as unknown as {instance_id:string;healthy:boolean}[])lines.push(metric("kiromail_worker_healthy",worker.healthy?1:0,{instance:worker.instance_id}));
  for(const state of states)lines.push(metric("kiromail_messages",state.count,{kind:state.kind,status:state.status}));
  lines.push(metric("kiromail_dead_letters_open",(dashboard.dead_letters as unknown as {status:string}[]).filter(item=>item.status==="open").length));
  lines.push(metric("kiromail_http_errors_last_hour",Number(httpErrors.count)));
  return new NextResponse(`${lines.join("\n")}\n`,{headers:{"Content-Type":"text/plain; version=0.0.4; charset=utf-8","Cache-Control":"no-store"}});
}
