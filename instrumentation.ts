import type { Instrumentation } from "next";

export async function register() {}

export const onRequestError:Instrumentation.onRequestError=async(error,request,context)=>{
  const captured=error as Error&{digest?:string};
  const requestIdHeader=request.headers["x-request-id"];
  const requestId=Array.isArray(requestIdHeader)?requestIdHeader[0]:requestIdHeader;
  console.error(JSON.stringify({timestamp:new Date().toISOString(),level:"error",event:"request_error",request_id:requestId??null,method:request.method,path:request.path,route:context.routePath,route_type:context.routeType,digest:captured.digest??null,error:captured.message}));
  if(process.env.NEXT_RUNTIME!=="nodejs")return;
  try{
    const{sql}=await import("./lib/db");
    await sql`INSERT INTO request_metric_minutes(minute,method,route_group,status_class,requests,total_duration_ms,max_duration_ms)VALUES(date_trunc('minute',now()),${request.method},${context.routePath||request.path.split('?')[0]},5,1,0,0)ON CONFLICT(minute,method,route_group,status_class)DO UPDATE SET requests=request_metric_minutes.requests+1`;
  }catch(instrumentationError){console.error(JSON.stringify({timestamp:new Date().toISOString(),level:"error",event:"request_error_record_failed",error:instrumentationError instanceof Error?instrumentationError.message:"unknown"}));}
};
