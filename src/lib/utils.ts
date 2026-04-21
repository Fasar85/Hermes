import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseAndFormatDate(dateStr: string): string {
  if (!dateStr || dateStr === "N/D") return "N/D";
  
  // Clean the string
  let clean = dateStr.trim().toLowerCase();
  
  // If already in DD/MM/YYYY format, just return it
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
  
  // Handle DD.MM.YYYY or DD-MM-YYYY
  if (/^\d{2}[\.\-]\d{2}[\.\-]\d{4}$/.test(clean)) {
    return clean.replace(/[\.\-]/g, "/");
  }

  // Handle formats like "10 apr 2026" or "10 aprile 2026"
  const months: Record<string, string> = {
    'gen': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'mag': '05', 'giu': '06',
    'lug': '07', 'ago': '08', 'set': '09', 'ott': '10', 'nov': '11', 'dic': '12',
    'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04', 'maggio': '05', 'giugno': '06',
    'luglio': '07', 'agosto': '08', 'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12'
  };

  const parts = clean.split(/\s+/);
  if (parts.length >= 3) {
    const day = parts[0].padStart(2, '0');
    const monthName = parts[1];
    const year = parts[2];
    
    const month = months[monthName] || months[monthName.substring(0, 3)];
    if (month && /^\d{4}$/.test(year)) {
      return `${day}/${month}/${year}`;
    }
  }

  return dateStr; // Fallback to original if parsing fails
}

export const formatDate = (dateStr: string) => {
  if (!dateStr || dateStr === "N/D") return "N/D";
  return dateStr.replace(/[\/\-]/g, ".");
};
