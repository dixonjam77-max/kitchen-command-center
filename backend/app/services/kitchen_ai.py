"""
KitchenAI — Claude API integration service.

All AI features for Kitchen Command Center are routed through this class.
"""

import json
import re
from functools import lru_cache

from app.config import get_settings

RECIPE_JSON_SCHEMA = """\
Return valid JSON matching this exact structure:
{
  "name": "string",
  "description": "string or null",
  "servings": integer,
  "prep_time_minutes": integer or null,
  "cook_time_minutes": integer or null,
  "total_time_minutes": integer or null,
  "instructions": [{"step": 1, "text": "...", "duration_minutes": null, "technique": null}, ...],
  "ingredients": [{"ingredient_name": "...", "quantity": number or null, "unit": "string or null", "preparation": "string or null", "group_name": "string or null", "optional": false}, ...],
  "tools": [{"tool_name": "...", "optional": false, "notes": null}, ...],
  "tags": ["string", ...],
  "cuisine": "string or null",
  "difficulty": "easy|medium|hard",
  "dietary_flags": ["gluten_free", "dairy_free", "vegetarian", "vegan", "low_carb", "keto", "nut_free"],
  "source_attribution": "string or null"
}
Only include dietary_flags that actually apply. Normalize ingredient names to common forms (e.g., "garlic" not "fresh garlic cloves"). Return ONLY the JSON, no markdown fences or extra text."""


def _extract_json(text: str) -> dict:
    """Extract JSON from Claude response, handling markdown fences."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    return json.loads(text)


class KitchenAI:
    """All AI features powered by the Anthropic Claude API."""

    def __init__(self):
        settings = get_settings()
        self.model = settings.CLAUDE_MODEL
        self.api_key = settings.ANTHROPIC_API_KEY
        self._client = None

    @property
    def client(self):
        if self._client is None and self.api_key:
            import anthropic
            self._client = anthropic.Anthropic(api_key=self.api_key)
        return self._client

    async def _call_claude(
        self, system: str, user_message: str, max_tokens: int = 4096
    ) -> str:
        """Make a call to the Claude API. Returns the text response."""
        if not self.client:
            raise RuntimeError("Anthropic API key not configured")
        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    async def _call_claude_with_image(
        self, system: str, text: str, image_base64: str, media_type: str = "image/jpeg", max_tokens: int = 4096
    ) -> str:
        """Call Claude with an image (vision)."""
        if not self.client:
            raise RuntimeError("Anthropic API key not configured")
        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_base64}},
                    {"type": "text", "text": text},
                ],
            }],
        )
        return response.content[0].text

    # ── Phase 2: Recipe Parsers ──────────────────────────────────────

    async def parse_recipe_url(self, url: str) -> dict:
        """Parse a recipe from a website URL into structured JSON."""
        system = (
            "You are a recipe extraction expert. Extract a structured recipe from the content "
            "the user provides. " + RECIPE_JSON_SCHEMA
        )
        user_msg = (
            f"Please fetch and parse the recipe from this URL: {url}\n\n"
            "Extract all recipe information including ingredients with exact quantities, "
            "step-by-step instructions, timing, servings, and any attribution. "
            "If you cannot access the URL, return your best interpretation of what the URL likely contains "
            "based on its structure, or return an error in the description field."
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def parse_recipe_youtube(self, url: str) -> dict:
        """Parse a recipe from a YouTube video transcript."""
        system = (
            "You are a recipe extraction expert. Parse a recipe from a YouTube video description/transcript. "
            "Extract ingredients with quantities (even if spoken casually), steps in order, timing cues, "
            "and any tips mentioned. Note which measurements are approximations. " + RECIPE_JSON_SCHEMA
        )
        user_msg = (
            f"Parse the recipe from this YouTube video: {url}\n\n"
            "Extract the full recipe with all ingredients and steps. "
            "If the creator eyeballs measurements, provide your best estimate with a note."
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def parse_recipe_image(self, image_base64: str, media_type: str = "image/jpeg") -> dict:
        """OCR and parse a recipe from a photo."""
        system = (
            "You are a recipe OCR and extraction expert. Extract all visible text from this recipe photo "
            "and structure it into a complete recipe. " + RECIPE_JSON_SCHEMA
        )
        text = await self._call_claude_with_image(
            system,
            "This is a photo of a recipe (cookbook page, recipe card, or handwritten). "
            "Extract all visible text and structure it into a complete recipe with ingredients, instructions, and metadata.",
            image_base64,
            media_type,
        )
        return _extract_json(text)

    async def parse_receipt(self, image_base64: str, media_type: str = "image/jpeg") -> list[dict]:
        """Extract grocery items from a receipt photo."""
        system = (
            "You are a grocery receipt parser. Extract line items from the receipt image. "
            "For each item return JSON array: [{\"name\": \"...\", \"quantity\": number, "
            "\"unit\": \"string or null\", \"price\": number or null, \"brand\": \"string or null\", "
            "\"category\": \"string or null\"}]. "
            "Map abbreviations to full names (e.g., 'ORG BNS CHKN BRST' -> 'Organic Boneless Chicken Breast'). "
            "Return ONLY the JSON array."
        )
        text = await self._call_claude_with_image(
            system,
            "Extract all grocery items from this receipt image.",
            image_base64,
            media_type,
        )
        return _extract_json(text)

    # ── Phase 2: Recipe Generator ────────────────────────────────────

    async def generate_recipe(
        self, constraints: dict, pantry: list[dict], tools: list[dict]
    ) -> dict:
        """Generate a novel recipe using the user's actual inventory."""
        system = (
            "You are a creative chef. Generate a recipe using primarily ingredients the user already has. "
            "Reference ingredients by their exact pantry names. Only suggest equipment the user owns. "
            "Be creative but practical. " + RECIPE_JSON_SCHEMA
        )
        pantry_summary = "\n".join(
            f"- {p.get('name', '?')} ({p.get('quantity', '?')} {p.get('unit', '')})"
            for p in pantry[:80]
        ) or "Pantry is empty."

        tools_summary = "\n".join(
            f"- {t.get('name', '?')} ({', '.join(t.get('capabilities', []))})"
            for t in tools[:40]
        ) or "No tools listed."

        constraint_lines = []
        if constraints.get("preferred_cuisine"):
            constraint_lines.append(f"Preferred cuisine: {constraints['preferred_cuisine']}")
        if constraints.get("max_time_minutes"):
            constraint_lines.append(f"Max total time: {constraints['max_time_minutes']} minutes")
        if constraints.get("difficulty"):
            constraint_lines.append(f"Difficulty: {constraints['difficulty']}")
        if constraints.get("dietary_restrictions"):
            constraint_lines.append(f"Dietary restrictions: {', '.join(constraints['dietary_restrictions'])}")
        if constraints.get("description"):
            constraint_lines.append(f"Description/mood: {constraints['description']}")

        user_msg = (
            f"Generate a recipe with these constraints:\n"
            f"{chr(10).join(constraint_lines) or 'No specific constraints.'}\n\n"
            f"Available pantry items:\n{pantry_summary}\n\n"
            f"Available equipment:\n{tools_summary}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    # ── Phase 2: Ingredient Normalizer ───────────────────────────────

    async def normalize_ingredient(
        self, raw: str, pantry_items: list[dict]
    ) -> dict:
        """Parse and normalize an ingredient string, fuzzy-match to pantry."""
        pantry_names = [
            {"name": p.get("name", ""), "canonical_name": p.get("canonical_name", ""), "id": p.get("id", "")}
            for p in pantry_items[:100]
        ]
        system = (
            "You are an ingredient parser. Parse the raw ingredient string into structured data "
            "and find the best matching item from the user's pantry. Return JSON:\n"
            '{"ingredient_name": "...", "canonical_name": "...", "quantity": number or null, '
            '"unit": "string or null", "preparation": "string or null", '
            '"pantry_match": {"id": "uuid or null", "name": "string or null", "confidence": 0.0-1.0}}\n'
            "Return ONLY the JSON."
        )
        user_msg = (
            f"Parse this ingredient: \"{raw}\"\n\n"
            f"User's pantry items:\n{json.dumps(pantry_names, indent=2)}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=1024)
        return _extract_json(text)

    # ── Phase 3: Meal Planning ────────────────────────────────────────

    async def generate_meal_plan(
        self,
        date_range: dict,
        pantry: list[dict],
        recipes: list[dict],
        history: list[dict],
        preferences: dict,
    ) -> list[dict]:
        """Generate a multi-day meal plan considering pantry, recipes, history, and preferences."""
        system = (
            "You are a meal planning expert. Generate a practical meal plan for the specified date range. "
            "Prioritize: (1) using items with 'use_soon' or 'use_today' freshness status, "
            "(2) variety in cuisine and protein, (3) recipes the user hasn't cooked recently, "
            "(4) respecting time constraints for weeknights (under 45 min). "
            "For each meal, specify either a recipe_id from the user's collection or suggest a custom_meal description. "
            "Return a JSON array of meal plan entries:\n"
            '[{"plan_date": "YYYY-MM-DD", "meal_type": "breakfast|lunch|dinner|snack", '
            '"recipe_id": "uuid or null", "recipe_name": "string", "custom_meal": "string or null", '
            '"servings": integer, "notes": "string or null"}]\n'
            "Return ONLY the JSON array."
        )

        pantry_summary = "\n".join(
            f"- {p.get('name', '?')} ({p.get('quantity', '?')} {p.get('unit', '')}) [{p.get('freshness_status', 'fresh')}]"
            for p in pantry[:80]
        ) or "Pantry is empty."

        recipe_summary = "\n".join(
            f"- {r.get('id', '?')}: {r.get('name', '?')} ({r.get('cuisine', '?')}, {r.get('total_time_minutes', '?')} min, {r.get('difficulty', '?')})"
            for r in recipes[:60]
        ) or "No recipes saved."

        history_summary = "\n".join(
            f"- {h.get('recipe_name', '?')} on {h.get('plan_date', '?')}"
            for h in history[:30]
        ) or "No recent meal history."

        pref_lines = []
        if preferences.get("preferred_cuisines"):
            pref_lines.append(f"Preferred cuisines: {', '.join(preferences['preferred_cuisines'])}")
        if preferences.get("max_weeknight_time"):
            pref_lines.append(f"Max weeknight cook time: {preferences['max_weeknight_time']} minutes")
        if preferences.get("dietary_restrictions"):
            pref_lines.append(f"Dietary restrictions: {', '.join(preferences['dietary_restrictions'])}")
        if preferences.get("meals_per_day"):
            pref_lines.append(f"Meals to plan: {', '.join(preferences['meals_per_day'])}")

        user_msg = (
            f"Generate a meal plan from {date_range.get('start_date', '?')} to {date_range.get('end_date', '?')}.\n\n"
            f"Preferences:\n{chr(10).join(pref_lines) or 'No specific preferences.'}\n\n"
            f"Current pantry (prioritize use_soon/use_today items):\n{pantry_summary}\n\n"
            f"User's recipe collection:\n{recipe_summary}\n\n"
            f"Recent meal history (avoid repeats):\n{history_summary}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def generate_grocery_from_plan(
        self,
        meal_plans: list[dict],
        pantry: list[dict],
        preferences: dict,
    ) -> list[dict]:
        """Generate a grocery list from meal plan, subtracting pantry stock and using brand preferences."""
        system = (
            "You are a grocery list generator. Given a meal plan with recipes and a pantry inventory, "
            "calculate what needs to be purchased. Subtract items already in stock. Use preferred brands "
            "when available. Round up to buyable quantities (e.g., need 3 oz cream cheese → list 8 oz package). "
            "Return a JSON array of grocery items:\n"
            '[{"item_name": "Brand Name (size)", "canonical_name": "generic name", "quantity": number, '
            '"unit": "string", "category": "store section", "estimated_price": number or null, '
            '"source": "meal_plan", "notes": "for Recipe Name"}]\n'
            "Group by store section. Return ONLY the JSON array."
        )

        plan_summary = "\n".join(
            f"- {m.get('recipe_name', m.get('custom_meal', '?'))} ({m.get('servings', '?')} servings, {m.get('plan_date', '?')}): "
            f"Ingredients: {', '.join(i.get('ingredient_name', '?') + ' (' + str(i.get('quantity', '?')) + ' ' + str(i.get('unit', '')) + ')' for i in m.get('ingredients', []))}"
            for m in meal_plans
        ) or "No meals planned."

        pantry_summary = "\n".join(
            f"- {p.get('name', '?')} ({p.get('quantity', '?')} {p.get('unit', '')}) brand={p.get('preferred_brand') or p.get('brand', 'any')}"
            for p in pantry[:80]
        ) or "Pantry is empty."

        user_msg = (
            f"Generate a grocery list for these planned meals:\n{plan_summary}\n\n"
            f"Current pantry stock (subtract these):\n{pantry_summary}\n\n"
            f"Use preferred brands where known. Round up to standard package sizes."
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def split_grocery_by_store(
        self, items: list[dict], stores: list[str] | None = None,
    ) -> dict:
        """Split a grocery list into store-specific sublists."""
        system = (
            "You are a grocery shopping optimizer. Split this grocery list into store-specific sublists. "
            "Consider: specialty items go to specialty stores (H Mart for Asian ingredients, etc.), "
            "bulk items to warehouse stores (Costco), and regular items to the primary grocery store. "
            "Return JSON: {\"stores\": {\"Store Name\": [{item}, ...], ...}}\n"
            "Each item keeps all its original fields. Return ONLY the JSON."
        )
        store_hint = f"Available stores: {', '.join(stores)}" if stores else "Use common store types (Main Grocery, Asian Market, Specialty, Bulk/Warehouse)."
        items_text = json.dumps(items, indent=2)
        user_msg = f"{store_hint}\n\nGrocery items to split:\n{items_text}"
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    # ── Phase 4: AI Intelligence Layer ──────────────────────────────

    async def calculate_freshness(self, item: dict, rules: dict | None = None) -> dict:
        """Assess effective remaining freshness for a single pantry item."""
        system = (
            "You are a food safety and freshness expert. Estimate the effective remaining shelf life "
            "of this food item. Consider: storage method, whether it's been opened, category norms, "
            "and USDA guidelines. Return JSON:\n"
            '{"freshness_status": "fresh|use_soon|use_today|expired", '
            '"effective_expiration_date": "YYYY-MM-DD", '
            '"confidence": 0.0-1.0, '
            '"reasoning": "brief explanation", '
            '"storage_tips": "how to maximize remaining life"}\n'
            "Return ONLY the JSON."
        )
        rules_text = ""
        if rules:
            rules_text = (
                f"\n\nKnown shelf life data for this item type:\n"
                f"- Sealed shelf life: {rules.get('sealed_shelf_life_days', '?')} days\n"
                f"- Opened shelf life: {rules.get('opened_shelf_life_days', '?')} days\n"
                f"- Optimal storage: {rules.get('storage_location', '?')}\n"
                f"- Freezable: {rules.get('freezable', '?')}\n"
                f"- Storage tips: {rules.get('storage_tips', '?')}"
            )
        user_msg = (
            f"Assess freshness for this item:\n"
            f"- Name: {item.get('name', '?')}\n"
            f"- Category: {item.get('category', '?')}\n"
            f"- Storage location: {item.get('location', '?')}\n"
            f"- Purchase date: {item.get('purchase_date', 'unknown')}\n"
            f"- Expiration date: {item.get('expiration_date', 'none printed')}\n"
            f"- Opened date: {item.get('opened_date', 'not opened')}\n"
            f"- Current quantity: {item.get('quantity', '?')} {item.get('unit', '')}"
            f"{rules_text}\n\nToday's date: {item.get('today', '?')}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=1024)
        return _extract_json(text)

    async def check_freshness_batch(self, items: list[dict]) -> list[dict]:
        """Batch freshness check for multiple items at once."""
        system = (
            "You are a food safety expert. Assess freshness for each item in the list. "
            "Return a JSON array with one entry per item:\n"
            '[{"item_id": "...", "freshness_status": "fresh|use_soon|use_today|expired", '
            '"effective_expiration_date": "YYYY-MM-DD", "confidence": 0.0-1.0, '
            '"reasoning": "brief", "storage_tips": "optional tip"}]\n'
            "Return ONLY the JSON array."
        )
        items_text = "\n".join(
            f"- ID={i.get('id','?')}: {i.get('name','?')} | cat={i.get('category','?')} | "
            f"loc={i.get('location','?')} | purchased={i.get('purchase_date','?')} | "
            f"expires={i.get('expiration_date','none')} | opened={i.get('opened_date','no')} | "
            f"qty={i.get('quantity','?')} {i.get('unit','')}"
            for i in items
        )
        user_msg = f"Assess freshness for these items (today's date: {items[0].get('today', '?')}):\n{items_text}"
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def suggest_substitutions(self, missing: str, recipe: dict, pantry: list[dict]) -> list[dict]:
        """Suggest substitutions from user's pantry for a missing ingredient."""
        system = (
            "You are a culinary substitution expert. The user is missing an ingredient for a recipe. "
            "Suggest 1-3 substitutions from items they actually have in their pantry. "
            "Rank by how well they'd work. Include quantity adjustments and technique modifications. "
            "Return JSON array:\n"
            '[{"substitute_name": "...", "pantry_item_id": "uuid or null", '
            '"quantity": number, "unit": "string", '
            '"confidence": 0.0-1.0, "notes": "technique adjustments", '
            '"flavor_impact": "brief description of how taste will differ"}]\n'
            "Return ONLY the JSON array."
        )
        pantry_summary = "\n".join(
            f"- {p.get('name','?')} (id={p.get('id','?')}, {p.get('quantity','?')} {p.get('unit','')}) [{p.get('category','?')}]"
            for p in pantry[:80]
        ) or "Pantry is empty."

        user_msg = (
            f"Missing ingredient: {missing}\n"
            f"Recipe: {recipe.get('name', '?')}\n"
            f"Recipe description: {recipe.get('description', 'N/A')}\n"
            f"Other ingredients in recipe: {', '.join(i.get('ingredient_name', '?') for i in recipe.get('ingredients', []))}\n\n"
            f"User's pantry:\n{pantry_summary}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=2048)
        return _extract_json(text)

    async def analyze_waste(self, waste_logs: list[dict]) -> dict:
        """Analyze waste patterns and suggest improvements."""
        system = (
            "You are a food waste reduction expert. Analyze this waste history and provide actionable insights. "
            "Return JSON:\n"
            '{"total_items_wasted": integer, "total_estimated_cost": number, '
            '"most_wasted_items": [{"name": "...", "count": integer, "total_cost": number}], '
            '"patterns": ["pattern description", ...], '
            '"recommendations": [{"title": "short title", "description": "actionable suggestion", "priority": "high|medium|low"}], '
            '"waste_by_reason": {"expired": integer, "spoiled": integer, "forgot": integer, "overcooked": integer, "didnt_like": integer}, '
            '"waste_by_category": {"produce": number, "dairy": number, ...}, '
            '"trend": "improving|worsening|stable", '
            '"monthly_summary": [{"month": "YYYY-MM", "cost": number, "count": integer}]}\n'
            "Return ONLY the JSON."
        )
        logs_text = "\n".join(
            f"- {l.get('item_name','?')} | qty={l.get('quantity_wasted','?')} {l.get('unit','')} | "
            f"reason={l.get('reason','?')} | cost=${l.get('estimated_cost',0) or 0:.2f} | "
            f"date={l.get('wasted_date','?')} | category={l.get('category','?')}"
            for l in waste_logs
        ) or "No waste logged yet."

        user_msg = f"Analyze this waste history ({len(waste_logs)} entries):\n{logs_text}"
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def what_can_i_make(self, pantry: list[dict], tools: list[dict], preferences: dict) -> list[dict]:
        """Suggest recipes from current pantry and equipment."""
        system = (
            "You are a creative chef. Suggest 5-8 recipes the user can make RIGHT NOW with what they have. "
            "Prioritize items that need to be used soon (use_today, use_soon freshness). "
            "Only suggest equipment the user owns. Return JSON array:\n"
            '[{"name": "Recipe Name", "description": "brief", "difficulty": "easy|medium|hard", '
            '"total_time_minutes": integer, "uses_expiring": ["item1", "item2"], '
            '"missing_items": ["item that would be nice but not required"], '
            '"key_ingredients": ["main items from pantry"], '
            '"cuisine": "string", "meal_type": "breakfast|lunch|dinner|snack"}]\n'
            "Return ONLY the JSON array."
        )
        pantry_summary = "\n".join(
            f"- {p.get('name','?')} ({p.get('quantity','?')} {p.get('unit','')}) [{p.get('freshness_status','fresh')}] loc={p.get('location','?')}"
            for p in pantry[:80]
        ) or "Pantry is empty."

        tools_summary = "\n".join(
            f"- {t.get('name','?')} ({', '.join(t.get('capabilities', []))})"
            for t in tools[:40]
        ) or "No tools listed."

        pref_lines = []
        if preferences.get("dietary_restrictions"):
            pref_lines.append(f"Dietary: {', '.join(preferences['dietary_restrictions'])}")
        if preferences.get("max_time_minutes"):
            pref_lines.append(f"Max time: {preferences['max_time_minutes']} min")
        if preferences.get("preferred_cuisine"):
            pref_lines.append(f"Cuisine preference: {preferences['preferred_cuisine']}")
        if preferences.get("meal_type"):
            pref_lines.append(f"Meal type: {preferences['meal_type']}")

        user_msg = (
            f"What can I make with these ingredients and tools?\n\n"
            f"Preferences:\n{chr(10).join(pref_lines) or 'No specific preferences.'}\n\n"
            f"Pantry (prioritize items marked use_today/use_soon):\n{pantry_summary}\n\n"
            f"Equipment:\n{tools_summary}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def seasonal_suggestions(self, month: int, pantry: list[dict]) -> dict:
        """Get seasonal ingredient suggestions and recipe ideas (Michigan-focused)."""
        month_names = [
            "", "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ]
        system = (
            "You are a seasonal cooking expert with deep knowledge of Michigan agriculture and seasonality. "
            "Suggest what's in season and recipe ideas that feature seasonal ingredients. "
            "Return JSON:\n"
            '{"month": "Month Name", "in_season": [{"name": "ingredient", "peak": true/false, '
            '"description": "brief note"}], '
            '"recipe_ideas": [{"name": "Recipe Name", "description": "brief", "seasonal_ingredients": ["..."], '
            '"total_time_minutes": integer}], '
            '"tips": ["seasonal cooking tip", ...], '
            '"items_user_has_in_season": ["pantry items that are currently in season"]}\n'
            "Return ONLY the JSON."
        )
        pantry_summary = "\n".join(
            f"- {p.get('name','?')} ({p.get('category','?')})"
            for p in pantry[:60]
        ) or "Pantry is empty."

        user_msg = (
            f"What's in season in Michigan for {month_names[month]}?\n\n"
            f"User's current pantry:\n{pantry_summary}\n\n"
            f"Suggest seasonal ingredients, recipes featuring them, and identify which items "
            f"the user already has that are currently in season."
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def pantry_forecast(self, pantry: list[dict], meal_plans: list[dict]) -> dict:
        """Project pantry state after planned meals, highlighting what will run out."""
        system = (
            "You are a kitchen inventory analyst. Given the current pantry and upcoming meal plans, "
            "project what the pantry will look like after all planned meals. "
            "Return JSON:\n"
            '{"forecast_date": "YYYY-MM-DD (end of plan period)", '
            '"items_will_run_out": [{"name": "...", "current_qty": number, "needed_qty": number, "unit": "...", "runs_out_by": "YYYY-MM-DD"}], '
            '"items_getting_low": [{"name": "...", "current_qty": number, "projected_qty": number, "unit": "..."}], '
            '"items_untouched": ["items not used in any planned meal"], '
            '"items_expiring_unused": [{"name": "...", "expires": "YYYY-MM-DD", "not_in_any_plan": true}], '
            '"shopping_needed": [{"name": "...", "quantity_short": number, "unit": "...", "needed_for": "recipe name"}]}\n'
            "Return ONLY the JSON."
        )
        pantry_summary = "\n".join(
            f"- {p.get('name','?')} ({p.get('quantity','?')} {p.get('unit','')}) expires={p.get('expiration_date','none')} [{p.get('freshness_status','fresh')}]"
            for p in pantry[:80]
        ) or "Pantry is empty."

        plans_summary = "\n".join(
            f"- {m.get('plan_date','?')} {m.get('meal_type','?')}: {m.get('recipe_name','?')} ({m.get('servings','?')} servings) "
            f"ingredients: {', '.join(i.get('ingredient_name','?') + '(' + str(i.get('quantity','?')) + ' ' + str(i.get('unit','')) + ')' for i in m.get('ingredients', []))}"
            for m in meal_plans
        ) or "No upcoming meals planned."

        user_msg = (
            f"Project pantry state after these planned meals:\n\n"
            f"Current pantry:\n{pantry_summary}\n\n"
            f"Upcoming meal plans:\n{plans_summary}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=4096)
        return _extract_json(text)

    async def smart_suggestions(self, context: dict) -> dict:
        """Generate contextual AI suggestions based on the user's current kitchen state."""
        system = (
            "You are an intelligent kitchen assistant. Based on the user's current kitchen state, "
            "generate 3-5 contextual, actionable suggestions. Consider freshness urgency, meal planning gaps, "
            "seasonal produce, waste patterns, and cooking variety. "
            "Return JSON:\n"
            '{"suggestions": [{"type": "freshness|meal_plan|waste|seasonal|variety|efficiency", '
            '"title": "Short action title", "description": "Detailed actionable suggestion", '
            '"priority": "high|medium|low", "related_items": ["item names"]}], '
            '"tip_of_the_day": "A contextual cooking or storage tip"}\n'
            "Return ONLY the JSON."
        )
        parts = []
        if context.get("expiring_items"):
            parts.append("Items expiring soon:\n" + "\n".join(
                f"- {i.get('name','?')} [{i.get('freshness_status','?')}] expires {i.get('expiration_date','?')}"
                for i in context["expiring_items"][:10]
            ))
        if context.get("low_stock"):
            parts.append("Low stock items:\n" + "\n".join(
                f"- {i.get('name','?')} ({i.get('quantity','?')} {i.get('unit','')} remaining)"
                for i in context["low_stock"][:10]
            ))
        if context.get("recent_waste"):
            parts.append("Recent waste:\n" + "\n".join(
                f"- {w.get('item_name','?')} ({w.get('reason','?')})"
                for w in context["recent_waste"][:5]
            ))
        if context.get("todays_meals"):
            parts.append("Today's planned meals:\n" + "\n".join(
                f"- {m.get('meal_type','?')}: {m.get('recipe_name', m.get('custom_meal','?'))}"
                for m in context["todays_meals"]
            ))
        if context.get("pantry_count"):
            parts.append(f"Pantry items: {context['pantry_count']}")
        if context.get("recipes_count"):
            parts.append(f"Saved recipes: {context['recipes_count']}")
        if context.get("current_month"):
            parts.append(f"Current month: {context['current_month']}")

        user_msg = "Generate smart suggestions based on this kitchen state:\n\n" + "\n\n".join(parts)
        text = await self._call_claude(system, user_msg, max_tokens=2048)
        return _extract_json(text)

    # ── Phase 6: Import & Sharing ────────────────────────────────────

    async def import_google_doc(self, text: str, doc_type: str = "pantry") -> list[dict]:
        """Parse unstructured text (Google Doc, notes, pasted lists) into structured data."""
        schemas = {
            "pantry": (
                "Extract pantry/inventory items from this text. Return JSON array:\n"
                '[{"name": "Item Name", "category": "produce|dairy|meat|seafood|grains|canned|condiments|spices|baking|beverages|snacks|frozen|other", '
                '"quantity": number or null, "unit": "string or null", "brand": "string or null", '
                '"location": "fridge|freezer|pantry|counter|other", "notes": "string or null"}]\n'
                "Parse quantities, units, and categories from context. Normalize names. Return ONLY the JSON array."
            ),
            "recipes": (
                "Extract recipe(s) from this text. For each recipe return JSON matching:\n"
                + RECIPE_JSON_SCHEMA + "\n"
                "If there are multiple recipes, wrap them in a JSON array. Return ONLY the JSON."
            ),
            "tools": (
                "Extract kitchen tools/equipment from this text. Return JSON array:\n"
                '[{"name": "Tool Name", "category": "appliance|cookware|bakeware|utensil|knife|gadget|storage|other", '
                '"brand": "string or null", "capabilities": ["capability1", ...], '
                '"condition": "excellent|good|fair|poor|needs_repair", "notes": "string or null"}]\n'
                "Return ONLY the JSON array."
            ),
            "grocery": (
                "Extract grocery/shopping list items from this text. Return JSON array:\n"
                '[{"item_name": "Item Name", "quantity": number or null, "unit": "string or null", '
                '"category": "produce|dairy|meat|bakery|frozen|canned|beverages|snacks|household|other", '
                '"notes": "string or null"}]\n'
                "Parse quantities and units from context. Return ONLY the JSON array."
            ),
        }

        schema = schemas.get(doc_type, schemas["pantry"])
        system = (
            f"You are a document parser for kitchen management. "
            f"Extract structured {doc_type} data from the user's text. "
            f"The text may be a Google Doc export, pasted notes, a list, or free-form text. "
            f"Capture every item mentioned. {schema}"
        )
        user_msg = f"Parse the following text into {doc_type} items:\n\n{text}"
        raw = await self._call_claude(system, user_msg, max_tokens=4096)
        result = _extract_json(raw)
        # Ensure we always return a list
        if isinstance(result, dict):
            result = [result]
        return result

    async def generate_share_card(self, recipe: dict) -> dict:
        """Generate a concise shareable summary for a recipe."""
        system = (
            "You are a recipe content creator. Generate an engaging share card for this recipe. "
            "Return JSON:\n"
            '{"title": "Recipe Name", "tagline": "One catchy sentence", '
            '"highlights": ["3-4 short bullet highlights"], '
            '"emoji": "single relevant emoji", '
            '"estimated_difficulty": "easy|medium|hard", '
            '"estimated_time": "X min"}\n'
            "Return ONLY the JSON."
        )
        user_msg = (
            f"Generate a share card for:\n"
            f"Name: {recipe.get('name', '?')}\n"
            f"Description: {recipe.get('description', 'N/A')}\n"
            f"Servings: {recipe.get('servings', '?')}, Time: {recipe.get('total_time_minutes', '?')} min\n"
            f"Cuisine: {recipe.get('cuisine', 'N/A')}, Difficulty: {recipe.get('difficulty', 'N/A')}\n"
            f"Ingredients: {', '.join(i.get('ingredient_name', '?') for i in recipe.get('ingredients', []))}\n"
            f"Tags: {', '.join(recipe.get('tags', []))}"
        )
        text = await self._call_claude(system, user_msg, max_tokens=1024)
        return _extract_json(text)


@lru_cache
def get_kitchen_ai() -> KitchenAI:
    return KitchenAI()
