# Kitchen Command Center — Claude Code Project Prompt

## Project Overview

Build **Kitchen Command Center**, a full-stack kitchen management application with a web app (Next.js) and native iOS app (React Native/Expo) sharing a common backend API. The app manages six interconnected modules — Food Inventory, Equipment Inventory, Recipe Creation, Recipe Management, Meal Planning, and Grocery Lists — with deep AI integration via the Anthropic Claude API for intelligent features like recipe parsing, freshness tracking, smart meal planning, and waste reduction.

The system already has a working SQLite-based Python prototype (schema and logic described below). This project elevates that into a production-grade multi-platform application.

---

## Tech Stack

### Backend
- **Framework:** Python FastAPI
- **Database:** PostgreSQL (with SQLAlchemy ORM + Alembic migrations)
- **Auth:** JWT-based authentication (email/password + optional OAuth via Google)
- **AI:** Anthropic Claude API (claude-sonnet-4-5-20250929) for all AI features
- **Task Queue:** Celery + Redis for background jobs (freshness checks, AI parsing)
- **File Storage:** Local filesystem for dev, S3-compatible for production (recipe photos, receipt images)
- **API Docs:** Auto-generated OpenAPI/Swagger via FastAPI

### Web Frontend
- **Framework:** Next.js 14+ (App Router)
- **UI:** Tailwind CSS + shadcn/ui component library
- **State:** Zustand for client state, TanStack Query for server state
- **Calendar:** Custom calendar component for meal planning (drag-and-drop via dnd-kit)
- **PWA:** Service worker for offline grocery list access

### iOS App
- **Framework:** React Native with Expo (managed workflow)
- **Navigation:** Expo Router (file-based routing)
- **UI:** NativeWind (Tailwind for React Native) + custom components matching web design system
- **Camera:** Expo Camera for receipt/recipe photo scanning
- **Barcode:** expo-barcode-scanner for product scanning
- **Notifications:** Expo Notifications for freshness alerts, thaw reminders, meal prep reminders

### Shared
- **API Client:** Generated TypeScript client from OpenAPI spec, shared between web and mobile
- **Validation:** Zod schemas shared between frontend and backend (via JSON Schema bridge)

---

## Database Schema

Expand the existing SQLite schema to PostgreSQL. All tables get `created_at` and `updated_at` timestamps automatically. Use UUIDs for primary keys.

### Core Tables

#### `users`
Standard user table for multi-user support.
```
id (UUID, PK)
email (TEXT, unique, required)
name (TEXT)
password_hash (TEXT)
preferences (JSONB) — timezone, default_servings, preferred_store_layout, units (metric/imperial)
```

#### `pantry_items`
```
id (UUID, PK)
user_id (UUID, FK → users)
name (TEXT, required) — e.g., "Soy Sauce (Kikkoman All-Purpose)"
canonical_name (TEXT) — normalized: "soy sauce" (for fuzzy matching)
category (TEXT) — produce, dairy, meat, seafood, grains, spices, canned, frozen, condiments, baking, beverages, snacks, oils, asian_pantry, latin_pantry, preserved, alcohol
subcategory (TEXT) — e.g., "leafy greens", "hard cheese", "dried pasta"
quantity (REAL)
unit (TEXT) — oz, lb, g, kg, cups, tbsp, tsp, count, ml, L, bunch, can, bottle, jar
location (TEXT) — fridge, freezer, pantry, spice_rack, counter, bar, garage
brand (TEXT) — e.g., "Kikkoman", "Meijer", "Swanson"
expiration_date (DATE) — printed/estimated expiration
opened_date (DATE) — when the item was opened (triggers AI freshness recalculation)
purchase_date (DATE) — when bought
freshness_status (TEXT) — fresh, use_soon, use_today, expired (AI-calculated)
freshness_expires_at (DATE) — AI-calculated effective expiration considering opened state
min_quantity (REAL) — low-stock threshold
is_staple (BOOLEAN, default false) — auto-reorder items like milk, eggs, butter
preferred_brand (TEXT) — for grocery list generation
batch_info (TEXT) — for homemade items: "Straw 6.24", "Peaches labeled 25"
notes (TEXT)
```

#### `kitchen_tools`
```
id (UUID, PK)
user_id (UUID, FK → users)
name (TEXT, required)
category (TEXT) — cookware, bakeware, appliances, utensils, knives, storage, small_appliances, specialty, barware
brand (TEXT)
model (TEXT)
condition (TEXT) — excellent, good, fair, needs_replacement
location (TEXT)
purchase_date (DATE)
capabilities (TEXT[]) — array of tags: "sear", "braise", "sous_vide", "grind", "blend", "bake", "grill", "smoke", "ferment", "press", "roll", "strain"
last_maintained (DATE)
maintenance_interval_days (INTEGER) — e.g., 30 for knife sharpening
maintenance_type (TEXT) — "sharpen", "season", "descale", "replace_filter"
notes (TEXT)
```

#### `tool_consumables`
```
id (UUID, PK)
tool_id (UUID, FK → kitchen_tools)
consumable_name (TEXT) — "butane canister", "vacuum sealer bags", "paper filters"
quantity (REAL)
unit (TEXT)
min_quantity (REAL)
notes (TEXT)
```

#### `recipes`
```
id (UUID, PK)
user_id (UUID, FK → users)
name (TEXT, required)
description (TEXT)
servings (INTEGER, default 4)
prep_time_minutes (INTEGER)
cook_time_minutes (INTEGER)
total_time_minutes (INTEGER) — computed or manual
instructions (JSONB) — structured steps: [{step: 1, text: "...", duration_minutes: 5, technique: "sauté"}]
source_type (TEXT) — manual, url, youtube, image, ai_generated, family
source_url (TEXT)
source_attribution (TEXT) — "Mom's recipe", "Kenji López-Alt", cookbook name + page
tags (TEXT[]) — array: ["weeknight", "comfort", "japanese", "spicy", "meal_prep", "date_night"]
cuisine (TEXT) — japanese, mexican, italian, american, thai, indian, french, korean, chinese, etc.
difficulty (TEXT) — easy, medium, hard
dietary_flags (TEXT[]) — auto-calculated: ["gluten_free", "dairy_free", "vegetarian", "vegan", "low_carb", "keto", "nut_free"]
estimated_calories_per_serving (INTEGER) — AI-estimated
estimated_macros (JSONB) — {protein_g, carbs_g, fat_g, fiber_g}
rating (REAL) — 1-5, averaged from cook_logs
photo_url (TEXT)
is_favorite (BOOLEAN, default false)
version (INTEGER, default 1)
parent_recipe_id (UUID, FK → recipes, nullable) — for versioning
notes (TEXT)
```

#### `recipe_ingredients`
```
id (UUID, PK)
recipe_id (UUID, FK → recipes)
pantry_item_id (UUID, FK → pantry_items, nullable) — linked pantry item
ingredient_name (TEXT, required) — display name
canonical_name (TEXT) — normalized for matching: "garlic" matches "Garlic, Fresh (Christopher Ranch)"
quantity (REAL)
unit (TEXT)
preparation (TEXT) — "diced", "minced", "melted", "room temperature", "thinly sliced"
group_name (TEXT) — "For the marinade", "For the sauce", "For assembly"
sort_order (INTEGER)
optional (BOOLEAN, default false)
substitutions (TEXT) — AI-suggested alternatives
```

#### `recipe_tools`
```
id (UUID, PK)
recipe_id (UUID, FK → recipes)
tool_id (UUID, FK → kitchen_tools, nullable)
tool_name (TEXT, required)
optional (BOOLEAN, default false)
notes (TEXT) — "9-inch preferred" or "can use food processor instead"
```

#### `recipe_collections`
```
id (UUID, PK)
user_id (UUID, FK → users)
name (TEXT, required) — "Weeknight Under 30", "Date Night", "Using the Pizza Steel"
description (TEXT)
sort_order (INTEGER)
```

#### `recipe_collection_items`
```
collection_id (UUID, FK → recipe_collections)
recipe_id (UUID, FK → recipes)
sort_order (INTEGER)
PRIMARY KEY (collection_id, recipe_id)
```

#### `cook_logs`
```
id (UUID, PK)
recipe_id (UUID, FK → recipes)
user_id (UUID, FK → users)
cooked_date (DATE, required)
servings_made (INTEGER)
rating (REAL) — 1-5 for this specific cook
modifications (TEXT) — "reduced salt by half, added extra gochujang"
photo_url (TEXT)
notes (TEXT) — "Next time: toast the spices longer"
duration_minutes (INTEGER) — actual time it took
```

#### `meal_plans`
```
id (UUID, PK)
user_id (UUID, FK → users)
plan_date (DATE, required)
meal_type (TEXT, required) — breakfast, lunch, dinner, snack
recipe_id (UUID, FK → recipes, nullable)
custom_meal (TEXT) — for non-recipe meals: "Leftovers", "Eating out"
servings (INTEGER)
notes (TEXT)
completed (BOOLEAN, default false)
completed_at (TIMESTAMP)
leftover_portions (INTEGER) — how many servings left over after completion
leftover_plan_id (UUID, FK → meal_plans, nullable) — links to the meal that uses these leftovers
thaw_reminder_sent (BOOLEAN, default false)
prep_day_group (TEXT) — group meals for batch prep: "sunday_prep"
sort_order (INTEGER) — within same date/meal_type
```

#### `grocery_lists`
```
id (UUID, PK)
user_id (UUID, FK → users)
name (TEXT, required)
status (TEXT) — active, shopping, completed, archived
store (TEXT) — "Meijer", "Costco", "H Mart", "Specialty"
estimated_cost (REAL) — AI-estimated total
notes (TEXT)
```

#### `grocery_list_items`
```
id (UUID, PK)
list_id (UUID, FK → grocery_lists)
item_name (TEXT, required) — display name, with brand if known: "Swanson Chicken Broth"
canonical_name (TEXT) — for matching
quantity (REAL)
unit (TEXT)
category (TEXT) — store section for aisle grouping
store_section_order (INTEGER) — custom order matching user's store layout
pantry_item_id (UUID, FK → pantry_items, nullable)
estimated_price (REAL)
checked (BOOLEAN, default false)
checked_at (TIMESTAMP)
added_to_pantry (BOOLEAN, default false)
source (TEXT) — "meal_plan", "low_stock", "manual", "ai_suggestion"
notes (TEXT)
```

#### `waste_log`
```
id (UUID, PK)
user_id (UUID, FK → users)
pantry_item_id (UUID, FK → pantry_items, nullable)
item_name (TEXT)
quantity_wasted (REAL)
unit (TEXT)
reason (TEXT) — expired, spoiled, forgot, overcooked, didn't_like
wasted_date (DATE)
estimated_cost (REAL)
notes (TEXT)
```

#### `freshness_rules`
AI-populated reference table for shelf life knowledge.
```
id (UUID, PK)
canonical_name (TEXT) — "heavy cream", "cilantro", "ground beef"
category (TEXT)
sealed_shelf_life_days (INTEGER)
opened_shelf_life_days (INTEGER)
storage_location (TEXT) — optimal location
storage_tips (TEXT) — "wrap in damp paper towel"
freezable (BOOLEAN)
frozen_shelf_life_days (INTEGER)
source (TEXT) — "USDA", "AI estimate"
```

---

## API Architecture

### RESTful Endpoints (FastAPI)

Organize routes by module. All endpoints require JWT authentication except auth routes.

```
/api/v1/
├── auth/
│   ├── POST /register
│   ├── POST /login
│   ├── POST /refresh
│   └── GET  /me
│
├── pantry/
│   ├── GET    / (list, search, filter)
│   ├── POST   / (add item)
│   ├── GET    /{id}
│   ├── PATCH  /{id}
│   ├── DELETE /{id}
│   ├── POST   /{id}/adjust (adjust quantity +/-)
│   ├── POST   /{id}/open (mark as opened → triggers freshness recalc)
│   ├── POST   /{id}/waste (log waste and remove)
│   ├── GET    /expiring (items expiring within N days)
│   ├── GET    /low-stock
│   ├── GET    /freshness-dashboard (Use It or Lose It view)
│   └── POST   /import/receipt (AI receipt parsing)
│
├── tools/
│   ├── GET    / (list, search, filter)
│   ├── POST   /
│   ├── GET    /{id}
│   ├── PATCH  /{id}
│   ├── DELETE /{id}
│   ├── POST   /{id}/maintain (log maintenance)
│   ├── GET    /maintenance-due
│   └── GET    /{id}/consumables
│
├── recipes/
│   ├── GET    / (search, filter by tags/cuisine/time/dietary)
│   ├── POST   / (manual creation)
│   ├── GET    /{id}
│   ├── PATCH  /{id}
│   ├── DELETE /{id}
│   ├── POST   /{id}/version (create new version from existing)
│   ├── GET    /{id}/history (version history)
│   ├── POST   /{id}/cook (log a cook)
│   ├── GET    /{id}/cook-logs
│   ├── POST   /parse/url (AI: parse recipe from website URL)
│   ├── POST   /parse/youtube (AI: parse recipe from YouTube URL)
│   ├── POST   /parse/image (AI: parse recipe from photo)
│   ├── POST   /generate (AI: generate recipe from constraints)
│   └── POST   /{id}/scale (recalculate for different servings)
│
├── collections/
│   ├── GET    /
│   ├── POST   /
│   ├── PATCH  /{id}
│   ├── DELETE /{id}
│   ├── POST   /{id}/recipes (add recipe to collection)
│   └── DELETE /{id}/recipes/{recipe_id}
│
├── meal-plans/
│   ├── GET    / (by date range)
│   ├── POST   /
│   ├── PATCH  /{id}
│   ├── DELETE /{id}
│   ├── POST   /{id}/complete (mark complete → deduct inventory)
│   ├── POST   /generate (AI: generate meal plan for date range)
│   ├── GET    /thaw-reminders (upcoming items needing thaw)
│   └── GET    /prep-groups (batch prep grouping)
│
├── grocery/
│   ├── GET    / (all lists)
│   ├── POST   / (create list)
│   ├── GET    /{id}
│   ├── PATCH  /{id}
│   ├── DELETE /{id}
│   ├── POST   /{id}/items (add items)
│   ├── PATCH  /{id}/items/{item_id} (check off item)
│   ├── POST   /{id}/items/{item_id}/to-pantry (check off + add to pantry)
│   ├── POST   /generate-from-plan (auto-generate from meal plan)
│   └── POST   /{id}/split-by-store (split list into store-specific sublists)
│
├── ai/
│   ├── POST   /what-can-i-make (recipe suggestions from current pantry)
│   ├── POST   /freshness-check (batch freshness assessment)
│   ├── POST   /substitutions (find substitutes for missing ingredient)
│   ├── POST   /waste-analysis (patterns and suggestions)
│   ├── POST   /seasonal-suggestions (what's in season + recipe ideas)
│   ├── POST   /pantry-forecast (projected pantry after planned meals)
│   └── POST   /smart-suggestions (contextual suggestions based on current state)
│
└── import/
    ├── POST   /pantry/csv
    ├── POST   /tools/csv
    ├── POST   /recipes/csv
    └── POST   /google-doc (import from existing Google Doc format)
```

---

## AI Integration Layer

### Claude API Service

Create a centralized AI service class that wraps all Claude API calls. Use `claude-sonnet-4-5-20250929` for all features. Every AI call should include relevant context from the user's data.

```python
class KitchenAI:
    """All AI features powered by Claude API."""
    
    def __init__(self, anthropic_client):
        self.client = anthropic_client
        self.model = "claude-sonnet-4-5-20250929"
```

### AI Feature Specifications

#### 1. Recipe URL Parser
**Input:** URL string
**Process:** Use Claude with web search tool enabled to fetch and parse the recipe page.
**System prompt context:** "Extract a structured recipe from this URL. Return JSON with: name, description, servings, prep_time_minutes, cook_time_minutes, ingredients (array of {name, quantity, unit, preparation, optional, group_name}), instructions (array of {step, text, duration_minutes}), source_url, tags, cuisine, difficulty. Normalize ingredient names to common forms. Strip all non-recipe content."
**Output:** Structured recipe JSON matching the `recipes` + `recipe_ingredients` schema.

#### 2. YouTube Recipe Parser
**Input:** YouTube URL
**Process:** Use Claude with web search tool to access the video transcript/description. Parse into structured recipe format.
**System prompt context:** Same extraction format as URL parser. Additional instruction: "Parse the video transcript to extract ingredients with quantities (even if spoken casually), steps in order, timing cues, and any tips mentioned. If the creator specifies exact measurements vs. 'eyeballing it', note which are approximations."
**Output:** Structured recipe JSON.

#### 3. Image Recipe Parser
**Input:** Base64-encoded image (photo of recipe card, cookbook page, or handwritten recipe)
**Process:** Send image to Claude with vision. OCR and structure the content.
**System prompt context:** "This is a photo of a recipe. Extract all visible text and structure it into: name, ingredients with quantities and units, preparation steps, and any visible notes about servings, time, or source."
**Output:** Structured recipe JSON.

#### 4. Receipt Parser
**Input:** Base64-encoded image of grocery receipt
**Process:** Send to Claude with vision. Extract line items.
**System prompt context:** "Extract grocery items from this receipt image. For each item return: {name, quantity, unit (infer from context), price, brand (if visible)}. Map common abbreviations (e.g., 'ORG BNS CHKN BRST' → 'Organic Boneless Chicken Breast'). Group by likely store section."
**Output:** Array of pantry items ready for import.

#### 5. Freshness Calculator
**Input:** Pantry item details (name, category, storage location, opened_date, purchase_date, expiration_date)
**Process:** Claude assesses effective remaining freshness.
**System prompt context:** Provide the item details plus the `freshness_rules` table data if available. "Estimate the effective remaining shelf life of this item. Consider: storage method, whether it's been opened, category norms. Return: {freshness_status: 'fresh'|'use_soon'|'use_today'|'expired', effective_expiration_date: 'YYYY-MM-DD', confidence: 0-1, reasoning: '...', storage_tips: '...'}. For produce without printed dates, use purchase_date + typical shelf life for that item."
**Output:** Freshness assessment with status and reasoning.

#### 6. AI Recipe Generator
**Input:** Constraints object: {available_ingredients: [...], preferred_cuisine, max_time_minutes, dietary_restrictions, equipment_available: [...], difficulty, mood/description}
**Process:** Generate a novel recipe using the user's actual inventory.
**System prompt context:** Include the user's full pantry inventory and equipment list. "Generate a recipe using primarily ingredients the user already has. Reference ingredients by their exact pantry names. Only suggest equipment the user owns. Be creative but practical. Return structured recipe JSON."
**Output:** Complete structured recipe.

#### 7. AI Meal Plan Generator
**Input:** {date_range, preferences, constraints}
**Process:** Generate a multi-day meal plan optimizing for variety, freshness, nutrition, and user history.
**System prompt context:** Include: current pantry with freshness statuses, user's recipe collection with ratings and cook logs, recent meal history (last 2 weeks to avoid repeats), dietary preferences. "Generate a meal plan for the specified dates. Prioritize: (1) using items with 'use_soon' or 'use_today' freshness, (2) variety in cuisine and protein, (3) including at least one new/untried recipe per week, (4) respecting prep time constraints for weeknights. For each meal, specify recipe_id (existing) or generate a new recipe. Flag any items that need to be thawed and when."
**Output:** Array of meal plan entries with recipes and shopping needs.

#### 8. Smart Substitutions
**Input:** {missing_ingredient, recipe_context, available_pantry}
**Process:** Suggest substitutions from what the user actually has.
**System prompt context:** "The user is making [recipe] but is missing [ingredient]. Here is their current pantry. Suggest 1-3 substitutions from items they have, ranked by how well they'd work. Include quantity adjustments and any technique modifications needed."
**Output:** Array of substitution suggestions with confidence scores.

#### 9. Waste Analysis
**Input:** User's waste_log history
**Process:** Identify patterns and suggest improvements.
**System prompt context:** "Analyze this waste history. Identify: (1) most frequently wasted items, (2) total estimated cost of waste, (3) patterns (e.g., always wasting cilantro, buying too much produce on Mondays). Suggest specific actionable changes: buy smaller quantities, freeze portions, use specific storage techniques, adjust meal planning frequency."
**Output:** Structured analysis with insights and recommendations.

#### 10. Ingredient Normalizer
**Input:** Raw ingredient string from recipe (e.g., "2 cloves garlic, minced")
**Process:** Parse and normalize, then fuzzy-match against user's pantry.
**System prompt context:** Provide the user's full pantry item list with canonical_names. "Parse this ingredient string into {quantity, unit, canonical_name, preparation}. Then find the best matching item from the user's pantry. Return the match with a confidence score."
**Output:** Parsed ingredient with pantry match.

---

## Module Specifications

### Module 1: Food Inventory (Pantry Brain)

#### Views
1. **Main Inventory View** — Grouped by location (Fridge, Freezer, Pantry, etc.), searchable, filterable by category. Each item shows name, quantity, freshness status badge (color-coded dot: green/yellow/orange/red).
2. **Freshness Dashboard ("Use It or Lose It")** — Priority view showing items by urgency. Three sections: "Use Today" (red), "Use This Week" (orange), "Use Soon" (yellow). Each item links to recipes that use it.
3. **Low Stock View** — Items below min_quantity threshold. One-tap "Add to Grocery List."
4. **Category Browser** — Browse by category with item counts. Supports the user's custom categories like "Asian Pantry", "The Bar".

#### Actions
- **Add Item:** Manual form, barcode scan (mobile), receipt photo scan (AI), or voice input (mobile).
- **Quick Adjust:** Swipe or tap to adjust quantity (+/-) without opening full edit.
- **Mark Opened:** Sets `opened_date`, triggers background freshness recalculation via AI.
- **Log Waste:** When discarding, log reason and quantity. Removes from inventory, adds to waste_log.
- **Batch Import:** CSV upload or Google Doc import for initial setup.

#### Background Jobs
- **Daily Freshness Scan:** Celery task runs nightly. For each item with an opened_date or approaching expiration, call AI freshness calculator. Update `freshness_status` and `freshness_expires_at`. Push notifications for status changes.
- **Low Stock Alerts:** Check staple items against min_quantity. Generate notification if below threshold.

---

### Module 2: Equipment Inventory (Tool Shed)

#### Views
1. **Equipment List** — Grouped by category. Shows name, brand, condition badge, maintenance status.
2. **Maintenance Dashboard** — Items needing maintenance, sorted by urgency.
3. **Capabilities View** — Browse by what your equipment can do: "What can I sear with?", "What can I bake in?"
4. **Consumables Tracker** — Low-stock consumables linked to equipment.

#### Actions
- **Add Tool:** Form with category, brand, model, capabilities tags (multi-select), maintenance schedule.
- **Log Maintenance:** Record maintenance date, resets countdown timer.
- **Track Consumables:** Add/adjust consumable quantities. Auto-add to grocery list when low.

#### Integration Points
- Recipe creation shows which equipment you own vs. need.
- Recipe search can filter by "uses equipment I own."
- Recipe suggestions for underutilized specialty equipment.

---

### Module 3: Recipe Creation (Test Kitchen)

#### Input Methods
1. **Manual Entry** — Full form: name, description, servings, times, ingredients (with pantry auto-linking), equipment, instructions (step builder with drag-to-reorder), tags, cuisine, source, photo upload.
2. **URL Import** — Paste URL → AI parses → presents structured recipe for review/edit before saving.
3. **YouTube Import** — Paste YouTube URL → AI parses transcript → structured recipe for review.
4. **Photo Import** — Camera/upload photo → AI OCR → structured recipe for review.
5. **AI Generate** — Describe what you want ("quick Thai curry using my chicken thighs and coconut milk") → AI generates using your actual pantry/equipment → review and save.

#### Ingredient Entry UX
- As user types ingredient name, fuzzy-search pantry items and suggest matches.
- Auto-populate brand/unit from matched pantry item.
- Group ingredients by section (e.g., "For the sauce", "For the protein").
- Drag-to-reorder ingredients and groups.
- Toggle "optional" per ingredient.
- AI-suggested substitutions shown inline for each ingredient.

#### Auto-Calculations
- `total_time_minutes` = prep + cook (or manual override).
- `dietary_flags` auto-detected from ingredient list (scan for gluten, dairy, meat, etc.).
- `estimated_calories_per_serving` and `estimated_macros` via AI.
- `difficulty` suggested by AI based on techniques, ingredient count, total time.

---

### Module 4: Recipe Management (Cookbook)

#### Views
1. **Recipe Library** — Card grid or list view. Search by name, filter by: tags, cuisine, dietary flags, difficulty, max time, rating, source type. Sort by: name, rating, times cooked, recently added, recently cooked.
2. **Collections** — User-created folders. A recipe can be in multiple collections. Default collections: "Favorites", "Recently Cooked", "Quick Meals (<30 min)", "Untried".
3. **Recipe Detail** — Full recipe view with: photo, description, metadata, ingredient list (with pantry availability indicators — green check if in stock, yellow warning if low, red X if missing), equipment list (with ownership indicators), step-by-step instructions, cook log history, version history, nutritional info.
4. **Cook Mode** — Distraction-free step-by-step view. Large text, one step at a time, swipe to advance, built-in timers per step, screen stays on. On completion, prompt to log the cook.

#### Actions
- **Rate & Review** — After cooking, rate 1-5 stars, add notes, add photo.
- **Version** — "Tweak this recipe" creates a new version linked to parent. Shows diff.
- **Scale** — Adjust servings, all ingredient quantities recalculate. Remembers last scaling.
- **Share** — Generate shareable link or export as text/PDF.
- **"Can I Make This?"** — Instant check against current pantry. Shows what's missing. One-tap to add missing items to grocery list.

---

### Module 5: Meal Planning (Calendar)

#### Views
1. **Week View** — 7-day grid, rows for breakfast/lunch/dinner/snack. Each cell shows recipe name/photo or custom meal text. Drag-and-drop recipes from a sidebar recipe picker. Color-coded borders by cuisine or dietary type.
2. **Month View** — Overview showing which days have meals planned. Tap to see day detail.
3. **Day View** — Detailed single-day view with all meals, total nutrition, and prep timeline.
4. **Prep Planner** — For batch cooking: shows grouped prep tasks across multiple recipes. "Sunday Prep: dice 4 onions (used in 3 meals), make marinade base (used in 2 meals), cook rice (3 cups total for the week)."

#### Actions
- **Manual Plan:** Drag recipe from library to calendar slot.
- **AI Plan:** "Plan my week" → AI generates complete meal plan considering: freshness urgency, variety, cook history, time constraints, and preferences. User can accept, regenerate, or edit individual meals.
- **Complete Meal:** Mark as eaten → deducts ingredients from pantry (scaled to servings). Prompt: "Any leftovers?" → logs leftover_portions. If leftovers, suggest repurpose recipe for later in the week.
- **Thaw Reminders:** Background job scans upcoming meals for frozen ingredients. Sends push notification 24-48 hours before needed: "Move salmon to fridge tonight for Wednesday's dinner."
- **Copy Week:** Duplicate a week's plan to another week.
- **Swap Meals:** Drag to reorder or swap between days.

#### Smart Features
- **Leftover Intelligence:** When a recipe yields more servings than planned, system tracks leftover_portions. AI suggests repurpose meals: "You'll have 4 portions of pulled pork — how about pulled pork tacos on Thursday?"
- **Nutrition Summary:** Daily/weekly macro and calorie totals from planned meals.
- **Pantry Forecast:** Show projected pantry state at end of planned period. Highlight items that will run out.

---

### Module 6: Grocery Lists (Shopping Run)

#### Views
1. **Active Lists** — Current shopping lists. One primary "active" list, plus store-specific sublists.
2. **List Detail** — Items grouped by store section, ordered by user's custom aisle order. Each item shows: name (with brand), quantity, unit, checkbox, estimated price, source badge (meal_plan, low_stock, manual).
3. **Shopping Mode** — Streamlined check-off view. Large tap targets. Running total. As items are checked, prompt: "Add to pantry?" → auto-adds with today's date.
4. **List History** — Past completed lists for reference and re-use.

#### Actions
- **Auto-Generate from Meal Plan:** Select date range → system calculates all needed ingredients, subtracts pantry stock, generates list with brand preferences. Shows cost estimate.
- **Add Manual Items:** Quick-add with autocomplete from pantry history.
- **Low Stock Auto-Add:** Staple items below min_quantity automatically appear in a "Restock" section.
- **Split by Store:** AI groups items by likely store (specialty items at H Mart, bulk at Costco, regular at Meijer). Creates separate sublists per store.
- **Check Off + Pantry:** Checking off an item optionally adds it to pantry with quantity purchased and today's purchase_date.
- **Share List:** Generate shareable link for household members.
- **Recurring Lists:** Save a list as a template for repeated use.

#### Smart Features
- **Price Tracking:** Optionally log price when checking off. Over time, builds price history for cost estimation.
- **Preferred Brands:** When generating from meal plan, use the brand stored in pantry item or preferred_brand field. "Chicken Broth" → "Swanson Chicken Broth (32 oz)".
- **Smart Quantities:** AI rounds up to buyable quantities. If you need 3 oz of cream cheese, it lists 8 oz (standard package size).

---

## Cross-Cutting Features

### "Use It or Lose It" Dashboard (Home Screen Widget)
The app's home/dashboard should prominently feature:
1. **Freshness Alerts** — Top 5 items needing attention, with recipe suggestions for each.
2. **Today's Meals** — What's planned for today with a "Start Cooking" button.
3. **Grocery Status** — Active list item count, next planned shopping trip.
4. **Quick Stats** — Items in pantry, recipes saved, meals planned this week.
5. **AI Tip of the Day** — Contextual suggestion: seasonal ingredient, waste reduction tip, or recipe recommendation.

### Waste Tracker & Analytics
- Dashboard showing: waste by category over time (chart), most wasted items (ranked), estimated cost of waste per month, trend (improving or worsening).
- AI-generated insights: "You've thrown away cilantro 4 of the last 6 times you bought it. Try buying half bunches or freezing in oil within 3 days of purchase."

### Seasonal & Local Awareness
- AI knows Michigan seasonality.
- "In Season Now" section suggesting recipes featuring seasonal produce.
- Can influence AI meal plan generation: "prioritize seasonal ingredients."

### Notification System (Mobile)
- Freshness alerts: "Your avocados are ripe — use today!"
- Thaw reminders: "Move the chicken thighs to the fridge for tomorrow's dinner."
- Maintenance reminders: "Time to sharpen your Global knives."
- Meal reminders: "Tonight's dinner: Herb Roasted Chicken. Prep starts in 1 hour."
- Low stock: "You're almost out of eggs (2 remaining)."

---

## Data Import Pipeline

### Initial Setup: Import from Google Docs
The user has two comprehensive Google Docs with current inventory. Build an import endpoint that:

1. Accepts Google Doc content (pasted text or fetched via API).
2. Sends to Claude AI with structured extraction prompt: "Parse this kitchen inventory document. It's organized by location/category with items listed underneath. Extract each item as: {name, category, subcategory, quantity (if stated), unit (if stated), location, brand (if mentioned), notes}. The document uses informal formatting — item names may include brand names in parentheses, quantities may be approximate, and some items are grouped under headers like 'The Fridge: Produce' or 'The Freezer: Meats'."
3. Returns parsed items for user review before bulk insert.
4. Handles the equipment doc similarly: parse into kitchen_tools records.

### CSV Import
Maintain existing CSV import functionality for structured data import.

---

## Build Phases (for Claude Code)

### Phase 1: Foundation
- Initialize monorepo structure (backend/ + web/ + mobile/)
- Set up PostgreSQL database with all migrations via Alembic
- Implement FastAPI backend with auth and all CRUD endpoints
- Set up the Anthropic Claude API service wrapper
- Build basic web UI with Next.js: navigation shell, pantry list/add/edit, tools list/add/edit

### Phase 2: Recipe System
- Recipe CRUD (manual creation with full form)
- AI recipe parsers (URL, YouTube, image)
- AI recipe generator
- Ingredient normalization and pantry auto-linking
- Recipe search/filter/sort
- Collections CRUD
- Cook logging

### Phase 3: Meal Planning & Grocery
- Calendar views (week/month/day)
- Drag-and-drop meal planning
- Meal completion with inventory deduction
- AI meal plan generator
- Grocery list auto-generation from meal plan
- Grocery list CRUD with check-off → pantry flow
- Store splitting and brand preferences

### Phase 4: AI Intelligence Layer
- Freshness engine (background jobs + dashboard)
- Use It or Lose It dashboard
- Waste tracking and analytics
- Smart substitutions
- Seasonal awareness
- Pantry forecast
- Notification system

### Phase 5: Mobile App
- React Native/Expo project setup
- Shared API client
- All screens matching web functionality
- Camera integration (barcode scan, receipt scan, recipe photo scan)
- Push notifications
- Offline grocery list access

### Phase 6: Polish & Import
- Google Doc import pipeline
- CSV import/export
- PWA setup for web
- Cook mode (step-by-step)
- Recipe sharing
- Analytics dashboard
- Performance optimization

---

## Project Structure

```
kitchen-command-center/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app init
│   │   ├── config.py               # Settings, env vars
│   │   ├── database.py             # DB connection, session
│   │   ├── models/                 # SQLAlchemy models
│   │   │   ├── user.py
│   │   │   ├── pantry.py
│   │   │   ├── tool.py
│   │   │   ├── recipe.py
│   │   │   ├── meal_plan.py
│   │   │   ├── grocery.py
│   │   │   └── waste.py
│   │   ├── schemas/                # Pydantic schemas (request/response)
│   │   │   ├── pantry.py
│   │   │   ├── tool.py
│   │   │   ├── recipe.py
│   │   │   ├── meal_plan.py
│   │   │   └── grocery.py
│   │   ├── routers/                # API route handlers
│   │   │   ├── auth.py
│   │   │   ├── pantry.py
│   │   │   ├── tools.py
│   │   │   ├── recipes.py
│   │   │   ├── collections.py
│   │   │   ├── meal_plans.py
│   │   │   ├── grocery.py
│   │   │   ├── ai.py
│   │   │   └── import_export.py
│   │   ├── services/               # Business logic
│   │   │   ├── kitchen_ai.py       # Claude API integration
│   │   │   ├── freshness.py        # Freshness calculation engine
│   │   │   ├── grocery_generator.py
│   │   │   ├── meal_planner.py
│   │   │   ├── ingredient_matcher.py  # Fuzzy matching / normalization
│   │   │   └── waste_analytics.py
│   │   ├── tasks/                  # Celery background tasks
│   │   │   ├── freshness_scan.py
│   │   │   └── notifications.py
│   │   └── utils/
│   │       ├── auth.py             # JWT helpers
│   │       └── pagination.py
│   ├── alembic/                    # Database migrations
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── web/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Dashboard / home
│   │   ├── pantry/
│   │   │   ├── page.tsx            # Inventory list
│   │   │   └── [id]/page.tsx       # Item detail
│   │   ├── tools/
│   │   ├── recipes/
│   │   │   ├── page.tsx            # Recipe library
│   │   │   ├── new/page.tsx        # Create recipe (all input methods)
│   │   │   ├── [id]/page.tsx       # Recipe detail
│   │   │   └── [id]/cook/page.tsx  # Cook mode
│   │   ├── meal-plan/
│   │   │   └── page.tsx            # Calendar view
│   │   ├── grocery/
│   │   │   ├── page.tsx            # Lists
│   │   │   └── [id]/page.tsx       # List detail / shopping mode
│   │   └── analytics/
│   │       └── page.tsx            # Waste tracker, stats
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── pantry/
│   │   ├── recipes/
│   │   ├── meal-plan/
│   │   ├── grocery/
│   │   └── shared/
│   ├── lib/
│   │   ├── api-client.ts           # Generated API client
│   │   ├── stores/                 # Zustand stores
│   │   └── utils.ts
│   ├── public/
│   ├── tailwind.config.ts
│   └── package.json
│
├── mobile/
│   ├── app/                        # Expo Router
│   │   ├── (tabs)/
│   │   │   ├── index.tsx           # Dashboard
│   │   │   ├── pantry.tsx
│   │   │   ├── recipes.tsx
│   │   │   ├── meal-plan.tsx
│   │   │   └── grocery.tsx
│   │   ├── pantry/[id].tsx
│   │   ├── recipes/[id].tsx
│   │   ├── recipes/new.tsx
│   │   ├── recipes/[id]/cook.tsx
│   │   ├── grocery/[id].tsx
│   │   └── scan.tsx                # Camera/barcode scanner
│   ├── components/
│   ├── lib/
│   │   ├── api-client.ts           # Shared with web
│   │   └── stores/
│   ├── app.json
│   └── package.json
│
├── shared/
│   ├── types/                      # TypeScript interfaces shared web + mobile
│   ├── schemas/                    # Zod validation schemas
│   └── constants/                  # Shared enums, categories, units
│
├── docker-compose.yml              # PostgreSQL + Redis + Backend
├── .env.example
└── README.md
```

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/kitchen_command
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<generate-secure-key>
JWT_EXPIRY_HOURS=24

# Anthropic
ANTHROPIC_API_KEY=<your-anthropic-api-key>
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Storage
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE_MB=10

# App
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:8000
```

---

## Key Implementation Notes

1. **Ingredient Matching is Critical.** The `canonical_name` field and the AI ingredient normalizer are the glue that makes everything work. Every recipe ingredient must be matchable to a pantry item for inventory deduction, grocery generation, and "what can I make?" to function. Invest heavily in the fuzzy matching service — it should handle variations like "garlic" matching "Garlic, Fresh (Christopher Ranch)" and "garlic cloves" and "fresh garlic."

2. **AI Calls Should Be Async.** Recipe parsing, freshness calculations, and meal plan generation can take several seconds. Use background tasks where possible and streaming responses for interactive features.

3. **Offline-First Grocery Lists.** The grocery list must work offline (PWA service worker for web, AsyncStorage for mobile). Queue check-off actions and sync when online.

4. **Serving Scaling Math.** When a meal plan entry specifies different servings than the recipe's base, all ingredient quantities must be scaled proportionally for both grocery generation AND pantry deduction. Use `(meal_servings / recipe_base_servings)` as the multiplier.

5. **Freshness Rules Bootstrapping.** Pre-populate the `freshness_rules` table with USDA data for common items. For items not in the table, the AI estimates on first encounter and the result is cached to the table.

6. **Unit Conversions.** The system needs a unit conversion layer for intelligent matching: "2 cups of flour" in a recipe vs. "5 lb bag of flour" in pantry. Build a conversion table for volume-to-weight by ingredient category.

7. **The Existing Kitchen Manager Skill.** The existing Python SQLite code in the kitchen-manager skill can serve as a reference implementation. The core logic (what_can_i_make, generate_grocery_list_from_meal_plan, complete_meal deduction) is already battle-tested — port that logic to the new PostgreSQL/SQLAlchemy backend.
