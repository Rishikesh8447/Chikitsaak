import { FlaskConical } from "lucide-react";
import { getAdminLaboratoryOverview } from "@/actions/laboratory";
import { LaboratoryPanel } from "../_components/laboratory-panel";
import { PageHeader } from "@/components/page-header";

export default async function AdminLaboratoryPage() {
  const overview = await getAdminLaboratoryOverview();
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-6 sm:py-9">
    <PageHeader icon={<FlaskConical />} title="Laboratory oversight" description="Review partner applications, maintain test definitions, monitor order state, and audit activity." backLink="/admin" backLabel="Administration" />
    <LaboratoryPanel {...overview} />
  </main>;
}
