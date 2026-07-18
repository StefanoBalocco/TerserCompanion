# TerserCompanion

Standalone JavaScript source transform that detects profitable repeated safe strings and eligible call targets and replaces them with shorter alias identifiers. Deterministic. Output never longer than input.

The package is ESM-only. Input must be valid ESM JavaScript.

## Features

- **Repeated string aliasing** — long string literals used at least twice are hoisted to a single `const` declaration
- **Exact function-path aliasing** — each configured path is aliased independently as a detached function reference, e.g. `const a=Math.floor; a(...)`
- **Class-root aliasing** — configured roots share one alias for all static-member calls, e.g. `const b=Array; b.isArray(...); b.from(...)`
- **Safe identifier generation** — aliases avoid source identifiers and JavaScript reserved words
- **Shadowing detection** — locally bound roots are left unchanged
- **Unsafe-context preservation** — directives, import/export specifiers, dynamic-import arguments, direct `require`/`require.resolve` first arguments, direct delete operands, element-access keys, property names, binding-element property names, and import-attribute keys/values are never aliased
- **Deterministic** — identical input always produces identical output
- **Never longer** — aliasing is applied only when it reduces total source length

## Installation

```sh
npm add @stefanobalocco/tersercompanion
```

TypeScript runtime required. The package is ESM-only.

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
// result replaces the repeated string and eligible call targets with aliases,
// e.g. const a="a very long repeated string literal",b=Math.floor,c=Array;
```

## Usage with a minifier (Terser)

TerserCompanion pairs naturally after minification: Terser removes the most redundancy first, and TerserCompanion handles patterns Terser's mangle cannot reach (shared string literals across variable declarations and repeated call targets).

Terser is an optional consumer-side dependency.

```sh
npm add terser
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
| `functionsToAlias` | `readonly string[]` | 21 default paths | Exact function paths that may be aliased independently |
| `classesToAlias` | `readonly string[]` | 2 default class roots | Class roots whose static method calls share one alias per root |

Supplying an option array replaces that category's defaults. Omitting the option uses defaults. An empty array disables that category. Class-root handling takes precedence: if the same root appears in both `functionsToAlias` and `classesToAlias`, the class-root behavior is used and the function path is ignored.

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
- **Exact function paths** — each `functionsToAlias` entry is aliased independently as a detached function reference. For example, `Math.floor` produces `const a=Math.floor; a(...)`. Bare paths such as `RegExp` remain aliasable
- **Static method calls** — `classesToAlias` entries share one root alias, e.g. `Array.isArray` and `Array.from` are grouped under one alias for `Array`. Class-root handling takes precedence for overlapping roots

Aliases avoid existing identifiers and JavaScript reserved words. Declaration is placed after a leading shebang, directive prologue, and import declarations.

### Responsibilities and stability

Configured function paths must be safe to call detached from their receiver. The default paths are intended for detached calls; custom entries are the caller's responsibility. Aliased function paths and class roots must resolve at insertion time and remain stable during relevant calls.

---

### Passthrough

Source that is syntactically accepted but contains a `with` statement or direct `eval(...)` (including parenthesized direct eval like `(eval)(...)`) is returned unchanged. The `with` passthrough is a conservative fallback for classic-script input outside the supported ESM contract. The following do **not** trigger passthrough and are transformed normally:

- Indirect eval (`(0,eval)(...)`)
- Property eval (`globalThis.eval(...)`)
- Optional eval (`eval?.(...)`)
- `Function` and `new Function`

Malformed or unsupported syntax (TypeScript-only constructs, JSX, decorators, namespace exports) still throws.

---

### Protected strings

The following string literal positions are never aliased:

- Static `import`/`export` module specifiers and names (including import attributes)
- Dynamic `import()` first argument
- Direct `require(...)` and `require.resolve(...)` first StringLiteral argument
- Direct `delete` StringLiteral operand
- Element-access keys (`obj["key"]`)
- Directive prologue strings (`"use strict"`)
- Binding-element property names
- Declaration names (property assignments, methods, class members)
- Specifier names (`import { X as "name" }`, `export { X as "name" }`)

Only syntactically direct bare forms of `require` and `require.resolve` are protected. Property access (`globalThis.require`), comma/indirect (`(0,require)`), and optional forms are not protected.

---

### Determinism

Priorities for candidate selection are: occurrence count, initializer length, then replaced length. Complete ties retain source encounter order for strings and configured order for functions and classes. No alphabetical or locale collation is used.

---

### Errors / limitations

- Malformed JavaScript throws a formatted `Error` with TypeScript diagnostics
- TypeScript-only syntax (type annotations, interfaces, enums, JSX, decorators, namespace exports, type-only imports, `as` expressions, non-null assertions) throws
- Source with `with` or direct `eval` is returned unchanged
- A root whose identifier is locally bound (variable or parameter declaration) is not aliased
- Optional-chain calls (`?.()`) and `new` expressions are not candidates

---

### Return value

The transformed source string. Deterministic: identical input always produces identical output. Never longer than the input. Returns the original input when no net-saving candidate exists or when passthrough conditions apply.

## License

BSD-3-Clause. See [LICENSE](LICENSE).
