"use client";

import clsx from "clsx";
import type { PropsWithChildren, ReactNode } from "react";

type ModalProps = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
  bodyClassName?: string;
}>;

export function Modal({
  open,
  onClose,
  title,
  footer,
  width = "md",
  bodyClassName,
  children,
}: ModalProps) {
  return (
    <div
      className={clsx("modal-overlay", open && "open")}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={clsx(
          "modal",
          width === "sm" && "modal-sm",
          width === "lg" && "modal-lg",
        )}
      >
        <div className="modal-head">
          <div>{title}</div>
          <button className="modal-x" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className={clsx("modal-body", bodyClassName)}>{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
