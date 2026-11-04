import { Suspense } from "react";
import { LoginContent } from "./LoginContent";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  return (
    <Suspense fallback={<div className="simple-auth-page" />}>
      <LoginContent />
    </Suspense>
  );
}
