import { notFound } from "next/navigation";
import { SpendDashboard } from "@/components/admin/spend-dashboard";
import { PageContainer, PageHeader } from "@/components/ui/misc";
import { PREVIEW_SPEND } from "../fixtures";

export default function SpendPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PageContainer>
      <PageHeader title="Spend" subtitle="Actual provider cost where reported, otherwise the config estimate. Failed jobs excluded." />
      <SpendDashboard stats={PREVIEW_SPEND} />
    </PageContainer>
  );
}
