import { themeScript } from '@adea-ai/ui/components/theme/script'
import { defaultDarkThemeId } from '@adea-ai/ui/lib/theme-defaults'

import { APPEARANCE_STORAGE_KEY } from './theme.ts'

/**
 * The shared no-flash script plus Cortana's one rule, as a string. Only the build
 * reads this module (vite.config.ts writes the string to `theme-boot.js`); the app
 * never imports it.
 *
 * It is a file because the desktop shell's CSP is `script-src 'self'`. It sets the
 * stored selection's data-theme, class and color-scheme before the first frame, and
 * theme-variants.css supplies that theme's palette. Cortana is dark-chrome only and
 * the provider pins `appearance: 'dark'`, but a first launch has no stored selection
 * and the shared script resolves that against the operating system, so anything it
 * leaves light is made the default dark theme.
 */
export function themeBootSource(): string {
  return (
    themeScript({ key: APPEARANCE_STORAGE_KEY }) +
    `(function(){var r=document.documentElement;if(r.dataset.appearance==='dark')return;` +
    `r.classList.add('dark');r.style.colorScheme='dark';r.dataset.appearance='dark';` +
    `r.dataset.theme=${JSON.stringify(defaultDarkThemeId)}})();`
  )
}
