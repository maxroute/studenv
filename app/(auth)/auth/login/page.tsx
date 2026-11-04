import { Suspense } from "react";
import { LoginContent } from "./LoginContent";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="simple-auth-page" />}>
      <LoginContent />
    </Suspense>
  );
}
