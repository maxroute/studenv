import { Suspense } from "react";
import { SigninContent } from "./SigninContent";

export default function SigninPage() {
  return (
    <Suspense fallback={<div className="simple-auth-page" />}>
      <SigninContent />
    </Suspense>
  );
}
