const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Access was denied for this sign-in attempt.",
  CallbackRouteError: "Authentication could not finish. Please try again.",
  Configuration:
    "Authentication is unavailable because the database connection failed. Re-check DATABASE_URL and refresh your Neon password.",
  CredentialsSignin: "Invalid email or password.",
  OAuthAccountNotLinked:
    "That email is already linked to a different sign-in method.",
  OAuthCallback:
    "Google sign-in could not finish. Please try again in a moment.",
  OAuthSignin:
    "Google sign-in could not start. Check the Google OAuth client settings.",
  SessionRequired: "Please sign in to continue.",
  Verification: "That sign-in link is invalid or has already been used.",
};

export function getAuthErrorMessage(error?: string | null) {
  if (!error) {
    return "";
  }

  return AUTH_ERROR_MESSAGES[error] ?? error;
}
