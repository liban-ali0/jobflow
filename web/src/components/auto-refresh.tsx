"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Reloads the screen's data every few seconds while something is running.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
