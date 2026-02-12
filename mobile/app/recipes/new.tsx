import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api-client";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CUISINES = [
  "japanese", "mexican", "italian", "american", "thai",
  "indian", "french", "korean", "chinese", "mediterranean",
  "vietnamese", "greek", "spanish", "middle_eastern", "other",
] as const;

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const DIETARY_FLAGS = [
  "gluten_free", "dairy_free", "vegetarian", "vegan",
  "low_carb", "keto", "nut_free",
] as const;

type TabId = "manual" | "url" | "photo" | "ai";

const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "manual", label: "Manual", icon: "create-outline" },
  { id: "url", label: "URL", icon: "link-outline" },
  { id: "photo", label: "Photo", icon: "camera-outline" },
  { id: "ai", label: "AI", icon: "sparkles-outline" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IngredientEntry {
  key: string;
  ingredient_name: string;
  quantity: string;
  unit: string;
  preparation: string;
  optional: boolean;
}

interface StepEntry {
  key: string;
  text: string;
}

interface RecipePreview {
  name: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  instructions: { step: number; text: string }[];
  ingredients: {
    ingredient_name: string;
    quantity: number | null;
    unit: string | null;
    preparation: string | null;
  }[];
  tools: { tool_name: string }[];
  cuisine: string | null;
  difficulty: string | null;
  dietary_flags: string[];
  tags: string[];
  source_type: string | null;
  source_url: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `k_${keyCounter}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Chip Picker Component
// ---------------------------------------------------------------------------

function ChipPicker({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {options.map((opt) => {
          const active = selected === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect(active ? null : opt)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {formatLabel(opt)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MultiChipPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map((opt) => {
          const active = selected.has(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(opt)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {formatLabel(opt)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Manual Tab
// ---------------------------------------------------------------------------

function ManualTab({ onSave }: { onSave: (data: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("4");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [dietaryFlags, setDietaryFlags] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");

  // Ingredients list
  const [ingredients, setIngredients] = useState<IngredientEntry[]>([
    { key: nextKey(), ingredient_name: "", quantity: "", unit: "", preparation: "", optional: false },
  ]);

  // Steps list
  const [steps, setSteps] = useState<StepEntry[]>([
    { key: nextKey(), text: "" },
  ]);

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { key: nextKey(), ingredient_name: "", quantity: "", unit: "", preparation: "", optional: false },
    ]);
  };

  const removeIngredient = (key: string) => {
    setIngredients((prev) => prev.filter((i) => i.key !== key));
  };

  const updateIngredient = (key: string, field: keyof IngredientEntry, value: string | boolean) => {
    setIngredients((prev) =>
      prev.map((i) => (i.key === key ? { ...i, [field]: value } : i))
    );
  };

  const addStep = () => {
    setSteps((prev) => [...prev, { key: nextKey(), text: "" }]);
  };

  const removeStep = (key: string) => {
    setSteps((prev) => prev.filter((s) => s.key !== key));
  };

  const updateStep = (key: string, text: string) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, text } : s)));
  };

  const toggleDietary = (flag: string) => {
    setDietaryFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter a recipe name.");
      return;
    }

    const validIngredients = ingredients
      .filter((i) => i.ingredient_name.trim())
      .map((i) => ({
        ingredient_name: i.ingredient_name.trim(),
        quantity: i.quantity ? parseFloat(i.quantity) : null,
        unit: i.unit.trim() || null,
        preparation: i.preparation.trim() || null,
        optional: i.optional,
      }));

    const validSteps = steps
      .filter((s) => s.text.trim())
      .map((s, idx) => ({
        step: idx + 1,
        text: s.text.trim(),
      }));

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      name: name.trim(),
      description: description.trim() || null,
      servings: parseInt(servings, 10) || 4,
      prep_time_minutes: prepTime ? parseInt(prepTime, 10) : null,
      cook_time_minutes: cookTime ? parseInt(cookTime, 10) : null,
      instructions: validSteps,
      cuisine,
      difficulty,
      dietary_flags: Array.from(dietaryFlags),
      tags: tagList,
      notes: notes.trim() || null,
      ingredients: validIngredients,
      tools: [],
      source_type: "manual",
    });
  };

  return (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentInner}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Name */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Recipe Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Grandma's Chicken Soup"
          placeholderTextColor={colors.mutedForeground}
          value={name}
          onChangeText={setName}
        />
      </View>

      {/* Description */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="A brief description..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      {/* Servings + Times */}
      <View style={styles.rowGroup}>
        <View style={styles.rowField}>
          <Text style={styles.fieldLabel}>Servings</Text>
          <TextInput
            style={styles.input}
            value={servings}
            onChangeText={setServings}
            keyboardType="numeric"
            placeholder="4"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.rowField}>
          <Text style={styles.fieldLabel}>Prep (min)</Text>
          <TextInput
            style={styles.input}
            value={prepTime}
            onChangeText={setPrepTime}
            keyboardType="numeric"
            placeholder="15"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.rowField}>
          <Text style={styles.fieldLabel}>Cook (min)</Text>
          <TextInput
            style={styles.input}
            value={cookTime}
            onChangeText={setCookTime}
            keyboardType="numeric"
            placeholder="30"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      </View>

      {/* Cuisine */}
      <ChipPicker
        label="Cuisine"
        options={CUISINES}
        selected={cuisine}
        onSelect={setCuisine}
      />

      {/* Difficulty */}
      <ChipPicker
        label="Difficulty"
        options={DIFFICULTIES}
        selected={difficulty}
        onSelect={setDifficulty}
      />

      {/* Dietary flags */}
      <MultiChipPicker
        label="Dietary Flags"
        options={DIETARY_FLAGS}
        selected={dietaryFlags}
        onToggle={toggleDietary}
      />

      {/* Tags */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Tags (comma-separated)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. comfort food, weeknight, one-pot"
          placeholderTextColor={colors.mutedForeground}
          value={tags}
          onChangeText={setTags}
        />
      </View>

      {/* Ingredients */}
      <View style={styles.fieldGroup}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          <TouchableOpacity onPress={addIngredient}>
            <Ionicons name="add-circle" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {ingredients.map((ing, idx) => (
          <View key={ing.key} style={styles.ingredientEntry}>
            <View style={styles.ingredientTopRow}>
              <Text style={styles.ingredientIndex}>{idx + 1}.</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Ingredient name"
                placeholderTextColor={colors.mutedForeground}
                value={ing.ingredient_name}
                onChangeText={(v) => updateIngredient(ing.key, "ingredient_name", v)}
              />
              {ingredients.length > 1 && (
                <TouchableOpacity onPress={() => removeIngredient(ing.key)}>
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.ingredientDetailRow}>
              <TextInput
                style={[styles.input, styles.smallInput]}
                placeholder="Qty"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={ing.quantity}
                onChangeText={(v) => updateIngredient(ing.key, "quantity", v)}
              />
              <TextInput
                style={[styles.input, styles.smallInput]}
                placeholder="Unit"
                placeholderTextColor={colors.mutedForeground}
                value={ing.unit}
                onChangeText={(v) => updateIngredient(ing.key, "unit", v)}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Prep (diced, minced...)"
                placeholderTextColor={colors.mutedForeground}
                value={ing.preparation}
                onChangeText={(v) => updateIngredient(ing.key, "preparation", v)}
              />
            </View>
          </View>
        ))}
      </View>

      {/* Instructions */}
      <View style={styles.fieldGroup}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          <TouchableOpacity onPress={addStep}>
            <Ionicons name="add-circle" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {steps.map((step, idx) => (
          <View key={step.key} style={styles.stepEntry}>
            <View style={styles.stepNumBadge}>
              <Text style={styles.stepNumText}>{idx + 1}</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea, { flex: 1 }]}
              placeholder={`Step ${idx + 1}...`}
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={step.text}
              onChangeText={(v) => updateStep(step.key, v)}
            />
            {steps.length > 1 && (
              <TouchableOpacity onPress={() => removeStep(step.key)}>
                <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* Notes */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Tips, variations, etc."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      {/* Save button */}
      <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
        <Text style={styles.primaryButtonText}>Save Recipe</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// URL Import Tab
// ---------------------------------------------------------------------------

function URLImportTab({ onSave }: { onSave: (data: Record<string, unknown>) => void }) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<RecipePreview | null>(null);

  const parseMutation = useMutation({
    mutationFn: (u: string) =>
      api.post<{ recipe: RecipePreview }>("/recipes/parse/url", { url: u }),
    onSuccess: (data) => {
      setPreview(data.recipe);
    },
    onError: (err: Error) => {
      Alert.alert("Parse Error", err.message);
    },
  });

  const handleParse = () => {
    if (!url.trim()) {
      Alert.alert("Required", "Please enter a URL.");
      return;
    }
    parseMutation.mutate(url.trim());
  };

  const handleSave = () => {
    if (!preview) return;
    onSave({
      ...preview,
      source_type: "url",
      source_url: url.trim(),
    });
  };

  return (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentInner}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Recipe URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://example.com/recipe/..."
          placeholderTextColor={colors.mutedForeground}
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={handleParse}
        disabled={parseMutation.isPending}
      >
        {parseMutation.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Ionicons name="download-outline" size={18} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Import from URL</Text>
          </>
        )}
      </TouchableOpacity>

      {preview && (
        <RecipePreviewCard preview={preview} onSave={handleSave} />
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Photo Import Tab
// ---------------------------------------------------------------------------

function PhotoImportTab({ onSave }: { onSave: (data: Record<string, unknown>) => void }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [preview, setPreview] = useState<RecipePreview | null>(null);

  const parseMutation = useMutation({
    mutationFn: async (base64: string) => {
      return api.post<{ recipe: RecipePreview }>("/recipes/parse/image", {
        image_base64: base64,
        media_type: "image/jpeg",
      });
    },
    onSuccess: (data) => {
      setPreview(data.recipe);
    },
    onError: (err: Error) => {
      Alert.alert("Parse Error", err.message);
    },
  });

  const pickImage = useCallback(async (source: "camera" | "library") => {
    let result: ImagePicker.ImagePickerResult;
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Camera permission is required.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.8,
      });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Gallery permission is required.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.8,
      });
    }

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      if (asset.base64) {
        parseMutation.mutate(asset.base64);
      }
    }
  }, [parseMutation]);

  const handleSave = () => {
    if (!preview) return;
    onSave({
      ...preview,
      source_type: "image",
    });
  };

  return (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentInner}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.photoButtons}>
        <TouchableOpacity
          style={styles.photoPickerBtn}
          onPress={() => pickImage("camera")}
          disabled={parseMutation.isPending}
        >
          <Ionicons name="camera" size={32} color={colors.primary} />
          <Text style={styles.photoPickerText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.photoPickerBtn}
          onPress={() => pickImage("library")}
          disabled={parseMutation.isPending}
        >
          <Ionicons name="images" size={32} color={colors.primary} />
          <Text style={styles.photoPickerText}>Gallery</Text>
        </TouchableOpacity>
      </View>

      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={styles.previewImage}
          resizeMode="cover"
        />
      )}

      {parseMutation.isPending && (
        <View style={styles.parsingIndicator}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.parsingText}>Analyzing image...</Text>
        </View>
      )}

      {preview && (
        <RecipePreviewCard preview={preview} onSave={handleSave} />
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// AI Generate Tab
// ---------------------------------------------------------------------------

function AIGenerateTab({ onSave }: { onSave: (data: Record<string, unknown>) => void }) {
  const [description, setDescription] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [maxTime, setMaxTime] = useState("");
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [dietaryFlags, setDietaryFlags] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<RecipePreview | null>(null);

  const toggleDietary = (flag: string) => {
    setDietaryFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  };

  const generateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ recipe: RecipePreview }>("/recipes/generate", body),
    onSuccess: (data) => {
      setPreview(data.recipe);
    },
    onError: (err: Error) => {
      Alert.alert("Generation Error", err.message);
    },
  });

  const handleGenerate = () => {
    if (!description.trim() && !cuisine) {
      Alert.alert(
        "Required",
        "Please describe what you want or select a cuisine."
      );
      return;
    }

    generateMutation.mutate({
      description: description.trim() || null,
      preferred_cuisine: cuisine,
      max_time_minutes: maxTime ? parseInt(maxTime, 10) : null,
      difficulty,
      dietary_restrictions: Array.from(dietaryFlags),
    });
  };

  const handleSave = () => {
    if (!preview) return;
    onSave({
      ...preview,
      source_type: "ai_generated",
    });
  };

  return (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.tabContentInner}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Describe what you want</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="e.g. A hearty winter stew that uses butternut squash..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <ChipPicker
        label="Cuisine"
        options={CUISINES}
        selected={cuisine}
        onSelect={setCuisine}
      />

      <ChipPicker
        label="Difficulty"
        options={DIFFICULTIES}
        selected={difficulty}
        onSelect={setDifficulty}
      />

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Max Time (minutes)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 60"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="numeric"
          value={maxTime}
          onChangeText={setMaxTime}
        />
      </View>

      <MultiChipPicker
        label="Dietary Restrictions"
        options={DIETARY_FLAGS}
        selected={dietaryFlags}
        onToggle={toggleDietary}
      />

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleGenerate}
        disabled={generateMutation.isPending}
      >
        {generateMutation.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <>
            <Ionicons
              name="sparkles"
              size={18}
              color={colors.primaryForeground}
            />
            <Text style={styles.primaryButtonText}> Generate Recipe</Text>
          </>
        )}
      </TouchableOpacity>

      {preview && (
        <RecipePreviewCard preview={preview} onSave={handleSave} />
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Recipe Preview Card (used by URL, Photo, AI)
// ---------------------------------------------------------------------------

function RecipePreviewCard({
  preview,
  onSave,
}: {
  preview: RecipePreview;
  onSave: () => void;
}) {
  return (
    <View style={styles.previewCard}>
      <Text style={styles.previewTitle}>Preview</Text>

      <Text style={styles.previewName}>{preview.name}</Text>
      {preview.description && (
        <Text style={styles.previewDescription}>{preview.description}</Text>
      )}

      {/* Meta */}
      <View style={styles.previewMeta}>
        {preview.servings > 0 && (
          <View style={styles.previewMetaItem}>
            <Ionicons name="people-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.previewMetaText}>{preview.servings} servings</Text>
          </View>
        )}
        {preview.prep_time_minutes != null && (
          <View style={styles.previewMetaItem}>
            <Ionicons name="cut-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.previewMetaText}>{preview.prep_time_minutes}m prep</Text>
          </View>
        )}
        {preview.cook_time_minutes != null && (
          <View style={styles.previewMetaItem}>
            <Ionicons name="flame-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.previewMetaText}>{preview.cook_time_minutes}m cook</Text>
          </View>
        )}
      </View>

      {/* Tags */}
      <View style={styles.previewTags}>
        {preview.cuisine && (
          <View style={[styles.tagChip, { backgroundColor: colors.blue.bg }]}>
            <Text style={[styles.tagChipText, { color: colors.blue.text }]}>
              {formatLabel(preview.cuisine)}
            </Text>
          </View>
        )}
        {preview.difficulty && (
          <View style={[styles.tagChip, { backgroundColor: colors.orange.bg }]}>
            <Text style={[styles.tagChipText, { color: colors.orange.text }]}>
              {formatLabel(preview.difficulty)}
            </Text>
          </View>
        )}
        {(preview.dietary_flags ?? []).map((flag) => (
          <View key={flag} style={[styles.tagChip, { backgroundColor: colors.purple.bg }]}>
            <Text style={[styles.tagChipText, { color: colors.purple.text }]}>
              {formatLabel(flag)}
            </Text>
          </View>
        ))}
      </View>

      {/* Ingredients */}
      {preview.ingredients && preview.ingredients.length > 0 && (
        <View style={styles.previewSection}>
          <Text style={styles.previewSectionTitle}>
            Ingredients ({preview.ingredients.length})
          </Text>
          {preview.ingredients.map((ing, idx) => (
            <Text key={idx} style={styles.previewItem}>
              {"\u2022"} {ing.quantity != null ? `${ing.quantity} ` : ""}
              {ing.unit ? `${ing.unit} ` : ""}
              {ing.ingredient_name}
              {ing.preparation ? `, ${ing.preparation}` : ""}
            </Text>
          ))}
        </View>
      )}

      {/* Steps */}
      {preview.instructions && preview.instructions.length > 0 && (
        <View style={styles.previewSection}>
          <Text style={styles.previewSectionTitle}>
            Steps ({preview.instructions.length})
          </Text>
          {preview.instructions.map((step, idx) => (
            <Text key={idx} style={styles.previewItem}>
              {step.step ?? idx + 1}. {step.text}
            </Text>
          ))}
        </View>
      )}

      {/* Save */}
      <TouchableOpacity style={styles.primaryButton} onPress={onSave}>
        <Ionicons name="save-outline" size={18} color={colors.primaryForeground} />
        <Text style={styles.primaryButtonText}> Save Recipe</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function NewRecipeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("manual");

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/recipes", data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      Alert.alert("Saved", "Recipe created successfully!", [
        {
          text: "View Recipe",
          onPress: () => {
            if (data?.id) {
              router.replace(`/recipes/${data.id}`);
            } else {
              router.back();
            }
          },
        },
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleSave = useCallback(
    (data: Record<string, unknown>) => {
      saveMutation.mutate(data);
    },
    [saveMutation]
  );

  return (
    <View style={styles.container}>
      {/* Saving overlay */}
      {saveMutation.isPending && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.savingText}>Saving recipe...</Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Ionicons
                name={tab.icon}
                size={20}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.tabLabel,
                  active && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab content */}
      {activeTab === "manual" && <ManualTab onSave={handleSave} />}
      {activeTab === "url" && <URLImportTab onSave={handleSave} />}
      {activeTab === "photo" && <PhotoImportTab onSave={handleSave} />}
      {activeTab === "ai" && <AIGenerateTab onSave={handleSave} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    gap: 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  tabLabelActive: {
    color: colors.primary,
  },

  // Tab content
  tabContent: {
    flex: 1,
  },
  tabContentInner: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },

  // Field groups
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  rowGroup: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  rowField: {
    flex: 1,
  },

  // Chips
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  chipTextActive: {
    color: colors.primaryForeground,
    fontWeight: "600",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.foreground,
  },

  // Ingredient entries
  ingredientEntry: {
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingredientTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  ingredientIndex: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.mutedForeground,
    width: 24,
  },
  ingredientDetailRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginLeft: 32,
  },
  smallInput: {
    width: 70,
  },

  // Step entries
  stepEntry: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stepNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  stepNumText: {
    color: colors.primaryForeground,
    fontWeight: "700",
    fontSize: fontSize.xs,
  },

  // Photo buttons
  photoButtons: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  photoPickerBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    gap: spacing.sm,
  },
  photoPickerText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primary,
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  parsingIndicator: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  parsingText: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
  },

  // Preview card
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewTitle: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  previewName: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  previewDescription: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
  },
  previewMeta: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  previewMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewMetaText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
  previewTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tagChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  tagChipText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  previewSection: {
    marginBottom: spacing.md,
  },
  previewSectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  previewItem: {
    fontSize: fontSize.sm,
    color: colors.foreground,
    lineHeight: 22,
    paddingLeft: spacing.xs,
  },

  // Buttons
  primaryButton: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: fontSize.base,
    fontWeight: "700",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  secondaryButtonText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primary,
  },

  // Saving overlay
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    gap: spacing.md,
  },
  savingText: {
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontWeight: "600",
  },
});
