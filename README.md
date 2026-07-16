# TerserCompanion

Standalone JavaScript source transform that detects profitable repeated safe strings and eligible call roots and replaces them with shorter alias identifiers. Deterministic. Output never longer than input.

## Features

- **Repeated string aliasing** — long string literals used at least twice are hoisted to a single `const` declaration
- **Function-root aliasing** — repeated calls to whitelisted methods (`Math.floor`, `JSON.parse`, …) share a root alias
- **Class-root aliasing** — repeated static method calls on the same class root (`Array.isArray`, …) are aliased together
- **Safe identifier generation** — aliases avoid source identifiers and JavaScript reserved words
- **Shadowing detection** — locally bound roots are left unchanged
- **Unsafe-context preservation** — directives, import/export specifiers, dynamic-import arguments, element-access keys, property names, binding-element property names, and import-attribute keys/values are never aliased
- **Deterministic** — identical input always produces identical output
- **Never longer** — aliasing is applied only when it reduces total source length

## Installation

```sh
pnpm add @stefanobalocco/tersercompanion
```

TypeScript runtime required. ESM only.

## Quick Start

```javascript
import TerserCompanion from '@stefanobalocco/tersercompanion';

const code = `
var a = "a very long repeated string literal";
var b = "a very long repeated string literal";
var c = Math.floor( 1.5 );
var d = Math.floor( 2.5 );
var e = Array.isArray( x );
var f = Array.isArray( y );
`;

const result = TerserCompanion( code );
// result replaces the repeated string and eligible call roots with aliases,
// e.g. const a="a very long repeated string literal",b=Math,c=Array;
```

## Usage with a minifier (Terser)

TerserCompanion pairs naturally after minification: Terser removes the most redundancy first, and TerserCompanion handles patterns Terser's mangle cannot reach (shared string literals across variable declarations and repeated call roots).

Terser is an optional consumer-side dependency.

```sh
pnpm add terser
```

```javascript
import { readFile, writeFile } from 'node:fs/promises';
import { minify } from 'terser';
import TerserCompanion from '@stefanobalocco/tersercompanion';

const source = await readFile( 'input.js', 'utf8' );
const terserResult = await minify( source );

if( undefined === terserResult.code ) {
	throw new Error( 'Terser minification failed' );
}

const output = TerserCompanion( terserResult.code );

await writeFile( 'output.min.js', output, 'utf8' );
```

## API

```typescript
export default function TerserCompanion(
	source: string,
	options?: TerserCompanionOptions
): string;
```

### Options

| Property | Type | Default | Description |
|---|---|---|---|
| `functionsToAlias` | `readonly string[]` | 21 default paths | Exact function paths that may be aliased by root |
| `classesToAlias` | `readonly string[]` | 2 default class roots | Class roots whose static method calls share one alias per root |

Supplying an option array replaces that category's defaults. Omitting the option uses defaults. An empty array disables that category. Class-root handling takes precedence: if the same root appears in both `functionsToAlias` and `classesToAlias`, the class-root behavior is used.

<details>
<summary>Default <code>functionsToAlias</code></summary>

```
Date.now
JSON.parse
JSON.stringify
Math.floor
Math.max
Math.min
Math.round
Number.isFinite
Number.isInteger
Number.isNaN
Object.assign
Object.entries
Object.keys
Object.values
RegExp
Reflect.get
Reflect.has
Reflect.ownKeys
Reflect.set
String.fromCharCode
String.fromCodePoint
```

</details>

<details>
<summary>Default <code>classesToAlias</code></summary>

```
Array
Promise
```

</details>

---

### What gets aliased

- **Safe repeated strings** — string literals in expression positions appearing at least twice with positive net byte savings
- **Exact function paths** — call targets matching `functionsToAlias` are grouped by their root identifier (e.g., `Math.floor` and `Math.round` share one alias for `Math`)
- **Static method calls** — whitelisted class-root members (e.g., `Array.isArray`, `Array.from`) are grouped under one alias per root

Aliases avoid existing identifiers and JavaScript reserved words. Declaration is placed after a leading shebang, directive prologue, and import declarations.

---

### Errors / limitations

- Malformed JavaScript throws a formatted `Error` with TypeScript diagnostics
- TypeScript-only syntax (type annotations, interfaces, enums, JSX, decorators, namespace exports, type-only imports, `as` expressions, non-null assertions) throws
- Directives, import/export module specifiers and names, import attributes, dynamic-import arguments, element-access keys, and property/declaration names are never aliased
- A root whose identifier is locally bound (variable or parameter declaration) is not aliased
- Optional-chain calls (`?.()`) and `new` expressions are not candidates

---

### Return value

The transformed source string. Deterministic: identical input always produces identical output. Never longer than the input. Returns the original input when no net-saving candidate exists.

## License

BSD-3-Clause. See [LICENSE](LICENSE).
