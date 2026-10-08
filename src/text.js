// Turns the free-form text people type (or that came from the workbook)
// into display blocks. Leading bullets and step numbers are stripped so every
// recipe renders consistently; lines ending in ":" become small subheads.

const MARKER = /^\s*(?:[-*•♦·]+|\d{1,2}[.)]|[a-z][.)](?=\s))\s*/i;

export function parseBlocks(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const clean = l.replace(MARKER, "").trim();
      if (!clean) return null;
      // "For the sauce:" or "For Crockpot: (Modified by Chris)" become subheads.
      const isHead = clean.length <= 60 && !/^\d/.test(clean) && /^[^:]{2,40}:\s*(\([^)]*\))?\s*$/.test(clean);
      return { type: isHead ? "head" : "item", text: isHead ? clean.replace(/:\s*$/, "") : clean };
    })
    .filter(Boolean);
}

export function paragraphs(text) {
  if (!text) return [];
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export const CATEGORIES = [
  "Breakfast", "Cocktails", "Appetizers", "Salads", "Soups & Stews",
  "Chicken", "Pork", "Beef", "Seafood", "Vegetarian", "Other", "Dessert",
];
