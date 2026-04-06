import {
  defineConfig,
  mergeConfig,
  type ConfigEnv,
  type ConfigPluginContext,
  type Plugin,
  type PluginOption,
  type UserConfig,
} from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

type CompatRoot = {
  rollupOptions?: Record<string, unknown>;
  rolldownOptions?: Record<string, unknown>;
  [key: string]: unknown;
};

type ConfigResult = Omit<UserConfig, 'plugins'> | null | void;
type ConfigHook = (
  this: ConfigPluginContext,
  config: UserConfig,
  env: ConfigEnv,
) => ConfigResult | Promise<ConfigResult>;

const COMPAT_ROOT_KEYS = ['build', 'worker', 'optimizeDeps'] as const;

function normalizePlugins(plugins: PluginOption): Plugin[] {
  if (!plugins) {
    return [];
  }

  if (Array.isArray(plugins)) {
    return plugins.flatMap((plugin) => normalizePlugins(plugin));
  }

  return [plugins as Plugin];
}

function mergeCompatOptions(
  modern?: Record<string, unknown>,
  legacy?: Record<string, unknown>,
) {
  if (!modern) {
    return legacy;
  }

  if (!legacy) {
    return modern;
  }

  return mergeConfig(modern, legacy);
}

function sanitizeCompatRoot<T extends CompatRoot | undefined>(root: T): T {
  if (!root || (root.rollupOptions == null && root.rolldownOptions == null)) {
    return root;
  }

  const sanitized = {
    ...root,
    rolldownOptions: mergeCompatOptions(root.rolldownOptions, root.rollupOptions),
  };

  delete sanitized.rollupOptions;

  return sanitized as T;
}

function sanitizeCrxCompatResult(result: unknown) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const config = { ...(result as Record<string, unknown>) };

  for (const key of COMPAT_ROOT_KEYS) {
    const root = config[key];
    if (root && typeof root === 'object') {
      config[key] = sanitizeCompatRoot(root as CompatRoot);
    }
  }

  const ssr = config.ssr;
  if (ssr && typeof ssr === 'object') {
    const nextSsr = { ...(ssr as Record<string, unknown>) };
    const optimizeDeps = nextSsr.optimizeDeps;
    if (optimizeDeps && typeof optimizeDeps === 'object') {
      nextSsr.optimizeDeps = sanitizeCompatRoot(optimizeDeps as CompatRoot);
      config.ssr = nextSsr;
    }
  }

  return config;
}

function wrapCrxCompatPlugins(plugins: PluginOption): Plugin[] {
  return normalizePlugins(plugins).map((plugin) => {
    if (typeof plugin.config !== 'function' || !plugin.name.startsWith('crx:')) {
      return plugin;
    }

    const originalConfig = plugin.config as ConfigHook;

    return {
      ...plugin,
      async config(
        this: ConfigPluginContext,
        config: UserConfig,
        env: ConfigEnv,
      ): Promise<ConfigResult> {
        const result = await originalConfig.call(this, config, env);

        // Vite 8 exposes `rollupOptions` as a compat alias to `rolldownOptions`.
        // CRX plugin hooks spread the resolved config back into their return value,
        // which can reintroduce both keys and trigger noisy warnings.
        return sanitizeCrxCompatResult(result) as ConfigResult;
      },
    };
  });
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  plugins: [react(), ...wrapCrxCompatPlugins(crx({ manifest }))],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  build: {
    outDir: 'dist',
    minify: false,
    rollupOptions: {
      input: {
        index: 'index.html',
        settings: 'settings.html',
      },
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('react/jsx-runtime')
          ) {
            return 'react';
          }
        },
      },
    },
  },
});
