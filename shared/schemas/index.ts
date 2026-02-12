import { z } from "zod";
import {
  PANTRY_CATEGORIES, STORAGE_LOCATIONS, UNITS, TOOL_CATEGORIES,
  CONDITION_OPTIONS, MEAL_TYPES, DIFFICULTY_LEVELS, FRESHNESS_STATUSES,
  GROCERY_LIST_STATUSES, SOURCE_TYPES, WASTE_REASONS,
} from "../constants";

// --- Reusable validators ---

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format");
const optionalDate = dateStr.optional().nullable();
const optionalUuid = uuid.optional().nullable();

// --- Auth ---

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
});

// --- Pantry ---

export const CreatePantryItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  subcategory: z.string().optional().nullable(),
  quantity: z.number().optional().nullable(),
  unit: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  expiration_date: optionalDate,
  opened_date: optionalDate,
  purchase_date: optionalDate,
  min_quantity: z.number().optional().nullable(),
  is_staple: z.boolean().optional(),
  preferred_brand: z.string().optional().nullable(),
  batch_info: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const UpdatePantryItemSchema = CreatePantryItemSchema.partial();

// --- Tools ---

export const CreateKitchenToolSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  condition: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  purchase_date: optionalDate,
  capabilities: z.array(z.string()).optional(),
  maintenance_interval_days: z.number().int().optional().nullable(),
  maintenance_type: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const UpdateKitchenToolSchema = CreateKitchenToolSchema.partial();

// --- Recipes ---

export const RecipeIngredientSchema = z.object({
  ingredient_name: z.string().min(1),
  canonical_name: z.string().optional().nullable(),
  quantity: z.number().optional().nullable(),
  unit: z.string().optional().nullable(),
  preparation: z.string().optional().nullable(),
  group_name: z.string().optional().nullable(),
  sort_order: z.number().int().optional().nullable(),
  optional: z.boolean().optional(),
  substitutions: z.string().optional().nullable(),
  pantry_item_id: optionalUuid,
});

export const RecipeToolSchema = z.object({
  tool_name: z.string().min(1),
  tool_id: optionalUuid,
  optional: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

export const CreateRecipeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  servings: z.number().int().optional(),
  prep_time_minutes: z.number().int().optional().nullable(),
  cook_time_minutes: z.number().int().optional().nullable(),
  total_time_minutes: z.number().int().optional().nullable(),
  instructions: z.array(z.record(z.unknown())).optional(),
  source_type: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  source_attribution: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  cuisine: z.string().optional().nullable(),
  difficulty: z.string().optional().nullable(),
  dietary_flags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  ingredients: z.array(RecipeIngredientSchema).optional(),
  tools: z.array(RecipeToolSchema).optional(),
});

export const UpdateRecipeSchema = CreateRecipeSchema.partial();

// --- Meal Plans ---

export const CreateMealPlanSchema = z.object({
  plan_date: dateStr,
  meal_type: z.string().min(1),
  recipe_id: optionalUuid,
  custom_meal: z.string().optional().nullable(),
  servings: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  prep_day_group: z.string().optional().nullable(),
  sort_order: z.number().int().optional().nullable(),
});

export const UpdateMealPlanSchema = CreateMealPlanSchema.partial();

// --- Grocery ---

export const CreateGroceryListSchema = z.object({
  name: z.string().min(1),
  store: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GroceryListItemSchema = z.object({
  item_name: z.string().min(1),
  quantity: z.number().optional().nullable(),
  unit: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  pantry_item_id: optionalUuid,
  estimated_price: z.number().optional().nullable(),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
