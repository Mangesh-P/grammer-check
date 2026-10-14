import { defineConfig } from 'wxt';

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
  version: '1.0.0',

  browser_specific_settings: {
    gecko: {
      id: 'grammar-check@mangesh-p.github.io',
    },
  },

  permissions: ['storage', 'activeTab'],
  host_permissions: ['<all_urls>'],

  action: {
    default_title: 'Grammar Check',
  },

  commands: {
    'check-grammar': {
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
