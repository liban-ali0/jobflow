"use client";

import { useEffect, useId, useState } from "react";
import { useReorder } from "@/components/use-reorder";

const SUGGESTIONS = 8;
const cache = new Map<string, Promise<string[]>>();

function loadCities(code: string) {
  if (!cache.has(code)) {
    cache.set(
      code,
      fetch(`/api/places/${code}`)
        .then((response) => (response.ok ? response.json() : []))
        .catch(() => []),
    );
  }
  return cache.get(code)!;
}

// "İzmir" and "Izmir" match the same search.
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase();

// Chosen cities as chips, the first one preferred, with a search box over the
// country's cities. A city that is not in the list can still be added.
export function CityPicker({ code, cities, onChange }: { code: string; cities: string[]; onChange: (cities: string[]) => void }) {
  const [known, setKnown] = useState<{ code: string; list: string[] }>({ code: "", list: [] });
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const { itemProps } = useReorder(cities, onChange, (city) => city);

  useEffect(() => {
    if (!code) return;
    let current = true;
    loadCities(code).then((list) => current && setKnown({ code, list }));
    return () => {
      current = false;
    };
  }, [code]);

  const loading = Boolean(code) && known.code !== code;
  const options = known.code === code ? known.list : [];
  const query = plain(text.trim());
  const chosen = new Set(cities.map(plain));
  const matches = query
    ? options
        .filter((city) => !chosen.has(plain(city)))
        .filter((city) => plain(city).includes(query))
        .sort((a, b) => Number(!plain(a).startsWith(query)) - Number(!plain(b).startsWith(query)))
        .slice(0, SUGGESTIONS)
    : options.filter((city) => !chosen.has(plain(city))).slice(0, SUGGESTIONS);
  const exact = matches.find((city) => plain(city) === query);
  // The suggestions, plus "Add …" for a city that is not in the list.
  const choices = text.trim() && !exact ? [...matches, null] : matches;
  const highlighted = Math.min(active, choices.length - 1);

  const add = (city: string) => {
    const name = city.trim();
    if (!name || chosen.has(plain(name))) return;
    onChange([...cities, name]);
    setText("");
    setActive(0);
  };
  const pick = (index: number) => add(choices[index] ?? text);
  const optionId = (index: number) => `${listId}-${index}`;
  const showList = open && Boolean(code) && (loading || choices.length > 0);

  return (
    <div className="space-y-2">
      {cities.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen cities, first is preferred">
          {cities.map((city, index) => (
            <li
              key={city}
              {...itemProps(city, false)}
              className="inline-flex cursor-grab items-center rounded-full bg-mist text-sm transition-opacity data-[dragging]:opacity-40"
            >
              {index === 0 ? (
                <span className="flex items-center gap-1.5 py-1 pl-1.5">
                  <span className="rounded-full bg-go-soft px-1.5 text-[11px] font-semibold text-go">Preferred</span>
                  {city}
                </span>
              ) : (
                // Tapping a city makes it the preferred one; this also works
                // on touch screens, where chips cannot be dragged.
                <button
                  type="button"
                  onClick={() => onChange([city, ...cities.filter((other) => other !== city)])}
                  className="rounded-l-full py-1 pl-2.5 hover:text-teal"
                  title="Make preferred"
                >
                  {city}
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(cities.filter((other) => other !== city))}
                className="grid size-7 place-items-center rounded-full text-base text-slate hover:bg-coral-soft hover:text-coral"
                aria-label={`Remove ${city}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (choices.length) setActive((highlighted + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (choices.length) pick(highlighted);
              else add(text);
            } else if (event.key === "Escape") setOpen(false);
          }}
          placeholder={code ? "Add a city" : "Choose the country first"}
          disabled={!code}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && choices.length ? optionId(highlighted) : undefined}
          className="field"
        />
        {showList && (
          <ul id={listId} role="listbox" className="card absolute z-20 mt-1 max-h-64 w-full overflow-auto p-1 shadow-lg">
            {loading && <li className="px-3 py-1.5 text-sm text-slate">Loading cities…</li>}
            {choices.map((city, index) => (
              <li
                key={city ?? "custom"}
                id={optionId(index)}
                role="option"
                aria-selected={index === highlighted}
                // Keeps the input focused, so the list stays open for the next city.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
                className={`cursor-pointer rounded px-3 py-1.5 text-sm ${index === highlighted ? "bg-teal-soft text-teal" : ""} ${city === null ? "text-slate" : ""}`}
              >
                {city ?? `Add “${text.trim()}”`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
