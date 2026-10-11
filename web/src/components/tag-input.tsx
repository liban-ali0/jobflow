"use client";

import { useState } from "react";
import { useReorder } from "@/components/use-reorder";

// A list of short phrases shown as chips: Enter or a comma adds what was
// typed, × or Backspace in the empty box removes, and chips drag into order.
// The form receives them comma-separated in a hidden field.
export function TagInput({
  id,
  name,
  initial,
  placeholder,
}: {
  id: string;
  name: string;
  initial: string[];
  placeholder: string;
}) {
  const [tags, setTags] = useState(initial);
  const [text, setText] = useState("");
  const { itemProps } = useReorder(tags, setTags, (tag) => tag);

  const add = (value: string) => {
    const fresh = value
      .split(/[,\n،]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag && !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()));
    if (fresh.length) setTags([...tags, ...new Set(fresh)]);
    setText("");
  };

  return (
    <div className="field flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-teal focus-within:ring-3 focus-within:ring-teal/20">
      <input type="hidden" name={name} value={tags.join(", ")} />
      {tags.map((tag) => (
        <span
          key={tag}
          {...itemProps(tag, false)}
          className="inline-flex cursor-grab items-center rounded-full bg-mist pl-2.5 text-sm transition-opacity data-[dragging]:opacity-40"
          dir="auto"
        >
          {tag}
          <button
            type="button"
            onClick={() => setTags(tags.filter((other) => other !== tag))}
            className="grid size-7 place-items-center rounded-full text-base text-slate hover:bg-coral-soft hover:text-coral"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(event) => {
          const value = event.target.value;
          if (/[,،]/.test(value)) add(value);
          else setText(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(text);
          } else if (event.key === "Backspace" && !text && tags.length) {
            setTags(tags.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && add(text)}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (/[,\n،]/.test(pasted)) {
            event.preventDefault();
            add(text + pasted);
          }
        }}
        placeholder={tags.length ? "Add more" : placeholder}
        className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-slate"
        dir="auto"
      />
    </div>
  );
}
