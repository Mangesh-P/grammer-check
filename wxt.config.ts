import { defineConfig } from 'wxt';
// Relative path: the config is loaded before the @/ alias exists. src/types has no imports, so this is safe.
import { CHECK_GRAMMAR_COMMAND } from './src/types';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  dev: {
    server: {
      port: 3210,
    },
  },
  webExt: {
    disabled: true,
  },
manifest: {
  name: 'Grammar Check - AI Grammar & Spelling Checker',
  description: 'Privacy-first AI grammar, spelling, and style checker. Works with local models (Ollama, Open WebUI) or your own API key.',
  version: '1.0.1',

  browser_specific_settings: {
    gecko: {
      id: 'grammar-check@mangesh-p.github.io',
      // Built-in data consent needs Firefox 140+; Mozilla recommends blocking older versions.
      strict_min_version: '140.0',
      // Checked text goes to the user's chosen AI provider (cloud or local), which AMO counts as website content.
      data_collection_permissions: {
        required: ['websiteContent'],
      },
    },
    gecko_android: {
      strict_min_version: '142.0',
    },
  },

  permissions: ['storage', 'activeTab'],
  host_permissions: ['<all_urls>'],

  action: {
    default_title: 'Grammar Check',
  },

  commands: {
    [CHECK_GRAMMAR_COMMAND]: {
      suggested_key: {
        default: 'Ctrl+Shift+G',
        mac: 'Command+Shift+G',
      },
      description: 'Check grammar in current text field',
    },
  },
},
  // React plugin is already added by @wxt-dev/module-react; adding it again breaks dev mode.
  vite: () => ({
    optimizeDeps: {
      // Pre-bundle up front so Vite doesn't re-optimize and force-reload pages mid-session.
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react'],
    },
  }),
});
