import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  Alert,
  SectionList,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useOfflineStore } from "@/lib/stores/offline-store";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

// --- Types ---

interface GroceryItem {
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

interface GroceryList {
  id: string;
  name: string;
  status: string;
  store: string | null;
  estimated_cost: number | null;
  notes: string | null;
  items: GroceryItem[];
  created_at: string;
  updated_at: string;
}

interface StoreGroup {
  store: string;
  items: { item_name: string; quantity: number | null; unit: string | null }[];
}

type ListStatus = "active" | "shopping" | "completed";

const NEXT_STATUS: Record<string, ListStatus> = {
  active: "shopping",
  shopping: "completed",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Start Shopping",
  shopping: "Mark Completed",
  completed: "Completed",
};

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  active: "cart-outline",
  shopping: "checkmark-done-outline",
  completed: "checkmark-circle",
};

// --- Component ---

export default function GroceryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [shoppingMode, setShoppingMode] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitData, setSplitData] = useState<Record<string, StoreGroup> | null>(null);

  // Add item form
  const [addName, setAddName] = useState("");
  const [addQuantity, setAddQuantity] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addCategory, setAddCategory] = useState("");

  const isOnline = useOfflineStore((s) => s.isOnline);
  const offlineLists = useOfflineStore((s) => s.groceryLists);
  const offlineCheck = useOfflineStore((s) => s.checkItem);
  const offlineUncheck = useOfflineStore((s) => s.uncheckItem);
  const cacheGroceryList = useOfflineStore((s) => s.cacheGroceryList);
  const pendingActions = useOfflineStore((s) => s.pendingActions);

  // --- Data fetching ---

  const {
    data: list,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<GroceryList>({
    queryKey: ["grocery-list", id],
    queryFn: async () => {
      const data = await api.get<GroceryList>(`/grocery/${id}`);
      cacheGroceryList({
        id: data.id,
        name: data.name,
        status: data.status,
        store: data.store,
        estimated_cost: data.estimated_cost,
        items: data.items.map((i) => ({
          id: i.id,
          item_name: i.item_name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
          checked: i.checked,
          added_to_pantry: i.added_to_pantry,
          source: i.source,
          notes: i.notes,
        })),
      });
      return data;
    },
    enabled: isOnline,
  });

  // Fallback to offline data
  const offlineList = offlineLists.find((l) => l.id === id);

  const displayList = isOnline ? list : offlineList;
  const displayItems: GroceryItem[] = useMemo(() => {
    if (!displayList) return [];
    return (displayList.items ?? []) as GroceryItem[];
  }, [displayList]);

  // --- Mutations ---

  const toggleItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      checked,
    }: {
      itemId: string;
      checked: boolean;
    }) => {
      if (checked) {
        await offlineCheck(id!, itemId);
      } else {
        await offlineUncheck(id!, itemId);
      }
    },
    onSuccess: () => {
      if (isOnline) {
        queryClient.invalidateQueries({ queryKey: ["grocery-list", id] });
      }
    },
  });

  const addToPantryMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/grocery/${id}/items/${itemId}/to-pantry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-list", id] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (body: {
      item_name: string;
      quantity?: number;
      unit?: string;
      category?: string;
    }) => api.post(`/grocery/${id}/items`, [body]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-list", id] });
      setShowAddItemModal(false);
      setAddName("");
      setAddQuantity("");
      setAddUnit("");
      setAddCategory("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/grocery/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-list", id] });
      queryClient.invalidateQueries({ queryKey: ["grocery-lists"] });
    },
  });

  const splitByStoreMutation = useMutation({
    mutationFn: () =>
      api.post<{ stores: Record<string, StoreGroup> }>(
        `/grocery/${id}/split-by-store`
      ),
    onSuccess: (data: any) => {
      setSplitData(data.stores ?? data);
      setShowSplitModal(true);
    },
  });

  // --- Derived values ---

  const checkedCount = displayItems.filter((i) => i.checked).length;
  const totalCount = displayItems.length;
  const progress = totalCount > 0 ? checkedCount / totalCount : 0;

  const runningTotal = useMemo(() => {
    return displayItems
      .filter((i) => i.checked && i.estimated_price)
      .reduce((sum, i) => sum + (i.estimated_price ?? 0), 0);
  }, [displayItems]);

  const sections = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    for (const item of displayItems) {
      const cat = item.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [displayItems]);

  const pendingCount = pendingActions.filter(
    (a) => a.list_id === id
  ).length;

  // --- Handlers ---

  const handleToggleItem = (item: GroceryItem) => {
    toggleItemMutation.mutate({ itemId: item.id, checked: !item.checked });
  };

  const handleAddToPantry = (item: GroceryItem) => {
    Alert.alert("Add to Pantry", `Add "${item.item_name}" to your pantry?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add",
        onPress: () => addToPantryMutation.mutate(item.id),
      },
    ]);
  };

  const handleStatusChange = () => {
    const currentStatus = displayList?.status ?? "active";
    const next = NEXT_STATUS[currentStatus];
    if (!next) return;
    updateStatusMutation.mutate(next);
  };

  const handleAddItem = () => {
    if (!addName.trim()) return;
    const body: {
      item_name: string;
      quantity?: number;
      unit?: string;
      category?: string;
    } = { item_name: addName.trim() };
    if (addQuantity.trim()) body.quantity = parseFloat(addQuantity);
    if (addUnit.trim()) body.unit = addUnit.trim();
    if (addCategory.trim()) body.category = addCategory.trim();
    addItemMutation.mutate(body);
  };

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // --- Render helpers ---

  const renderItem = ({ item }: { item: GroceryItem }) => {
    const nameStyle = item.checked
      ? [styles.itemName, styles.itemNameChecked]
      : styles.itemName;

    return (
      <TouchableOpacity
        style={[styles.itemRow, shoppingMode && styles.itemRowShopping]}
        onPress={() => handleToggleItem(item)}
        activeOpacity={0.6}
      >
        {/* Checkbox */}
        <View
          style={[
            styles.checkbox,
            item.checked && styles.checkboxChecked,
          ]}
        >
          {item.checked && (
            <Ionicons
              name="checkmark"
              size={shoppingMode ? 18 : 14}
              color={colors.primaryForeground}
            />
          )}
        </View>

        {/* Item info */}
        <View style={styles.itemInfo}>
          <Text
            style={[nameStyle, shoppingMode && styles.itemNameShopping]}
            numberOfLines={1}
          >
            {item.item_name}
          </Text>
          {!shoppingMode && (
            <View style={styles.itemDetails}>
              {item.quantity != null && (
                <Text style={styles.itemDetail}>
                  {item.quantity}
                  {item.unit ? ` ${item.unit}` : ""}
                </Text>
              )}
              {item.estimated_price != null && item.estimated_price > 0 && (
                <Text style={styles.itemDetail}>
                  ${item.estimated_price.toFixed(2)}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Add to pantry (on checked items only) */}
        {item.checked && !item.added_to_pantry && isOnline && (
          <TouchableOpacity
            style={styles.pantryButton}
            onPress={() => handleAddToPantry(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="nutrition-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
        {item.added_to_pantry && (
          <View style={styles.pantryBadge}>
            <Ionicons name="checkmark-circle" size={16} color={colors.fresh} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({
    section,
  }: {
    section: { title: string; data: GroceryItem[] };
  }) => {
    if (shoppingMode) return null;
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.data.length}</Text>
      </View>
    );
  };

  // --- Loading / empty ---

  if (isLoading && isOnline && !offlineList) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!displayList) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.emptyTitle}>List not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Main render ---

  const currentStatus = displayList.status ?? "active";

  return (
    <View style={styles.container}>
      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.orange.text} />
          <Text style={styles.offlineBannerText}>
            Offline Mode{pendingCount > 0 ? ` (${pendingCount} pending)` : ""}
          </Text>
        </View>
      )}

      {/* Header (hidden in shopping mode) */}
      {!shoppingMode && (
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayList.name}
          </Text>
          <View style={styles.headerMeta}>
            {displayList.store && (
              <View style={styles.metaItem}>
                <Ionicons
                  name="storefront-outline"
                  size={14}
                  color={colors.mutedForeground}
                />
                <Text style={styles.metaText}>{displayList.store}</Text>
              </View>
            )}
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    currentStatus === "active"
                      ? colors.blue.bg
                      : currentStatus === "shopping"
                      ? colors.orange.bg
                      : colors.green.bg,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  {
                    color:
                      currentStatus === "active"
                        ? colors.blue.text
                        : currentStatus === "shopping"
                        ? colors.orange.text
                        : colors.green.text,
                  },
                ]}
              >
                {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>
            {checkedCount}/{totalCount} items
          </Text>
          {runningTotal > 0 && (
            <Text style={styles.progressText}>
              ${runningTotal.toFixed(2)} checked
            </Text>
          )}
        </View>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[
            styles.toolbarButton,
            shoppingMode && styles.toolbarButtonActive,
          ]}
          onPress={() => setShoppingMode(!shoppingMode)}
        >
          <Ionicons
            name={shoppingMode ? "eye-off-outline" : "cart-outline"}
            size={16}
            color={shoppingMode ? colors.primaryForeground : colors.primary}
          />
          <Text
            style={[
              styles.toolbarButtonText,
              shoppingMode && styles.toolbarButtonTextActive,
            ]}
          >
            {shoppingMode ? "Exit Shopping" : "Shopping Mode"}
          </Text>
        </TouchableOpacity>

        {isOnline && (
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => splitByStoreMutation.mutate()}
            disabled={splitByStoreMutation.isPending}
          >
            {splitByStoreMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons
                  name="git-branch-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.toolbarButtonText}>Split by Store</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {NEXT_STATUS[currentStatus] && isOnline && (
          <TouchableOpacity
            style={[styles.toolbarButton, styles.toolbarButtonStatus]}
            onPress={handleStatusChange}
            disabled={updateStatusMutation.isPending}
          >
            {updateStatusMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons
                  name={STATUS_ICON[currentStatus]}
                  size={16}
                  color={colors.primaryForeground}
                />
                <Text style={styles.toolbarButtonStatusText}>
                  {STATUS_LABEL[currentStatus]}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Items list */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={!shoppingMode}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="basket-outline" size={48} color={colors.border} />
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to add items to this list.
            </Text>
          </View>
        }
      />

      {/* FAB - Add Item */}
      {isOnline && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAddItemModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={colors.primaryForeground} />
        </TouchableOpacity>
      )}

      {/* Add Item Modal */}
      <Modal
        visible={showAddItemModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddItemModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddItemModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Item</Text>
            <TouchableOpacity
              onPress={handleAddItem}
              disabled={!addName.trim() || addItemMutation.isPending}
            >
              <Text
                style={[
                  styles.modalDone,
                  (!addName.trim() || addItemMutation.isPending) &&
                    styles.modalDoneDisabled,
                ]}
              >
                {addItemMutation.isPending ? "Adding..." : "Add"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {addItemMutation.isError && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.destructive} />
                <Text style={styles.errorText}>
                  {addItemMutation.error instanceof Error
                    ? addItemMutation.error.message
                    : "Failed to add item"}
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Item Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Organic Milk"
                placeholderTextColor={colors.mutedForeground}
                value={addName}
                onChangeText={setAddName}
                autoFocus
              />
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Quantity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                  value={addQuantity}
                  onChangeText={setAddQuantity}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Unit</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gal"
                  placeholderTextColor={colors.mutedForeground}
                  value={addUnit}
                  onChangeText={setAddUnit}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Category</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Dairy"
                placeholderTextColor={colors.mutedForeground}
                value={addCategory}
                onChangeText={setAddCategory}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Split by Store Modal */}
      <Modal
        visible={showSplitModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSplitModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowSplitModal(false)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Split by Store</Text>
            <View style={{ width: 50 }} />
          </View>

          <FlatList
            data={splitData ? Object.entries(splitData) : []}
            keyExtractor={([store]) => store}
            contentContainerStyle={styles.modalBody}
            renderItem={({ item: [store, group] }) => (
              <View style={styles.splitStoreCard}>
                <View style={styles.splitStoreHeader}>
                  <Ionicons
                    name="storefront"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.splitStoreName}>{store}</Text>
                  <Text style={styles.splitStoreCount}>
                    {(group as StoreGroup).items?.length ?? 0} items
                  </Text>
                </View>
                {(group as StoreGroup).items?.map((storeItem, idx) => (
                  <View key={idx} style={styles.splitItem}>
                    <Text style={styles.splitItemName} numberOfLines={1}>
                      {storeItem.item_name}
                    </Text>
                    {storeItem.quantity != null && (
                      <Text style={styles.splitItemQty}>
                        {storeItem.quantity}
                        {storeItem.unit ? ` ${storeItem.unit}` : ""}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptySubtitle}>
                  No store splits available.
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.orange.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.orange.border,
    paddingVertical: spacing.sm,
  },
  offlineBannerText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.orange.text,
  },

  // Header
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },

  // Progress
  progressSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  progressText: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },

  // Toolbar
  toolbar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: "wrap",
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toolbarButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toolbarButtonText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.primary,
  },
  toolbarButtonTextActive: {
    color: colors.primaryForeground,
  },
  toolbarButtonStatus: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toolbarButtonStatusText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.primaryForeground,
  },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
    flexGrow: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.foreground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    fontWeight: "500",
  },

  // Item row
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  itemRowShopping: {
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: fontSize.base,
    color: colors.foreground,
    fontWeight: "500",
  },
  itemNameChecked: {
    textDecorationLine: "line-through",
    color: colors.mutedForeground,
  },
  itemNameShopping: {
    fontSize: fontSize.lg,
  },
  itemDetails: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 2,
  },
  itemDetail: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  pantryButton: {
    padding: spacing.xs,
  },
  pantryBadge: {
    padding: spacing.xs,
  },

  // Empty
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  linkText: {
    fontSize: fontSize.base,
    color: colors.primary,
    fontWeight: "600",
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
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  // Modal
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
  modalDone: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primary,
  },
  modalDoneDisabled: {
    opacity: 0.4,
  },
  modalBody: {
    padding: spacing.md,
    gap: spacing.md,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.red.bg,
    borderWidth: 1,
    borderColor: colors.red.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.red.text,
    fontSize: fontSize.sm,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.foreground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  rowInputs: {
    flexDirection: "row",
    gap: spacing.sm,
  },

  // Split by store
  splitStoreCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  splitStoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  splitStoreName: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.foreground,
  },
  splitStoreCount: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
  },
  splitItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  splitItemName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  splitItemQty: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
});
