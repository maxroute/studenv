import Image from "next/image";

type BrandVariant = "badge" | "mark";

type BrandMarkProps = {
  alt?: string;
  className?: string;
  height?: number;
  priority?: boolean;
  variant?: BrandVariant;
  width?: number;
};

type BrandLockupProps = {
  className?: string;
  imageClassName?: string;
  name?: string;
  priority?: boolean;
  textClassName?: string;
  variant?: BrandVariant;
  width?: number;
  height?: number;
};

const brandAssets = {
  badge: {
    src: "/branding/logo-variant1.png",
    width: 282,
    height: 282,
  },
  mark: {
    src: "/branding/logo-variant2.png",
    width: 12,
    height: 15,
  },
} as const;

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function StudenvBootMark({
  alt,
  className,
  height,
  width,
}: {
  alt: string;
  className?: string;
  height: number;
  width: number;
}) {
  return (
    <svg
      aria-label={alt}
      className={joinClasses("sb-boot-mark", className)}
      height={height}
      role="img"
      viewBox="0 0 282 282"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient cx="42%" cy="34%" id="sbBootGold" r="72%">
          <stop offset="0%" stopColor="#ffe65a" />
          <stop offset="58%" stopColor="#ffd814" />
          <stop offset="100%" stopColor="#f6c900" />
        </radialGradient>
        <filter
          colorInterpolationFilters="sRGB"
          height="145%"
          id="sbBootGlow"
          width="145%"
          x="-22.5%"
          y="-22.5%"
        >
          <feGaussianBlur stdDeviation="7" />
          <feColorMatrix values="1 0 0 0 1 0 0 0 0 0.78 0 0 0 0 0.05 0 0 0 0.72 0" />
        </filter>
      </defs>

      <g className="sb-boot-stage">
        <circle className="sb-boot-glow" cx="141" cy="141" r="121" />
        <circle className="sb-boot-black-disc" cx="141" cy="141" r="121" />
        <circle className="sb-boot-ring" cx="141" cy="141" r="113" />
        <circle className="sb-boot-fill" cx="141" cy="141" r="121" />
        <circle className="sb-boot-center-mask" cx="141" cy="141" r="86" />

        <g className="sb-boot-arrows" fill="none" stroke="#050505">
          <path
            className="sb-boot-arrow-path sb-boot-arrow-path-top"
            d="M111.5 142.5C84.4 133.7 76 98.2 94.4 74.6C107.6 57.6 128.6 51.6 151 54"
          />
          <path
            className="sb-boot-arrow-head sb-boot-arrow-head-top"
            d="M146.5 40.5L164.5 55.2L149.2 72.1"
          />
          <path
            className="sb-boot-arrow-path sb-boot-arrow-path-bottom"
            d="M170.5 139.5C197.6 148.3 206 183.8 187.6 207.4C174.4 224.4 153.4 230.4 131 228"
          />
          <path
            className="sb-boot-arrow-head sb-boot-arrow-head-bottom"
            d="M135.5 241.5L117.5 226.8L132.8 209.9"
          />
        </g>

        <circle className="sb-boot-dot" cx="141" cy="141" r="17" />
        <g className="sb-boot-logo-reveal">
          <circle cx="141" cy="141" fill="url(#sbBootGold)" r="121" />
          <path
            d="M111.5 142.5C84.4 133.7 76 98.2 94.4 74.6C107.6 57.6 128.6 51.6 151 54"
            fill="none"
            stroke="#050505"
            strokeLinecap="round"
            strokeWidth="11.5"
          />
          <path
            d="M146.5 40.5L164.5 55.2L149.2 72.1"
            fill="none"
            stroke="#050505"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="11.5"
          />
          <path
            d="M170.5 139.5C197.6 148.3 206 183.8 187.6 207.4C174.4 224.4 153.4 230.4 131 228"
            fill="none"
            stroke="#050505"
            strokeLinecap="round"
            strokeWidth="11.5"
          />
          <path
            d="M135.5 241.5L117.5 226.8L132.8 209.9"
            fill="none"
            stroke="#050505"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="11.5"
          />
          <circle cx="141" cy="141" fill="#050505" r="17" />
        </g>
      </g>
    </svg>
  );
}

export function BrandMark({
  alt = "Studenv logo",
  className,
  height,
  priority = false,
  variant = "mark",
  width,
}: BrandMarkProps) {
  const asset = brandAssets[variant];
  const shouldUseBootMark =
    variant === "badge" && className?.split(/\s+/).includes("sb-loader-logo");

  if (shouldUseBootMark) {
    return (
      <StudenvBootMark
        alt={alt}
        className={className}
        height={height ?? asset.height}
        width={width ?? asset.width}
      />
    );
  }

  return (
    <Image
      alt={alt}
      className={className}
      height={height ?? asset.height}
      priority={priority}
      src={asset.src}
      width={width ?? asset.width}
    />
  );
}

export function BrandLockup({
  className,
  height,
  imageClassName,
  name = "Studenv",
  priority = false,
  textClassName,
  variant = "mark",
  width,
}: BrandLockupProps) {
  return (
    <div className={joinClasses("brand-lockup", className)}>
      <BrandMark
        alt={`${name} logo`}
        className={joinClasses("brand-mark", imageClassName)}
        height={height}
        priority={priority}
        variant={variant}
        width={width}
      />
      <span className={joinClasses("brand-wordmark", textClassName)}>{name}</span>
    </div>
  );
}
