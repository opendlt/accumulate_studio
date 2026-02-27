import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NetworkId, SDKLanguage } from '@accumulate-studio/types';

// =============================================================================
// UI State Types
// =============================================================================

interface PanelSizes {
  palette: number;
  codePanel: number;
  executionPanel: number;
}

interface UIState {
  // Theme
  theme: 'light' | 'dark' | 'system';

  // Panel visibility
  showPalette: boolean;
  showCodePanel: boolean;
  showExecutionPanel: boolean;

  // Panel sizes (percentages)
  panelSizes: PanelSizes;

  // Code generation
  selectedLanguage: SDKLanguage;
  codeMode: 'sdk' | 'cli';

  // Network
  selectedNetwork: NetworkId;

  // Execution panel tab
  executionTab: 'log' | 'state-diff' | 'receipt' | 'synthetic';

  // Modals
  activeModal: string | null;
  modalData: unknown;

  // Template gallery
  showTemplateGallery: boolean;

  // Onboarding
  hasCompletedOnboarding: boolean;
}

interface UIActions {
  // Theme
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Panels
  togglePalette: () => void;
  toggleCodePanel: () => void;
  toggleExecutionPanel: () => void;
  setPanelSize: (panel: keyof PanelSizes, size: number) => void;

  // Code generation
  setSelectedLanguage: (language: SDKLanguage) => void;
  setCodeMode: (mode: 'sdk' | 'cli') => void;

  // Network
  setSelectedNetwork: (network: NetworkId) => void;

  // Execution panel
  setExecutionTab: (tab: 'log' | 'state-diff' | 'receipt' | 'synthetic') => void;

  // Modals
  openModal: (modalId: string, data?: unknown) => void;
  closeModal: () => void;

  // Template gallery
  setShowTemplateGallery: (show: boolean) => void;

  // Onboarding
  completeOnboarding: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: UIState = {
  theme: 'system',
  showPalette: true,
  showCodePanel: true,
  showExecutionPanel: true,
  panelSizes: {
    palette: 280,
    codePanel: 400,
    executionPanel: 250,
  },
  selectedLanguage: 'python',
  codeMode: 'sdk',
  selectedNetwork: 'kermit',
  executionTab: 'log',
  activeModal: null,
  modalData: null,
  showTemplateGallery: false,
  hasCompletedOnboarding: false,
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set) => ({
      ...initialState,

      // Theme
      setTheme: (theme) => {
        set({ theme });
        // Apply theme to document
        if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },

      // Panels
      togglePalette: () => set((state) => ({ showPalette: !state.showPalette })),
      toggleCodePanel: () => set((state) => ({ showCodePanel: !state.showCodePanel })),
      toggleExecutionPanel: () => set((state) => ({ showExecutionPanel: !state.showExecutionPanel })),
      setPanelSize: (panel, size) =>
        set((state) => ({
          panelSizes: { ...state.panelSizes, [panel]: size },
        })),

      // Code generation
      setSelectedLanguage: (language) => set({ selectedLanguage: language }),
      setCodeMode: (mode) => set({ codeMode: mode }),

      // Network
      setSelectedNetwork: (network) => set({ selectedNetwork: network }),

      // Execution panel
      setExecutionTab: (tab) => set({ executionTab: tab }),

      // Modals
      openModal: (modalId, data) => set({ activeModal: modalId, modalData: data }),
      closeModal: () => set({ activeModal: null, modalData: null }),

      // Template gallery
      setShowTemplateGallery: (show) => set({ showTemplateGallery: show }),

      // Onboarding
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
    }),
    {
      name: 'accumulate-studio-ui',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0) {
          // devnet DNS is no longer available – migrate to kermit
          if (state.selectedNetwork === 'devnet') {
            state.selectedNetwork = 'kermit';
          }
        }
        if (version <= 1) {
          // testnet and devnet are defunct – migrate to kermit
          if (state.selectedNetwork === 'testnet' || state.selectedNetwork === 'devnet') {
            state.selectedNetwork = 'kermit';
          }
        }
        if (version <= 1) {
          // New field for onboarding — existing users who already have
          // persisted state should skip onboarding (they're not new)
          state.hasCompletedOnboarding = true;
        }
        return state as UIState & UIActions;
      },
      partialize: (state) => ({
        theme: state.theme,
        showPalette: state.showPalette,
        showCodePanel: state.showCodePanel,
        showExecutionPanel: state.showExecutionPanel,
        panelSizes: state.panelSizes,
        selectedLanguage: state.selectedLanguage,
        codeMode: state.codeMode,
        selectedNetwork: state.selectedNetwork,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
);
