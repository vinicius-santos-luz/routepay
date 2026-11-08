import { WorkspaceOverview } from "@/modules/organizations/presentation/workspace-overview";
import { requireSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireSession();
  return <WorkspaceOverview />;
}
