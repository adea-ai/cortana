import { plugin } from 'bun'
import { readFileSync } from 'node:fs'

import { transformAsync } from '@babel/core'
import presetTypescript from '@babel/preset-typescript'
import presetSolid from 'babel-preset-solid'

// Bun's native test runner does not load vite-plugin-solid, so component
// tests get the same DOM transform here: babel-preset-solid compiles JSX to
// solid-js/web calls and preset-typescript strips types, leaving plain
// JavaScript for Bun's module loader.
plugin({
  name: 'solid-jsx',
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
      const source = readFileSync(path, 'utf8')
      const result = await transformAsync(source, {
        filename: path,
        babelrc: false,
        configFile: false,
        sourceMaps: 'inline',
        presets: [
          [presetTypescript, { isTSX: true, allExtensions: true }],
          [presetSolid, { generate: 'dom', hydratable: false }],
        ],
      })
      return { contents: result?.code ?? source, loader: 'js' }
    })
  },
})
