import { notFound } from "next/navigation";
import { TeamManager } from "@/components/admin/team-manager";
import { PageContainer, PageHeader } from "@/components/ui/misc";
import { PREVIEW_ADMIN, PREVIEW_KEYS, PREVIEW_MEMBERS } from "../fixtures";

export default function TeamPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PageContainer>
      <PageHeader title="Team & API" subtitle="Add editors, reset passwords, manage roles, and issue API keys." />
      <TeamManager me={PREVIEW_ADMIN} members={PREVIEW_MEMBERS} apiKeys={PREVIEW_KEYS} />
    </PageContainer>
  );
}
