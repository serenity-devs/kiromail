import { z } from "zod";

export function headerText(min:number,max:number){
  return z.string().trim().min(min).max(max).refine(value=>!/[\r\n\0]/.test(value),"No se permiten saltos de línea ni bytes nulos en una cabecera");
}
