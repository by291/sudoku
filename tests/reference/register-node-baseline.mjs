// Playwright's Node-side oracles are explicit test-only imports. No browser bundle loads this hook.
import { registerHooks } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { referenceRoot } from '../migration/freeze-reference.mjs'
import { registerReference } from '../migration/reference-loader.mjs'

registerReference()
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@reference/')) {
      return next(
        pathToFileURL(resolve(referenceRoot, 'src', specifier.slice('@reference/'.length) + '.ts'))
          .href,
        context,
      )
    }
    return next(specifier, context)
  },
})
