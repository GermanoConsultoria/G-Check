import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ISO local "yyyy-MM-dd" (sem conversão de fuso) a partir de um Date. */
export function isoDoDia(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Date à meia-noite local a partir de um ISO "yyyy-MM-dd". */
export function dataDoIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
