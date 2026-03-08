import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: React.ReactNode;
  readonly width?: string;
}

export function Modal({ open, onClose, title, children, width }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5"
      onClick={onClose}
      style={{ animation: "agFadeIn 0.15s ease-out" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className="bg-bg-1 border border-border-2 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "agSlideUp 0.2s ease-out",
          ...(width !== undefined ? { width } : {}),
        }}
      >
        {title && (
          <div className="flex justify-between items-center px-6 py-5 border-b border-border">
            <h3 id="modal-title" className="text-lg font-bold text-strong m-0 tracking-tight">{title}</h3>
            <button
              className="w-8 h-8 rounded-md bg-transparent border-none text-muted cursor-pointer flex items-center justify-center hover:bg-bg-3 hover:text-foreground transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
