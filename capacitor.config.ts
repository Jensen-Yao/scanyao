import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jensenyao.scanyao',
  appName: '扫耀',
  webDir: 'dist',
  android: {
    backgroundColor: '#f2f3f5',
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
