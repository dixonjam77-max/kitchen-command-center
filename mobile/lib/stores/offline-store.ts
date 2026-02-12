/**
 * Offline store for grocery lists — queues actions when offline, syncs when online.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { api } from "../api-client";
import { AppState } from "react-native";

const OFFLINE_GROCERY_KEY = "offline_grocery_data";
const PENDING_ACTIONS_KEY = "offline_pending_actions";

interface GroceryItem {
  id: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
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
  items: GroceryItem[];
}

interface PendingAction {
  id: string;
  type: "check_item" | "uncheck_item" | "add_to_pantry";
  list_id: string;
  item_id: string;
  timestamp: number;
}

interface OfflineState {
  groceryLists: GroceryList[];
  pendingActions: PendingAction[];
  isOnline: boolean;
  lastSynced: string | null;
  cacheGroceryList: (list: GroceryList) => Promise<void>;
  cacheAllLists: (lists: GroceryList[]) => Promise<void>;
  checkItem: (listId: string, itemId: string) => Promise<void>;
  uncheckItem: (listId: string, itemId: string) => Promise<void>;
  syncPendingActions: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  setOnline: (online: boolean) => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  groceryLists: [],
  pendingActions: [],
  isOnline: true,
  lastSynced: null,

  cacheGroceryList: async (list) => {
    const lists = get().groceryLists.filter((l) => l.id !== list.id);
    lists.push(list);
    set({ groceryLists: lists });
    await AsyncStorage.setItem(OFFLINE_GROCERY_KEY, JSON.stringify(lists));
  },

  cacheAllLists: async (lists) => {
    set({ groceryLists: lists, lastSynced: new Date().toISOString() });
    await AsyncStorage.setItem(OFFLINE_GROCERY_KEY, JSON.stringify(lists));
  },

  checkItem: async (listId, itemId) => {
    // Optimistic local update
    const lists = get().groceryLists.map((l) => {
      if (l.id !== listId) return l;
      return {
        ...l,
        items: l.items.map((i) =>
          i.id === itemId ? { ...i, checked: true } : i
        ),
      };
    });
    set({ groceryLists: lists });
    await AsyncStorage.setItem(OFFLINE_GROCERY_KEY, JSON.stringify(lists));

    if (get().isOnline) {
      try {
        await api.patch(`/grocery/${listId}/items/${itemId}`, { checked: true });
      } catch {
        // Queue for later
        const action: PendingAction = {
          id: `${Date.now()}-${Math.random()}`,
          type: "check_item",
          list_id: listId,
          item_id: itemId,
          timestamp: Date.now(),
        };
        const pending = [...get().pendingActions, action];
        set({ pendingActions: pending });
        await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
      }
    } else {
      const action: PendingAction = {
        id: `${Date.now()}-${Math.random()}`,
        type: "check_item",
        list_id: listId,
        item_id: itemId,
        timestamp: Date.now(),
      };
      const pending = [...get().pendingActions, action];
      set({ pendingActions: pending });
      await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
    }
  },

  uncheckItem: async (listId, itemId) => {
    const lists = get().groceryLists.map((l) => {
      if (l.id !== listId) return l;
      return {
        ...l,
        items: l.items.map((i) =>
          i.id === itemId ? { ...i, checked: false } : i
        ),
      };
    });
    set({ groceryLists: lists });
    await AsyncStorage.setItem(OFFLINE_GROCERY_KEY, JSON.stringify(lists));

    if (get().isOnline) {
      try {
        await api.patch(`/grocery/${listId}/items/${itemId}`, {
          checked: false,
        });
      } catch {
        const action: PendingAction = {
          id: `${Date.now()}-${Math.random()}`,
          type: "uncheck_item",
          list_id: listId,
          item_id: itemId,
          timestamp: Date.now(),
        };
        const pending = [...get().pendingActions, action];
        set({ pendingActions: pending });
        await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
      }
    } else {
      const action: PendingAction = {
        id: `${Date.now()}-${Math.random()}`,
        type: "uncheck_item",
        list_id: listId,
        item_id: itemId,
        timestamp: Date.now(),
      };
      const pending = [...get().pendingActions, action];
      set({ pendingActions: pending });
      await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
    }
  },

  syncPendingActions: async () => {
    const pending = get().pendingActions;
    if (pending.length === 0) return;

    const remaining: PendingAction[] = [];
    for (const action of pending) {
      try {
        if (action.type === "check_item") {
          await api.patch(`/grocery/${action.list_id}/items/${action.item_id}`, {
            checked: true,
          });
        } else if (action.type === "uncheck_item") {
          await api.patch(`/grocery/${action.list_id}/items/${action.item_id}`, {
            checked: false,
          });
        } else if (action.type === "add_to_pantry") {
          await api.post(
            `/grocery/${action.list_id}/items/${action.item_id}/to-pantry`
          );
        }
      } catch {
        remaining.push(action);
      }
    }
    set({ pendingActions: remaining });
    await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(remaining));
  },

  loadFromStorage: async () => {
    try {
      const [groceryData, pendingData] = await AsyncStorage.multiGet([
        OFFLINE_GROCERY_KEY,
        PENDING_ACTIONS_KEY,
      ]);
      const lists = groceryData[1] ? JSON.parse(groceryData[1]) : [];
      const pending = pendingData[1] ? JSON.parse(pendingData[1]) : [];
      set({ groceryLists: lists, pendingActions: pending });
    } catch {
      // Ignore parse errors
    }
  },

  setOnline: (online) => {
    set({ isOnline: online });
    if (online) {
      get().syncPendingActions();
    }
  },
}));
