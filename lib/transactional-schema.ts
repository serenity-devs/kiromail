import { z } from "zod";
import { headerText } from "./validation";

const variables=z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]));
export const attachmentSchema=z.object({asset_id:z.string().uuid(),filename:headerText(1,240).optional(),disposition:z.enum(["attachment","inline"]).default("attachment"),content_id:headerText(1,200).optional()});
export const transactionalInputSchema=z.object({
  to:z.object({email:z.email(),name:headerText(0,200).optional()}),
  from:z.object({email:z.email(),name:headerText(0,200).optional()}).optional(),reply_to:z.email().optional(),
  template_key:z.string().trim().min(1).max(160).optional(),template_version_id:z.string().uuid().optional(),
  subject:headerText(1,998).optional(),html:z.string().min(1).optional(),text:z.string().max(2_000_000).optional(),
  variables:variables.optional(),metadata:z.record(z.string(),z.unknown()).optional(),track_opens:z.boolean().optional(),track_clicks:z.boolean().optional(),
  attachments:z.array(attachmentSchema).max(10).default([]),
});
export const transactionalBatchSchema=z.object({messages:z.array(transactionalInputSchema).min(1).max(100)});
