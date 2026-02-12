// ============================================================
// Kitchen Command Center — Shared TypeScript Types
// ============================================================

// --- Enums ---

export type FreshnessStatus = "fresh" | "use_soon" | "use_today" | "expired";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type GroceryListStatus = "active" | "shopping" | "completed" | "archived";
export type Difficulty = "easy" | "medium" | "hard";
export type SourceType = "manual" | "url" | "youtube" | "image" | "ai_generated" | "family";
export type ItemCondition = "excellent" | "good" | "fair" | "needs_replacement";
export type WasteReason = "expired" | "spoiled" | "forgot" | "overcooked" | "didn't_like";

// --- Entities ---

export interface User {
  id: string;
  email: string;
  name: string;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  canonical_name: string | null;
  category: string | null;
  subcategory: string | null;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  brand: string | null;
  expiration_date: string | null;
  opened_date: string | null;
  purchase_date: string | null;
  freshness_status: FreshnessStatus;
  freshness_expires_at: string | null;
  min_quantity: number | null;
  is_staple: boolean;
  preferred_brand: string | null;
  batch_info: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KitchenTool {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  condition: ItemCondition | null;
  location: string | null;
  purchase_date: string | null;
  capabilities: string[];
  last_maintained: string | null;
  maintenance_interval_days: number | null;
  maintenance_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolConsumable {
  id: string;
  tool_id: string;
  consumable_name: string;
  quantity: number | null;
  unit: string | null;
  min_quantity: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeInstruction {
  step: number;
  text: string;
  duration_minutes?: number;
  technique?: string;
}

export interface RecipeMacros {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  instructions: RecipeInstruction[];
  source_type: SourceType | null;
  source_url: string | null;
  source_attribution: string | null;
  tags: string[];
  cuisine: string | null;
  difficulty: Difficulty | null;
  dietary_flags: string[];
  estimated_calories_per_serving: number | null;
  estimated_macros: RecipeMacros | null;
  rating: number | null;
  photo_url: string | null;
  is_favorite: boolean;
  version: number;
  parent_recipe_id: string | null;
  notes: string | null;
  ingredients: RecipeIngredient[];
  tools: RecipeTool[];
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  pantry_item_id: string | null;
  ingredient_name: string;
  canonical_name: string | null;
  quantity: number | null;
  unit: string | null;
  preparation: string | null;
  group_name: string | null;
  sort_order: number | null;
  optional: boolean;
  substitutions: string | null;
}

export interface RecipeTool {
  id: string;
  recipe_id: string;
  tool_id: string | null;
  tool_name: string;
  optional: boolean;
  notes: string | null;
}

export interface RecipeCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface CookLog {
  id: string;
  recipe_id: string;
  user_id: string;
  cooked_date: string;
  servings_made: number | null;
  rating: number | null;
  modifications: string | null;
  photo_url: string | null;
  notes: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface MealPlan {
  id: string;
  user_id: string;
  plan_date: string;
  meal_type: MealType;
  recipe_id: string | null;
  custom_meal: string | null;
  servings: number | null;
  notes: string | null;
  completed: boolean;
  completed_at: string | null;
  leftover_portions: number | null;
  leftover_plan_id: string | null;
  thaw_reminder_sent: boolean;
  prep_day_group: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface GroceryList {
  id: string;
  user_id: string;
  name: string;
  status: GroceryListStatus;
  store: string | null;
  estimated_cost: number | null;
  notes: string | null;
  items: GroceryListItem[];
  created_at: string;
  updated_at: string;
}

export interface GroceryListItem {
  id: string;
  list_id: string;
  item_name: string;
  canonical_name: string | null;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  store_section_order: number | null;
  pantry_item_id: string | null;
  estimated_price: number | null;
  checked: boolean;
  checked_at: string | null;
  added_to_pantry: boolean;
  source: string | null;
  notes: string | null;
}

export interface WasteLog {
  id: string;
  user_id: string;
  pantry_item_id: string | null;
  item_name: string | null;
  quantity_wasted: number | null;
  unit: string | null;
  reason: WasteReason | null;
  wasted_date: string | null;
  estimated_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FreshnessRule {
  id: string;
  canonical_name: string;
  category: string | null;
  sealed_shelf_life_days: number | null;
  opened_shelf_life_days: number | null;
  storage_location: string | null;
  storage_tips: string | null;
  freezable: boolean | null;
  frozen_shelf_life_days: number | null;
  source: string | null;
}

// --- API Response Types ---

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
