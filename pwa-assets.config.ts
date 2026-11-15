import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PNG icons iOS and Android need from public/favicon.svg:
//   npm run generate:icons
export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#14213d' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#14213d' },
    },
  },
  images: ['public/favicon.svg'],
});
