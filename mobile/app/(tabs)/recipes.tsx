import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CUISINES = [
  "japanese",
  "mexican",
  "italian",
  "american",
  "thai",
  "indian",
  "french",
  "korean",
  "chinese",
  "mediterranean",
  "vietnamese",
  "greek",
  "spanish",
  "middle_eastern",
  "other",
] as const;

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const MAX_TIME_OPTIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "60 min", value: 60 },
  { label: "90 min", value: 90 },
] as const;

const DIETARY_FLAGS = [
  "gluten_free",
  "dairy_free",
  "vegetarian",
  "vegan",
  "low_carb",
  "keto",
  "nut_free",
] as const;

// ---------------------------------------------------------------------------
// Types (matching backend RecipeListResponse)
// ---------------------------------------------------------------------------

interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  total_time_minutes: number | null;
  tags: string[];
  cuisine: string | null;
  difficulty: string | null;
  dietary_flags: string[];
  rating: number | null;
  photo_url: string | null;
  is_favorite: boolean;
  source_type: string | null;
  created_at: string;
}

interface RecipeListResponse {
  items: RecipeListItem[];
  total: number;
  skip: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

function RatingStars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <View style={styles.ratingRow}>
      {Array.from({ length: full }).map((_, i) => (
        <Ionicons key={`f${i}`} name="star" size={14} color="#F59E0B" />
      ))}
      {half && <Ionicons name="star-half" size={14} color="#F59E0B" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Ionicons key={`e${i}`} name="star-outline" size={14} color="#D1D5DB" />
      ))}
      <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Filter Chip Components
// ---------------------------------------------------------------------------

function ChipRow({
  label,
  options,
  selected,
  onSelect,
  formatValue = formatLabel,
}: {
  label: string;
  options: readonly string[] | readonly { label: string; value: number }[];
  selected: string | number | null;
  onSelect: (v: string | number | null) => void;
  formatValue?: (v: string) => string;
}) {
  return (
    <View style={styles.chipSection}>
      <Text style={styles.chipLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {(options as readonly any[]).map((opt) => {
          const value = typeof opt === "object" ? opt.value : opt;
          const display = typeof opt === "object" ? opt.label : formatValue(opt);
          const active = selected === value;
          return (
            <TouchableOpacity
              key={String(value)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect(active ? null : value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {display}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DietaryChipRow({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (flag: string) => void;
}) {
  return (
    <View style={styles.chipSection}>
      <Text style={styles.chipLabel}>Dietary</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {DIETARY_FLAGS.map((flag) => {
          const active = selected.has(flag);
          return (
            <TouchableOpacity
              key={flag}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(flag)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {formatLabel(flag)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recipe Card
// ---------------------------------------------------------------------------

function RecipeCard({
  item,
  onPress,
}: {
  item: RecipeListItem;
  onPress: () => void;
}) {
  const dc = difficultyColor(item.difficulty);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Top row: name + favorite */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.is_favorite && (
          <Ionicons name="heart" size={18} color={colors.destructive} />
        )}
      </View>

      {/* Badges row */}
      <View style={styles.badgeRow}>
        {item.cuisine && (
          <View style={[styles.badge, { backgroundColor: colors.blue.bg }]}>
            <Text style={[styles.badgeText, { color: colors.blue.text }]}>
              {formatLabel(item.cuisine)}
            </Text>
          </View>
        )}
        {item.difficulty && (
          <View style={[styles.badge, { backgroundColor: dc.bg }]}>
            <Text style={[styles.badgeText, { color: dc.text }]}>
              {formatLabel(item.difficulty)}
            </Text>
          </View>
        )}
      </View>

      {/* Meta row */}
      <View style={styles.metaRow}>
        {item.total_time_minutes != null && (
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.metaText}>{item.total_time_minutes} min</Text>
          </View>
        )}
        <RatingStars rating={item.rating} />
      </View>

      {/* Dietary flags */}
      {item.dietary_flags.length > 0 && (
        <View style={styles.dietaryRow}>
          {item.dietary_flags.slice(0, 3).map((flag) => (
            <View key={flag} style={styles.dietaryChip}>
              <Text style={styles.dietaryChipText}>{formatLabel(flag)}</Text>
            </View>
          ))}
          {item.dietary_flags.length > 3 && (
            <Text style={styles.dietaryMore}>
              +{item.dietary_flags.length - 3}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function RecipesScreen() {
  const router = useRouter();

  // Search + filter state
  const [search, setSearch] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [dietaryFlags, setDietaryFlags] = useState<Set<string>>(new Set());
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeout = useMemo(() => ({ current: null as NodeJS.Timeout | null }), []);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => setDebouncedSearch(text), 400);
    },
    [searchTimeout]
  );

  const toggleDietary = useCallback((flag: string) => {
    setDietaryFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }, []);

  // Build query params
  const queryParams = useMemo(() => {
    const p: Record<string, string | number | boolean | undefined> = {
      limit: 50,
    };
    if (debouncedSearch) p.search = debouncedSearch;
    if (cuisine) p.cuisine = cuisine;
    if (difficulty) p.difficulty = difficulty;
    if (maxTime) p.max_time = maxTime;
    if (dietaryFlags.size > 0) {
      // Backend doesn't have a dietary filter param on list endpoint,
      // so we pass tags which can be used for filtering.
      // We'll filter client-side for dietary flags.
    }
    return p;
  }, [debouncedSearch, cuisine, difficulty, maxTime, dietaryFlags]);

  const {
    data,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<RecipeListResponse>({
    queryKey: ["recipes", queryParams],
    queryFn: () => api.get<RecipeListResponse>("/recipes", queryParams),
  });

  // Client-side dietary filtering (API doesn't support multi-flag filter)
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (dietaryFlags.size === 0) return data.items;
    return data.items.filter((item) =>
      Array.from(dietaryFlags).every((flag) =>
        item.dietary_flags.includes(flag)
      )
    );
  }, [data?.items, dietaryFlags]);

  const activeFilterCount =
    (cuisine ? 1 : 0) +
    (difficulty ? 1 : 0) +
    (maxTime ? 1 : 0) +
    dietaryFlags.size;

  const clearFilters = useCallback(() => {
    setCuisine(null);
    setDifficulty(null);
    setMaxTime(null);
    setDietaryFlags(new Set());
  }, []);

  const renderRecipe = useCallback(
    ({ item }: { item: RecipeListItem }) => (
      <RecipeCard
        item={item}
        onPress={() => router.push(`/recipes/${item.id}`)}
      />
    ),
    [router]
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter toggle */}
        <TouchableOpacity
          style={styles.filterToggle}
          onPress={() => setFiltersExpanded((v) => !v)}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeFilterCount > 0 ? colors.primary : colors.mutedForeground}
          />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filters panel */}
      {filtersExpanded && (
        <View style={styles.filtersPanel}>
          <ChipRow
            label="Cuisine"
            options={CUISINES}
            selected={cuisine}
            onSelect={(v) => setCuisine(v as string | null)}
          />
          <ChipRow
            label="Difficulty"
            options={DIFFICULTIES}
            selected={difficulty}
            onSelect={(v) => setDifficulty(v as string | null)}
          />
          <ChipRow
            label="Max Time"
            options={MAX_TIME_OPTIONS}
            selected={maxTime}
            onSelect={(v) => setMaxTime(v as number | null)}
          />
          <DietaryChipRow selected={dietaryFlags} onToggle={toggleDietary} />

          {activeFilterCount > 0 && (
            <TouchableOpacity style={styles.clearFilters} onPress={clearFilters}>
              <Ionicons name="close" size={14} color={colors.destructive} />
              <Text style={styles.clearFiltersText}>Clear all filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Recipe list */}
      {isLoading && !isRefetching ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="restaurant-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No recipes found</Text>
          <Text style={styles.emptySubtitle}>
            {activeFilterCount > 0 || debouncedSearch
              ? "Try adjusting your search or filters"
              : "Tap + to add your first recipe"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderRecipe}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/recipes/new")}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.primaryForeground} />
      </TouchableOpacity>
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

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  filterToggle: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  filterBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  filterBadgeText: {
    color: colors.primaryForeground,
    fontSize: 10,
    fontWeight: "700",
  },

  // Filters panel
  filtersPanel: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chipSection: {
    marginTop: spacing.sm,
  },
  chipLabel: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
    marginRight: spacing.xs,
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
  clearFilters: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  clearFiltersText: {
    fontSize: fontSize.sm,
    color: colors.destructive,
  },

  // List
  listContent: {
    padding: spacing.md,
    paddingBottom: 100,
  },

  // Card
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  cardName: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.cardForeground,
    marginRight: spacing.sm,
  },
  badgeRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginLeft: 4,
  },
  dietaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dietaryChip: {
    backgroundColor: colors.purple.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  dietaryChipText: {
    fontSize: fontSize.xs,
    color: colors.purple.text,
  },
  dietaryMore: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    alignSelf: "center",
  },

  // Empty
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
    textAlign: "center",
    marginTop: spacing.xs,
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: spacing.lg,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
