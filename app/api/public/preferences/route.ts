import { NextResponse } from "next/server";
import { applyPreferences, requestIp } from "@/lib/public-preferences";

function scalar(value:FormDataEntryValue|null){return typeof value==="string"?value:"";}
function typedValue(type:string,values:string[]){
  if(type==="boolean")return values.includes("true");
  if(type==="integer")return values[0]?Number.parseInt(values[0],10):null;
  if(type==="decimal")return values[0]?Number.parseFloat(values[0]):null;
  if(type==="multiselect")return values;
  return values[0]??"";
}

export async function POST(request:Request){
  try{
    const form=await request.formData();const token=scalar(form.get("token"));const fieldValues:Record<string,Record<string,unknown>>={};
    for(const key of new Set([...form.keys()].filter((item)=>item.startsWith("field.")))){
      const parts=key.split(".");if(parts.length!==4)continue;const[,listId,fieldKey,type]=parts;fieldValues[listId]??={};fieldValues[listId][fieldKey]=typedValue(type,form.getAll(key).map(String));
    }
    await applyPreferences({token,firstName:scalar(form.get("first_name")),lastName:scalar(form.get("last_name")),phone:scalar(form.get("phone")),city:scalar(form.get("city")),country:scalar(form.get("country")),activeListIds:form.getAll("active_list_ids").map(String),fieldValues,unsubscribeAll:form.get("action")==="unsubscribe_all",ip:requestIp(request),userAgent:request.headers.get("user-agent")??""});
    if((request.headers.get("accept")??"").includes("text/html"))return NextResponse.redirect(new URL("/preferences/done",request.url),303);
    return NextResponse.json({updated:true});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"No se pudieron actualizar las preferencias"},{status:400});
  }
}
