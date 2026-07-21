import { useEffect, useState } from "react";

export class RoomStateStore {
  private listeners: Record<string, Set<(val: any) => void>> = {};
  private state: Record<string, any> = {};

  constructor(initialState: Record<string, any>) {
    this.state = { ...initialState };
  }

  get(key: string) {
    return this.state[key];
  }

  set(key: string, val: any) {
    if (this.state[key] === val) return;
    this.state[key] = val;
    this.listeners[key]?.forEach((cb) => {
      try {
        cb(val);
      } catch (err) {
        console.error(`Error in state store listener for key "${key}":`, err);
      }
    });
  }

  setMultiple(update: Record<string, any>) {
    Object.entries(update).forEach(([key, val]) => {
      this.set(key, val);
    });
  }

  subscribe(key: string, cb: (val: any) => void) {
    if (!this.listeners[key]) {
      this.listeners[key] = new Set();
    }
    this.listeners[key].add(cb);
    return () => {
      this.listeners[key].delete(cb);
    };
  }
}

export function useRoomState<T>(store: RoomStateStore, key: string, defaultValue: T): T {
  const [val, setVal] = useState<T>(() => {
    const current = store.get(key);
    return current !== undefined ? current : defaultValue;
  });

  useEffect(() => {
    // Sync initial state if it changed between creation and render
    const current = store.get(key);
    if (current !== undefined && current !== val) {
      setVal(current);
    }
    
    return store.subscribe(key, (newVal) => {
      setVal(newVal);
    });
  }, [store, key]);

  return val;
}
