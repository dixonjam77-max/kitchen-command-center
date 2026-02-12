import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecipeIngredient {
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

interface RecipeTool {
  id: string;
  recipe_id: string;
  tool_id: string | null;
  tool_name: string;
  optional: boolean;
  notes: string | null;
}

interface Instruction {
  step: number;
  text: string;
  duration_minutes?: number;
  technique?: string;
}

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  instructions: Instruction[] | null;
  source_type: string | null;
  source_url: string | null;
  tags: string[];
  cuisine: string | null;
  difficulty: string | null;
  dietary_flags: string[];
  estimated_calories_per_serving: number | null;
  rating: number | null;
  photo_url: string | null;
  is_favorite: boolean;
  version: number;
  notes: string | null;
  ingredients: RecipeIngredient[];
  tools: RecipeTool[];
  created_at: string;
  updated_at: string;
}

interface CookLog {
  id: string;
  recipe_id: string;
  cooked_date: string;
  servings_made: number | null;
  rating: number | null;
  modifications: string | null;
  notes: string | null;
  duration_minutes: number | null;
  created_at: string;
}

interface PantryItem {
  id: string;
  name: string;
  canonical_name: string | null;
  quantity: number | null;
  unit: string | null;
}

interface ScaleResponse {
  recipe_id: string;
  original_servings: number;
  target_servings: number;
  ratio: number;
  scaled_ingredients: RecipeIngredient[];
}

interface PantryCheckResult {
  available: string[];
  missing: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function difficultyColor(d: string | null): { bg: string; text: string } {
  switch (d) {
    case "easy":
      return { bg: colors.green.bg, text: colors.green.text };
    case "medium":
      return { bg: colors.orange.bg, text: colors.orange.text };
    case "hard":
      return { bg: colors.red.bg, text: colors.red.text };
    default:
      return { bg: colors.gray.bg, text: colors.gray.text };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <View>
        <Text style={styles.metaChipValue}>{value}</Text>
        <Text style={styles.metaChipLabel}>{label}</Text>
      </View>
    </View>
  );
}

function RatingStars({
  rating,
  size = 18,
}: {
  rating: number | null;
  size?: number;
}) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <View style={styles.ratingRow}>
      {Array.from({ length: full }).map((_, i) => (
        <Ionicons key={`f${i}`} name="star" size={size} color="#F59E0B" />
      ))}
      {half && <Ionicons name="star-half" size={size} color="#F59E0B" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Ionicons key={`e${i}`} name="star-outline" size={size} color="#D1D5DB" />
      ))}
      <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.ratingRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity key={s} onPress={() => onChange(s)}>
          <Ionicons
            name={s <= value ? "star" : "star-outline"}
            size={28}
            color="#F59E0B"
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cook Log Modal
// ---------------------------------------------------------------------------

function CookLogModal({
  visible,
  recipeId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  recipeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [modifications, setModifications] = useState("");
  const [servingsMade, setServingsMade] = useState("");

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/recipes/${recipeId}/cook`, body),
    onSuccess: () => {
      onSaved();
      onClose();
      setRating(0);
      setNotes("");
      setModifications("");
      setServingsMade("");
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleSave = () => {
    const body: Record<string, unknown> = {
      cooked_date: new Date().toISOString().split("T")[0],
    };
    if (rating > 0) body.rating = rating;
    if (notes.trim()) body.notes = notes.trim();
    if (modifications.trim()) body.modifications = modifications.trim();
    if (servingsMade) body.servings_made = parseInt(servingsMade, 10);
    mutation.mutate(body);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log Cook</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Rating</Text>
            <StarPicker value={rating} onChange={setRating} />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              Servings Made
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 4"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
              value={servingsMade}
              onChangeText={setServingsMade}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              Modifications
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any changes you made..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              value={modifications}
              onChangeText={setModifications}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              Notes
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="How did it turn out?"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSave}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>Save Cook Log</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Scale Picker Modal
// ---------------------------------------------------------------------------

function ScaleModal({
  visible,
  recipeId,
  originalServings,
  onClose,
  onScaled,
}: {
  visible: boolean;
  recipeId: string;
  originalServings: number;
  onClose: () => void;
  onScaled: (data: ScaleResponse) => void;
}) {
  const [targetServings, setTargetServings] = useState(
    String(originalServings)
  );

  const mutation = useMutation({
    mutationFn: (servings: number) =>
      api.post<ScaleResponse>(`/recipes/${recipeId}/scale`, { servings }),
    onSuccess: (data) => {
      onScaled(data);
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: 250 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Scale Recipe</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Target Servings</Text>
          <View style={styles.servingsRow}>
            <TouchableOpacity
              style={styles.servingsBtn}
              onPress={() => {
                const n = Math.max(1, parseInt(targetServings, 10) - 1);
                setTargetServings(String(n));
              }}
            >
              <Ionicons name="remove" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, styles.servingsInput]}
              value={targetServings}
              onChangeText={setTargetServings}
              keyboardType="numeric"
              textAlign="center"
            />
            <TouchableOpacity
              style={styles.servingsBtn}
              onPress={() => {
                const n = parseInt(targetServings, 10) + 1;
                setTargetServings(String(n));
              }}
            >
              <Ionicons name="add" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: spacing.md }]}
            onPress={() => {
              const n = parseInt(targetServings, 10);
              if (n > 0) mutation.mutate(n);
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>Scale</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showCookLog, setShowCookLog] = useState(false);
  const [showScale, setShowScale] = useState(false);
  const [scaledIngredients, setScaledIngredients] = useState<
    RecipeIngredient[] | null
  >(null);
  const [scaledServings, setScaledServings] = useState<number | null>(null);
  const [pantryCheck, setPantryCheck] = useState<PantryCheckResult | null>(
    null
  );
  const [checkingPantry, setCheckingPantry] = useState(false);

  // Fetch recipe
  const {
    data: recipe,
    isLoading,
    error,
  } = useQuery<Recipe>({
    queryKey: ["recipe", id],
    queryFn: () => api.get<Recipe>(`/recipes/${id}`),
    enabled: !!id,
  });

  // Fetch cook logs
  const { data: cookLogs } = useQuery<CookLog[]>({
    queryKey: ["cookLogs", id],
    queryFn: () => api.get<CookLog[]>(`/recipes/${id}/cook-logs`),
    enabled: !!id,
  });

  // Fetch pantry items for availability check
  const { data: pantryData } = useQuery<{ items: PantryItem[] }>({
    queryKey: ["pantryItems"],
    queryFn: () =>
      api.get<{ items: PantryItem[] }>("/pantry", { limit: 500 }),
  });

  const pantryCanonicals = useMemo(() => {
    if (!pantryData?.items) return new Set<string>();
    return new Set(
      pantryData.items
        .filter((p) => (p.quantity ?? 0) > 0)
        .map((p) => p.canonical_name?.toLowerCase() ?? p.name.toLowerCase())
    );
  }, [pantryData]);

  const checkPantryAvailability = useCallback(() => {
    if (!recipe) return;
    setCheckingPantry(true);

    const available: string[] = [];
    const missing: string[] = [];

    for (const ing of recipe.ingredients) {
      if (ing.optional) continue;
      const canonical =
        ing.canonical_name?.toLowerCase() ??
        ing.ingredient_name.toLowerCase();
      if (pantryCanonicals.has(canonical)) {
        available.push(ing.ingredient_name);
      } else {
        missing.push(ing.ingredient_name);
      }
    }

    setPantryCheck({ available, missing });
    setCheckingPantry(false);
  }, [recipe, pantryCanonicals]);

  const handleScaled = useCallback((data: ScaleResponse) => {
    setScaledIngredients(data.scaled_ingredients);
    setScaledServings(data.target_servings);
  }, []);

  const ingredientsToShow = scaledIngredients ?? recipe?.ingredients ?? [];
  const servingsToShow = scaledServings ?? recipe?.servings ?? 0;

  // Determine ingredient pantry availability
  const ingredientAvailability = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const ing of ingredientsToShow) {
      const canonical =
        ing.canonical_name?.toLowerCase() ??
        ing.ingredient_name.toLowerCase();
      map[ing.ingredient_name] = pantryCanonicals.has(canonical);
    }
    return map;
  }, [ingredientsToShow, pantryCanonicals]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !recipe) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.destructive} />
        <Text style={styles.errorText}>Failed to load recipe</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dc = difficultyColor(recipe.difficulty);
  const instructions: Instruction[] = recipe.instructions ?? [];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          {recipe.description && (
            <Text style={styles.description}>{recipe.description}</Text>
          )}
          <RatingStars rating={recipe.rating} size={20} />
        </View>

        {/* Metadata row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.metaRow}
          contentContainerStyle={styles.metaRowContent}
        >
          <MetaChip
            icon="people-outline"
            label="Servings"
            value={String(servingsToShow)}
          />
          {recipe.prep_time_minutes != null && (
            <MetaChip
              icon="cut-outline"
              label="Prep"
              value={`${recipe.prep_time_minutes}m`}
            />
          )}
          {recipe.cook_time_minutes != null && (
            <MetaChip
              icon="flame-outline"
              label="Cook"
              value={`${recipe.cook_time_minutes}m`}
            />
          )}
          {recipe.total_time_minutes != null && (
            <MetaChip
              icon="time-outline"
              label="Total"
              value={`${recipe.total_time_minutes}m`}
            />
          )}
          {recipe.difficulty && (
            <MetaChip
              icon="speedometer-outline"
              label="Difficulty"
              value={formatLabel(recipe.difficulty)}
            />
          )}
          {recipe.estimated_calories_per_serving != null && (
            <MetaChip
              icon="nutrition-outline"
              label="Calories"
              value={`${recipe.estimated_calories_per_serving}`}
            />
          )}
        </ScrollView>

        {/* Tags / Cuisine / Dietary */}
        <View style={styles.tagsSection}>
          {recipe.cuisine && (
            <View style={[styles.tagChip, { backgroundColor: colors.blue.bg }]}>
              <Text style={[styles.tagChipText, { color: colors.blue.text }]}>
                {formatLabel(recipe.cuisine)}
              </Text>
            </View>
          )}
          {recipe.difficulty && (
            <View style={[styles.tagChip, { backgroundColor: dc.bg }]}>
              <Text style={[styles.tagChipText, { color: dc.text }]}>
                {formatLabel(recipe.difficulty)}
              </Text>
            </View>
          )}
          {recipe.dietary_flags.map((flag) => (
            <View
              key={flag}
              style={[styles.tagChip, { backgroundColor: colors.purple.bg }]}
            >
              <Text style={[styles.tagChipText, { color: colors.purple.text }]}>
                {formatLabel(flag)}
              </Text>
            </View>
          ))}
          {recipe.tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tagChip, { backgroundColor: colors.teal.bg }]}
            >
              <Text style={[styles.tagChipText, { color: colors.teal.text }]}>
                {tag}
              </Text>
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowScale(true)}
          >
            <Ionicons name="resize-outline" size={18} color={colors.primary} />
            <Text style={styles.actionBtnText}>Scale</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={checkPantryAvailability}
            disabled={checkingPantry}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={styles.actionBtnText}>Can I Make?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowCookLog(true)}
          >
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.actionBtnText}>Log Cook</Text>
          </TouchableOpacity>
        </View>

        {/* Pantry check results */}
        {pantryCheck && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pantry Check</Text>
            {pantryCheck.missing.length === 0 ? (
              <View style={styles.pantryOk}>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={colors.fresh}
                />
                <Text style={styles.pantryOkText}>
                  You have all the ingredients!
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.pantryMissingTitle}>
                  Missing {pantryCheck.missing.length} ingredient
                  {pantryCheck.missing.length > 1 ? "s" : ""}:
                </Text>
                {pantryCheck.missing.map((name) => (
                  <View key={name} style={styles.pantryMissingItem}>
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={colors.destructive}
                    />
                    <Text style={styles.pantryMissingText}>{name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Ingredients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Ingredients ({ingredientsToShow.length})
            </Text>
            {scaledIngredients && (
              <TouchableOpacity
                onPress={() => {
                  setScaledIngredients(null);
                  setScaledServings(null);
                }}
              >
                <Text style={styles.resetScale}>Reset scale</Text>
              </TouchableOpacity>
            )}
          </View>
          {ingredientsToShow.map((ing, idx) => {
            const inStock = ingredientAvailability[ing.ingredient_name];
            return (
              <View key={ing.id ?? idx} style={styles.ingredientRow}>
                <Ionicons
                  name={inStock ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={inStock ? colors.fresh : colors.destructive}
                />
                <View style={styles.ingredientInfo}>
                  <Text style={styles.ingredientName}>
                    {ing.quantity != null && `${ing.quantity} `}
                    {ing.unit && `${ing.unit} `}
                    {ing.ingredient_name}
                    {ing.preparation && (
                      <Text style={styles.ingredientPrep}>
                        , {ing.preparation}
                      </Text>
                    )}
                  </Text>
                  {ing.optional && (
                    <Text style={styles.optionalBadge}>optional</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Equipment */}
        {recipe.tools.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Equipment ({recipe.tools.length})
            </Text>
            {recipe.tools.map((tool) => (
              <View key={tool.id} style={styles.toolRow}>
                <Ionicons
                  name="construct-outline"
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text style={styles.toolName}>
                  {tool.tool_name}
                  {tool.optional && (
                    <Text style={styles.optionalBadge}> (optional)</Text>
                  )}
                </Text>
                {tool.notes && (
                  <Text style={styles.toolNotes}> - {tool.notes}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Instructions */}
        {instructions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {instructions.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.step ?? idx + 1}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepText}>{step.text}</Text>
                  {(step.duration_minutes || step.technique) && (
                    <View style={styles.stepMeta}>
                      {step.duration_minutes && (
                        <View style={styles.stepMetaItem}>
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color={colors.mutedForeground}
                          />
                          <Text style={styles.stepMetaText}>
                            {step.duration_minutes} min
                          </Text>
                        </View>
                      )}
                      {step.technique && (
                        <View style={styles.stepMetaItem}>
                          <Ionicons
                            name="flash-outline"
                            size={12}
                            color={colors.mutedForeground}
                          />
                          <Text style={styles.stepMetaText}>
                            {step.technique}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        {recipe.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{recipe.notes}</Text>
          </View>
        )}

        {/* Cook Log History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Cook History{" "}
            {cookLogs && cookLogs.length > 0 && `(${cookLogs.length})`}
          </Text>
          {!cookLogs || cookLogs.length === 0 ? (
            <Text style={styles.emptyText}>
              No cook logs yet. Tap "Log Cook" to record your first!
            </Text>
          ) : (
            cookLogs.map((log) => (
              <View key={log.id} style={styles.cookLogCard}>
                <View style={styles.cookLogHeader}>
                  <Text style={styles.cookLogDate}>
                    {new Date(log.cooked_date).toLocaleDateString()}
                  </Text>
                  {log.rating != null && (
                    <RatingStars rating={log.rating} size={14} />
                  )}
                </View>
                {log.servings_made != null && (
                  <Text style={styles.cookLogDetail}>
                    Servings: {log.servings_made}
                  </Text>
                )}
                {log.duration_minutes != null && (
                  <Text style={styles.cookLogDetail}>
                    Duration: {log.duration_minutes} min
                  </Text>
                )}
                {log.modifications && (
                  <Text style={styles.cookLogDetail}>
                    Modifications: {log.modifications}
                  </Text>
                )}
                {log.notes && (
                  <Text style={styles.cookLogDetail}>{log.notes}</Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Bottom spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky bottom buttons */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.bottomBtnOutline]}
          onPress={() => setShowCookLog(true)}
        >
          <Ionicons name="create-outline" size={18} color={colors.primary} />
          <Text style={styles.bottomBtnOutlineText}>Log Cook</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.bottomBtnPrimary]}
          onPress={() => {
            // Navigate to a step-by-step cook mode (future screen)
            // For now, scroll to instructions
            Alert.alert(
              "Start Cooking",
              "Step-by-step cook mode coming soon! For now, follow the instructions above."
            );
          }}
        >
          <Ionicons
            name="flame-outline"
            size={18}
            color={colors.primaryForeground}
          />
          <Text style={styles.bottomBtnPrimaryText}>Start Cooking</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <CookLogModal
        visible={showCookLog}
        recipeId={id!}
        onClose={() => setShowCookLog(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["cookLogs", id] });
        }}
      />

      <ScaleModal
        visible={showScale}
        recipeId={id!}
        originalServings={recipe.servings}
        onClose={() => setShowScale(false)}
        onScaled={handleScaled}
      />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.destructive,
    marginTop: spacing.md,
  },
  linkText: {
    fontSize: fontSize.base,
    color: colors.primary,
    marginTop: spacing.sm,
  },

  // Header
  header: {
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  recipeName: {
    fontSize: fontSize["3xl"],
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },

  // Meta row
  metaRow: {
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  metaRowContent: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metaChipValue: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  metaChipLabel: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },

  // Tags
  tagsSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
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

  // Action buttons
  actionsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.blue.bg,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.primary,
  },

  // Pantry check
  pantryOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.green.bg,
    borderRadius: borderRadius.md,
  },
  pantryOkText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.green.text,
  },
  pantryMissingTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  pantryMissingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  pantryMissingText: {
    fontSize: fontSize.base,
    color: colors.foreground,
  },

  // Sections
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  resetScale: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "600",
  },

  // Ingredients
  ingredientRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: fontSize.base,
    color: colors.foreground,
    lineHeight: 22,
  },
  ingredientPrep: {
    color: colors.mutedForeground,
    fontStyle: "italic",
  },
  optionalBadge: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontStyle: "italic",
  },

  // Tools
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  toolName: {
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  toolNotes: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },

  // Instructions
  stepRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumberText: {
    color: colors.primaryForeground,
    fontWeight: "700",
    fontSize: fontSize.sm,
  },
  stepContent: {
    flex: 1,
    paddingTop: 4,
  },
  stepText: {
    fontSize: fontSize.base,
    color: colors.foreground,
    lineHeight: 22,
  },
  stepMeta: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  stepMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepMetaText: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },

  // Notes
  notesText: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
    lineHeight: 22,
    fontStyle: "italic",
  },

  // Cook logs
  emptyText: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  cookLogCard: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cookLogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  cookLogDate: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  cookLogDetail: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: 2,
  },

  // Rating
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginLeft: spacing.xs,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md - 2,
    borderRadius: borderRadius.lg,
  },
  bottomBtnOutline: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bottomBtnPrimary: {
    backgroundColor: colors.primary,
  },
  bottomBtnOutlineText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primary,
  },
  bottomBtnPrimaryText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primaryForeground,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
  },
  modalBody: {
    marginBottom: spacing.md,
  },

  // Form fields
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

  // Servings row
  servingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  servingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  servingsInput: {
    flex: 1,
    textAlign: "center",
  },

  // Primary button
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: fontSize.base,
    fontWeight: "700",
  },
});
