import { useEffect, useRef } from "react";

export function useDocumentTitle(title: string | null): void {
  const originalRef = useRef(document.title);

  useEffect(() => {
    if (title != null) document.title = title;
  }, [title]);

  useEffect(() => {
    const original = originalRef.current;
    return () => {
      document.title = original;
    };
  }, []);
}
