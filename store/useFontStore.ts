import { create } from 'zustand';
import { FontMetadata, loadCustomFont } from '@/lib/fontUtils';

interface FontState {
  customFonts: FontMetadata[];
  addFont: (font: FontMetadata) => void;
  removeFont: (fontFamily: string) => void;
  loadAllFonts: () => Promise<void>;
  setCustomFonts: (fonts: FontMetadata[]) => void;
  clearFonts: () => void;
  isFontLoaded: (fontFamily: string) => boolean;
}

export const useFontStore = create<FontState>((set, get) => ({
  customFonts: [],

  addFont: (font) => {
    set((state) => {
      const exists = state.customFonts.some(f => f.fontFamily === font.fontFamily);
      if (exists) {
        console.warn(`Font "${font.fontFamily}" already exists in store`);
        return state;
      }

      return {
        customFonts: [...state.customFonts, font]
      };
    });
  },

  removeFont: (fontFamily) => {
    set((state) => ({
      customFonts: state.customFonts.filter(f => f.fontFamily !== fontFamily)
    }));
  },

  loadAllFonts: async () => {
    const { customFonts } = get();

    const loadPromises = customFonts.map(async (font) => {
      try {
        await loadCustomFont(font);
      } catch (error) {
        console.error(`Failed to load font "${font.fontFamily}":`, error);
      }
    });

    await Promise.all(loadPromises);
  },

  setCustomFonts: (fonts) => {
    set({ customFonts: fonts });
  },

  clearFonts: () => {
    set({ customFonts: [] });
  },

  isFontLoaded: (fontFamily) => {
    const { customFonts } = get();
    return customFonts.some(f => f.fontFamily === fontFamily);
  },
}));
