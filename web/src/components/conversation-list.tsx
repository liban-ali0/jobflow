"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { id: number; title: string; engine: string; updated: string };

export function ConversationList({ items }: { items: Item[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;

  return (
    <ul className="mt-5 space-y-1">
      {items.map((item) => {
        const active = pathname === `/assistant/${item.id}`;
        return (
          <li key={item.id}>
            <Link
              href={`/assistant/${item.id}`}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                active ? "border-saffron bg-surface" : "border-transparent hover:bg-surface"
              }`}
            >
              <span className="block truncate font-medium" dir="auto">
                {item.title}
              </span>
              <span className="text-xs text-slate">
                {item.engine} · {item.updated}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
