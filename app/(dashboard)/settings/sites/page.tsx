import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SitesManager from "./sites-manager";

export default async function SitesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <SitesManager />;
}
