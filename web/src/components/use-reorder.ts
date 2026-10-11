"use client";

import { useState } from "react";

// Drag-to-reorder for a list kept in React state. Rows move live while
// dragging. With a handle, a row only becomes draggable while its handle is
// held, so text in the row's fields can still be selected; the handle also
// moves its row with the arrow keys.
export function useReorder<T>(items: T[], setItems: (next: T[]) => void, idOf: (item: T) => string) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const moveTo = (id: string, to: number) => {
    const from = items.findIndex((item) => idOf(item) === id);
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    setItems(next);
  };

  const itemProps = (id: string, withHandle = true) => ({
    draggable: withHandle ? armed === id : true,
    onDragStart: (event: React.DragEvent) => {
      setDragging(id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    },
    onDragOver: (event: React.DragEvent) => {
      if (!dragging) return;
      event.preventDefault();
      if (dragging !== id) moveTo(dragging, items.findIndex((item) => idOf(item) === id));
    },
    onDrop: (event: React.DragEvent) => event.preventDefault(),
    onDragEnd: () => {
      setDragging(null);
      setArmed(null);
    },
    "data-dragging": dragging === id ? "" : undefined,
  });

  const handleProps = (id: string, label: string) => ({
    onPointerDown: () => setArmed(id),
    onPointerUp: () => setArmed(null),
    onKeyDown: (event: React.KeyboardEvent) => {
      const at = items.findIndex((item) => idOf(item) === id);
      if (event.key === "ArrowUp") moveTo(id, at - 1);
      else if (event.key === "ArrowDown") moveTo(id, at + 1);
      else return;
      event.preventDefault();
    },
    "aria-label": `Move ${label}. Drag, or use the arrow keys.`,
    title: "Drag to change the order",
  });

  return { itemProps, handleProps, moveTo, dragging };
}
