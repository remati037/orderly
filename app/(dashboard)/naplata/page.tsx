import { requirePageRole } from "@/lib/auth/page-guards";
import RecoveryBoard from "./recovery-board";

export default async function NaplataPage() {
  const member = await requirePageRole(["owner", "agent"]);
  return <RecoveryBoard currentMemberId={member.id} />;
}
