import { useState, useCallback } from "react";
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
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useOfflineStore } from "@/lib/stores/offline-store";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

// --- Types ---

type GroceryListStatus = "active" | "shopping" | "completed" | "archived";

interface GroceryListSummary {
  id: string;
  name: string;
  status: GroceryListStatus;
  store: string | null;
  estimated_cost: number | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

type StatusFilter = "all" | GroceryListStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "shopping", label: "Shopping" },
  { key: "completed", label: "Completed" },
];

const STATUS_BADGE_COLORS: Record<GroceryListStatus, { bg: string; text: string }> = {
  active: { bg: colors.blue.bg, text: colors.blue.text },
  shopping: { bg: colors.orange.bg, text: colors.orange.text },
  completed: { bg: colors.green.bg, text: colors.green.text },
  archived: { bg: colors.gray.bg, text: colors.gray.text },
};

// --- Component ---

export default function GroceryScreen() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createStore, setCreateStore] = useState("");
  const [genStartDate, setGenStartDate] = useState("");
  const [genEndDate, setGenEndDate] = useState("");
  const [genListName, setGenListName] = useState("");

  const isOnline = useOfflineStore((s) => s.isOnline);
  const offlineLists = useOfflineStore((s) => s.groceryLists);
  const cacheAllLists = useOfflineStore((s) => s.cacheAllLists);

  // --- Data fetching ---

  const {
    data: lists,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<GroceryListSummary[]>({
    queryKey: ["grocery-lists"],
    queryFn: async () => {
      const data = await api.get<GroceryListSummary[]>("/grocery");
      // Cache for offline use
      cacheAllLists(
        data.map((l) => ({ ...l, items: [] })) as any
      );
      return data;
    },
    enabled: isOnline,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; store?: string }) =>
      api.post("/grocery", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-lists"] });
      setShowCreateModal(false);
      setCreateName("");
      setCreateStore("");
    },
  });

  const generateMutation = useMutation({
    mutationFn: (body: { start_date: string; end_date: string; list_name?: string }) =>
      api.post("/grocery/generate-from-plan", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-lists"] });
      setShowGenerateModal(false);
      setGenStartDate("");
      setGenEndDate("");
      setGenListName("");
    },
  });

  // --- Derived data ---

  const displayLists = isOnline
    ? lists ?? []
    : offlineLists.map((l) => ({
        ...l,
        item_count: l.items?.length ?? 0,
      }));

  const filteredLists =
    statusFilter === "all"
      ? displayLists
      : displayLists.filter((l) => l.status === statusFilter);

  // --- Handlers ---

  const handleCreate = () => {
    if (!createName.trim()) return;
    const body: { name: string; store?: string } = { name: createName.trim() };
    if (createStore.trim()) body.store = createStore.trim();
    createMutation.mutate(body);
  };

  const handleGenerate = () => {
    if (!genStartDate.trim() || !genEndDate.trim()) return;
    const body: { start_date: string; end_date: string; list_name?: string } = {
      start_date: genStartDate.trim(),
      end_date: genEndDate.trim(),
    };
    if (genListName.trim()) body.list_name = genListName.trim();
    generateMutation.mutate(body);
  };

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // --- Render helpers ---

  const renderStatusBadge = (status: GroceryListStatus) => {
    const badgeColors = STATUS_BADGE_COLORS[status] ?? STATUS_BADGE_COLORS.active;
    return (
      <View style={[styles.badge, { backgroundColor: badgeColors.bg }]}>
        <Text style={[styles.badgeText, { color: badgeColors.text }]}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
      </View>
    );
  };

  const renderListCard = ({ item }: { item: GroceryListSummary }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push(`/grocery/${item.id}`)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.name}
        </Text>
        {renderStatusBadge(item.status as GroceryListStatus)}
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="list-outline" size={14} color={colors.mutedForeground} />
          <Text style={styles.metaText}>
            {item.item_count} {item.item_count === 1 ? "item" : "items"}
          </Text>
        </View>
        {item.store && (
          <View style={styles.metaItem}>
            <Ionicons name="storefront-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.metaText}>{item.store}</Text>
          </View>
        )}
        {item.estimated_cost != null && item.estimated_cost > 0 && (
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.metaText}>${item.estimated_cost.toFixed(2)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={64} color={colors.border} />
        <Text style={styles.emptyTitle}>No grocery lists</Text>
        <Text style={styles.emptySubtitle}>
          {statusFilter !== "all"
            ? `No ${statusFilter} lists found. Try a different filter.`
            : "Create your first grocery list or generate one from your meal plan."}
        </Text>
      </View>
    );
  };

  // --- Main render ---

  return (
    <View style={styles.container}>
      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.orange.text} />
          <Text style={styles.offlineBannerText}>Offline Mode</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.7}
          disabled={!isOnline}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primaryForeground} />
          <Text style={styles.actionButtonText}>Create List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonSecondary]}
          onPress={() => setShowGenerateModal(true)}
          activeOpacity={0.7}
          disabled={!isOnline}
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
            From Meal Plan
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterTab,
              statusFilter === f.key && styles.filterTabActive,
            ]}
            onPress={() => setStatusFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterTabText,
                statusFilter === f.key && styles.filterTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {isLoading && isOnline ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredLists}
          keyExtractor={(item) => item.id}
          renderItem={renderListCard}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Create List Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Grocery List</Text>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={!createName.trim() || createMutation.isPending}
            >
              <Text
                style={[
                  styles.modalDone,
                  (!createName.trim() || createMutation.isPending) &&
                    styles.modalDoneDisabled,
                ]}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {createMutation.isError && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.destructive} />
                <Text style={styles.errorText}>
                  {createMutation.error instanceof Error
                    ? createMutation.error.message
                    : "Failed to create list"}
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>List Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Weekly Groceries"
                placeholderTextColor={colors.mutedForeground}
                value={createName}
                onChangeText={setCreateName}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Store (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Trader Joe's"
                placeholderTextColor={colors.mutedForeground}
                value={createStore}
                onChangeText={setCreateStore}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Generate from Meal Plan Modal */}
      <Modal
        visible={showGenerateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowGenerateModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowGenerateModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Generate from Meal Plan</Text>
            <TouchableOpacity
              onPress={handleGenerate}
              disabled={
                !genStartDate.trim() ||
                !genEndDate.trim() ||
                generateMutation.isPending
              }
            >
              <Text
                style={[
                  styles.modalDone,
                  (!genStartDate.trim() ||
                    !genEndDate.trim() ||
                    generateMutation.isPending) &&
                    styles.modalDoneDisabled,
                ]}
              >
                {generateMutation.isPending ? "Generating..." : "Generate"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {generateMutation.isError && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.destructive} />
                <Text style={styles.errorText}>
                  {generateMutation.error instanceof Error
                    ? generateMutation.error.message
                    : "Failed to generate list"}
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Start Date *</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={genStartDate}
                onChangeText={setGenStartDate}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>End Date *</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={genEndDate}
                onChangeText={setGenEndDate}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>List Name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Auto-generated if empty"
                placeholderTextColor={colors.mutedForeground}
                value={genListName}
                onChangeText={setGenListName}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
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
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
  },
  actionButtonSecondary: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.primaryForeground,
  },
  actionButtonTextSecondary: {
    color: colors.primary,
  },
  filterRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.mutedForeground,
  },
  filterTabTextActive: {
    color: colors.primaryForeground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.cardForeground,
    marginRight: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: 80,
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
    textAlign: "center",
    marginTop: spacing.xs,
    lineHeight: 20,
  },

  // Modal styles
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
});
