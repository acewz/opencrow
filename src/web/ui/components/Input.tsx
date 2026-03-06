import React from "react";
import { cn } from "../lib/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string;
}

export function Input({ label, id, className, ...props }: InputProps) {
  const input = (
    <input
      id={id}
      className={cn(
        "w-full px-4 py-2.5 bg-bg border border-border-2 rounded-lg text-foreground text-base outline-none transition-colors duration-150",
        "focus:border-accent placeholder:text-faint",
        className,
      )}
      {...props}
    />
  );

  if (!label) return input;

  return (
    <div>
      <label
        className="block text-sm font-semibold text-muted uppercase tracking-wide mb-2"
        htmlFor={id}
      >
        {label}
      </label>
      {input}
    </div>
  );
}
