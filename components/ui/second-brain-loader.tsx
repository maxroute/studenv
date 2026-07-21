import { BrandMark } from "@/components/ui/brand-logo";

const statusMessages = [
  "Initializing vault...",
  "Loading your library...",
  "Syncing knowledge graph...",
  "Building search index...",
  "Ready.",
  "Ready..",
  "Ready...",
];

type SecondBrainLoaderProps = {
  variant?: "full" | "logo";
};

export function SecondBrainLoader({
  variant = "full",
}: SecondBrainLoaderProps) {
  const isLogoOnly = variant === "logo";

  return (
    <div
      aria-label="Loading Studenv"
      aria-live="polite"
      className={`sb-loader-screen ${isLogoOnly ? "logo-only" : ""}`}
      role="status"
    >
      <div className="sb-loader">
        <div className="sb-loader-logo-stack">
          <BrandMark
            alt="Studenv loading logo"
            className="sb-loader-logo"
            height={200}
            priority
            variant="badge"
            width={200}
          />
          <div className="sb-loader-wordmark-text">Studenv</div>
          <div className="sb-loader-wordmark-sub">YOUR ONLINE STUDY ROOM</div>
        </div>

        {!isLogoOnly ? (
          <div aria-hidden="true" className="sb-loader-progress-wrap">
            <div className="sb-loader-progress-fill" />
          </div>
        ) : null}

        {!isLogoOnly ? (
          <div aria-hidden="true" className="sb-loader-status-wrap">
            {statusMessages.map((message, index) => (
              <span
                className={`sb-loader-status-text sb-loader-status-${index + 1}`}
                key={message}
              >
                {message}
              </span>
            ))}
          </div>
        ) : null}

        <span className="sb-loader-sr-only">Loading Studenv</span>
      </div>
    </div>
  );
}
