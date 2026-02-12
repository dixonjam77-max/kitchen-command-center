export const PANTRY_CATEGORIES = [
  "produce", "dairy", "meat", "seafood", "grains", "spices",
  "canned", "frozen", "condiments", "baking", "beverages",
  "snacks", "oils", "asian_pantry", "latin_pantry", "preserved", "alcohol",
] as const;

export const STORAGE_LOCATIONS = [
  "fridge", "freezer", "pantry", "spice_rack", "counter", "bar", "garage",
] as const;

export const UNITS = [
  "oz", "lb", "g", "kg", "cups", "tbsp", "tsp",
  "count", "ml", "L", "bunch", "can", "bottle", "jar",
] as const;

export const TOOL_CATEGORIES = [
  "cookware", "bakeware", "appliances", "utensils", "knives",
  "storage", "small_appliances", "specialty", "barware",
] as const;

export const TOOL_CAPABILITIES = [
  "sear", "braise", "sous_vide", "grind", "blend", "bake",
  "grill", "smoke", "ferment", "press", "roll", "strain",
] as const;

export const CONDITION_OPTIONS = [
  "excellent", "good", "fair", "needs_replacement",
] as const;

export const MEAL_TYPES = [
  "breakfast", "lunch", "dinner", "snack",
] as const;

export const DIFFICULTY_LEVELS = [
  "easy", "medium", "hard",
] as const;

export const DIETARY_FLAGS = [
  "gluten_free", "dairy_free", "vegetarian", "vegan",
  "low_carb", "keto", "nut_free",
] as const;

export const CUISINES = [
  "japanese", "mexican", "italian", "american", "thai",
  "indian", "french", "korean", "chinese", "mediterranean",
  "vietnamese", "greek", "spanish", "middle_eastern", "other",
] as const;

export const FRESHNESS_STATUSES = [
  "fresh", "use_soon", "use_today", "expired",
] as const;

export const GROCERY_LIST_STATUSES = [
  "active", "shopping", "completed", "archived",
] as const;

export const SOURCE_TYPES = [
  "manual", "url", "youtube", "image", "ai_generated", "family",
] as const;

export const WASTE_REASONS = [
  "expired", "spoiled", "forgot", "overcooked", "didn't_like",
] as const;

export const MAINTENANCE_TYPES = [
  "sharpen", "season", "descale", "replace_filter",
] as const;
