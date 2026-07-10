import { Suspense } from "react";
import SignInForm from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-6">
      <Suspense>
        <SignInForm />
      </Suspense>
    </div>
  );
}
