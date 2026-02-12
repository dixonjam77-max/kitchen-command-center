import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

/* ── Constants ──────────────────────────────────────────────────── */

const CATEGORIES = [
  "produce",
  "dairy",
  "meat",
  "seafood",
  "grains",
  "spices",
  "canned",
  "frozen",
  "condiments",
  "baking",
  "beverages",
  "snacks",
  "oils",
  "asian_pantry",
  "latin_pantry",
  "preserved",
  "alcohol",
];

const LOCATIONS = [
  "fridge",
  "freezer",
  "pantry",
  "spice_rack",
  "counter",
  "bar",
  "garage",
];

const UNITS = [
  "",
  "oz",
  "lb",
  "g",
  "kg",
  "ml",
  "L",
  "cup",
  "tbsp",
  "tsp",
  "count",
  "bunch",
  "bag",
  "box",
  "can",
  "bottle",
  "jar",
  "each",
];

const FRESHNESS_DOT_COLORS: Record<string, string> = {
  fresh: colors.fresh,
  use_soon: colors.useSoon,
  use_today: colors.useToday,
  expired: colors.expired,
};

/* ── Types ──────────────────────────────────────────────────────── */

interface PantryItem {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  quantity: number | null;
  unit: string | null;
  location: string | null;
  brand: string | null;
  freshness_status: string | null;
  expiration_date: string | null;
}

interface PantryListResponse {
  items: PantryItem[];
  total: number;
}

interface AddItemForm {
  name: string;
  category: string;
  quantity: string;
  unit: string;
  location: string;
  expiration_date: string;
}

const EMPTY_FORM: AddItemForm = {
  name: "",
  category: "",
  quantity: "",
  unit: "",
  location: "",
  expiration_date: "",
};

/* ── Component ──────────────────────────────────────────────────── */

export default function PantryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<AddItemForm>(EMPTY_FORM);
  const [refreshing, setRefreshing] = useState(false);

  /* ── Query ────────────────────────────────────────────────── */

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pantry-items", search, selectedCategory, selectedLocation],
    queryFn: () =>
      api.get<PantryListResponse>("/pantry", {
        search: search || undefined,
        category: selectedCategory || undefined,
        location: selectedLocation || undefined,
        limit: 50,
      }),
    enabled: isAuthenticated,
  });

  /* ── Mutations ────────────────────────────────────────────── */

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/pantry", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
      queryClient.invalidateQueries({ queryKey: ["pantry-count"] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/pantry/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
      queryClient.invalidateQueries({ queryKey: ["pantry-count"] });
    },
  });

  /* ── Handlers ─────────────────────────────────────────────── */

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function handleSubmit() {
    if (!form.name.trim()) {
      Alert.alert("Validation", "Item name is required.");
      return;
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
    };
    if (form.category) payload.category = form.category;
    if (form.quantity) payload.quantity = parseFloat(form.quantity);
    if (form.unit) payload.unit = form.unit;
    if (form.location) payload.location = form.location;
    if (form.expiration_date) payload.expiration_date = form.expiration_date;
    createMut.mutate(payload);
  }

  function handleDeletePress(item: PantryItem) {
    Alert.alert(
      "Delete Item",
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMut.mutate(item.id),
        },
      ]
    );
  }

  function toggleFilter(
    current: string,
    value: string,
    setter: (v: string) => void
  ) {
    setter(current === value ? "" : value);
  }

  /* ── Render Item ──────────────────────────────────────────── */

  function renderItem({ item }: { item: PantryItem }) {
    const dotColor =
      FRESHNESS_DOT_COLORS[item.freshness_status || "fresh"] || colors.fresh;

    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => router.push(`/pantry/${item.id}`)}
        onLongPress={() => handleDeletePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.itemLeft}>
          <View style={styles.itemNameRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.brand ? (
              <Text style={styles.itemBrand} numberOfLines={1}>
                {item.brand}
              </Text>
            ) : null}
          </View>
          <Text style={styles.itemMeta}>
            {item.category?.replace("_", " ") || "uncategorized"}
            {item.location ? ` / ${item.location.replace("_", " ")}` : ""}
          </Text>
        </View>
        <View style={styles.itemRight}>
          {item.quantity != null ? (
            <Text style={styles.itemQty}>
              {item.quantity} {item.unit || ""}
            </Text>
          ) : null}
          <View style={styles.freshnessRow}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={styles.freshnessText}>
              {(item.freshness_status || "fresh").replace("_", " ")}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  /* ── Render ───────────────────────────────────────────────── */

  const items = data?.items || [];

  return (
    <View style={styles.container}>
      {/* ═══ Search Bar ═══ */}
      <View style={styles.searchWrapper}>
        <Ionicons
          name="search"
          size={18}
          color={colors.mutedForeground}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search pantry items..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* ═══ Filter Chips ═══ */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScrollOuter}
        contentContainerStyle={styles.chipScroll}
      >
        {/* Category chips */}
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <TouchableOpacity
              key={`cat-${cat}`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() =>
                toggleFilter(selectedCategory, cat, setSelectedCategory)
              }
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {cat.replace("_", " ")}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Separator */}
        <View style={styles.chipSeparator} />

        {/* Location chips */}
        {LOCATIONS.map((loc) => {
          const active = selectedLocation === loc;
          return (
            <TouchableOpacity
              key={`loc-${loc}`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() =>
                toggleFilter(selectedLocation, loc, setSelectedLocation)
              }
            >
              <Ionicons
                name="location-outline"
                size={12}
                color={active ? colors.primaryForeground : colors.mutedForeground}
                style={{ marginRight: 2 }}
              />
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {loc.replace("_", " ")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ═══ Items List ═══ */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="basket-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No pantry items</Text>
          <Text style={styles.emptySubtitle}>
            Tap the + button to add your first item.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* ═══ Floating Add Button ═══ */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.primaryForeground} />
      </TouchableOpacity>

      {/* ═══ Add Item Modal ═══ */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Pantry Item</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.modalSave}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
          >
            {/* Name */}
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput
              style={styles.textField}
              placeholder="e.g. Chicken breast"
              placeholderTextColor={colors.mutedForeground}
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              autoFocus
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.fieldChipScroll}
            >
              {CATEGORIES.map((cat) => {
                const active = form.category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() =>
                      setForm({
                        ...form,
                        category: active ? "" : cat,
                      })
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {cat.replace("_", " ")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Quantity + Unit */}
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <TextInput
                  style={styles.textField}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={form.quantity}
                  onChangeText={(v) => setForm({ ...form, quantity: v })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Unit</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.fieldChipScroll}
                >
                  {UNITS.filter(Boolean).map((u) => {
                    const active = form.unit === u;
                    return (
                      <TouchableOpacity
                        key={u}
                        style={[styles.chipSmall, active && styles.chipActive]}
                        onPress={() =>
                          setForm({ ...form, unit: active ? "" : u })
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {u}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* Location */}
            <Text style={styles.fieldLabel}>Location</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.fieldChipScroll}
            >
              {LOCATIONS.map((loc) => {
                const active = form.location === loc;
                return (
                  <TouchableOpacity
                    key={loc}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() =>
                      setForm({
                        ...form,
                        location: active ? "" : loc,
                      })
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {loc.replace("_", " ")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Expiration Date */}
            <Text style={styles.fieldLabel}>Expiration Date</Text>
            <TextInput
              style={styles.textField}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              value={form.expiration_date}
              onChangeText={(v) => setForm({ ...form, expiration_date: v })}
              keyboardType={Platform.OS === "ios" ? "default" : "default"}
            />

            {/* Spacer for scroll */}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
  },

  /* Search */
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? spacing.sm + 2 : spacing.sm,
    fontSize: fontSize.base,
    color: colors.foreground,
  },

  /* Chips */
  chipScrollOuter: {
    maxHeight: 44,
    marginBottom: spacing.sm,
  },
  chipScroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
    marginRight: spacing.xs,
  },
  chipSmall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
    marginRight: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: colors.primaryForeground,
    fontWeight: "600",
  },
  chipSeparator: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },

  /* List */
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
  },
  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
  },
  itemLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  itemName: {
    fontSize: fontSize.base,
    fontWeight: "500",
    color: colors.foreground,
    flexShrink: 1,
  },
  itemBrand: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    flexShrink: 0,
  },
  itemMeta: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
    textTransform: "capitalize",
  },
  itemRight: {
    alignItems: "flex-end",
  },
  itemQty: {
    fontSize: fontSize.sm,
    color: colors.foreground,
    fontWeight: "500",
  },
  freshnessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  freshnessText: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    textTransform: "capitalize",
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },

  /* Empty state */
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },

  /* FAB */
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },

  /* Modal */
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCancel: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
  },
  modalSave: {
    fontSize: fontSize.base,
    color: colors.primary,
    fontWeight: "600",
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: spacing.md,
  },

  /* Form fields */
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.foreground,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  textField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === "ios" ? spacing.sm + 2 : spacing.sm,
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  fieldRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  fieldChipScroll: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
});
