const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Access was denied for this sign-in attempt.",
  CallbackRouteError: "Authentication could not finish. Please try again.",
  Configuration:
    "Authentication is unavailable because the database connection failed. Re-check DATABASE_URL and refresh your Neon password.",
  CredentialsSignin: "Invalid email or password.",
  SessionRequired: "Please sign in to continue.",
  Verification: "That sign-in link is invalid or has already been used.",
};

export function getAuthErrorMessage(error?: string | null) {
  if (!error) {
    return "";
  }

  return AUTH_ERROR_MESSAGES[error] ?? error;
}
