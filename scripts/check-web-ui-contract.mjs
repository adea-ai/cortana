#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve, matchesGlob as pathMatchesGlob } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import ts from 'typescript'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRootPath = 'apps/web/src'
const rawControls = new Set([
  'a',
  'button',
  'details',
  'fieldset',
  'legend',
  'input',
  'kbd',
  'meter',
  'progress',
  'table',
  'label',
  'option',
  'select',
  'summary',
  'textarea',
])
const primitivePackages = [
  '@kobalte/core',
  '@corvu',
  'cmdk-solid',
  '@ark-ui',
  '@zag-js',
  '@radix-ui',
  'radix-ui',
  '@base-ui-components',
  '@base-ui',
  'class-variance-authority',
  'tailwind-variants',
  'cva',
  'clsx',
  'classnames',
  'tailwind-merge',
  'cn',
]
const sharedPackages = ['@adea-ai/ui', '@adea-ai/themes']
const sharedButtonModule = '@adea-ai/ui/components/ui/button'

const uiRules = [
  'adea/no-raw-interactive-elements',
  'adea/no-primitive-library-imports',
  'adea/no-interactive-wrappers',
  'adea/no-inline-styles',
  'adea/no-class-list',
  'adea/require-action-button-tooltip',
  'shadcn/no-restyle',
  'shadcn/no-raw-colors',
  'shadcn/no-arbitrary-values',
  'shadcn/no-inline-styles',
  'shadcn/no-unknown-classes',
  'shadcn/require-static-classes',
]
const restyleDenyCategories = ['color', 'typography', 'shape', 'effects', 'motion']

const removedFiles = [
  'LegacyRenderer.tsx',
  'ShadcnRenderer.tsx',
  'rendererMode.ts',
  'components/Navigation.tsx',
  'components/ui/Button.tsx',
  'components/ui/buttonClasses.ts',
  'components/m7/M7SurfacePrimitives.tsx',
  'components/m7/M7SurfacePrimitives.shadcn.ts',
  'components/shadcn/sidebar-context.ts',
  'components/shadcn/sidebar-variants.ts',
  'components/shadcn/sidebar.tsx',
  'components/shadcn/sidebar.test.tsx',
  'components/settings/field.tsx',
  'components/settings/label.tsx',
  'styles.css',
  'styles/buttons.css',
  'styles/context.css',
  'styles/responsive.css',
  'styles/settings.css',
  'styles/shell.css',
  'styles/tokens.css',
  'styles/utility.css',
  'styles/workspace.css',
]

const legacyTokens = new Set([
  '--amber',
  '--amber-soft',
  '--ink',
  '--panel',
  '--line',
  '--paper',
  '--paper-ink',
  '--surface-elevated',
  '--btn-chrome-size',
  '--btn-icon-size',
  '--btn-compact-height',
  '--btn-compact-padding',
  '--btn-action-height',
  '--btn-action-padding',
])

const colorFunction = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i
const colorKeywords = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    ' '
  )
)

function filesBelow(directory, includeTests = false) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return filesBelow(path, includeTests)
      return /\.(?:css|jsx?|tsx?)$/.test(entry.name) &&
        (includeTests || !/\.test\./.test(entry.name))
        ? [path]
        : []
    })
}

export function normalizePathSeparators(path) {
  return path.replaceAll('\\', '/')
}

function relativeSourcePath(sourceRoot, file) {
  return normalizePathSeparators(relative(sourceRoot, file))
}

function lineAt(source, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) if (source[index] === '\n') line += 1
  return line
}

function scriptFile(file, source) {
  const kind = file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : file.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
}

function importedNames(clause) {
  if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return []
  return clause.namedBindings.elements.map((element) => ({
    imported: element.propertyName?.text ?? element.name.text,
    local: element.name.text,
  }))
}

function resolveModule(file, specifier, scripts) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(file), specifier)
  return (
    [
      base,
      ...['.tsx', '.ts', '.jsx', '.js'].map((extension) => `${base}${extension}`),
      ...['index.tsx', 'index.ts', 'index.jsx', 'index.js'].map((name) => resolve(base, name)),
    ].find((path) => scripts.has(path)) ?? null
  )
}

function hasExportModifier(node) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  )
}

function jsxTagName(node) {
  const tag = node.tagName
  return ts.isIdentifier(tag) ? tag.text : null
}

function unwrapExpression(node) {
  let expression = node
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression
  }
  return expression
}

function returnedJsxExpressions(node) {
  if (!node) return []
  if (!ts.isBlock(node)) return [node]

  const expressions = []
  const visit = (child) => {
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child) ||
      ts.isMethodDeclaration(child) ||
      ts.isGetAccessorDeclaration(child) ||
      ts.isSetAccessorDeclaration(child) ||
      ts.isConstructorDeclaration(child)
    )
      return
    if (ts.isReturnStatement(child)) {
      expressions.push(child.expression)
      return
    }
    ts.forEachChild(child, visit)
  }
  for (const statement of node.statements) visit(statement)
  return expressions
}

function returnedJsxTagName(node) {
  const expression = unwrapExpression(node)
  if (ts.isJsxElement(expression)) return jsxTagName(expression.openingElement)
  if (ts.isJsxSelfClosingElement(expression)) return jsxTagName(expression)
  return null
}

function visitJsx(node, visitor) {
  const visit = (child) => {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) visitor(child)
    ts.forEachChild(child, visit)
  }
  visit(node)
}

function sourceData(files) {
  const scripts = new Map()
  const data = new Map()

  for (const file of files.filter((path) => /\.[jt]sx?$/.test(path))) {
    const source = readFileSync(file, 'utf8')
    const sf = scriptFile(file, source)
    scripts.set(file, sf)
    data.set(file, {
      source,
      sf,
      shared: new Map(),
      exports: new Map(),
      localImports: [],
      aliases: [],
      wrappers: [],
      dynamicNames: new Set(['Dynamic']),
    })
  }

  for (const [file, item] of data) {
    const sf = item.sf
    for (const statement of sf.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const moduleName = statement.moduleSpecifier.text
        const clause = statement.importClause
        if (moduleName.startsWith('@adea-ai/ui/components/')) {
          for (const binding of importedNames(clause))
            item.shared.set(binding.local, binding.imported)
        } else if (moduleName === 'solid-js/web' && clause) {
          for (const binding of importedNames(clause)) {
            if (binding.imported === 'Dynamic') item.dynamicNames.add(binding.local)
          }
        } else {
          const target = resolveModule(file, moduleName, scripts)
          if (target) {
            for (const binding of importedNames(clause)) {
              item.localImports.push({ local: binding.local, target, imported: binding.imported })
            }
          }
        }
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        const moduleName =
          statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : null
        for (const element of statement.exportClause.elements) {
          item.aliases.push({
            local: element.propertyName?.text ?? element.name.text,
            exported: element.name.text,
            moduleName,
          })
        }
      }

      if (ts.isFunctionDeclaration(statement) && statement.name) {
        item.wrappers.push({ name: statement.name.text, node: statement.body })
        if (hasExportModifier(statement))
          item.aliases.push({
            local: statement.name.text,
            exported: statement.name.text,
            moduleName: null,
          })
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
          if (
            ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer)
          ) {
            item.wrappers.push({ name: declaration.name.text, node: declaration.initializer.body })
            if (hasExportModifier(statement)) {
              item.aliases.push({
                local: declaration.name.text,
                exported: declaration.name.text,
                moduleName: null,
              })
            }
          }
        }
      }
    }
  }

  let changed = true
  while (changed) {
    changed = false
    for (const [file, item] of data) {
      for (const binding of item.localImports) {
        const targetValue = data.get(binding.target)?.exports.get(binding.imported)
        if (targetValue && item.shared.get(binding.local) !== targetValue) {
          item.shared.set(binding.local, targetValue)
          changed = true
        }
      }

      for (const wrapper of item.wrappers) {
        if (!wrapper.node || item.shared.has(wrapper.name)) continue
        const returnedPrimitives = returnedJsxExpressions(wrapper.node).map((expression) => {
          const name = expression && returnedJsxTagName(expression)
          return name ? item.shared.get(name) : undefined
        })
        const primitive = returnedPrimitives[0]
        if (primitive && returnedPrimitives.every((candidate) => candidate === primitive)) {
          item.shared.set(wrapper.name, primitive)
          changed = true
        }
      }

      for (const alias of item.aliases) {
        let value
        if (alias.moduleName?.startsWith('@adea-ai/ui/components/')) {
          value = alias.local
        } else if (alias.moduleName) {
          const target = resolveModule(file, alias.moduleName, scripts)
          value = target ? data.get(target)?.exports.get(alias.local) : undefined
        } else {
          value = item.shared.get(alias.local)
        }
        if (value && item.exports.get(alias.exported) !== value) {
          item.exports.set(alias.exported, value)
          item.shared.set(alias.exported, value)
          changed = true
        }
      }
    }
  }

  return data
}

function staticStringParts(node) {
  const parts = []
  const visit = (child) => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child))
      parts.push(child.text)
    else if (ts.isTemplateExpression(child)) {
      parts.push(child.head.text, ...child.templateSpans.map((span) => span.literal.text))
    }
    ts.forEachChild(child, visit)
  }
  if (node) visit(node)
  return parts
}

function classAttributeNames(element) {
  const names = new Set()
  for (const property of element.attributes.properties) {
    if (
      !ts.isJsxAttribute(property) ||
      !['class', 'className', 'classList'].includes(property.name.text)
    )
      continue
    const initializer = property.initializer
    const values = ts.isStringLiteral(initializer)
      ? [initializer.text]
      : ts.isJsxExpression(initializer)
        ? staticStringParts(initializer.expression)
        : []
    for (const token of values.flatMap((value) => value.split(/\s+/))) {
      if (/^[A-Za-z_][\w-]*$/.test(token)) names.add(token)
    }
    if (
      property.name.text === 'classList' &&
      ts.isJsxExpression(initializer) &&
      ts.isObjectLiteralExpression(initializer.expression)
    ) {
      for (const member of initializer.expression.properties) {
        if (!ts.isPropertyAssignment(member)) continue
        const name = member.name
        if (
          ts.isIdentifier(name) ||
          ts.isStringLiteral(name) ||
          ts.isNoSubstitutionTemplateLiteral(name)
        )
          names.add(name.text)
      }
    }
  }
  return names
}

/** Collects custom class names applied to @adea-ai/ui components and local adapters of them. */
export function collectSharedClasses(root = defaultRoot) {
  const sourceRoot = resolve(root, sourceRootPath)
  const files = filesBelow(sourceRoot)
  const data = sourceData(files)
  const result = []
  for (const [file, item] of data) {
    visitJsx(item.sf, (element) => {
      const name = jsxTagName(element)
      const sharedPrimitive = name ? item.shared.get(name) : undefined
      if (!name || !sharedPrimitive) return
      const classNames = [...classAttributeNames(element)].toSorted()
      for (const className of classNames) {
        result.push({
          file: relativeSourcePath(sourceRoot, file),
          line: lineAt(item.source, element.getStart(item.sf)),
          component: name,
          sharedPrimitive,
          className,
          classNames,
        })
      }
    })
  }
  return result.toSorted(
    (left, right) =>
      left.className.localeCompare(right.className) ||
      left.file.localeCompare(right.file) ||
      left.line - right.line
  )
}

function literalTooltipHasHelp(value) {
  return /[\p{L}\p{N}]/u.test(value)
}

function tooltipHasHelp(attribute) {
  if (!attribute?.initializer) return false
  if (
    ts.isStringLiteral(attribute.initializer) ||
    ts.isNoSubstitutionTemplateLiteral(attribute.initializer)
  )
    return literalTooltipHasHelp(attribute.initializer.text)
  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return false
  return tooltipExpressionHasHelp(attribute.initializer.expression)
}

function tooltipExpressionHasHelp(node) {
  const expression = unwrapExpression(node)
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return literalTooltipHasHelp(expression.text)
  if (ts.isConditionalExpression(expression))
    return (
      tooltipExpressionHasHelp(expression.whenTrue) &&
      tooltipExpressionHasHelp(expression.whenFalse)
    )
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  )
    return false
  if (
    (ts.isIdentifier(expression) && expression.text === 'undefined') ||
    ts.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword
  )
    return false
  return true
}

function listRowIsInteractive(element) {
  return element.attributes.properties.some((property) => {
    if (!ts.isJsxAttribute(property)) return false
    if (property.name.text === 'onClick') return true
    if (property.name.text !== 'as' || !property.initializer) return false
    const value = ts.isJsxExpression(property.initializer)
      ? property.initializer.expression && unwrapExpression(property.initializer.expression)
      : property.initializer
    return value && ts.isStringLiteral(value) && ['a', 'button'].includes(value.text.toLowerCase())
  })
}

function hasFieldSetAccessibleName(element, ids) {
  return element.attributes.properties.some((property) => {
    if (
      !ts.isJsxAttribute(property) ||
      !['aria-label', 'aria-labelledby'].includes(property.name.text) ||
      !property.initializer
    )
      return false

    const initializer = property.initializer
    if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer))
      return property.name.text === 'aria-labelledby'
        ? initializer.text.trim().length > 0 &&
            initializer.text
              .trim()
              .split(/\s+/)
              .every((id) => ids.has(`literal:${id}`))
        : initializer.text.trim().length > 0
    if (!ts.isJsxExpression(initializer) || !initializer.expression) return false

    const expression = unwrapExpression(initializer.expression)
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
      return property.name.text === 'aria-labelledby'
        ? expression.text.trim().length > 0 &&
            expression.text
              .trim()
              .split(/\s+/)
              .every((id) => ids.has(`literal:${id}`))
        : expression.text.trim().length > 0
    if (property.name.text === 'aria-labelledby')
      return ids.has(`expression:${expression.getText()}`)
    return (
      !(ts.isIdentifier(expression) && expression.text === 'undefined') &&
      expression.kind !== ts.SyntaxKind.NullKeyword &&
      expression.kind !== ts.SyntaxKind.FalseKeyword
    )
  })
}

function jsxHasAccessibleText(node) {
  if (ts.isJsxText(node)) return node.text.trim().length > 0
  if (ts.isJsxExpression(node)) return tooltipHasHelp({ initializer: node })
  if (ts.isJsxFragment(node)) return node.children.some(jsxHasAccessibleText)
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return false
  const element = ts.isJsxElement(node) ? node.openingElement : node
  if (
    element.attributes.properties.some(
      (property) =>
        ts.isJsxAttribute(property) &&
        ['aria-label', 'alt', 'title', 'children'].includes(property.name.text) &&
        tooltipHasHelp(property)
    )
  )
    return true
  return ts.isJsxElement(node) && node.children.some(jsxHasAccessibleText)
}

function containsSharedFieldLegend(element, shared) {
  if (!ts.isJsxOpeningElement(element) || !ts.isJsxElement(element.parent)) return false
  const hasLegend = (node) => {
    if (ts.isJsxFragment(node)) return node.children.some(hasLegend)
    if (ts.isJsxExpression(node) && node.expression) return hasLegend(node.expression)
    if (ts.isConditionalExpression(node))
      return hasLegend(node.whenTrue) && hasLegend(node.whenFalse)
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return false
    const opening = ts.isJsxElement(node) ? node.openingElement : node
    const name = jsxTagName(opening)
    return shared.get(name) === 'FieldLegend' && jsxHasAccessibleText(node)
  }
  return element.parent.children.some(hasLegend)
}

function fieldSetFailures(sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    const ids = new Set()
    visitJsx(item.sf, (element) => {
      for (const property of element.attributes.properties) {
        if (!ts.isJsxAttribute(property) || property.name.text !== 'id' || !property.initializer)
          continue
        const value = ts.isJsxExpression(property.initializer)
          ? property.initializer.expression
          : property.initializer
        if (!value) continue
        const expression = unwrapExpression(value)
        const target = ts.isJsxOpeningElement(element) ? element.parent : element
        if (!jsxHasAccessibleText(target)) continue
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
          ids.add(`literal:${expression.text}`)
        else ids.add(`expression:${expression.getText()}`)
      }
    })
    visitJsx(item.sf, (element) => {
      const name = jsxTagName(element)
      if (!name || item.shared.get(name) !== 'FieldSet') return
      if (
        hasFieldSetAccessibleName(element, ids) ||
        containsSharedFieldLegend(element, item.shared)
      )
        return
      failures.push(
        `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, element.getStart(item.sf))} <${name}> requires a shared FieldLegend child or explicit aria-label/aria-labelledby; use FieldGroup for layout-only grouping`
      )
    })
  }
  return failures
}

function resolvesActionButton(expression, shared) {
  const node = unwrapExpression(expression)
  if (ts.isIdentifier(node)) return shared.get(node.text) === 'ActionButton'
  if (ts.isConditionalExpression(node)) {
    return (
      resolvesActionButton(node.whenTrue, shared) || resolvesActionButton(node.whenFalse, shared)
    )
  }
  if (ts.isBinaryExpression(node)) {
    const isFallback = [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind)
    return (
      isFallback &&
      (resolvesActionButton(node.left, shared) || resolvesActionButton(node.right, shared))
    )
  }
  return false
}

function actionButtonFailures(sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    visitJsx(item.sf, (element) => {
      const name = jsxTagName(element)
      const renderedAsActionButton = element.attributes.properties.some((property) => {
        if (
          !ts.isJsxAttribute(property) ||
          property.name.text !== 'as' ||
          !ts.isJsxExpression(property.initializer) ||
          !property.initializer.expression
        )
          return false
        return resolvesActionButton(property.initializer.expression, item.shared)
      })
      const sharedPrimitive = name ? item.shared.get(name) : undefined
      const needsActionButtonHelp = sharedPrimitive === 'ActionButton' || renderedAsActionButton
      const needsListRowHelp = sharedPrimitive === 'ListRow' && listRowIsInteractive(element)
      if (!name || (!needsActionButtonHelp && !needsListRowHelp)) return
      const tooltip = element.attributes.properties.find(
        (property) => ts.isJsxAttribute(property) && property.name.text === 'tooltip'
      )
      if (tooltip && ts.isJsxAttribute(tooltip) && tooltipHasHelp(tooltip)) return
      failures.push(
        `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, element.getStart(item.sf))} <${name}>${renderedAsActionButton ? ' using an ActionButton in as' : ''} requires a nonempty helpful explicit tooltip prop; prop spreads do not satisfy the help contract`
      )
    })
  }
  return failures
}

function forbiddenPackage(packageName) {
  return primitivePackages.some(
    (name) => packageName === name || packageName.startsWith(`${name}/`)
  )
}

function isPublishedVersionRange(specifier) {
  if (typeof specifier !== 'string') return false
  return /^(?:\^|~)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    specifier
  )
}

function sharedPackageOverrideName(key) {
  if (typeof key !== 'string') return undefined
  return sharedPackages.find((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|/)${escaped}(?:$|@)`).test(key)
  })
}

function overrideFailures(pkg, manifestPath) {
  const failures = []
  const sections = [
    ['overrides', pkg.overrides],
    ['resolutions', pkg.resolutions],
    ['pnpm.overrides', pkg.pnpm?.overrides],
  ]
  for (const [sectionName, section] of sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue
    const visit = (entries, parentKeys = []) => {
      for (const [key, value] of Object.entries(entries)) {
        const packageName = sharedPackageOverrideName(key)
        if (packageName) {
          const specifier =
            typeof value === 'string'
              ? value
              : value && typeof value === 'object' && !Array.isArray(value)
                ? value['.']
                : undefined
          if (specifier !== undefined && !isPublishedVersionRange(specifier)) {
            const target = [...parentKeys, key].join(' > ')
            failures.push(
              `${manifestPath} ${sectionName} ${target} must use a published registry semver version`
            )
          }
        }
        if (value && typeof value === 'object' && !Array.isArray(value))
          visit(value, [...parentKeys, key])
      }
    }
    visit(section)
  }
  return failures
}

function matchesSharedPackageAlias(alias) {
  if (typeof alias !== 'string') return false
  const regexLiteral = alias.match(/^\/(.*)\/([a-z]*)$/)
  if (regexLiteral) {
    try {
      const matcher = new RegExp(regexLiteral[1], regexLiteral[2])
      return sharedPackages.some((packageName) =>
        [packageName, `${packageName}/subpath`].some((specifier) => {
          matcher.lastIndex = 0
          return matcher.test(specifier)
        })
      )
    } catch {
      return false
    }
  }
  const normalized = alias.replaceAll('\\/', '/')
  return sharedPackages.some((packageName) => {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.*')
    const matches = (candidate) => new RegExp(`^${escaped}$`).test(candidate)
    return matches(packageName) || matches(`${packageName}/subpath`)
  })
}

function tsPropertyNameText(name) {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function tsConfigAliasFailures(root) {
  const appRoot = resolve(root, 'apps/web')
  if (!existsSync(appRoot)) return []
  const failures = []
  for (const entry of readdirSync(appRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/^tsconfig(?:\.[\w-]+)?\.json$/.test(entry.name)) continue
    const path = resolve(appRoot, entry.name)
    const relativePath = `apps/web/${entry.name}`
    const parsed = ts.readConfigFile(path, ts.sys.readFile)
    if (parsed.error) {
      failures.push(
        `${relativePath} is invalid JSONC: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n')}`
      )
      continue
    }
    const paths = parsed.config.compilerOptions?.paths
    for (const alias of Object.keys(paths ?? {})) {
      if (matchesSharedPackageAlias(alias)) {
        failures.push(
          `${relativePath} aliases ${alias}; resolve @adea-ai/ui and @adea-ai/themes from published packages`
        )
      }
    }
  }
  return failures
}

function viteAliasFailures(root) {
  const path = resolve(root, 'apps/web/vite.config.ts')
  if (!existsSync(path)) return []
  const source = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const failures = []
  const seenInitializers = new Set()
  const aliases = []
  const resolveIdentifier = (node) => {
    if (!ts.isIdentifier(node)) return node
    const declaration = sf.statements
      .flatMap((statement) =>
        ts.isVariableStatement(statement) ? statement.declarationList.declarations : []
      )
      .find((item) => ts.isIdentifier(item.name) && item.name.text === node.text)
    return declaration?.initializer ?? node
  }
  const collectAlias = (expression) => {
    const resolved = resolveIdentifier(expression)
    if (seenInitializers.has(resolved)) return
    seenInitializers.add(resolved)
    if (ts.isArrayLiteralExpression(resolved)) {
      for (const element of resolved.elements) collectAlias(element)
      return
    }
    if (!ts.isObjectLiteralExpression(resolved)) return
    for (const property of resolved.properties) {
      if (ts.isSpreadAssignment(property)) {
        collectAlias(property.expression)
        continue
      }
      if (!ts.isPropertyAssignment(property)) continue
      const name = tsPropertyNameText(property.name)
      if (name === 'find') aliases.push(property.initializer)
      else if (name === 'replacement') continue
      else aliases.push(property.name)
      if (
        ts.isObjectLiteralExpression(property.initializer) ||
        ts.isArrayLiteralExpression(property.initializer)
      )
        collectAlias(property.initializer)
    }
  }
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && tsPropertyNameText(node.name) === 'alias')
      collectAlias(node.initializer)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  for (const alias of aliases) {
    const value =
      ts.isStringLiteral(alias) || ts.isNoSubstitutionTemplateLiteral(alias)
        ? alias.text
        : alias.getText(sf)
    if (matchesSharedPackageAlias(value)) {
      failures.push(
        'apps/web/vite.config.ts aliases a shared package; resolve @adea-ai/ui and @adea-ai/themes from published packages'
      )
      break
    }
  }
  return failures
}

function dependencyFailures(root) {
  const failures = []
  const packagePath = resolve(root, 'apps/web/package.json')
  if (!existsSync(packagePath)) return ['apps/web/package.json is missing']
  let pkg
  try {
    pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  } catch (error) {
    return [`apps/web/package.json is invalid JSON: ${error.message}`]
  }
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      if (forbiddenPackage(name))
        failures.push(`apps/web/package.json declares ${section} ${name}; use @adea-ai/ui`)
    }
  }
  for (const name of sharedPackages) {
    const specifier = pkg.dependencies?.[name]
    if (!specifier) {
      failures.push(`apps/web/package.json must declare ${name} in dependencies`)
    } else if (!isPublishedVersionRange(specifier)) {
      failures.push(
        `apps/web/package.json dependencies ${name} must use a published registry semver version`
      )
    }
  }
  failures.push(...overrideFailures(pkg, 'apps/web/package.json'))

  const rootPackagePath = resolve(root, 'package.json')
  if (existsSync(rootPackagePath)) {
    let rootPackage
    try {
      rootPackage = JSON.parse(readFileSync(rootPackagePath, 'utf8'))
    } catch (error) {
      failures.push(`package.json is invalid JSON: ${error.message}`)
    }
    if (rootPackage) {
      for (const section of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ]) {
        for (const name of sharedPackages) {
          const specifier = rootPackage[section]?.[name]
          if (specifier && !isPublishedVersionRange(specifier)) {
            failures.push(
              `package.json ${section} ${name} must use a published registry semver version`
            )
          }
        }
      }
      if (rootPackage.devDependencies?.['@adea-ai/ui'] !== pkg.dependencies?.['@adea-ai/ui'])
        failures.push(
          'package.json devDependencies @adea-ai/ui must match apps/web/package.json so lint and the renderer use the same shared library'
        )
      failures.push(...overrideFailures(rootPackage, 'package.json'))
    }
  }
  if (existsSync(resolve(root, 'packages/ui')))
    failures.push('packages/ui exists; shared UI ownership belongs to @adea-ai/ui')
  if (existsSync(resolve(root, sourceRootPath, 'components/ui'))) {
    failures.push(
      'apps/web/src/components/ui exists; import primitives from @adea-ai/ui/components/ui/*'
    )
  }
  failures.push(...tsConfigAliasFailures(root))
  failures.push(...viteAliasFailures(root))
  return failures
}

function primitiveImportFailures(root, sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    const report = (moduleName, offset) => {
      if (moduleName === '@adea-ai/ui')
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, offset)} imports @adea-ai/ui root; use canonical components or lib subpaths so component contracts stay enforceable`
        )
      if (forbiddenPackage(moduleName)) {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, offset)} imports ${moduleName}; use @adea-ai/ui`
        )
      }
    }
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        report(node.moduleSpecifier.text, node.getStart(item.sf))
        if (node.moduleSpecifier.text === 'lucide-solid') {
          const bindings = ts.isImportDeclaration(node)
            ? importedNames(node.importClause).map((binding) => binding.imported)
            : node.exportClause && ts.isNamedExports(node.exportClause)
              ? node.exportClause.elements.map(
                  (binding) => binding.propertyName?.text ?? binding.name.text
                )
              : []
          for (const name of bindings) {
            if (name.startsWith('Loader'))
              failures.push(
                `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, node.getStart(item.sf))} imports ${name} from lucide-solid; use shared Spinner for loading indicators`
              )
          }
        }
      }
      if (
        ts.isCallExpression(node) &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
        if (isRequire || isDynamicImport) report(node.arguments[0].text, node.getStart(item.sf))
      }
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'cva') {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, node.getStart(item.sf))} defines a local cva helper; use shared component variants`
        )
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'cva'
      ) {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, node.getStart(item.sf))} defines a local cva helper; use shared component variants`
        )
      }
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'cn') {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, node.getStart(item.sf))} defines a local cn helper; import it from @adea-ai/ui/lib/utils`
        )
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'cn') {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, node.getStart(item.sf))} defines a local cn helper; import it from @adea-ai/ui/lib/utils`
        )
      }
      ts.forEachChild(node, visit)
    }
    visit(item.sf)
  }
  return failures
}

function bareSharedButtonFailures(sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    for (const statement of item.sf.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === sharedButtonModule
      ) {
        const bindings = statement.importClause?.namedBindings
        const importsButton =
          (bindings && ts.isNamespaceImport(bindings)) ||
          (bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.some(
              (element) => (element.propertyName?.text ?? element.name.text) === 'Button'
            ))
        if (importsButton) {
          failures.push(
            `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, statement.getStart(item.sf))} imports bare Button from ${sharedButtonModule}; use ActionButton or an interactive ListRow`
          )
        }
      }

      if (
        !ts.isExportDeclaration(statement) ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== sharedButtonModule
      )
        continue

      const reexportsButton =
        !statement.exportClause ||
        !ts.isNamedExports(statement.exportClause) ||
        statement.exportClause.elements.some(
          (element) => (element.propertyName?.text ?? element.name.text) === 'Button'
        )
      if (reexportsButton) {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, statement.getStart(item.sf))} re-exports bare Button from ${sharedButtonModule}; use ActionButton or an interactive ListRow`
        )
      }
    }
  }
  return failures
}

function resolveRawControl(node, initializers, seen = new Set()) {
  if (!node) return false
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return rawControls.has(node.text)
  if (ts.isIdentifier(node)) {
    const initializer = initializers(node)
    if (!initializer || seen.has(initializer)) return false
    const next = new Set(seen)
    next.add(initializer)
    return resolveRawControl(initializer, initializers, next)
  }
  if (ts.isConditionalExpression(node)) {
    return (
      resolveRawControl(node.whenTrue, initializers, new Set(seen)) ||
      resolveRawControl(node.whenFalse, initializers, new Set(seen))
    )
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return resolveRawControl(node.expression, initializers, seen)
  }
  if (ts.isTemplateExpression(node))
    return (
      rawControls.has(node.head.text) ||
      node.templateSpans.some((span) => rawControls.has(span.literal.text))
    )
  if (ts.isBinaryExpression(node) || ts.isPrefixUnaryExpression(node)) {
    return (
      resolveRawControl(node.left ?? node.operand, initializers, new Set(seen)) ||
      resolveRawControl(node.right, initializers, new Set(seen))
    )
  }
  return false
}

function rawControlFailures(sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    const initializers = constInitializers(item.sf, { includeMutable: true })

    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = jsxTagName(node)
        const line = lineAt(item.source, node.getStart(item.sf))
        if (name && rawControls.has(name)) {
          failures.push(
            `${relativeSourcePath(sourceRoot, file)}:${line} contains raw <${name}>; use its @adea-ai/ui primitive`
          )
        }
        if (name && item.dynamicNames.has(name)) {
          const attribute = node.attributes.properties.find(
            (property) => ts.isJsxAttribute(property) && property.name.text === 'component'
          )
          const value =
            attribute && ts.isJsxAttribute(attribute) && ts.isJsxExpression(attribute.initializer)
              ? attribute.initializer.expression
              : attribute && ts.isJsxAttribute(attribute)
                ? attribute.initializer
                : undefined
          if (resolveRawControl(value, initializers)) {
            failures.push(
              `${relativeSourcePath(sourceRoot, file)}:${line} dynamically renders a raw control through <${name}>; use its @adea-ai/ui primitive`
            )
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(item.sf)
  }
  return failures
}

function memberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const argument = unwrapExpression(node.argumentExpression)
    if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      return argument.text
  }
  return null
}

function isDocumentObject(node) {
  const expression = unwrapExpression(node)
  if (ts.isIdentifier(expression)) return expression.text === 'document'
  const receiver = ts.isPropertyAccessExpression(expression)
    ? expression.expression
    : ts.isElementAccessExpression(expression)
      ? expression.expression
      : undefined
  return (
    memberName(expression) === 'document' &&
    ts.isIdentifier(receiver) &&
    ['window', 'globalThis', 'self'].includes(receiver.text)
  )
}

function staticStringValue(node, initializers, seen = new Set()) {
  if (!node) return undefined
  const expression = unwrapExpression(node)
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    return expression.text
  if (ts.isIdentifier(expression)) {
    const initializer = initializers(expression)
    if (!initializer || seen.has(initializer)) return undefined
    const next = new Set(seen)
    next.add(initializer)
    return staticStringValue(initializer, initializers, next)
  }
  return undefined
}

function containsStyleReference(node, initializers, seen = new Set()) {
  const expression = resolvedExpression(node)
  if (ts.isIdentifier(expression)) {
    const initializer = initializers(expression)
    if (!initializer || seen.has(initializer)) return false
    const next = new Set(seen)
    next.add(initializer)
    return containsStyleReference(initializer, initializers, next)
  }
  if (memberName(expression) === 'style') return true
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression))
    return containsStyleReference(expression.expression, initializers, seen)
  return false
}

function referencesDocumentCreateElement(node, initializers, seen = new Set()) {
  const expression = resolvedExpression(node)
  if (ts.isIdentifier(expression)) {
    const initializer = initializers(expression)
    if (!initializer || seen.has(initializer)) return false
    const next = new Set(seen)
    next.add(initializer)
    return referencesDocumentCreateElement(initializer, initializers, next)
  }
  if (
    (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) &&
    memberName(expression) === 'createElement' &&
    isDocumentObject(expression.expression)
  )
    return true
  if (ts.isCallExpression(expression) && memberName(expression.expression) === 'bind')
    return referencesDocumentCreateElement(expression.expression, initializers, seen)
  return false
}

function imperativeDomFailures(sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    const stringInitializers = constInitializers(item.sf, { includeMutable: true })
    const hasStyle = (node) => containsStyleReference(node, stringInitializers)
    const report = (node, message) => {
      failures.push(
        `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, node.getStart(item.sf))} ${message}`
      )
    }
    const visit = (node) => {
      if (ts.isBinaryExpression(node)) {
        const operator = node.operatorToken.kind
        if (
          operator >= ts.SyntaxKind.FirstAssignment &&
          operator <= ts.SyntaxKind.LastAssignment &&
          hasStyle(node.left)
        ) {
          report(
            node,
            'mutates inline styles through a DOM style assignment; use a shared layout primitive'
          )
        }
      }

      if (ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression)
        const calledMember = memberName(callee)
        if (
          (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
          ['setProperty', 'removeProperty'].includes(calledMember ?? '') &&
          hasStyle(callee.expression)
        ) {
          report(
            node,
            'mutates inline styles through CSSStyleDeclaration; use a shared layout primitive'
          )
        }
        if (
          (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
          calledMember === 'setAttribute' &&
          staticStringValue(node.arguments[0], stringInitializers)?.toLowerCase() === 'style'
        ) {
          report(
            node,
            'sets an inline style attribute through a DOM API; use a shared layout primitive'
          )
        }

        const documentCreateElement =
          ((ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
            calledMember === 'createElement' &&
            isDocumentObject(callee.expression)) ||
          (ts.isIdentifier(callee) && referencesDocumentCreateElement(callee, stringInitializers))
        if (documentCreateElement) {
          const tag = staticStringValue(node.arguments[0], stringInitializers)?.toLowerCase()
          if (tag && rawControls.has(tag)) {
            report(
              node,
              `creates raw <${tag}> with document.createElement; use its @adea-ai/ui primitive`
            )
          } else if (!tag) {
            report(
              node,
              'uses document.createElement with a dynamic tag; use a static shared control'
            )
          }
        }

        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.expression.kind === ts.SyntaxKind.Identifier &&
          callee.expression.text === 'Object' &&
          callee.name.text === 'assign' &&
          hasStyle(node.arguments[0])
        ) {
          report(node, 'mutates inline styles through Object.assign; use a shared layout primitive')
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(item.sf)
  }
  return failures
}

function staticObjectHasProperty(node, propertyName, initializers, seen = new Set()) {
  if (!node) return false
  const expression = resolvedExpression(node)
  if (ts.isIdentifier(expression)) {
    const initializer = initializers(expression)
    if (!initializer || seen.has(initializer)) return false
    const next = new Set(seen)
    next.add(initializer)
    return staticObjectHasProperty(initializer, propertyName, initializers, next)
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.some((property) => {
      if (ts.isPropertyAssignment(property))
        return tsPropertyNameText(property.name) === propertyName
      if (ts.isShorthandPropertyAssignment(property)) return property.name.text === propertyName
      if (ts.isSpreadAssignment(property))
        return staticObjectHasProperty(
          property.expression,
          propertyName,
          initializers,
          new Set(seen)
        )
      return false
    })
  }
  if (ts.isConditionalExpression(expression))
    return (
      staticObjectHasProperty(expression.whenTrue, propertyName, initializers, new Set(seen)) ||
      staticObjectHasProperty(expression.whenFalse, propertyName, initializers, new Set(seen))
    )
  if (
    ts.isBinaryExpression(expression) &&
    [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(expression.operatorToken.kind)
  ) {
    return (
      staticObjectHasProperty(expression.left, propertyName, initializers, new Set(seen)) ||
      staticObjectHasProperty(expression.right, propertyName, initializers, new Set(seen))
    )
  }
  return false
}

function jsxSpreadFailures(sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    const initializers = constInitializers(item.sf)

    const visit = (node) => {
      if (ts.isJsxSpreadAttribute(node) && ts.isIdentifier(unwrapExpression(node.expression))) {
        for (const propertyName of ['style', 'classList']) {
          if (staticObjectHasProperty(node.expression, propertyName, initializers)) {
            failures.push(
              `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, node.getStart(item.sf))} JSX spread resolves to ${propertyName} through a local object alias; pass named shared props instead of hiding ${propertyName}`
            )
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(item.sf)
  }
  return failures
}

function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

function declarations(css, baseOffset = 0) {
  const result = []
  const pattern = /(?:^|[;{}])\s*([\w-]+)\s*:\s*([^;{}]*?)(?=[;}])/gm
  for (const match of withoutComments(css).matchAll(pattern)) {
    result.push({
      name: match[1].toLowerCase(),
      value: match[2].trim(),
      offset: baseOffset + match.index + match[0].indexOf(match[1]),
    })
  }
  return result
}

function isLiteralColor(value) {
  if (colorFunction.test(value)) return true
  const normalized = withoutComments(value)
    .replace(/url\([^)]*\)/gi, ' ')
    .toLowerCase()
  return normalized.split(/[^a-z]+/).some((word) => colorKeywords.has(word))
}

function sharedThemeTokens(root) {
  const path = resolve(root, 'node_modules/@adea-ai/ui/src/styles/theme.css')
  if (!existsSync(path)) return { path, tokens: new Set() }
  return {
    path,
    tokens: new Set(
      [...withoutComments(readFileSync(path, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)].map((match) =>
        match[1].toLowerCase()
      )
    ),
  }
}

function legacyToken(name) {
  return (
    legacyTokens.has(name) ||
    ['--theme-', '--chrome-', '--status-'].some((prefix) => name.startsWith(prefix))
  )
}

function cssWithoutNestedBlocks(source) {
  let depth = 0
  return [...source]
    .map((character) => {
      if (character === '{') depth += 1
      if (character === '}') depth = Math.max(0, depth - 1)
      if (depth > 0 || character === '{' || character === '}')
        return character === '\n' ? '\n' : ' '
      return character
    })
    .join('')
}

function findBrace(source, start) {
  let quote = ''
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) quote = ''
    } else if (character === '"' || character === "'") quote = character
    else if (character === '{') return index
  }
  return -1
}

function matchingBrace(source, opening) {
  let depth = 0
  let quote = ''
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) quote = ''
    } else if (character === '"' || character === "'") quote = character
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) return index
  }
  return source.length
}

function parseCssRules(source, baseOffset = 0) {
  const rules = []
  let cursor = 0
  while (cursor < source.length) {
    const opening = findBrace(source, cursor)
    if (opening < 0) break
    const closing = matchingBrace(source, opening)
    const segment = source.slice(cursor, opening)
    const selector = segment.trim()
    const bodyOffset = baseOffset + opening + 1
    const body = source.slice(opening + 1, closing)
    if (selector.startsWith('@')) rules.push(...parseCssRules(body, bodyOffset))
    else if (selector) {
      const start = baseOffset + cursor + segment.indexOf(selector)
      rules.push({
        selector,
        offset: start,
        declarations: declarations(cssWithoutNestedBlocks(body), bodyOffset),
      })
      if (body.includes('{')) rules.push(...parseCssRules(body, bodyOffset))
    }
    cursor = closing + 1
  }
  return rules
}

function splitSelectorList(selector) {
  const parts = []
  let start = 0
  let parens = 0
  let brackets = 0
  let quote = ''
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if (character === '(') parens += 1
    else if (character === ')') parens -= 1
    else if (character === '[') brackets += 1
    else if (character === ']') brackets -= 1
    else if (character === ',' && parens === 0 && brackets === 0) {
      parts.push(selector.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(selector.slice(start).trim())
  return parts
}

function subjectSelector(selector) {
  let start = 0
  let parens = 0
  let brackets = 0
  let quote = ''
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if (character === '(') parens += 1
    else if (character === ')') parens -= 1
    else if (character === '[') brackets += 1
    else if (character === ']') brackets -= 1
    else if (
      parens === 0 &&
      brackets === 0 &&
      (character === '>' || character === '+' || character === '~' || /\s/.test(character))
    )
      start = index + 1
  }
  return selector.slice(start).trim()
}

function matchingParenthesis(selector, opening) {
  let depth = 1
  let brackets = 0
  let quote = ''
  for (let index = opening + 1; index < selector.length; index += 1) {
    const character = selector[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) quote = ''
    } else if (character === '"' || character === "'") quote = character
    else if (character === '[') brackets += 1
    else if (character === ']') brackets -= 1
    else if (brackets === 0 && character === '(') depth += 1
    else if (brackets === 0 && character === ')' && --depth === 0) return index
  }
  return selector.length
}

function functionalSelector(selector) {
  let brackets = 0
  let quote = ''
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index]
    if (quote) {
      if (character === '\\') index += 1
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if (character === '[') brackets += 1
    else if (character === ']') brackets -= 1
    else if (brackets === 0 && character === ':') {
      const match = selector.slice(index).match(/^:(is|where|not)\s*\(/i)
      if (!match) continue
      const opening = index + match[0].lastIndexOf('(')
      return {
        name: match[1].toLowerCase(),
        start: index,
        opening,
        closing: matchingParenthesis(selector, opening),
      }
    }
  }
  return null
}

function expandSelectorAlternatives(selector, excluded = []) {
  const functional = functionalSelector(selector)
  if (!functional) return [{ selector, excluded }]
  const before = selector.slice(0, functional.start)
  const after = selector.slice(functional.closing + 1)
  const contents = selector.slice(functional.opening + 1, functional.closing)
  if (functional.name === 'not') {
    const negativeAlternatives = splitSelectorList(contents).flatMap((negative) =>
      expandSelectorAlternatives(negative).map((alternative) => alternative.selector)
    )
    return expandSelectorAlternatives(before + after, [...excluded, ...negativeAlternatives])
  }
  return splitSelectorList(contents).flatMap((alternative) =>
    expandSelectorAlternatives(before + alternative + after, excluded)
  )
}

function selectorClasses(selector) {
  return [
    ...new Set(
      [...selector.replace(/\[[^\]]*]/g, ' ').matchAll(/\.([A-Za-z_][\w-]*)/g)].map(
        (match) => match[1]
      )
    ),
  ]
}

function excludesSharedUsage(usage, excludedSelectors) {
  return excludedSelectors.some((selector) => {
    const classes = selectorClasses(selector)
    return classes.length > 0 && classes.every((name) => usage.classes.has(name))
  })
}

function visualProperty(name) {
  return (
    /^(?:accent-color|appearance|background(?:-[\w-]+)?|border(?:-[\w-]+)?|box-shadow|caret-color|color|column-rule|fill(?:-[\w-]+)?|filter|font(?:-[\w-]+)?|letter-spacing|line-height|mask(?:-[\w-]+)?|mix-blend-mode|opacity|outline(?:-[\w-]+)?|scrollbar-color|stroke(?:-[\w-]+)?|text-decoration(?:-[\w-]+)?|text-shadow|text-transform|transform|transition|animation)$/.test(
      name
    ) ||
    /^(?:cursor|pointer-events|touch-action|user-select|visibility)$/.test(name) ||
    /^--[\w-]*(?:accent|background|border|color|fill|font|foreground|primary|radius|shadow|surface|text|tone|typography)[\w-]*$/i.test(
      name
    )
  )
}

const sharedControlPrimitives = new Set([
  'ActionButton',
  'Button',
  'Checkbox',
  'Badge',
  'StatusChip',
  'EntityIcon',
  'Kbd',
  'Spinner',
  'Progress',
  'Input',
  'Textarea',
  'RadioGroupItem',
  'SelectTrigger',
  'Slider',
  'NativeSelect',
  'Switch',
  'SkipLink',
  'TextLink',
  'TabsTrigger',
  'Toggle',
  'ListRow',
])

const sharedControlRootPrimitives = new Set([...sharedControlPrimitives, 'ListRow'])

const sharedControlSlots = new Set([
  'action-button',
  'button',
  'checkbox',
  'badge',
  'status-chip',
  'entity-icon',
  'spinner',
  'textarea',
  'radio-group-item',
  'select-trigger',
  'slider',
  'input',
  'kbd',
  'meter',
  'progress',
  'table',
  'native-select',
  'switch',
  'skip-link',
  'textlink',
  'tabs-trigger',
  'toggle',
])

const sharedControlRoles = new Set([
  'button',
  'checkbox',
  'combobox',
  'radio',
  'searchbox',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
])

function isFunctionScopeNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  )
}

function isLexicalScopeNode(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseBlock(node) ||
    isFunctionScopeNode(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  )
}

function bindingNames(name, result = []) {
  if (ts.isIdentifier(name)) result.push(name.text)
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) bindingNames(element.name, result)
    }
  }
  return result
}

function constInitializers(sourceFile, { includeMutable = false } = {}) {
  const shadowed = Symbol('shadowed')
  const scopes = new Map()
  const ensureScope = (node, parent) => {
    if (!scopes.has(node)) scopes.set(node, { parent, bindings: new Map() })
  }
  const addBinding = (scope, name, initializer = shadowed) => {
    const bindings = scopes.get(scope).bindings
    if (bindings.has(name)) {
      bindings.set(name, shadowed)
      return
    }
    bindings.set(name, initializer)
  }
  const nearestFunctionScope = (scope) => {
    let current = scope
    while (current && !ts.isSourceFile(current) && !isFunctionScopeNode(current))
      current = scopes.get(current)?.parent
    return current
  }

  const visit = (node, currentScope) => {
    if (node !== sourceFile && isLexicalScopeNode(node)) {
      if (ts.isFunctionDeclaration(node) && node.name) addBinding(currentScope, node.name.text)
      if (ts.isClassDeclaration(node) && node.name) addBinding(currentScope, node.name.text)
      const parentScope = currentScope
      currentScope = node
      ensureScope(currentScope, parentScope)
      if (isFunctionScopeNode(node)) {
        if (node.name && ts.isFunctionExpression(node)) addBinding(currentScope, node.name.text)
        for (const parameter of node.parameters) {
          for (const name of bindingNames(parameter.name)) addBinding(currentScope, name)
        }
      } else if (ts.isCatchClause(node) && node.variableDeclaration) {
        for (const name of bindingNames(node.variableDeclaration.name))
          addBinding(currentScope, name)
      } else if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
        addBinding(currentScope, node.name.text)
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent)) {
      const flags = node.parent.flags
      const isConst = (flags & ts.NodeFlags.Const) !== 0
      const isVar = (flags & ts.NodeFlags.Let) === 0 && !isConst
      const owner = isVar ? nearestFunctionScope(currentScope) : currentScope
      for (const name of bindingNames(node.name)) {
        const initializer =
          (isConst || includeMutable) && ts.isIdentifier(node.name) ? node.initializer : shadowed
        addBinding(owner, name, initializer)
      }
    } else if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause
      if (clause.name) addBinding(sourceFile, clause.name.text)
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
        addBinding(sourceFile, clause.namedBindings.name.text)
      else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const specifier of clause.namedBindings.elements)
          addBinding(sourceFile, specifier.name.text)
      }
    }

    ts.forEachChild(node, (child) => visit(child, currentScope))
  }

  ensureScope(sourceFile, null)
  visit(sourceFile, sourceFile)

  return (identifier) => {
    let scope = identifier.parent
    while (scope && !isLexicalScopeNode(scope)) scope = scope.parent
    while (scope) {
      const info = scopes.get(scope)
      const binding = info?.bindings.get(identifier.text)
      if (binding !== undefined) return binding === shadowed ? undefined : binding
      scope = info?.parent
    }
    return undefined
  }
}

function resolvedExpression(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node))
  )
    node = node.expression
  return node
}

function staticClassTokens(node, initializers, seen = new Set()) {
  const tokens = new Set()
  const visitClassValue = (value, visited = new Set()) => {
    value = resolvedExpression(value)
    if (!value) return
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      for (const token of value.text.split(/\s+/)) if (token) tokens.add(token)
      return
    }
    if (ts.isTemplateExpression(value)) {
      const text = [value.head.text, ...value.templateSpans.map((span) => span.literal.text)].join(
        ' '
      )
      for (const token of text.split(/\s+/)) if (token) tokens.add(token)
      return
    }
    if (ts.isIdentifier(value)) {
      const initializer = initializers(value)
      if (!initializer || visited.has(initializer)) return
      const next = new Set(visited)
      next.add(initializer)
      visitClassValue(initializer, next)
      return
    }
    if (ts.isObjectLiteralExpression(value)) {
      for (const member of value.properties) {
        if (ts.isPropertyAssignment(member)) {
          const key = member.name
          if (
            ts.isIdentifier(key) ||
            ts.isStringLiteral(key) ||
            ts.isNoSubstitutionTemplateLiteral(key)
          ) {
            for (const token of key.text.split(/\s+/)) if (token) tokens.add(token)
          }
        } else if (ts.isSpreadAssignment(member)) {
          visitPropsObject(member.expression, visited)
        }
      }
    }
  }

  const visitPropsObject = (value, visited = new Set()) => {
    value = resolvedExpression(value)
    if (!value) return
    if (ts.isIdentifier(value)) {
      const initializer = initializers(value)
      if (!initializer || visited.has(initializer)) return
      const next = new Set(visited)
      next.add(initializer)
      visitPropsObject(initializer, next)
      return
    }
    if (!ts.isObjectLiteralExpression(value)) return
    for (const member of value.properties) {
      if (ts.isSpreadAssignment(member)) {
        visitPropsObject(member.expression, visited)
        continue
      }
      if (!ts.isPropertyAssignment(member)) continue
      const key = member.name
      if (
        (ts.isIdentifier(key) ||
          ts.isStringLiteral(key) ||
          ts.isNoSubstitutionTemplateLiteral(key)) &&
        ['class', 'className', 'classList'].includes(key.text)
      )
        visitClassValue(member.initializer, visited)
    }
  }

  node = resolvedExpression(node)
  if (ts.isJsxElement(node) || ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    for (const attribute of node.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        visitPropsObject(attribute.expression, seen)
        continue
      }
      if (
        !ts.isJsxAttribute(attribute) ||
        !['class', 'className', 'classList'].includes(attribute.name.text)
      )
        continue
      const initializer = attribute.initializer
      if (ts.isStringLiteral(initializer)) visitClassValue(initializer, seen)
      else if (ts.isJsxExpression(initializer)) visitClassValue(initializer.expression, seen)
    }
  } else {
    visitClassValue(node, seen)
  }
  return tokens
}

function utilityWithoutVariants(token) {
  let depth = 0
  let lastBoundary = -1
  for (let index = 0; index < token.length; index += 1) {
    if (token[index] === '[') depth += 1
    else if (token[index] === ']') depth = Math.max(0, depth - 1)
    else if (token[index] === ':' && depth === 0) lastBoundary = index
  }
  return token.slice(lastBoundary + 1).replace(/^[!-]+/, '')
}

function sharedControlSizeClass(token) {
  const utility = utilityWithoutVariants(token)
  return (
    /^(?:p|px|py|ps|pe|pt|pr|pb|pl|h|min-h|max-h|size)-/.test(utility) ||
    /^\[(?:padding(?:-[\w-]+)?|height|min-height|max-height|block-size|min-block-size|max-block-size):/.test(
      utility
    )
  )
}

function sharedControlDisplayClass(token) {
  const utility = utilityWithoutVariants(token)
  return (
    (utility !== 'hidden' &&
      /^(?:block|inline-block|inline|flex|inline-flex|table|inline-table|table-caption|table-cell|table-column|table-column-group|table-footer-group|table-header-group|table-row-group|table-row|flow-root|grid|inline-grid|contents|list-item)$/.test(
        utility
      )) ||
    utility.startsWith('[display:')
  )
}

function targetsSharedControlDescendant(token) {
  const boundary = token.lastIndexOf(':')
  if (boundary < 0) return false
  const variants = token.slice(0, boundary)
  const selectors = []
  let depth = 0
  let start = -1
  for (let index = 0; index < variants.length; index += 1) {
    if (variants[index] === '[') {
      if (depth === 0) start = index
      depth += 1
    } else if (variants[index] === ']' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        selectors.push(variants.slice(start + 1, index))
        start = -1
      }
    }
  }
  return selectors.some((selector) => {
    if (!selector.includes('&')) return false
    if (/(?:^|[>+~\s])(?:a|button|input|select|textarea)(?=$|[.#:[\s])/.test(selector)) return true
    return selectorAttributes(selector).some(
      (attribute) => attribute.name === 'data-slot' && sharedControlSlots.has(attribute.value)
    )
  })
}

function sharedControlClassFailures(sourceRoot, data) {
  const failures = []
  for (const [file, item] of data) {
    const initializers = constInitializers(item.sf)
    visitJsx(item.sf, (element) => {
      const name = jsxTagName(element)
      const primitive = name ? item.shared.get(name) : undefined
      if (!primitive) return
      const classes = [...staticClassTokens(element, initializers)]
      const violations = classes.filter(
        (token) =>
          targetsSharedControlDescendant(token) ||
          (sharedControlPrimitives.has(primitive) &&
            (sharedControlSizeClass(token) || sharedControlDisplayClass(token)))
      )
      if (violations.length === 0) return
      failures.push(
        `${relativeSourcePath(sourceRoot, file)}:${lineAt(item.source, element.getStart(item.sf))} <${name}> restyles shared control geometry through class utilities: ${violations.toSorted().join(', ')}; use a shared variant or component layout prop`
      )
    })
  }
  return failures
}

function sharedControlSizeProperty(name) {
  return /^(?:padding(?:-[\w-]+)?|height|min-height|max-height|block-size|min-block-size|max-block-size)$/.test(
    name
  )
}

function sharedControlRootDisplay(name, value) {
  return name === 'display' && !/^none(?:\s*!important)?$/i.test(value)
}

const sharedRoles = new Set([
  'alertdialog',
  'button',
  'checkbox',
  'combobox',
  'dialog',
  'grid',
  'gridcell',
  'listbox',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'progressbar',
  'radio',
  'radiogroup',
  'scrollbar',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'tablist',
  'tabpanel',
  'textbox',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
])

function selectorAttributes(selector) {
  return [
    ...selector.matchAll(
      /\[\s*([\w-]+)(?:\s*(?:[~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?[^\]]*\]/g
    ),
  ].map((match) => ({
    name: match[1].toLowerCase(),
    value: (match[2] ?? match[3] ?? match[4] ?? '').toLowerCase(),
  }))
}

function sharedCssFailures(root, sourceRoot, files, sharedClasses) {
  const failures = []
  const usages = new Map()
  for (const item of sharedClasses) {
    const key = `${item.file}:${item.line}:${item.component}:${item.classNames.join(' ')}`
    const usage = usages.get(key) ?? {
      classes: new Set(item.classNames),
      labels: new Set(),
      primitives: new Set(),
    }
    usage.labels.add(`<${item.component}> at ${item.file}:${item.line}`)
    usage.primitives.add(item.sharedPrimitive)
    usages.set(key, usage)
  }

  for (const file of files.filter((path) => path.endsWith('.css'))) {
    const source = withoutComments(readFileSync(file, 'utf8'))
    for (const rule of parseCssRules(source)) {
      for (const subject of splitSelectorList(rule.selector).map(subjectSelector)) {
        for (const alternative of expandSelectorAlternatives(subject)) {
          const selectorClassesFound = selectorClasses(alternative.selector)
          const matchedUsages = [...usages.values()].filter(
            (usage) =>
              selectorClassesFound.length > 0 &&
              selectorClassesFound.every((name) => usage.classes.has(name)) &&
              !excludesSharedUsage(usage, alternative.excluded)
          )
          const attributes = selectorAttributes(alternative.selector)
          const dataSlot = attributes.some((attribute) => attribute.name === 'data-slot')
          const controlDataSlot = attributes.some(
            (attribute) => attribute.name === 'data-slot' && sharedControlSlots.has(attribute.value)
          )
          const role = attributes.find(
            (attribute) => attribute.name === 'role' && sharedRoles.has(attribute.value)
          )?.value
          const controlRole = attributes.some(
            (attribute) => attribute.name === 'role' && sharedControlRoles.has(attribute.value)
          )
          const rawTag = alternative.selector.match(
            /^(a|button|details|fieldset|input|label|legend|option|select|summary|textarea)(?=$|[.#:]|\[)/i
          )?.[1]
          if (matchedUsages.length === 0 && !dataSlot && !role && !rawTag) continue
          const controlTarget =
            matchedUsages.some((usage) =>
              [...usage.primitives].some((primitive) => sharedControlPrimitives.has(primitive))
            ) ||
            controlDataSlot ||
            controlRole ||
            /^(?:a|button|input|select)(?=$|[.#:]|\[)/i.test(alternative.selector)
          const controlBoxTarget =
            controlTarget && !/::(?:before|after)(?:\b|$)/i.test(alternative.selector)
          const controlRootTarget =
            matchedUsages.some((usage) =>
              [...usage.primitives].some((primitive) => sharedControlRootPrimitives.has(primitive))
            ) ||
            controlDataSlot ||
            controlRole ||
            /^(?:a|button|input|select)(?=$|[.#:]|\[)/i.test(alternative.selector)
          const properties = [
            ...new Set(
              rule.declarations
                .filter(
                  (entry) =>
                    visualProperty(entry.name) ||
                    (controlRootTarget && sharedControlRootDisplay(entry.name, entry.value)) ||
                    (controlBoxTarget && sharedControlSizeProperty(entry.name))
                )
                .map((entry) => entry.name)
            ),
          ]
          if (properties.length === 0) continue
          const subjectName =
            selectorClassesFound.map((name) => `.${name}`).join('') ||
            (dataSlot ? '[data-slot]' : role ? `[role="${role}"]` : `<${rawTag}>`)
          const labels = new Set()
          for (const usage of matchedUsages) for (const label of usage.labels) labels.add(label)
          const references = matchedUsages.length > 0 ? ` used by ${[...labels].join(', ')}` : ''
          failures.push(
            `${relativeSourcePath(sourceRoot, file)}:${lineAt(source, rule.offset)} selector ${subjectName}${references} restyles shared UI: ${properties.join(', ')}; use a shared variant or remove the visual override`
          )
        }
      }
    }
  }
  return failures
}

function cssFailures(root, sourceRoot, files) {
  const failures = []
  const theme = sharedThemeTokens(root)
  if (theme.tokens.size === 0)
    failures.push(
      `${relative(root, theme.path)} is missing; install @adea-ai/ui before checking its theme contract`
    )
  let importsTheme = false

  for (const file of files.filter((path) => path.endsWith('.css'))) {
    const source = readFileSync(file, 'utf8')
    const code = withoutComments(source)
    importsTheme ||= /@import\s+['"]@adea-ai\/ui\/theme\.css['"]/.test(code)
    for (const entry of declarations(code)) {
      if (entry.name.startsWith('--')) {
        if (theme.tokens.has(entry.name)) {
          failures.push(
            `${relativeSourcePath(sourceRoot, file)}:${lineAt(source, entry.offset)} redefines shared token ${entry.name}; @adea-ai/ui owns theme values`
          )
        } else if (legacyToken(entry.name)) {
          failures.push(
            `${relativeSourcePath(sourceRoot, file)}:${lineAt(source, entry.offset)} defines legacy app token ${entry.name}; use @adea-ai/ui tokens directly`
          )
        } else {
          failures.push(
            `${relativeSourcePath(sourceRoot, file)}:${lineAt(source, entry.offset)} defines app-owned CSS token ${entry.name}; use a shared theme token or an approved geometry property`
          )
        }
        const aliases = [...entry.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1])
        if (aliases.some((name) => theme.tokens.has(name))) {
          failures.push(
            `${relativeSourcePath(sourceRoot, file)}:${lineAt(source, entry.offset)} aliases a shared theme token in ${entry.name}; reference @adea-ai/ui tokens directly`
          )
        }
      }
      if (isLiteralColor(entry.value)) {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(source, entry.offset)} uses a literal color in ${entry.name}; use a theme token`
        )
      }
    }
  }

  if (!importsTheme)
    failures.push('apps/web/src must import @adea-ai/ui/theme.css for shared theme tokens')
  return failures
}

function severity(setting) {
  return Array.isArray(setting) ? setting[0] : setting
}

function options(setting) {
  return Array.isArray(setting) && setting[1] && typeof setting[1] === 'object' ? setting[1] : {}
}

function matchesGlob(pattern, path) {
  // Match the glob grammar used by Oxlint, including bracket classes, braces,
  // and alternatives. Slashless ignore patterns match basenames at any depth.
  const normalized = normalizePathSeparators(pattern)
  return (
    pathMatchesGlob(path, normalized) ||
    (!normalized.includes('/') && pathMatchesGlob(path, `**/${normalized}`))
  )
}

function uiSuppressionFailures(sourceRoot, files, requiredRules) {
  const protectedNames = new Set(requiredRules.flatMap((rule) => [rule, rule.split('/').at(-1)]))
  const failures = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.Standard,
      source
    )
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        ![ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(
          token
        )
      )
        continue
      const comment = scanner.getTokenText().replace(/\*\/$/, '')
      const directive = /\b(?:oxlint|eslint)-disable(?:-next-line|-line)?\b([\s\S]*)/.exec(comment)
      if (!directive) continue
      const rules = directive[1]
        .split('--')[0]
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
      if (
        !rules.length ||
        rules.some((rule) => protectedNames.has(rule) || /^(?:adea|shadcn|jsx-a11y)[/:]/.test(rule))
      ) {
        failures.push(
          `${relativeSourcePath(sourceRoot, file)}:${lineAt(source, scanner.getTokenPos())} suppresses shared UI or accessibility lint; fix the component instead`
        )
      }
    }
  }
  return failures
}

function nestedWebLintConfigs(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return nestedWebLintConfigs(path)
    return /^\.(?:oxlintrc(?:\..+)?|oxlintignore|eslintignore)$/.test(entry.name) ? [path] : []
  })
}

function installedUiRules(root) {
  const require = createRequire(resolve(root, 'package.json'))
  const path = require.resolve('@adea-ai/ui/lint')
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const names = new Set()
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source).replace(/['"]/g, '') === 'rules' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const rule of node.initializer.properties) {
        if (rule.name && (ts.isStringLiteral(rule.name) || ts.isIdentifier(rule.name)))
          names.add(`adea/${rule.name.text}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!names.size) throw new Error('the installed plugin has no discoverable rule catalogue')
  return [...names]
}

function lintConfigFailures(root) {
  const path = resolve(root, '.oxlintrc.json')
  if (!existsSync(path)) return ['.oxlintrc.json is missing']
  let config
  try {
    config = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return [`.oxlintrc.json is invalid JSON: ${error.message}`]
  }
  const failures = []
  if (!(config.plugins ?? []).includes('jsx-a11y'))
    failures.push('.oxlintrc.json must keep accessibility lint enabled')
  if (config.extends && (!Array.isArray(config.extends) || config.extends.length))
    failures.push(
      '.oxlintrc.json must own the complete web lint policy; external config inheritance can hide exemptions'
    )
  let requiredRules = uiRules
  try {
    requiredRules = [...new Set([...uiRules, ...installedUiRules(root)])]
  } catch (error) {
    failures.push(`Cannot inspect installed @adea-ai/ui lint rules: ${error.message}`)
  }
  if (!(config.jsPlugins ?? []).includes('@shadcn/lint'))
    failures.push('.oxlintrc.json must load @shadcn/lint')
  if (!(config.jsPlugins ?? []).includes('@adea-ai/ui/lint'))
    failures.push('.oxlintrc.json must load @adea-ai/ui/lint')
  const componentPrefixes = config.settings?.shadcn?.ui
  const prefixes = Array.isArray(componentPrefixes) ? componentPrefixes : [componentPrefixes]
  if (!prefixes.includes('@adea-ai/ui/components')) {
    failures.push(
      '.oxlintrc.json must configure shadcn.ui to recognize @adea-ai/ui/components as the shared component source'
    )
  }
  const lintSettings = [
    config.settings,
    ...(config.overrides ?? []).map((override) => override.settings),
  ]
  for (const settings of lintSettings) {
    const ignoredImports = settings?.shadcn?.ignoreImports
    if (
      (Array.isArray(ignoredImports) ? ignoredImports : [ignoredImports]).some(
        (pattern) => typeof pattern === 'string' && pattern.length
      )
    ) {
      failures.push(
        '.oxlintrc.json shadcn.ignoreImports excludes shared components; import exemptions are prohibited'
      )
    }
    if (settings?.shadcn?.ui !== undefined) {
      const values = Array.isArray(settings.shadcn.ui) ? settings.shadcn.ui : [settings.shadcn.ui]
      if (!values.includes('@adea-ai/ui/components'))
        failures.push('.oxlintrc.json override must preserve the shared shadcn.ui source')
    }
  }
  for (const rule of requiredRules) {
    if (severity(config.rules?.[rule]) !== 'error')
      failures.push(`.oxlintrc.json must keep ${rule} at error severity`)
  }
  for (const [index, override] of (config.overrides ?? []).entries()) {
    if (
      override.jsPlugins !== undefined &&
      !['@adea-ai/ui/lint', '@shadcn/lint'].every((plugin) => override.jsPlugins.includes(plugin))
    ) {
      failures.push(`.oxlintrc.json overrides[${index}] removes shared UI lint plugins`)
    }
    if (override.plugins !== undefined && !override.plugins.includes('jsx-a11y')) {
      failures.push(`.oxlintrc.json overrides[${index}] removes accessibility lint`)
    }
    for (const rule of requiredRules) {
      if (override.rules?.[rule] !== undefined && severity(override.rules[rule]) !== 'error') {
        failures.push(
          `.oxlintrc.json overrides[${index}] weakens ${rule}; UI rules apply to every file`
        )
      }
    }
  }

  const settingsFor = (rule) =>
    [
      config.rules?.[rule],
      ...(config.overrides ?? []).map((override) => override.rules?.[rule]),
    ].filter((setting) => setting !== undefined)
  for (const [index, setting] of settingsFor('shadcn/no-restyle').entries()) {
    const policy = options(setting)
    if ((policy.allow ?? []).length > 0 || (policy.contracts ?? []).length > 0) {
      failures.push(
        `.oxlintrc.json shadcn/no-restyle setting ${index} has component or class exemptions`
      )
    }
    for (const category of restyleDenyCategories) {
      if (!(policy.deny ?? []).includes(category)) {
        failures.push(`.oxlintrc.json shadcn/no-restyle setting ${index} must deny ${category}`)
      }
    }
  }

  for (const rule of ['shadcn/no-raw-colors', 'shadcn/no-arbitrary-values']) {
    for (const [index, setting] of settingsFor(rule).entries()) {
      if (
        (options(setting).allow ?? []).length > 0 ||
        (options(setting).contracts ?? []).length > 0
      ) {
        failures.push(`.oxlintrc.json ${rule} setting ${index} has exemptions`)
      }
    }
  }

  for (const [index, setting] of settingsFor('shadcn/no-inline-styles').entries()) {
    if (
      (options(setting).contracts ?? []).length > 0 ||
      (options(setting).allow ?? []).length > 0
    ) {
      failures.push(
        `.oxlintrc.json shadcn/no-inline-styles setting ${index} has JSX style exemptions; geometry belongs in a shared layout primitive`
      )
    }
  }

  const classSettings = [
    config.rules?.['shadcn/no-unknown-classes'],
    ...(config.overrides ?? [])
      .map((item) => item.rules?.['shadcn/no-unknown-classes'])
      .filter(Boolean),
  ]
  for (const setting of classSettings) {
    for (const pattern of options(setting).allow ?? []) {
      if (pattern.includes('*')) {
        failures.push(
          `.oxlintrc.json wildcard class allow ${pattern} permits future custom skins; use exact utilities`
        )
      } else {
        failures.push(
          `.oxlintrc.json class allow ${pattern} is a grandfathered exemption; declare a real @utility instead`
        )
      }
    }
  }
  const ignoredPaths = Array.isArray(config.ignorePatterns)
    ? config.ignorePatterns
    : typeof config.ignorePatterns === 'string'
      ? [config.ignorePatterns]
      : []
  const webSourcePaths = [
    'apps/web/src/App.tsx',
    'apps/web/src/shadcn.css',
    'apps/web/src/components/Example.tsx',
    ...filesBelow(resolve(root, sourceRootPath), true).map((file) =>
      normalizePathSeparators(relative(root, file))
    ),
  ]
  const ignoreFile = resolve(root, '.eslintignore')
  if (existsSync(ignoreFile)) {
    ignoredPaths.push(
      ...readFileSync(ignoreFile, 'utf8')
        .split(/\r?\n/)
        .map((pattern) => pattern.trim())
        .filter((pattern) => pattern && !pattern.startsWith('#') && !pattern.startsWith('!'))
    )
  }
  if (
    ignoredPaths.some((pattern) =>
      webSourcePaths.some((sourcePath) => matchesGlob(pattern, sourcePath))
    )
  ) {
    failures.push(
      '.oxlintrc.json ignores apps/web source; shared UI lint must cover all application files'
    )
  }
  failures.push(
    ...uiSuppressionFailures(
      resolve(root, sourceRootPath),
      filesBelow(resolve(root, sourceRootPath), true),
      requiredRules
    )
  )
  for (const nested of [
    resolve(root, 'apps/.oxlintrc.json'),
    resolve(root, 'apps/web/.oxlintrc.json'),
    ...nestedWebLintConfigs(resolve(root, sourceRootPath)),
  ]) {
    if (existsSync(nested))
      failures.push(
        `${relative(root, nested)} replaces the central web lint policy; configure strict rules in the root .oxlintrc.json`
      )
  }
  return failures
}

export function collectWebUiContractFailures(root = defaultRoot) {
  const sourceRoot = resolve(root, sourceRootPath)
  if (!existsSync(sourceRoot)) return [`${sourceRootPath} is missing`]
  const files = filesBelow(sourceRoot)
  const data = sourceData(files)
  const failures = []

  for (const file of removedFiles) {
    if (existsSync(resolve(sourceRoot, file)))
      failures.push(`${file} must stay removed; use @adea-ai/ui`)
  }
  failures.push(...dependencyFailures(root))
  failures.push(...primitiveImportFailures(root, sourceRoot, data))
  failures.push(...bareSharedButtonFailures(sourceRoot, data))
  failures.push(...rawControlFailures(sourceRoot, data))
  failures.push(...imperativeDomFailures(sourceRoot, data))
  failures.push(...jsxSpreadFailures(sourceRoot, data))
  failures.push(...actionButtonFailures(sourceRoot, data))
  failures.push(...fieldSetFailures(sourceRoot, data))
  failures.push(...cssFailures(root, sourceRoot, files))
  failures.push(...sharedCssFailures(root, sourceRoot, files, collectSharedClasses(root)))
  failures.push(...sharedControlClassFailures(sourceRoot, data))
  failures.push(...lintConfigFailures(root))
  return failures
}

export function verifyWebUiContract(root = defaultRoot) {
  const failures = collectWebUiContractFailures(root)
  if (failures.length) {
    throw new Error(
      `Web UI contract failed (${failures.length}):\n${failures.map((failure) => `- ${failure}`).join('\n')}`
    )
  }
  console.log(
    'Web UI contract: shared primitives, theme-owned styles, no consumer JSX styles, and strict UI lint rules'
  )
}

if (import.meta.main) verifyWebUiContract()
