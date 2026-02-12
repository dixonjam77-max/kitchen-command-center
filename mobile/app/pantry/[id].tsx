import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

/* ── Types ──────────────────────────────────────────────────────── */

interface PantryItemDetail {
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
  freshness_status: string | null;
  freshness_expires_at: string | null;
  min_quantity: number | null;
  is_staple: boolean;
  preferred_brand: string | null;
  batch_info: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/* ── Constants ──────────────────────────────────────────────────── */

const FRESHNESS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; borderColor: string }
> = {
  fresh: {
    label: "Fresh",
    color: colors.green.text,
    bg: colors.green.bg,
    borderColor: colors.green.border,
  },
  use_soon: {
    label: "Use Soon",
    color: colors.orange.text,
    bg: colors.orange.bg,
    borderColor: colors.orange.border,
  },
  use_today: {
    label: "Use Today",
    color: colors.red.text,
    bg: colors.red.bg,
    borderColor: colors.red.border,
  },
  expired: {
    label: "Expired",
    color: colors.gray.text,
    bg: colors.gray.bg,
    borderColor: colors.gray.border,
  },
};

const WASTE_REASONS = [
  "expired",
  "spoiled",
  "leftover",
  "overcooked",
  "didn't like",
  "forgot about it",
  "other",
];

const CATEGORIES = [
  "produce", "dairy", "meat", "seafood", "grains", "spices",
  "canned", "frozen", "condiments", "baking", "beverages",
  "snacks", "oils", "asian_pantry", "latin_pantry", "preserved", "alcohol",
];

const LOCATIONS = [
  "fridge", "freezer", "pantry", "spice_rack", "counter", "bar", "garage",
];

/* ── Component ──────────────────────────────────────────────────── */

export default function PantryItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteReason, setWasteReason] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const [wasteNotes, setWasteNotes] = useState("");

  /* ── Query ────────────────────────────────────────────────── */

  const { data: item, isLoading } = useQuery({
    queryKey: ["pantry-item", id],
    queryFn: () => api.get<PantryItemDetail>(`/pantry/${id}`),
    enabled: isAuthenticated && !!id,
  });

  /* ── Mutations ────────────────────────────────────────────── */

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["pantry-item", id] });
    queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
    queryClient.invalidateQueries({ queryKey: ["pantry-count"] });
    queryClient.invalidateQueries({ queryKey: ["freshness-dashboard"] });
  };

  const openMut = useMutation({
    mutationFn: () => api.post<PantryItemDetail>(`/pantry/${id}/open`),
    onSuccess: () => invalidateAll(),
  });

  const adjustMut = useMutation({
    mutationFn: (amount: number) =>
      api.post<PantryItemDetail>(`/pantry/${id}/adjust`, { amount }),
    onSuccess: () => invalidateAll(),
  });

  const wasteMut = useMutation({
    mutationFn: (payload: {
      reason: string;
      quantity_wasted?: number;
      notes?: string;
    }) => api.post(`/pantry/${id}/waste`, payload),
    onSuccess: () => {
      invalidateAll();
      setShowWasteModal(false);
      setWasteReason("");
      setWasteQty("");
      setWasteNotes("");
      Alert.alert("Waste Logged", "The waste has been recorded.");
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch<PantryItemDetail>(`/pantry/${id}`, payload),
    onSuccess: () => {
      invalidateAll();
      setEditing(false);
      setEditFields({});
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.del(`/pantry/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pantry-items"] });
      queryClient.invalidateQueries({ queryKey: ["pantry-count"] });
      router.back();
    },
  });

  /* ── Handlers ─────────────────────────────────────────────── */

  function handleDelete() {
    Alert.alert(
      "Delete Item",
      `Are you sure you want to permanently delete "${item?.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMut.mutate(),
        },
      ]
    );
  }

  function handleMarkOpened() {
    if (item?.opened_date) {
      Alert.alert("Already Opened", "This item is already marked as opened.");
      return;
    }
    openMut.mutate();
  }

  function handleWasteSubmit() {
    if (!wasteReason) {
      Alert.alert("Required", "Please select a waste reason.");
      return;
    }
    const payload: {
      reason: string;
      quantity_wasted?: number;
      notes?: string;
    } = { reason: wasteReason };
    if (wasteQty) payload.quantity_wasted = parseFloat(wasteQty);
    if (wasteNotes) payload.notes = wasteNotes;
    wasteMut.mutate(payload);
  }

  function startEditing() {
    if (!item) return;
    setEditFields({
      name: item.name || "",
      category: item.category || "",
      subcategory: item.subcategory || "",
      quantity: item.quantity != null ? String(item.quantity) : "",
      unit: item.unit || "",
      location: item.location || "",
      brand: item.brand || "",
      expiration_date: item.expiration_date || "",
      notes: item.notes || "",
    });
    setEditing(true);
  }

  function handleSaveEdits() {
    if (!item) return;
    const payload: Record<string, unknown> = {};
    if (editFields.name && editFields.name !== item.name)
      payload.name = editFields.name;
    if (editFields.category !== (item.category || ""))
      payload.category = editFields.category || null;
    if (editFields.subcategory !== (item.subcategory || ""))
      payload.subcategory = editFields.subcategory || null;
    if (editFields.quantity !== (item.quantity != null ? String(item.quantity) : ""))
      payload.quantity = editFields.quantity ? parseFloat(editFields.quantity) : null;
    if (editFields.unit !== (item.unit || ""))
      payload.unit = editFields.unit || null;
    if (editFields.location !== (item.location || ""))
      payload.location = editFields.location || null;
    if (editFields.brand !== (item.brand || ""))
      payload.brand = editFields.brand || null;
    if (editFields.expiration_date !== (item.expiration_date || ""))
      payload.expiration_date = editFields.expiration_date || null;
    if (editFields.notes !== (item.notes || ""))
      payload.notes = editFields.notes || null;

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }
    updateMut.mutate(payload);
  }

  /* ── Loading / Error ──────────────────────────────────────── */

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.border} />
        <Text style={styles.errorText}>Item not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ── Derived ──────────────────────────────────────────────── */

  const freshnessKey = item.freshness_status || "fresh";
  const fConfig = FRESHNESS_CONFIG[freshnessKey] || FRESHNESS_CONFIG.fresh;

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* ═══ Freshness Badge + Name ═══ */}
      <View style={styles.headerSection}>
        <View
          style={[
            styles.freshnessBadge,
            { backgroundColor: fConfig.bg, borderColor: fConfig.borderColor },
          ]}
        >
          <Text style={[styles.freshnessBadgeText, { color: fConfig.color }]}>
            {fConfig.label}
          </Text>
        </View>
        {!editing ? (
          <Text style={styles.itemName}>{item.name}</Text>
        ) : (
          <TextInput
            style={[styles.itemName, styles.editField]}
            value={editFields.name}
            onChangeText={(v) => setEditFields({ ...editFields, name: v })}
          />
        )}
        {item.brand && !editing ? (
          <Text style={styles.brandText}>{item.brand}</Text>
        ) : null}
      </View>

      {/* ═══ Quick Actions ═══ */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline]}
          onPress={handleMarkOpened}
          disabled={openMut.isPending || !!item.opened_date}
        >
          <Ionicons
            name="open-outline"
            size={18}
            color={item.opened_date ? colors.mutedForeground : colors.primary}
          />
          <Text
            style={[
              styles.actionBtnText,
              item.opened_date && { color: colors.mutedForeground },
            ]}
          >
            {item.opened_date ? "Opened" : "Mark Opened"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline]}
          onPress={() => setShowWasteModal(true)}
        >
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
          <Text style={[styles.actionBtnText, { color: colors.destructive }]}>
            Log Waste
          </Text>
        </TouchableOpacity>
      </View>

      {/* ═══ Adjust Quantity ═══ */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Quantity</Text>
        <View style={styles.adjustRow}>
          <TouchableOpacity
            style={styles.adjustBtn}
            onPress={() => adjustMut.mutate(-1)}
            disabled={adjustMut.isPending}
          >
            <Ionicons name="remove" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.qtyDisplay}>
            <Text style={styles.qtyNumber}>
              {item.quantity != null ? item.quantity : "--"}
            </Text>
            {item.unit ? (
              <Text style={styles.qtyUnit}>{item.unit}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.adjustBtn}
            onPress={() => adjustMut.mutate(1)}
            disabled={adjustMut.isPending}
          >
            <Ionicons name="add" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══ Details ═══ */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>Details</Text>
          {!editing ? (
            <TouchableOpacity onPress={startEditing}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <TouchableOpacity
                onPress={() => {
                  setEditing(false);
                  setEditFields({});
                }}
              >
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveEdits}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.editLink}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {!editing ? (
          /* Read-only detail rows */
          <>
            <DetailRow label="Category" value={item.category} />
            <DetailRow label="Subcategory" value={item.subcategory} />
            <DetailRow label="Location" value={item.location} />
            <DetailRow label="Brand" value={item.brand} />
            <DetailRow label="Expiration" value={item.expiration_date} />
            <DetailRow label="Opened" value={item.opened_date} />
            <DetailRow label="Purchased" value={item.purchase_date} />
            <DetailRow
              label="Freshness Expires"
              value={item.freshness_expires_at}
            />
            <DetailRow
              label="Min Quantity"
              value={item.min_quantity != null ? String(item.min_quantity) : null}
            />
            <DetailRow label="Staple" value={item.is_staple ? "Yes" : "No"} />
            <DetailRow label="Preferred Brand" value={item.preferred_brand} />
            <DetailRow label="Batch Info" value={item.batch_info} />
            <DetailRow label="Notes" value={item.notes} />
          </>
        ) : (
          /* Edit mode fields */
          <>
            <EditField
              label="Category"
              value={editFields.category}
              onChangeText={(v) =>
                setEditFields({ ...editFields, category: v })
              }
              chipOptions={CATEGORIES}
            />
            <EditField
              label="Subcategory"
              value={editFields.subcategory}
              onChangeText={(v) =>
                setEditFields({ ...editFields, subcategory: v })
              }
            />
            <EditField
              label="Location"
              value={editFields.location}
              onChangeText={(v) =>
                setEditFields({ ...editFields, location: v })
              }
              chipOptions={LOCATIONS}
            />
            <EditField
              label="Brand"
              value={editFields.brand}
              onChangeText={(v) =>
                setEditFields({ ...editFields, brand: v })
              }
            />
            <EditField
              label="Expiration (YYYY-MM-DD)"
              value={editFields.expiration_date}
              onChangeText={(v) =>
                setEditFields({ ...editFields, expiration_date: v })
              }
            />
            <EditField
              label="Notes"
              value={editFields.notes}
              onChangeText={(v) =>
                setEditFields({ ...editFields, notes: v })
              }
              multiline
            />
          </>
        )}
      </View>

      {/* ═══ Delete Button ═══ */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDelete}
        disabled={deleteMut.isPending}
      >
        {deleteMut.isPending ? (
          <ActivityIndicator size="small" color={colors.destructive} />
        ) : (
          <>
            <Ionicons name="trash" size={18} color={colors.destructive} />
            <Text style={styles.deleteBtnText}>Delete Item</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Bottom spacing */}
      <View style={{ height: spacing.xl }} />

      {/* ═══ Waste Modal (inline) ═══ */}
      {showWasteModal && (
        <View style={styles.wasteOverlay}>
          <View style={styles.wasteSheet}>
            <View style={styles.wasteSheetHeader}>
              <Text style={styles.wasteSheetTitle}>Log Waste</Text>
              <TouchableOpacity onPress={() => setShowWasteModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Reason *</Text>
            <View style={styles.reasonGrid}>
              {WASTE_REASONS.map((reason) => {
                const active = wasteReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.reasonChip, active && styles.reasonChipActive]}
                    onPress={() => setWasteReason(reason)}
                  >
                    <Text
                      style={[
                        styles.reasonChipText,
                        active && styles.reasonChipTextActive,
                      ]}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>
              Quantity Wasted ({item.unit || "units"})
            </Text>
            <TextInput
              style={styles.textField}
              placeholder={
                item.quantity != null ? `All (${item.quantity})` : "Amount"
              }
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={wasteQty}
              onChangeText={setWasteQty}
            />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.textField, { minHeight: 60 }]}
              placeholder="Optional notes..."
              placeholderTextColor={colors.mutedForeground}
              value={wasteNotes}
              onChangeText={setWasteNotes}
              multiline
            />

            <TouchableOpacity
              style={styles.wasteSubmitBtn}
              onPress={handleWasteSubmit}
              disabled={wasteMut.isPending}
            >
              {wasteMut.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primaryForeground}
                />
              ) : (
                <Text style={styles.wasteSubmitText}>Log Waste</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>
        {value ? value.replace(/_/g, " ") : "--"}
      </Text>
    </View>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  chipOptions,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  chipOptions?: string[];
  multiline?: boolean;
}) {
  if (chipOptions) {
    return (
      <View style={styles.editFieldWrapper}>
        <Text style={styles.editFieldLabel}>{label}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexDirection: "row" }}
        >
          {chipOptions.map((opt) => {
            const active = value === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onChangeText(active ? "" : opt)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt.replace("_", " ")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.editFieldWrapper}>
      <Text style={styles.editFieldLabel}>{label}</Text>
      <TextInput
        style={[styles.textField, multiline && { minHeight: 60 }]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={colors.mutedForeground}
      />
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.mutedForeground,
    marginTop: spacing.md,
  },
  linkText: {
    fontSize: fontSize.base,
    color: colors.primary,
    marginTop: spacing.sm,
  },

  /* Header */
  headerSection: {
    marginBottom: spacing.lg,
  },
  freshnessBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  freshnessBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  itemName: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.foreground,
  },
  editField: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingBottom: spacing.xs,
  },
  brandText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },

  /* Actions row */
  actionsRow: {
    flexDirection: "row",
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
  },
  actionBtnOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.primary,
  },

  /* Adjust quantity */
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardLabel: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  adjustBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyDisplay: {
    alignItems: "center",
    minWidth: 80,
  },
  qtyNumber: {
    fontSize: fontSize["3xl"],
    fontWeight: "700",
    color: colors.foreground,
  },
  qtyUnit: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },

  /* Detail rows */
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    flex: 1,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.foreground,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
    textTransform: "capitalize",
  },

  /* Edit link */
  editLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "600",
  },
  cancelLink: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },

  /* Edit fields */
  editFieldWrapper: {
    marginBottom: spacing.sm,
  },
  editFieldLabel: {
    fontSize: fontSize.xs,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
    fontWeight: "500",
  },
  textField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === "ios" ? spacing.sm + 2 : spacing.sm,
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.background,
  },

  /* Chips (for edit mode) */
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
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

  /* Delete */
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  deleteBtnText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.destructive,
  },

  /* Waste modal overlay */
  wasteOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  wasteSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
  },
  wasteSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  wasteSheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
  },

  /* Waste form */
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.foreground,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  reasonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  reasonChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
  },
  reasonChipActive: {
    backgroundColor: colors.primary,
  },
  reasonChipText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    textTransform: "capitalize",
  },
  reasonChipTextActive: {
    color: colors.primaryForeground,
    fontWeight: "600",
  },
  wasteSubmitBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.destructive,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  wasteSubmitText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primaryForeground,
  },
});
