"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function SearchInput() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setValue((prev) => (prev !== q ? q : prev));
  }, [searchParams]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setValue(nextValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = nextValue.trim();
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      const queryString = params.toString();
      router.replace(`/home${queryString ? `?${queryString}` : ""}`);
    }, 300);
  };

  const handleClear = () => {
    setValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    router.replace("/home");
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (pathname !== "/home") return null;

  return (
    <div className="relative flex items-center">
      <svg
        className="absolute left-2.5 h-3.5 w-3.5 text-black/30 pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Search posts..."
        className="w-48 rounded-[10px] border border-[#d9d9d9] bg-white pl-8 pr-7 py-1.5 text-xs text-black placeholder:text-black/30 focus:outline-none focus:border-[#3a5b22] focus:w-56 transition-all duration-200"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 flex items-center justify-center h-3.5 w-3.5 rounded-full text-black/30 hover:text-black/60 transition-colors"
          aria-label="Clear search"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
