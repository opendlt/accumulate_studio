import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LayoutGrid, GitBranch, Code2, FileText, Rocket } from 'lucide-react';
import { cn, Button } from '../ui';
import { useUIStore } from '../../store';

// =============================================================================
// Types
// =============================================================================

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 0 | 1 | 2;

// =============================================================================
// Step Components
// =============================================================================

const WelcomeStep: React.FC = () => (
  <div className="flex flex-col items-center text-center px-8 py-6">
    <div className="w-16 h-16 rounded-2xl bg-accumulate-100 dark:bg-accumulate-900/30 flex items-center justify-center mb-6">
      <Rocket className="w-8 h-8 text-accumulate-600 dark:text-accumulate-400" />
    </div>
    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
      Welcome to Accumulate Studio
    </h3>
    <p className="text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
      A visual flow builder for the Accumulate blockchain. Design transaction
      flows, generate SDK code in 5 languages, and execute on testnet — all from
      your browser.
    </p>
  </div>
);

const QuickTourStep: React.FC = () => (
  <div className="px-8 py-6">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 text-center">
      Your Workspace
    </h3>
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
      Three areas work together to build and test flows
    </p>
    <div className="grid grid-cols-3 gap-4">
      <div className="flex flex-col items-center text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3">
          <LayoutGrid className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">
          Action Palette
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Browse and drag blocks onto the canvas
        </p>
      </div>
      <div className="flex flex-col items-center text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
          <GitBranch className="w-5 h-5 text-green-600 dark:text-green-400" />
        </div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">
          Flow Canvas
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Connect blocks to build transaction flows
        </p>
      </div>
      <div className="flex flex-col items-center text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3">
          <Code2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">
          Code Panel
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          See generated SDK code in Python, Rust, Dart, JS, C#
        </p>
      </div>
    </div>
  </div>
);

const GetStartedStep: React.FC<{
  onTemplate: () => void;
  onScratch: () => void;
}> = ({ onTemplate, onScratch }) => (
  <div className="px-8 py-6">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 text-center">
      Get Started
    </h3>
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
      Choose how you'd like to begin
    </p>
    <div className="grid grid-cols-2 gap-4">
      <button
        onClick={onTemplate}
        className={cn(
          'flex flex-col items-center text-center p-6 rounded-xl border-2 transition-all',
          'border-accumulate-200 dark:border-accumulate-800 bg-accumulate-50 dark:bg-accumulate-900/20',
          'hover:border-accumulate-400 dark:hover:border-accumulate-600 hover:shadow-md'
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-accumulate-100 dark:bg-accumulate-900/30 flex items-center justify-center mb-3">
          <FileText className="w-6 h-6 text-accumulate-600 dark:text-accumulate-400" />
        </div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
          Start with a Template
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Pick a pre-built flow to learn the basics
        </p>
      </button>
      <button
        onClick={onScratch}
        className={cn(
          'flex flex-col items-center text-center p-6 rounded-xl border-2 transition-all',
          'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
          'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
          <Rocket className="w-6 h-6 text-gray-500 dark:text-gray-400" />
        </div>
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
          Start from Scratch
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Jump right in with an empty canvas
        </p>
      </button>
    </div>
  </div>
);

// =============================================================================
// Step Indicator
// =============================================================================

const StepIndicator: React.FC<{ currentStep: Step }> = ({ currentStep }) => (
  <div className="flex items-center justify-center gap-2" data-testid="step-indicator">
    {([0, 1, 2] as Step[]).map((s) => (
      <div
        key={s}
        className={cn(
          'w-2 h-2 rounded-full transition-colors',
          s === currentStep
            ? 'bg-accumulate-500'
            : 'bg-gray-300 dark:bg-gray-600'
        )}
        data-testid={`step-dot-${s}`}
        aria-current={s === currentStep ? 'step' : undefined}
      />
    ))}
  </div>
);

// =============================================================================
// Main Component
// =============================================================================

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>(0);

  const handleTemplate = () => {
    useUIStore.setState({ hasCompletedOnboarding: true });
    onClose();
    useUIStore.getState().openModal('template-select');
  };

  const handleScratch = () => {
    useUIStore.setState({ hasCompletedOnboarding: true });
    onClose();
  };

  const handleNext = () => {
    if (step < 2) setStep((step + 1) as Step);
  };

  const handleBack = () => {
    if (step > 0) setStep((step - 1) as Step);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 bg-black/50 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-xl overflow-hidden',
            'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
            'border border-gray-200 dark:border-gray-700',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'duration-200'
          )}
        >
          <Dialog.Title className="sr-only">Welcome to Accumulate Studio</Dialog.Title>
          <Dialog.Description className="sr-only">
            A guided introduction to Accumulate Studio's workspace
          </Dialog.Description>

          {/* Step Content */}
          {step === 0 && <WelcomeStep />}
          {step === 1 && <QuickTourStep />}
          {step === 2 && (
            <GetStartedStep onTemplate={handleTemplate} onScratch={handleScratch} />
          )}

          {/* Footer */}
          <div className="px-8 pb-6 flex items-center justify-between">
            <StepIndicator currentStep={step} />

            <div className="flex items-center gap-3">
              {step > 0 && step < 2 && (
                <Button variant="secondary" onClick={handleBack}>
                  Back
                </Button>
              )}
              {step < 2 && (
                <Button variant="primary" onClick={handleNext}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
