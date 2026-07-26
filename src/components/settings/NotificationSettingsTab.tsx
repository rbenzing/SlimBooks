
import { forwardRef, useImperativeHandle } from 'react';
import { Bell, CheckCircle, AlertTriangle } from 'lucide-react';
import { themeClasses } from '@/utils/themeUtils.util';
import { toast } from 'sonner';
import { useNotificationSettings } from '@/hooks/useSettings.hook';
import type { SettingsTabRef } from '@/types';

export const NotificationSettingsTab = forwardRef<SettingsTabRef>((props, ref) => {
  const {
    settings,
    setSettings,
    saveSettings,
    isLoading,
    error
  } = useNotificationSettings();

  // Expose saveSettings method to parent component
  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      try {
        await saveSettings();
      } catch (error) {
        console.error('Error saving notification settings:', error);
        throw error;
      }
    }
  }), [saveSettings]);

  const handleSettingChange = (key: keyof typeof settings, value: boolean | number | string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const testNotification = (type: 'success' | 'error' | 'warning' | 'info') => {
    const messages = {
      success: 'This is a test success notification!',
      error: 'This is a test error notification!',
      warning: 'This is a test warning notification!',
      info: 'This is a test info notification!'
    };

    switch (type) {
      case 'success':
        if (settings.showSuccessToasts) toast.success(messages.success);
        break;
      case 'error':
        if (settings.showErrorToasts) toast.error(messages.error);
        break;
      case 'warning':
        if (settings.showWarningToasts) toast.warning(messages.warning);
        break;
      case 'info':
        if (settings.showInfoToasts) toast.info(messages.info);
        break;
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Bell className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Toast Notifications</h3>
        </div>
        <div className="flex justify-center py-8">
          <div className="text-muted-foreground">Loading notification settings...</div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Bell className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Toast Notifications</h3>
        </div>
        <div className="text-center py-8">
          <div className="text-destructive mb-2">Error loading settings</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notifications */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <div className="flex items-center mb-6">
          <Bell className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-medium text-card-foreground">Toast Notifications</h3>
        </div>

        <div className="space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-card-foreground">Enable Toast Notifications</h4>
              <p className="text-sm text-muted-foreground">Show popup notifications for actions and events throughout the application</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showToastNotifications}
                onChange={(e) => handleSettingChange('showToastNotifications', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Notification Types */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-card-foreground">Notification Types</h4>

              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                    <span className="text-sm text-card-foreground">Success notifications</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showSuccessToasts}
                    onChange={(e) => handleSettingChange('showSuccessToasts', e.target.checked)}
                    disabled={!settings.showToastNotifications}
                    className="rounded"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                    <span className="text-sm text-card-foreground">Error notifications</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showErrorToasts}
                    onChange={(e) => handleSettingChange('showErrorToasts', e.target.checked)}
                    disabled={!settings.showToastNotifications}
                    className="rounded"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" />
                    <span className="text-sm text-card-foreground">Warning notifications</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showWarningToasts}
                    onChange={(e) => handleSettingChange('showWarningToasts', e.target.checked)}
                    disabled={!settings.showToastNotifications}
                    className="rounded"
                  />
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Bell className="h-4 w-4 text-blue-600 mr-2" />
                    <span className="text-sm text-card-foreground">Info notifications</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showInfoToasts}
                    onChange={(e) => handleSettingChange('showInfoToasts', e.target.checked)}
                    disabled={!settings.showToastNotifications}
                    className="rounded"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-card-foreground">Test Notifications</h4>
              <div className="space-y-2">
                <button
                  onClick={() => testNotification('success')}
                  disabled={!settings.showToastNotifications || !settings.showSuccessToasts}
                  className="w-full px-3 py-2 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Test Success
                </button>
                <button
                  onClick={() => testNotification('error')}
                  disabled={!settings.showToastNotifications || !settings.showErrorToasts}
                  className="w-full px-3 py-2 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Test Error
                </button>
                <button
                  onClick={() => testNotification('warning')}
                  disabled={!settings.showToastNotifications || !settings.showWarningToasts}
                  className="w-full px-3 py-2 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Test Warning
                </button>
                <button
                  onClick={() => testNotification('info')}
                  disabled={!settings.showToastNotifications || !settings.showInfoToasts}
                  className="w-full px-3 py-2 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Test Info
                </button>
              </div>
            </div>
          </div>

          {/* Display Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Toast Duration (milliseconds)
              </label>
              <input
                type="number"
                min="1000"
                max="10000"
                step="500"
                value={settings.toastDuration}
                onChange={(e) => handleSettingChange('toastDuration', parseInt(e.target.value) || 4000)}
                disabled={!settings.showToastNotifications}
                className={themeClasses.input}
              />
              <p className="text-xs text-muted-foreground mt-1">How long notifications stay visible (1-10 seconds)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Toast Position
              </label>
              <select
                value={settings.toastPosition}
                onChange={(e) => handleSettingChange('toastPosition', e.target.value)}
                disabled={!settings.showToastNotifications}
                className={themeClasses.select}
              >
                <option value="top-left">Top Left</option>
                <option value="top-center">Top Center</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-center">Bottom Center</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Information Section */}
      <div className="bg-card rounded-lg shadow-sm border border-border p-6">
        <h4 className="text-sm font-medium text-card-foreground mb-3">About Notifications</h4>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Toast Notifications:</strong> Small popup messages that appear when you perform actions like saving invoices, sending emails, or when errors occur.
          </p>
          <p>
            <strong>Email Communications:</strong> Configure email settings in the Email Settings section to control invoice and reminder emails sent to clients.
          </p>
          <p>
            <strong>Note:</strong> These settings only control the popup notifications you see in the application interface, not email communications with clients.
          </p>
        </div>
      </div>
    </div>
  );
});

NotificationSettingsTab.displayName = 'NotificationSettingsTab';
