import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  icon?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "sb-button",
        variant === "ghost" && "sb-button-ghost",
        variant === "danger" && "sb-button-danger",
        className,
      )}
      type={props.type ?? "button"}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
