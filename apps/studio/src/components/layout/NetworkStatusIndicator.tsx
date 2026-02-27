import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Globe, RefreshCw } from 'lucide-react';
import { cn } from '../ui';
import { networkService } from '../../services/network';
import { useUIStore } from '../../store';
import { NETWORKS } from '@accumulate-studio/types';

interface NetworkStatus {
  connected: boolean;
  blockHeight?: number;
  lastBlockTime?: string;
  oraclePrice?: number;
  error?: string;
}

export const NetworkStatusIndicator: React.FC = () => {
  const selectedNetwork = useUIStore((state) => state.selectedNetwork);
  const [status, setStatus] = useState<NetworkStatus>({ connected: false });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Get initial status
    const currentStatus = networkService.getStatus();
    if (currentStatus) {
      setStatus({
        connected: currentStatus.connected,
        blockHeight: currentStatus.blockHeight,
        lastBlockTime: currentStatus.lastBlockTime,
        oraclePrice: currentStatus.oraclePrice,
        error: currentStatus.error,
      });
    }

    // Subscribe to status changes
    const unsubscribe = networkService.onStatusChange((newStatus) => {
      setStatus({
        connected: newStatus.connected,
        blockHeight: newStatus.blockHeight,
        lastBlockTime: newStatus.lastBlockTime,
        oraclePrice: newStatus.oraclePrice,
        error: newStatus.error,
      });
    });

    return unsubscribe;
  }, [selectedNetwork]);

  const networkConfig = NETWORKS[selectedNetwork];
  const networkName = networkConfig?.name || selectedNetwork;
  const hasFaucet = networkConfig?.faucetAvailable ?? false;

  const handleReconnect = () => {
    networkService.connect(selectedNetwork).catch(() => {
      // Status listener will update state
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors',
          status.connected
            ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
            : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
        )}
        title={status.connected ? `Connected to ${networkName}` : `Disconnected from ${networkName}`}
      >
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            status.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          )}
        />
        {status.connected ? (
          <Wifi className="w-3.5 h-3.5" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
      </button>

      {expanded && (
        <>
          {/* Click-away overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setExpanded(false)}
          />
          {/* Dropdown panel */}
          <div className="absolute top-full right-0 mt-1 z-50 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {networkName}
                </span>
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-xs rounded-full font-medium',
                  status.connected
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                )}
              >
                {status.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {status.blockHeight != null && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Block Height</span>
                  <span className="font-mono">{status.blockHeight.toLocaleString()}</span>
                </div>
              )}
              {status.oraclePrice != null && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Oracle Price</span>
                  <span className="font-mono">${(status.oraclePrice / 100).toFixed(2)}</span>
                </div>
              )}
              {status.lastBlockTime && (
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Last Block</span>
                  <span className="font-mono">
                    {new Date(status.lastBlockTime).toLocaleTimeString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Faucet</span>
                <span>{hasFaucet ? 'Available' : 'N/A'}</span>
              </div>
              {status.error && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-600 dark:text-red-400 text-xs">
                  {status.error}
                </div>
              )}
            </div>

            {!status.connected && (
              <button
                onClick={handleReconnect}
                className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accumulate-600 hover:bg-accumulate-700 rounded-md transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reconnect
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
