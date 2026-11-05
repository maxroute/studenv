const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Access was denied for this sign-in attempt.",
  CallbackRouteError: "Authentication could not finish. Please try again.",
  Configuration: "Sign-in is temporarily unavailable. Please try again shortly.",
  CredentialsSignin: "Invalid email or password.",
  SessionRequired: "Please sign in to continue.",
  Verification: "That sign-in link is invalid or has already been used.",
};

export function getAuthErrorMessage(error?: string | null) {
  if (!error) {
    return "";
  }

  // Never echo an arbitrary query-string value into the sign-in UI.
  return AUTH_ERROR_MESSAGES[error] ?? "Sign-in could not be completed. Please try again.";
}
