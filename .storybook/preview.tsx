import type { Preview } from 'storybook-solidjs-vite'
import { withThemeByClassName } from '@storybook/addon-themes'
import { initialGlobals as themeInitialGlobals } from '@storybook/addon-themes/preview'
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { setupWorker } from 'msw/browser'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { createJSXDecorator } from 'storybook-solidjs-vite'
import '../src/index.css'

const preview: Preview = {
  initialGlobals: {
    ...themeInitialGlobals,
    theme: 'dark',
  },
  // Our own setup rather than the addon's default: that one still passes msw 2's
  // `onUnhandledRequest`, which msw 3 ignores, so every unmocked request would warn.
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker()
      await worker.start({ quiet: true, onUnhandledFrame: 'bypass' })
      return worker
    }),
  ],
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'dark',
      parentSelector: 'html',
    }),
    createJSXDecorator((Story) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
        },
      })
      return (
        <QueryClientProvider client={queryClient}>
          <div class="min-h-[120px] bg-background p-4 text-foreground">
            <Story />
          </div>
        </QueryClientProvider>
      )
    }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
