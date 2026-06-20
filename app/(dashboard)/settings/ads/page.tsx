import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AdsManager from "./ads-manager";

export default async function AdsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <AdsManager />;
}
