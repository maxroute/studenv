"use client";

type ShelfNavIconProps = {
  className?: string;
};

/** Displays the latest refined Shelf SVG, tinted by the navigation state. */
export function ShelfNavIcon({ className }: ShelfNavIconProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        flexShrink: 0,
        backgroundColor: "currentColor",
        maskImage: "url('/icons/shelf.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/icons/shelf.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
