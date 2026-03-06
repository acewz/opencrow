import React from "react";

interface LoadingStateProps {
  readonly message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 gap-5">
      <span className="w-8 h-8 border-2 border-border-2 border-t-accent rounded-full animate-spin" />
      {message && <span className="text-base text-muted">{message}</span>}
    </div>
  );
}
