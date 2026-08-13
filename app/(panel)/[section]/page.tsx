import { notFound } from "next/navigation";
import { panelSectionFromSlug } from "@/lib/panel-navigation";

export default async function PanelSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!panelSectionFromSlug(section)) notFound();
  return null;
}
