import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'es.pelletcontrol.app',
  appName: 'Pellet Control',
  webDir: 'dist',
  android: {
    backgroundColor: '#f5f2ea',
    // Los márgenes (barras del sistema y teclado) los aplica MainActivity.java.
    adjustMarginsForEdgeToEdge: 'disable',
  },
};

export default config;
