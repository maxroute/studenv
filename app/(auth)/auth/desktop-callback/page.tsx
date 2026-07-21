import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function DesktopCallbackPage() {
  const cookieStore = cookies();
  const token =
    cookieStore.get("next-auth.session-token")?.value ||
    cookieStore.get("__Secure-next-auth.session-token")?.value;

  if (!token) {
    redirect("/auth/login?error=SessionExpired");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#0d0d0e",
        color: "#e4e4e7",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          maxWidth: "400px",
          background: "#161618",
          border: "1px solid #27272a",
          borderRadius: "12px",
          padding: "32px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            marginBottom: "16px",
            fontWeight: "600",
            color: "#f4f4f5",
          }}
        >
          Authentication Successful
        </h1>
        <p
          style={{
            color: "#a1a1aa",
            fontSize: "15px",
            lineHeight: "1.6",
            marginBottom: "24px",
          }}
        >
          You have successfully logged in via Google. You can now close this tab
          and return to the Studenv app.
        </p>
        <div
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: "6px",
            background: "#27272a",
            color: "#d4d4d8",
            fontSize: "13px",
          }}
        >
          Connecting to app...
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const token = ${JSON.stringify(token)};
            // Attempt to open the custom protocol
            window.location.href = "studenv://auth?token=" + encodeURIComponent(token);
            
            // Auto-close tab after a small delay
            setTimeout(() => {
              try { window.close(); } catch(e) {}
            }, 3000);
          `,
        }}
      />
    </div>
  );
}
