import { Suspense } from "react";
import TVContent from "./tv-content";

export const dynamic = "force-dynamic";

export default function TVPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#09090B]" />}>
      <TVContent />
    </Suspense>
  );
}
