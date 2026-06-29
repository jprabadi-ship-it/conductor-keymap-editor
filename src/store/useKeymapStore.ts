import { useState, useCallback, useRef } from 'react';
import type { Layer, KeyBinding, LedColor, Combo, Macro, MacroStep, GestureShortcut, BluetoothProfile, OsLayout, RightPanelTab, LeftPanelTab, KeymapProject } from '../types';
import { createDefaultLayers, createDefaultCombos, createDefaultGestures, createDefaultBluetoothProfiles } from '../data/defaultKeymap';
import { relabelBindings } from '../services/usbService';

const STORAGE_KEY_KEYMAP = 'conductor-studio-keymap';
const STORAGE_KEY_COMBOS = 'conductor-studio-combos';
const STORAGE_KEY_MACROS = 'conductor-studio-macros';
const STORAGE_KEY_LAYOUT = 'conductor-os-keyboard-layout';
const STORAGE_KEY_VERSION = 'conductor-studio-version';
const CURRENT_VERSION = '4';

// Clear stale cache when version changes
if (localStorage.getItem(STORAGE_KEY_VERSION) !== CURRENT_VERSION) {
  localStorage.removeItem(STORAGE_KEY_KEYMAP);
  localStorage.removeItem(STORAGE_KEY_COMBOS);
  localStorage.removeItem(STORAGE_KEY_MACROS);
  localStorage.setItem(STORAGE_KEY_VERSION, CURRENT_VERSION);
}

function loadFromStorage<T>(key: string, fallback: () => T): T {
  try {
    const data = localStorage.getItem(key);
    if (data) return JSON.parse(data);
  } catch { /* ignore */ }
  return fallback();
}

function saveToStorage(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* ignore */ }
}

export interface UndoEntry {
  layers: Layer[];
  combos: Combo[];
}

export function useKeymapStore() {
  const [layers, setLayers] = useState<Layer[]>(() => loadFromStorage(STORAGE_KEY_KEYMAP, createDefaultLayers));
  const [combos, setCombos] = useState<Combo[]>(() => loadFromStorage(STORAGE_KEY_COMBOS, createDefaultCombos));
  const [macros, setMacros] = useState<Macro[]>(() => loadFromStorage(STORAGE_KEY_MACROS, () => []));
  const [selectedMacroIndex, setSelectedMacroIndex] = useState<number | null>(null);
  const [osLayout, setOsLayout] = useState<OsLayout>(() => loadFromStorage(STORAGE_KEY_LAYOUT, () => 'us'));
  const [tappingTerm, setTappingTerm] = useState(200);
  const [gestures, setGestures] = useState<GestureShortcut[]>(createDefaultGestures);
  const [bluetoothProfiles, setBluetoothProfiles] = useState<BluetoothProfile[]>(createDefaultBluetoothProfiles);

  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('key-config');
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>('layers');
  const [diffMode, setDiffMode] = useState(false);
  const [amlExcluded, setAmlExcluded] = useState<string[]>(['R12', 'R13', 'R14', 'R32']);

  // Undo/Redo
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);

  const pushUndo = useCallback(() => {
    undoStack.current.push({ layers: JSON.parse(JSON.stringify(layers)), combos: JSON.parse(JSON.stringify(combos)) });
    redoStack.current = [];
  }, [layers, combos]);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push({ layers: JSON.parse(JSON.stringify(layers)), combos: JSON.parse(JSON.stringify(combos)) });
    setLayers(entry.layers);
    setCombos(entry.combos);
  }, [layers, combos]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push({ layers: JSON.parse(JSON.stringify(layers)), combos: JSON.parse(JSON.stringify(combos)) });
    setLayers(entry.layers);
    setCombos(entry.combos);
  }, [layers, combos]);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  // Auto-save
  const autoSave = useCallback(() => {
    saveToStorage(STORAGE_KEY_KEYMAP, layers);
    saveToStorage(STORAGE_KEY_COMBOS, combos);
    saveToStorage(STORAGE_KEY_MACROS, macros);
    saveToStorage(STORAGE_KEY_LAYOUT, osLayout);
  }, [layers, combos, macros, osLayout]);

  // Key binding operations
  const updateKeyBinding = useCallback((layerIndex: number, keyId: string, binding: KeyBinding) => {
    pushUndo();
    setDirtyKeys(prev => new Set(prev).add(`${layerIndex}:${keyId}`));
    setLayers(prev => prev.map((layer, i) =>
      i === layerIndex
        ? { ...layer, keys: layer.keys.map(k => k.id === keyId ? { ...k, binding } : k) }
        : layer
    ));
  }, [pushUndo]);

  const clearDirtyKeys = useCallback(() => setDirtyKeys(new Set()), []);

  const setLayerName = useCallback((layerIndex: number, name: string) => {
    setLayers(prev => prev.map((layer, i) =>
      i === layerIndex ? { ...layer, name } : layer
    ));
  }, []);

  const setLayerLedColor = useCallback((layerIndex: number, color: LedColor) => {
    setLayers(prev => prev.map((layer, i) =>
      i === layerIndex ? { ...layer, ledColor: color } : layer
    ));
  }, []);

  const addLayer = useCallback(() => {
    const newIndex = layers.length;
    if (newIndex >= 16) return;
    pushUndo();
    setLayers(prev => [...prev, {
      name: `Layer ${newIndex}`,
      index: newIndex,
      ledColor: 'white',
      isProtected: false,
      keys: prev[0].keys.map(k => ({ id: k.id, binding: { type: 'trans' as const, keyCode: 'KC_TRNS', label: '' } })),
    }]);
  }, [layers.length, pushUndo]);

  const removeLayer = useCallback((index: number) => {
    const layer = layers[index];
    if (layer.isProtected) return;
    pushUndo();
    setLayers(prev => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, index: i })));
    if (selectedLayerIndex >= index && selectedLayerIndex > 0) {
      setSelectedLayerIndex(selectedLayerIndex - 1);
    }
  }, [layers, selectedLayerIndex, pushUndo]);

  // Combo operations
  const addCombo = useCallback(() => {
    pushUndo();
    const newCombo: Combo = {
      id: `combo-${Date.now()}`,
      name: 'New',
      keyPositions: [],
      binding: { type: 'basic', keyCode: '', label: 'New' },
      timeoutMs: 50,
      layers: [],
    };
    setCombos(prev => [...prev, newCombo]);
  }, [pushUndo]);

  const updateCombo = useCallback((id: string, updates: Partial<Combo>) => {
    pushUndo();
    setCombos(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [pushUndo]);

  const removeCombo = useCallback((id: string) => {
    pushUndo();
    setCombos(prev => prev.filter(c => c.id !== id));
  }, [pushUndo]);

  // Macro operations
  const addMacro = useCallback(() => {
    if (macros.length >= 16) return;
    let name = 'm_new';
    let suffix = 1;
    const names = new Set(macros.map(m => m.name));
    while (names.has(name)) { name = `m_new_${suffix++}`; }
    setMacros(prev => [...prev, { name, waitMs: 30, tapMs: 30, bindings: [] }]);
    setSelectedMacroIndex(macros.length);
  }, [macros]);

  const updateMacro = useCallback((index: number, updates: Partial<Macro>) => {
    setMacros(prev => prev.map((m, i) => i === index ? { ...m, ...updates } : m));
  }, []);

  const removeMacro = useCallback((index: number) => {
    setMacros(prev => prev.filter((_, i) => i !== index));
    setSelectedMacroIndex(null);
  }, []);

  const addMacroStep = useCallback((macroIndex: number, step: MacroStep) => {
    setMacros(prev => prev.map((m, i) =>
      i === macroIndex ? { ...m, bindings: [...m.bindings, step] } : m
    ));
  }, []);

  const updateMacroStep = useCallback((macroIndex: number, stepIndex: number, updates: Partial<MacroStep>) => {
    setMacros(prev => prev.map((m, i) =>
      i === macroIndex ? { ...m, bindings: m.bindings.map((s, j) => j === stepIndex ? { ...s, ...updates } : s) } : m
    ));
  }, []);

  const removeMacroStep = useCallback((macroIndex: number, stepIndex: number) => {
    setMacros(prev => prev.map((m, i) =>
      i === macroIndex ? { ...m, bindings: m.bindings.filter((_, j) => j !== stepIndex) } : m
    ));
  }, []);

  const moveMacroStep = useCallback((macroIndex: number, stepIndex: number, direction: 'up' | 'down') => {
    setMacros(prev => prev.map((m, i) => {
      if (i !== macroIndex) return m;
      const newBindings = [...m.bindings];
      const target = direction === 'up' ? stepIndex - 1 : stepIndex + 1;
      if (target < 0 || target >= newBindings.length) return m;
      [newBindings[stepIndex], newBindings[target]] = [newBindings[target], newBindings[stepIndex]];
      return { ...m, bindings: newBindings };
    }));
  }, []);

  const selectedMacro = selectedMacroIndex !== null ? macros[selectedMacroIndex] : null;

  // Export/Import
  const exportProject = useCallback((): KeymapProject => ({
    layers, combos, macros, osLayout, tappingTerm, gestures, bluetoothProfiles, amlExcluded,
  }), [layers, combos, macros, osLayout, tappingTerm, gestures, bluetoothProfiles, amlExcluded]);

  const importProject = useCallback((project: KeymapProject) => {
    pushUndo();
    setLayers(project.layers);
    setCombos(project.combos);
    if (project.macros) {
      setMacros(project.macros);
      setSelectedMacroIndex(null);
    }
    setOsLayout(project.osLayout || 'us');
    setTappingTerm(project.tappingTerm || 200);
    if (project.gestures) setGestures(project.gestures);
    if (project.bluetoothProfiles) setBluetoothProfiles(project.bluetoothProfiles);
    if (project.amlExcluded) setAmlExcluded(project.amlExcluded);
  }, [pushUndo]);

  const reset = useCallback(() => {
    pushUndo();
    setLayers(createDefaultLayers());
    setCombos(createDefaultCombos());
    setMacros([]);
  }, [pushUndo]);

  // Selected layer & key helpers
  const selectedLayer = layers[selectedLayerIndex];
  const selectedKey = selectedKeyId ? selectedLayer?.keys.find(k => k.id === selectedKeyId) : null;

  // Combo overlay info for keyboard view
  const comboOverlays = combos.flatMap(combo =>
    combo.keyPositions.map(pos => ({ keyId: pos, comboName: combo.name }))
  );

  return {
    layers, combos, macros, osLayout, tappingTerm, gestures, bluetoothProfiles,
    selectedLayerIndex, selectedKeyId, selectedLayer, selectedKey,
    selectedMacroIndex, selectedMacro,
    rightPanelTab, leftPanelTab, diffMode, amlExcluded, comboOverlays,
    canUndo, canRedo,
    setSelectedLayerIndex, setSelectedKeyId, setRightPanelTab, setLeftPanelTab,
    setSelectedMacroIndex,
    setDiffMode, setAmlExcluded, setOsLayout, setTappingTerm,
    setGestures, setBluetoothProfiles,
    dirtyKeys, clearDirtyKeys,
    updateKeyBinding, setLayerName, setLayerLedColor, addLayer, removeLayer,
    addCombo, updateCombo, removeCombo,
    addMacro, updateMacro, removeMacro,
    addMacroStep, updateMacroStep, removeMacroStep, moveMacroStep,
    relabelLayers: useCallback(() => {
      setLayers(prev => relabelBindings(prev));
    }, []),
    undo, redo, reset, autoSave, exportProject, importProject,
  };
}

export type KeymapStore = ReturnType<typeof useKeymapStore>;
