import { Suspense } from "react";
import { InstalledAppIntro } from "@/components/intro/installed-app-intro";
import { WarmUp } from "@/components/ui/warm-up";
import { SigninContent } from "./SigninContent";

export default function SigninPage() {
  return (
    <>
      <WarmUp />
      <InstalledAppIntro />
      <Suspense fallback={<div className="simple-auth-page" />}>
        <SigninContent />
      </Suspense>
    </>
  );
}
