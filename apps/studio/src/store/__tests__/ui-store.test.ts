/**
 * UI Store Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../ui-store';

describe('UI Store', () => {
  beforeEach(() => {
    // Reset to initial state
    useUIStore.setState({
      theme: 'system',
      showPalette: true,
      showCodePanel: true,
      showExecutionPanel: true,
      panelSizes: { palette: 280, codePanel: 400, executionPanel: 250 },
      selectedLanguage: 'python',
      codeMode: 'sdk',
      selectedNetwork: 'kermit',
      executionTab: 'log',
      activeModal: null,
      modalData: null,
      showTemplateGallery: false,
    });
  });

  // =========================================================================
  // Theme
  // =========================================================================

  describe('theme', () => {
    it('defaults to system', () => {
      expect(useUIStore.getState().theme).toBe('system');
    });

    it('setTheme changes the theme', () => {
      useUIStore.getState().setTheme('dark');
      expect(useUIStore.getState().theme).toBe('dark');

      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
    });
  });

  // =========================================================================
  // Panel Visibility
  // =========================================================================

  describe('panel visibility', () => {
    it('togglePalette toggles visibility', () => {
      expect(useUIStore.getState().showPalette).toBe(true);
      useUIStore.getState().togglePalette();
      expect(useUIStore.getState().showPalette).toBe(false);
      useUIStore.getState().togglePalette();
      expect(useUIStore.getState().showPalette).toBe(true);
    });

    it('toggleCodePanel toggles visibility', () => {
      expect(useUIStore.getState().showCodePanel).toBe(true);
      useUIStore.getState().toggleCodePanel();
      expect(useUIStore.getState().showCodePanel).toBe(false);
    });

    it('toggleExecutionPanel toggles visibility', () => {
      expect(useUIStore.getState().showExecutionPanel).toBe(true);
      useUIStore.getState().toggleExecutionPanel();
      expect(useUIStore.getState().showExecutionPanel).toBe(false);
    });
  });

  // =========================================================================
  // Panel Sizes
  // =========================================================================

  describe('panel sizes', () => {
    it('has default sizes', () => {
      const { panelSizes } = useUIStore.getState();
      expect(panelSizes.palette).toBe(280);
      expect(panelSizes.codePanel).toBe(400);
      expect(panelSizes.executionPanel).toBe(250);
    });

    it('setPanelSize updates a specific panel', () => {
      useUIStore.getState().setPanelSize('palette', 350);
      expect(useUIStore.getState().panelSizes.palette).toBe(350);
      // Other panels unchanged
      expect(useUIStore.getState().panelSizes.codePanel).toBe(400);
    });
  });

  // =========================================================================
  // Code Generation Settings
  // =========================================================================

  describe('code generation', () => {
    it('defaults to python SDK mode', () => {
      expect(useUIStore.getState().selectedLanguage).toBe('python');
      expect(useUIStore.getState().codeMode).toBe('sdk');
    });

    it('setSelectedLanguage changes language', () => {
      useUIStore.getState().setSelectedLanguage('rust');
      expect(useUIStore.getState().selectedLanguage).toBe('rust');

      useUIStore.getState().setSelectedLanguage('dart');
      expect(useUIStore.getState().selectedLanguage).toBe('dart');
    });

    it('setCodeMode changes mode', () => {
      useUIStore.getState().setCodeMode('cli');
      expect(useUIStore.getState().codeMode).toBe('cli');
    });
  });

  // =========================================================================
  // Network
  // =========================================================================

  describe('network', () => {
    it('defaults to kermit', () => {
      expect(useUIStore.getState().selectedNetwork).toBe('kermit');
    });

    it('setSelectedNetwork changes network', () => {
      useUIStore.getState().setSelectedNetwork('mainnet');
      expect(useUIStore.getState().selectedNetwork).toBe('mainnet');
    });
  });

  // =========================================================================
  // Execution Tab
  // =========================================================================

  describe('execution tab', () => {
    it('defaults to log', () => {
      expect(useUIStore.getState().executionTab).toBe('log');
    });

    it('setExecutionTab changes tab', () => {
      useUIStore.getState().setExecutionTab('state-diff');
      expect(useUIStore.getState().executionTab).toBe('state-diff');

      useUIStore.getState().setExecutionTab('receipt');
      expect(useUIStore.getState().executionTab).toBe('receipt');
    });
  });

  // =========================================================================
  // Modals
  // =========================================================================

  describe('modals', () => {
    it('starts with no active modal', () => {
      expect(useUIStore.getState().activeModal).toBeNull();
      expect(useUIStore.getState().modalData).toBeNull();
    });

    it('openModal sets modal and data', () => {
      useUIStore.getState().openModal('block-config', { nodeId: 'node-1' });
      expect(useUIStore.getState().activeModal).toBe('block-config');
      expect(useUIStore.getState().modalData).toEqual({ nodeId: 'node-1' });
    });

    it('closeModal clears modal and data', () => {
      useUIStore.getState().openModal('export', { format: 'yaml' });
      useUIStore.getState().closeModal();
      expect(useUIStore.getState().activeModal).toBeNull();
      expect(useUIStore.getState().modalData).toBeNull();
    });
  });

  // =========================================================================
  // Template Gallery
  // =========================================================================

  describe('template gallery', () => {
    it('defaults to hidden', () => {
      expect(useUIStore.getState().showTemplateGallery).toBe(false);
    });

    it('setShowTemplateGallery toggles visibility', () => {
      useUIStore.getState().setShowTemplateGallery(true);
      expect(useUIStore.getState().showTemplateGallery).toBe(true);

      useUIStore.getState().setShowTemplateGallery(false);
      expect(useUIStore.getState().showTemplateGallery).toBe(false);
    });
  });
});
