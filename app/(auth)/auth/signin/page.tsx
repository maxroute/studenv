import { Suspense } from "react";
import { WarmUp } from "@/components/ui/warm-up";
import { SigninContent } from "./SigninContent";

export default function SigninPage() {
  return (
    <>
      <WarmUp />
      <Suspense fallback={<div className="simple-auth-page" />}>
        <SigninContent />
      </Suspense>
    </>
  );
}
