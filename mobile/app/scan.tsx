import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  FlatList,
  Image,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  CameraType,
  useCameraPermissions,
  BarcodeScanningResult,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { colors, spacing, fontSize, borderRadius } from "@/lib/theme";

// --- Types ---

type ScanMode = "barcode" | "receipt" | "recipe";

interface ParsedReceiptItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  category: string | null;
}

interface ParsedRecipe {
  name: string;
  description: string | null;
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  ingredients: { ingredient_name: string; quantity: number | null; unit: string | null }[];
  instructions: { step: number; text: string }[];
}

const MODE_TABS: { key: ScanMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "barcode", label: "Barcode", icon: "barcode-outline" },
  { key: "receipt", label: "Receipt", icon: "receipt-outline" },
  { key: "recipe", label: "Recipe Photo", icon: "book-outline" },
];

// --- Component ---

export default function ScanScreen() {
  const [mode, setMode] = useState<ScanMode>("barcode");
  const [flashOn, setFlashOn] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  // Review states
  const [receiptItems, setReceiptItems] = useState<ParsedReceiptItem[] | null>(null);
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // --- Mutations ---

  const barcodeLookupMutation = useMutation({
    mutationFn: (barcode: string) =>
      api.get<{ product: { name: string; brand: string | null; category: string | null } }>(
        `/pantry/barcode/${barcode}`
      ),
    onSuccess: (data: any) => {
      const product = data.product ?? data;
      Alert.alert(
        "Product Found",
        `${product.name}${product.brand ? ` (${product.brand})` : ""}\n\nAdd to pantry?`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setScanned(false),
          },
          {
            text: "Add to Pantry",
            onPress: async () => {
              try {
                await api.post("/pantry", {
                  name: product.name,
                  brand: product.brand,
                  category: product.category,
                });
                Alert.alert("Added", `${product.name} added to pantry.`);
              } catch {
                Alert.alert("Error", "Failed to add item to pantry.");
              }
              setScanned(false);
            },
          },
        ]
      );
    },
    onError: () => {
      Alert.alert(
        "Not Found",
        "Product not found in database. Try adding it manually.",
        [{ text: "OK", onPress: () => setScanned(false) }]
      );
    },
  });

  const receiptParseMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return api.post<{ items: ParsedReceiptItem[] }>("/pantry/import/receipt", {
        image_base64: base64,
        media_type: "image/jpeg",
      });
    },
    onSuccess: (data: any) => {
      const items = data.items ?? [];
      setReceiptItems(items);
    },
    onError: () => {
      Alert.alert("Error", "Failed to parse receipt. Please try again.");
      setCapturedUri(null);
    },
  });

  const recipeParseMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return api.post<{ recipe: ParsedRecipe }>("/recipes/parse/image", {
        image_base64: base64,
        media_type: "image/jpeg",
      });
    },
    onSuccess: (data: any) => {
      const recipe = data.recipe ?? data;
      setParsedRecipe(recipe);
    },
    onError: () => {
      Alert.alert("Error", "Failed to parse recipe photo. Please try again.");
      setCapturedUri(null);
    },
  });

  const saveReceiptItemsMutation = useMutation({
    mutationFn: async (items: ParsedReceiptItem[]) => {
      const pantryItems = items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
      }));
      // Add items one by one (the API accepts single items)
      const results = [];
      for (const pi of pantryItems) {
        const result = await api.post("/pantry", pi);
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      Alert.alert("Success", "Items added to pantry!", [
        { text: "OK", onPress: resetState },
      ]);
    },
    onError: () => {
      Alert.alert("Error", "Failed to save some items. Please try again.");
    },
  });

  const saveRecipeMutation = useMutation({
    mutationFn: (recipe: ParsedRecipe) =>
      api.post("/recipes", {
        ...recipe,
        source_type: "image",
        tags: [],
        dietary_flags: [],
        tools: [],
      }),
    onSuccess: () => {
      Alert.alert("Success", "Recipe saved!", [
        { text: "OK", onPress: resetState },
      ]);
    },
    onError: () => {
      Alert.alert("Error", "Failed to save recipe. Please try again.");
    },
  });

  // --- Helpers ---

  const resetState = () => {
    setScanned(false);
    setCapturedUri(null);
    setReceiptItems(null);
    setParsedRecipe(null);
  };

  const handleBarcodeScan = (result: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    barcodeLookupMutation.mutate(result.data);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });
      if (!photo) return;
      setCapturedUri(photo.uri);

      if (mode === "receipt") {
        receiptParseMutation.mutate(photo.uri);
      } else if (mode === "recipe") {
        recipeParseMutation.mutate(photo.uri);
      }
    } catch {
      Alert.alert("Error", "Failed to take photo. Please try again.");
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const uri = result.assets[0].uri;
    setCapturedUri(uri);

    if (mode === "receipt") {
      receiptParseMutation.mutate(uri);
    } else if (mode === "recipe") {
      recipeParseMutation.mutate(uri);
    }
  };

  // --- Permission handling ---

  if (!permission) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="camera-outline" size={64} color={colors.border} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSubtitle}>
          We need camera access to scan barcodes, receipts, and recipe photos.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Receipt review screen ---

  if (receiptItems !== null) {
    return (
      <View style={styles.container}>
        <View style={styles.reviewHeader}>
          <TouchableOpacity onPress={resetState}>
            <Text style={styles.reviewCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.reviewTitle}>Review Receipt Items</Text>
          <TouchableOpacity
            onPress={() => saveReceiptItemsMutation.mutate(receiptItems)}
            disabled={
              receiptItems.length === 0 || saveReceiptItemsMutation.isPending
            }
          >
            <Text
              style={[
                styles.reviewSave,
                (receiptItems.length === 0 ||
                  saveReceiptItemsMutation.isPending) &&
                  styles.reviewSaveDisabled,
              ]}
            >
              {saveReceiptItemsMutation.isPending
                ? "Saving..."
                : `Add All (${receiptItems.length})`}
            </Text>
          </TouchableOpacity>
        </View>

        {receiptItems.length === 0 ? (
          <View style={styles.centeredContainer}>
            <Ionicons
              name="document-text-outline"
              size={48}
              color={colors.border}
            />
            <Text style={styles.permissionTitle}>No items detected</Text>
            <Text style={styles.permissionSubtitle}>
              Could not parse any items from the receipt. Try taking a clearer
              photo.
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={resetState}
            >
              <Text style={styles.permissionButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={receiptItems}
            keyExtractor={(_, idx) => String(idx)}
            contentContainerStyle={styles.reviewList}
            renderItem={({ item, index }) => (
              <View style={styles.reviewItemCard}>
                <View style={styles.reviewItemHeader}>
                  <Text style={styles.reviewItemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => {
                      setReceiptItems((prev) =>
                        prev ? prev.filter((_, i) => i !== index) : null
                      );
                    }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={20}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.reviewItemMeta}>
                  {item.quantity != null && (
                    <Text style={styles.reviewItemDetail}>
                      Qty: {item.quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </Text>
                  )}
                  {item.price != null && (
                    <Text style={styles.reviewItemDetail}>
                      ${item.price.toFixed(2)}
                    </Text>
                  )}
                  {item.category && (
                    <Text style={styles.reviewItemDetail}>{item.category}</Text>
                  )}
                </View>
              </View>
            )}
          />
        )}
      </View>
    );
  }

  // --- Recipe review screen ---

  if (parsedRecipe !== null) {
    return (
      <View style={styles.container}>
        <View style={styles.reviewHeader}>
          <TouchableOpacity onPress={resetState}>
            <Text style={styles.reviewCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.reviewTitle}>Review Recipe</Text>
          <TouchableOpacity
            onPress={() => saveRecipeMutation.mutate(parsedRecipe)}
            disabled={saveRecipeMutation.isPending}
          >
            <Text
              style={[
                styles.reviewSave,
                saveRecipeMutation.isPending && styles.reviewSaveDisabled,
              ]}
            >
              {saveRecipeMutation.isPending ? "Saving..." : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.reviewList}
          showsVerticalScrollIndicator={false}
        >
          {/* Recipe Name */}
          <View style={styles.recipeSection}>
            <Text style={styles.recipeName}>{parsedRecipe.name}</Text>
            {parsedRecipe.description && (
              <Text style={styles.recipeDescription}>
                {parsedRecipe.description}
              </Text>
            )}
            <View style={styles.recipeMeta}>
              <View style={styles.recipeMetaItem}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={colors.mutedForeground}
                />
                <Text style={styles.recipeMetaText}>
                  {parsedRecipe.servings} servings
                </Text>
              </View>
              {parsedRecipe.prep_time_minutes != null && (
                <View style={styles.recipeMetaItem}>
                  <Ionicons
                    name="timer-outline"
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Text style={styles.recipeMetaText}>
                    {parsedRecipe.prep_time_minutes}m prep
                  </Text>
                </View>
              )}
              {parsedRecipe.cook_time_minutes != null && (
                <View style={styles.recipeMetaItem}>
                  <Ionicons
                    name="flame-outline"
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Text style={styles.recipeMetaText}>
                    {parsedRecipe.cook_time_minutes}m cook
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Ingredients */}
          <View style={styles.recipeSection}>
            <Text style={styles.recipeSectionTitle}>
              Ingredients ({parsedRecipe.ingredients.length})
            </Text>
            {parsedRecipe.ingredients.map((ing, idx) => (
              <View key={idx} style={styles.ingredientRow}>
                <Ionicons
                  name="ellipse"
                  size={6}
                  color={colors.primary}
                  style={{ marginTop: 6 }}
                />
                <Text style={styles.ingredientText}>
                  {ing.quantity != null ? `${ing.quantity} ` : ""}
                  {ing.unit ? `${ing.unit} ` : ""}
                  {ing.ingredient_name}
                </Text>
              </View>
            ))}
          </View>

          {/* Instructions */}
          <View style={styles.recipeSection}>
            <Text style={styles.recipeSectionTitle}>
              Instructions ({parsedRecipe.instructions.length} steps)
            </Text>
            {parsedRecipe.instructions.map((step) => (
              <View key={step.step} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.step}</Text>
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // --- Processing overlay ---

  const isProcessing =
    barcodeLookupMutation.isPending ||
    receiptParseMutation.isPending ||
    recipeParseMutation.isPending;

  // --- Camera view ---

  return (
    <View style={styles.container}>
      {/* Mode tabs */}
      <View style={styles.modeTabs}>
        {MODE_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.modeTab,
              mode === tab.key && styles.modeTabActive,
            ]}
            onPress={() => {
              setMode(tab.key);
              resetState();
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={mode === tab.key ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.modeTabText,
                mode === tab.key && styles.modeTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Camera preview */}
      <View style={styles.cameraContainer}>
        {capturedUri ? (
          <Image source={{ uri: capturedUri }} style={styles.capturedImage} />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            enableTorch={flashOn}
            barcodeScannerSettings={
              mode === "barcode"
                ? {
                    barcodeTypes: [
                      "ean13",
                      "ean8",
                      "upc_a",
                      "upc_e",
                      "code128",
                      "code39",
                      "qr",
                    ],
                  }
                : undefined
            }
            onBarcodeScanned={
              mode === "barcode" && !scanned ? handleBarcodeScan : undefined
            }
          >
            {/* Scan overlay for barcode mode */}
            {mode === "barcode" && (
              <View style={styles.scanOverlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>
                  Point camera at a product barcode
                </Text>
              </View>
            )}

            {/* Hint for receipt/recipe modes */}
            {mode !== "barcode" && (
              <View style={styles.scanOverlay}>
                <Text style={styles.scanHint}>
                  {mode === "receipt"
                    ? "Take a photo of your receipt"
                    : "Take a photo of a recipe"}
                </Text>
              </View>
            )}
          </CameraView>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={colors.primaryForeground} />
            <Text style={styles.processingText}>
              {mode === "barcode"
                ? "Looking up product..."
                : mode === "receipt"
                ? "Parsing receipt..."
                : "Parsing recipe..."}
            </Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Gallery button */}
        {mode !== "barcode" && (
          <TouchableOpacity
            style={styles.controlButton}
            onPress={pickFromGallery}
            disabled={isProcessing}
          >
            <Ionicons name="images-outline" size={24} color={colors.foreground} />
            <Text style={styles.controlLabel}>Gallery</Text>
          </TouchableOpacity>
        )}

        {/* Shutter / action button */}
        {mode !== "barcode" && !capturedUri && (
          <TouchableOpacity
            style={styles.shutterButton}
            onPress={takePhoto}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        )}

        {/* Re-take (when captured) */}
        {capturedUri && !isProcessing && (
          <TouchableOpacity
            style={styles.controlButton}
            onPress={resetState}
          >
            <Ionicons name="refresh-outline" size={24} color={colors.foreground} />
            <Text style={styles.controlLabel}>Retake</Text>
          </TouchableOpacity>
        )}

        {/* Flash toggle */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => setFlashOn(!flashOn)}
        >
          <Ionicons
            name={flashOn ? "flash" : "flash-off-outline"}
            size={24}
            color={flashOn ? colors.useSoon : colors.foreground}
          />
          <Text style={styles.controlLabel}>
            {flashOn ? "Flash On" : "Flash Off"}
          </Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => router.back()}
        >
          <Ionicons name="close-outline" size={24} color={colors.foreground} />
          <Text style={styles.controlLabel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },

  // Permissions
  permissionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
  },
  permissionSubtitle: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  permissionButtonText: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primaryForeground,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
  },

  // Mode tabs
  modeTabs: {
    flexDirection: "row",
    backgroundColor: "#111",
    paddingTop: Platform.OS === "ios" ? 8 : spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: "#222",
  },
  modeTabActive: {
    backgroundColor: colors.primary,
  },
  modeTabText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  modeTabTextActive: {
    color: colors.primaryForeground,
  },

  // Camera
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  capturedImage: {
    flex: 1,
    resizeMode: "cover",
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 250,
    height: 150,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    backgroundColor: "transparent",
  },
  scanHint: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    color: "#fff",
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  processingText: {
    fontSize: fontSize.base,
    color: "#fff",
    fontWeight: "500",
  },

  // Controls
  controls: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    backgroundColor: "#111",
    paddingVertical: spacing.md,
    paddingBottom: Platform.OS === "ios" ? spacing.xl + 8 : spacing.md,
  },
  controlButton: {
    alignItems: "center",
    gap: 4,
    minWidth: 60,
  },
  controlLabel: {
    fontSize: fontSize.xs,
    color: "#ccc",
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },

  // Review header
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  reviewCancel: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
  },
  reviewTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.foreground,
  },
  reviewSave: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.primary,
  },
  reviewSaveDisabled: {
    opacity: 0.4,
  },
  reviewList: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    flexGrow: 1,
  },

  // Receipt review items
  reviewItemCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reviewItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewItemName: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.foreground,
    marginRight: spacing.sm,
  },
  reviewItemMeta: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  reviewItemDetail: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },

  // Recipe review
  recipeSection: {
    marginBottom: spacing.lg,
  },
  recipeName: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  recipeDescription: {
    fontSize: fontSize.base,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  recipeMeta: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  recipeMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recipeMetaText: {
    fontSize: fontSize.sm,
    color: colors.mutedForeground,
  },
  recipeSectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  ingredientText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
    lineHeight: 20,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.primaryForeground,
  },
  stepText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
    lineHeight: 22,
  },
});
