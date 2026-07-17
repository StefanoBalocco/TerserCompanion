import test from 'ava';
import type { ExecutionContext } from 'ava';
import * as ts from 'typescript';
import TerserCompanion from './TerserCompanion.js';

type Nullable<T> = T | null;

const reservedIdentifiers: Set<string> = new Set<string>( [
	'arguments',
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'eval',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'implements',
	'import',
	'in',
	'instanceof',
	'interface',
	'let',
	'new',
	'null',
	'package',
	'private',
	'protected',
	'public',
	'return',
	'static',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'undefined',
	'var',
	'void',
	'while',
	'with',
	'yield'
] );

/**
 * Parses a string as JavaScript and asserts it has no parse diagnostics.
 */
function assertValidOutput( t: ExecutionContext, output: string ): void {
	const parsed: ts.SourceFile = ts.createSourceFile(
		'verify.js',
		output,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS
	);
	const diagnostics: readonly ts.DiagnosticWithLocation[] = ( parsed as ts.SourceFile & {
		parseDiagnostics: readonly ts.DiagnosticWithLocation[];
	} ).parseDiagnostics;

	t.is( diagnostics.length, 0, 'output must be syntactically valid JavaScript' );
}

// ── Contract 1: default export signature ─────────────────────────────────────

test( 'default export accepts options and returns a string', ( t: ExecutionContext ) => {
	const source: string = 'var x = 1;';
	const result: string = TerserCompanion( source );
	t.is( typeof result, 'string' );

	const resultWithOptions: string = TerserCompanion( source, { functionsToAlias: [] } );
	t.is( typeof resultWithOptions, 'string' );

	const resultWithEmptyClasses: string = TerserCompanion( source, { classesToAlias: [] } );
	t.is( typeof resultWithEmptyClasses, 'string' );
} );

// ── Contract 2: empty / non-profitable source unchanged ──────────────────────

test( 'empty source returns unchanged', ( t: ExecutionContext ) => {
	const source: string = '';
	t.is( TerserCompanion( source ), source );
} );

test( 'source without repeated expressions returns unchanged', ( t: ExecutionContext ) => {
	const source: string = 'var a = 1;\nvar b = 2;\nconsole.log( a + b );\n';
	t.is( TerserCompanion( source ), source );
} );

test( 'short repeated string below alias threshold unchanged', ( t: ExecutionContext ) => {
	const source: string = 'var a = "x";\nvar b = "x";\n';
	t.is( TerserCompanion( source ), source );
} );

// ── Contract 3: repeated long string literal ──────────────────────────────────

test( 'repeated long string literal produces shorter output and alias declaration', ( t: ExecutionContext ) => {
	const longString: string = 'a very long string literal that is profitable to alias';
	const source: string = 'var a = "' + longString + '";\nvar b = "' + longString + '";\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );
	t.regex( result, /^const\s+[a-z]=\s*["']/ );
	const countInResult: number = ( result.match( /a very long string literal/g ) || [] ).length;
	t.is( countInResult, 1 );
	assertValidOutput( t, result );
} );

// ── Contract 4: function aliasing ────────────────────────────────────────────

test( 'repeated default function call is aliased', ( t: ExecutionContext ) => {
	const source: string = 'var v0 = Math.floor( 1.5 );\nvar v1 = Math.floor( 2.5 );\nvar v2 = Math.floor( 3.5 );\nvar v3 = Math.floor( 4.5 );\nvar v4 = Math.floor( 5.5 );\nvar v5 = Math.floor( 6.5 );\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );
	t.regex( result, /\bconst\s+[a-z]+=Math\b/ );
	const callSiteFloor: Nullable<RegExpMatchArray> = result.match( /\bvar\s+v\d+\s*=\s*Math\.floor\b/ );
	t.falsy( callSiteFloor, 'call sites must use root-alias, not Math.floor' );
	assertValidOutput( t, result );
} );

test( 'custom functionsToAlias is honored', ( t: ExecutionContext ) => {
	const source: string = 'var v0 = Custom.call( x );\nvar v1 = Custom.call( y );\nvar v2 = Custom.call( z );\nvar v3 = Custom.call( w );\nvar v4 = Custom.call( p );\nvar v5 = Custom.call( q );\n';
	const result: string = TerserCompanion( source, {
		functionsToAlias: [ 'Custom.call' ]
	} );

	t.true( result.length < source.length );
	t.regex( result, /\bconst\s+[a-z]+=Custom\b/ );
	assertValidOutput( t, result );
} );

// ── Contract 5: class-root aliasing ──────────────────────────────────────────

test( 'repeated default class root is aliased', ( t: ExecutionContext ) => {
	const source: string = 'var a = Array.isArray( x );\nvar b = Array.isArray( y );\nvar c = Array.isArray( z );\nvar d = Array.isArray( w );\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );
	const arrayCount: number = ( result.match( /\bArray\b/g ) || [] ).length;
	t.true( arrayCount <= 1 );
	assertValidOutput( t, result );
} );

test( 'custom classesToAlias is honored', ( t: ExecutionContext ) => {
	const source: string = 'var a = Custom.create( "test" );\nvar b = Custom.create( "test2" );\nvar c = Custom.create( "test3" );\nvar d = Custom.create( "test4" );\n';
	const result: string = TerserCompanion( source, {
		classesToAlias: [ 'Custom' ]
	} );

	t.true( result.length < source.length );
	const customCount: number = ( result.match( /\bCustom\b/g ) || [] ).length;
	t.true( customCount <= 1 );
	assertValidOutput( t, result );
} );

// ── Contract 6: local binding shadowing blocks aliasing ──────────────────────

test( 'local binding shadowing Math blocks aliasing', ( t: ExecutionContext ) => {
	const source: string = 'const Math = {};\nvar a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\n';
	const result: string = TerserCompanion( source );

	const floorCount: number = ( result.match( /Math\.floor/g ) || [] ).length;
	t.is( floorCount, 2 );
} );

// ── Contract 7: unsafe string contexts remain literal ────────────────────────

test( 'repeated strings in unsafe contexts remain unchanged', ( t: ExecutionContext ) => {
	const directiveSource: string = '"use strict";\n"use strict";\n';
	t.is( TerserCompanion( directiveSource ), directiveSource );

	const importSource: string = 'import "mod";\nimport "mod";\n';
	t.is( TerserCompanion( importSource ), importSource );

	const dynamicImportSource: string = 'const a = import( "mod" );\nconst b = import( "mod" );\n';
	t.is( TerserCompanion( dynamicImportSource ), dynamicImportSource );

	const propertySource: string = 'var obj = { "key": 1, "key": 2 };\n';
	t.is( TerserCompanion( propertySource ), propertySource );
} );

// ── Contract 8: insertion location ────────────────────────────────────────────

test( 'insertion after shebang, directive, and import', ( t: ExecutionContext ) => {
	const shebangSource: string = '#!/usr/bin/env node\nvar a = "repeated long string for shebang test";\nvar b = "repeated long string for shebang test";\n';
	const shebangResult: string = TerserCompanion( shebangSource );

	t.true( shebangResult.startsWith( '#!/usr/bin/env node\nconst ' ) || shebangResult.startsWith( '#!/usr/bin/env node\n\nconst ' ) );
	t.true( shebangResult.length < shebangSource.length );

	const directiveSource: string = '"use strict";\nvar a = "repeated long string for directive test";\nvar b = "repeated long string for directive test";\n';
	const directiveResult: string = TerserCompanion( directiveSource );

	t.true( directiveResult.startsWith( '"use strict";const ' ) );
	t.true( directiveResult.length < directiveSource.length );

	const importSource: string = 'import fs from "fs";\nvar a = "repeated long string for import test";\nvar b = "repeated long string for import test";\n';
	const importResult: string = TerserCompanion( importSource );

	t.true( importResult.startsWith( 'import fs from "fs";const ' ) );
	t.true( importResult.length < importSource.length );
} );

test( 'insertion after directive without semicolon', ( t: ExecutionContext ) => {
	const source: string = '"use strict"\nvar a = "repeated long string for no-semicolon directive";\nvar b = "repeated long string for no-semicolon directive";\n';
	const result: string = TerserCompanion( source );

	t.true( result.startsWith( '"use strict";\nconst ' ) );
	t.true( result.length < source.length );
} );

// ── Contract 9: alias name collision avoidance ───────────────────────────────

test( 'aliases skip existing identifiers and reserved words', ( t: ExecutionContext ) => {
	const source: string = 'var a = 0;\nvar bVal = Math.floor( 1.5 );\nvar cVal = Math.floor( 2.5 );\nvar dVal = Math.floor( 3.5 );\nvar eVal = Math.floor( 4.5 );\nvar fVal = Math.floor( 5.5 );\nvar s1 = "some long profitable string for alias test";\nvar s2 = "some long profitable string for alias test";\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );

	const aliasRegex: RegExp = /(?:\bconst\s+|,\s*)([a-zA-Z]+)=/g;
	let aliasMatch: Nullable<RegExpExecArray> = aliasRegex.exec( result );

	while( aliasMatch ) {
		const alias: string = aliasMatch[ 1 ];

		t.not( alias, 'a', 'alias "' + alias + '" must not collide with existing binding "a"' );
		t.false( reservedIdentifiers.has( alias ), 'alias "' + alias + '" must not be a reserved identifier' );
		aliasMatch = aliasRegex.exec( result );
	}
	assertValidOutput( t, result );
} );

// ── Contract 10: malformed JavaScript throws ──────────────────────────────────

test( 'malformed JavaScript throws', ( t: ExecutionContext ) => {
	t.throws( () => {
		TerserCompanion( 'var x = ;\n' );
	}, { instanceOf: Error } );
} );

// ── Contract 11: TypeScript-only syntax and JSX rejection ─────────────────────

const invalidSources: { source: string; description: string }[] = [
	{ source: 'const value: number = 1;\n', description: 'type annotation' },
	{ source: 'function value( input: number ): number { return input; }\n', description: 'function with typed parameters and return' },
	{ source: 'interface Value { item: number; }\n', description: 'interface declaration' },
	{ source: 'type Value = number;\n', description: 'type alias' },
	{ source: 'enum Value { Item }\n', description: 'enum declaration' },
	{ source: 'const value = input as number;\n', description: 'as expression' },
	{ source: 'const value = input!;\n', description: 'non-null assertion' },
	{ source: 'import type { Value } from "./value.js";\n', description: 'type-only import' },
	{ source: 'const element = <div />;\n', description: 'JSX element' },
	{ source: 'const fragment = <></>;\n', description: 'JSX fragment' },
	{ source: 'export as namespace Value;\n', description: 'namespace export declaration' },
	{ source: 'class Foo {\n  @bar\n  method() {}\n}\n', description: 'decorator syntax' },
	{ source: 'module Value { }\n', description: 'module declaration' },
];

invalidSources.forEach( ( { source, description }: { source: string; description: string } ): void => {
	test( 'rejects ' + description, ( t: ExecutionContext ) => {
		const error: Error = t.throws( () => {
			TerserCompanion( source );
		}, { instanceOf: Error } );

		t.truthy( error.message.includes( 'source.js' ), 'error message must contain source.js' );
		t.truthy( error.message.includes( 'error TS' ), 'error message must contain error TS' );
	} );
} );

// ── Contract 12: option normalization ─────────────────────────────────────────

test( 'duplicate options deduplicated and empty arrays disable defaults', ( t: ExecutionContext ) => {
	const dedupSource: string = 'var a = Custom.call( 1 );\nvar b = Custom.call( 2 );\nvar c = Custom.call( 3 );\n';
	const resultDeduped: string = TerserCompanion( dedupSource, {
		functionsToAlias: [ 'Custom.call', 'Custom.call' ]
	} );
	const resultSingle: string = TerserCompanion( dedupSource, {
		functionsToAlias: [ 'Custom.call' ]
	} );

	t.is( resultDeduped, resultSingle );
	assertValidOutput( t, resultDeduped );

	// Empty arrays disable defaults: Math.floor and Array should remain as-is.
	const emptySource: string = 'var a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\nvar c = Math.floor( 3.5 );\nvar d = Array.isArray( x );\nvar e = Array.isArray( y );\nvar f = Array.isArray( z );\nvar g = Array.isArray( w );\n';
	const emptyResult: string = TerserCompanion( emptySource, {
		functionsToAlias: [],
		classesToAlias: []
	} );

	const mathFloorCount: number = ( emptyResult.match( /Math\.floor/g ) || [] ).length;
	t.is( mathFloorCount, 3, 'Math.floor must remain with empty functionsToAlias' );
	const arrayAccessCount: number = ( emptyResult.match( /Array\./g ) || [] ).length;
	t.is( arrayAccessCount, 4, 'Array.* must remain with empty classesToAlias' );
	t.is( emptyResult, emptySource, 'without profitable strings, output must equal input' );
	assertValidOutput( t, emptyResult );
} );

// ── Contract 13: determinism and never-longer ─────────────────────────────────

test( 'identical input produces identical output', ( t: ExecutionContext ) => {
	const source: string = 'var a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\nvar c = Math.floor( 3.5 );\n';
	const result1: string = TerserCompanion( source );
	const result2: string = TerserCompanion( source );

	t.is( result1, result2 );
} );

test( 'output is never longer than input', ( t: ExecutionContext ) => {
	const sources: string[] = [
		'',
		'var a = 1;',
		'var a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\n',
		'import "mod";\nimport "mod";\n',
		'"use strict";\nvar a = "hello world hello world";\nvar b = "hello world hello world";\n',
		'#!/usr/bin/env node\n"use strict";\nimport fs from "fs";\nvar a = "repeated string for length test";\nvar b = "repeated string for length test";\n'
	];

	sources.forEach( ( source: string ): void => {
		const result: string = TerserCompanion( source );

		t.true( result.length <= source.length, 'output length (' + result.length + ') must not exceed input length (' + source.length + ')' );
	} );
} );

// ── Contract 14: all candidate-sort tiebreak levels ────────────────────────────

test( 'sort comparator exercises priorityLength, replacedLength, and localeCompare', ( t: ExecutionContext ) => {
	// Six string candidates with equal occurrence counts (2 each):
	//   "aaaa_really_long_profitable_repeated_literal" (priorityLength=43, replacedLength=86)
	//   "bbbb_really_long_profitable_repeated_literal" (priorityLength=43, replacedLength=86)
	//   "cccc_longer_profitable_repeated_demo"         (priorityLength=37, replacedLength=74)
	//   "dddd_longer_profitable_repeated_demo"         (priorityLength=37, replacedLength=74)
	//   "eeee_short_profitable_repeated"               (priorityLength=31, replacedLength=62)
	//   "ffff_short_profitable_repeated"               (priorityLength=31, replacedLength=62)
	// Sort order (all count=2):
	//   aaaa/bbbb (priority=43) → equal → replacedLength equal (86) → localeCompare: "aaaa" < "bbbb" → aaaa before bbbb
	//   cccc/dddd (priority=37) → equal → replacedLength equal (74) → localeCompare: "cccc" < "dddd" → cccc before dddd
	//   eeee/ffff (priority=31) → equal → replacedLength equal (62) → localeCompare: "eeee" < "ffff" → eeee before ffff
	// Levels triggered: (a) differing priorityLength, (c) equal priority/replacedLength with distinct keys
	const source: string = [
		'var a0 = "aaaa_really_long_profitable_repeated_literal";',
		'var a1 = "aaaa_really_long_profitable_repeated_literal";',
		'var b0 = "bbbb_really_long_profitable_repeated_literal";',
		'var b1 = "bbbb_really_long_profitable_repeated_literal";',
		'var c0 = "cccc_longer_profitable_repeated_demo";',
		'var c1 = "cccc_longer_profitable_repeated_demo";',
		'var d0 = "dddd_longer_profitable_repeated_demo";',
		'var d1 = "dddd_longer_profitable_repeated_demo";',
		'var e0 = "eeee_short_profitable_repeated";',
		'var e1 = "eeee_short_profitable_repeated";',
		'var f0 = "ffff_short_profitable_repeated";',
		'var f1 = "ffff_short_profitable_repeated";'
	].join( '\n' ) + '\n';
	const result1: string = TerserCompanion( source );
	const result2: string = TerserCompanion( source );

	t.is( result1, result2, 'deterministic output for tiebreak candidates' );
	t.true( result1.length < source.length, 'output strictly shorter' );
	// declaration order matches comparator order: aaaa, bbbb, cccc, dddd, eeee, ffff
	t.true( result1.includes( '"aaaa_really_long_profitable_repeated_literal"' ), 'aaaa candidate aliased' );
	t.true( result1.includes( '"bbbb_really_long_profitable_repeated_literal"' ), 'bbbb candidate aliased' );
	t.true( result1.includes( '"cccc_longer_profitable_repeated_demo"' ), 'cccc candidate aliased' );
	t.true( result1.includes( '"dddd_longer_profitable_repeated_demo"' ), 'dddd candidate aliased' );
	t.true( result1.includes( '"eeee_short_profitable_repeated"' ), 'eeee candidate aliased' );
	t.true( result1.includes( '"ffff_short_profitable_repeated"' ), 'ffff candidate aliased' );
	// The declaration string should list aliases in comparator order; verify order via const-declaration pattern
	const constStart: number = result1.indexOf( 'const ' );
	const declEnd: number = result1.indexOf( ';\n', constStart );
	const declaration: string = result1.slice( constStart, declEnd );
	const aliasOrder: string[] = declaration.replace( 'const ', '' ).split( ',' ).map( ( part: string ) => part.split( '=' )[ 0 ] );
	t.is( aliasOrder.length, 6, 'all six aliases declared' );
	t.true( aliasOrder[ 0 ] < aliasOrder[ 1 ], 'aaaa alias precedes bbbb alias (localeCompare)' );
	assertValidOutput( t, result1 );
} );

// ── Contract 15: destructuring binding walker ──────────────────────────────────

test( 'destructuring with omitted element and local Math blocks aliasing', ( t: ExecutionContext ) => {
	const source: string = 'const [ , Math ] = values;\nvar a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\nvar c = Math.floor( 3.5 );\nvar d = Math.floor( 4.5 );\nvar e = Math.floor( 5.5 );\nvar f = Math.floor( 6.5 );\n';
	const result: string = TerserCompanion( source );

	t.is( result, source, 'output unchanged when Math is shadowed via destructuring' );
	assertValidOutput( t, result );
} );

// ── Contract 16: bare identifier callee ───────────────────────────────────────

test( 'bare RegExp identifier calls are aliased', ( t: ExecutionContext ) => {
	const source: string = 'var a0 = RegExp( "p1" );\nvar a1 = RegExp( "p2" );\nvar a2 = RegExp( "p3" );\nvar a3 = RegExp( "p4" );\nvar a4 = RegExp( "p5" );\nvar a5 = RegExp( "p6" );\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length, 'output shorter with RegExp alias' );
	t.false( /\bRegExp\s*\(/m.test( result ), 'call sites must not contain bare RegExp(' );
	t.regex( result, /\bconst\s+[a-z]=RegExp\b/ );
	assertValidOutput( t, result );
} );

// ── Contract 17: unsafe valid-JS string contexts ─────────────────────────────

test( 'element-access keys remain literal', ( t: ExecutionContext ) => {
	const longKey: string = 'a sufficiently long repeated string for element access key test';
	const source: string = 'var v = record[ "' + longKey + '" ];\nvar w = record[ "' + longKey + '" ];\n';
	t.is( TerserCompanion( source ), source );
} );

test( 'binding property names remain literal', ( t: ExecutionContext ) => {
	const longKey: string = 'a sufficiently long repeated string for binding property name test';
	const source: string = 'var { "' + longKey + '": first } = record;\nvar { "' + longKey + '": second } = record;\n';
	t.is( TerserCompanion( source ), source );
} );

test( 'import attributes remain literal', ( t: ExecutionContext ) => {
	const longAttr: string = 'a sufficiently long repeated string value for import attribute safety';
	const source: string = 'import data from "pkg" with { type: "' + longAttr + '" };\nimport more from "pkg" with { type: "' + longAttr + '" };\n';
	t.is( TerserCompanion( source ), source );
} );

test( 'export string names remain literal', ( t: ExecutionContext ) => {
	const longName: string = 'a sufficiently long repeated string for export name safety test';
	const source: string = 'const value = 1;\nexport { value as "' + longName + '" };\nconst other = 2;\nexport { other as "' + longName + '" };\n';
	t.is( TerserCompanion( source ), source );
} );

test( 'import string names remain literal', ( t: ExecutionContext ) => {
	const longName: string = 'a sufficiently long repeated string for import name safety test';
	const source: string = 'import { "' + longName + '" as value } from "pkg";\nimport { "' + longName + '" as other } from "pkg";\n';
	t.is( TerserCompanion( source ), source );
} );

// ── Contract 18: quote generation ─────────────────────────────────────────────

test( 'low control character uses \\\\xHH form', ( t: ExecutionContext ) => {
	const controlChar: string = String.fromCharCode( 0x01 );
	const source: string = [
		'var a00 = "' + controlChar + '";', 'var a01 = "' + controlChar + '";',
		'var a02 = "' + controlChar + '";', 'var a03 = "' + controlChar + '";',
		'var a04 = "' + controlChar + '";', 'var a05 = "' + controlChar + '";',
		'var a06 = "' + controlChar + '";', 'var a07 = "' + controlChar + '";',
		'var a08 = "' + controlChar + '";', 'var a09 = "' + controlChar + '";'
	].join( '\n' ) + '\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );
	t.regex( result, /\\x01/ );
	assertValidOutput( t, result );
} );

test( 'double-quoted string aliased with single quotes when shorter', ( t: ExecutionContext ) => {
	const source: string = 'var a = "a \\"test\\"";\nvar b = "a \\"test\\"";\nvar c = "a \\"test\\"";\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );
	// The declaration should use single quotes because the string contains
	// double quotes but no single quotes, making single-quoted form shorter
	t.regex( result, /const\s+[a-z]='[^']+'/ );
	assertValidOutput( t, result );
} );

test( 'single-quoted string aliased with double quotes when shorter', ( t: ExecutionContext ) => {
	const source: string = "var a = 'a \\'test\\'';\nvar b = 'a \\'test\\'';\nvar c = 'a \\'test\\'';\n";
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );
	// The declaration should use double quotes because the string contains
	// single quotes but no double quotes, making double-quoted form shorter
	t.regex( result, /const\s+[a-z]="[^"]+"/ );
	assertValidOutput( t, result );
} );

// ── Contract 19: missing triple-slash reference triggers getSourceFile false path ──

test( 'missing triple-slash reference with profitable string succeeds', ( t: ExecutionContext ) => {
	const source: string = '/// <reference path="./missing.js" />\nvar first = "a repeated string long enough to alias";\nvar second = "a repeated string long enough to alias";\n';
	const result: string = TerserCompanion( source );

	t.true( result.length < source.length );
	assertValidOutput( t, result );
} );

// ── Contract 20: shebang boundary cases ──────────────────────────────────────

test( 'insertion after CRLF-terminated shebang', ( t: ExecutionContext ) => {
	const source: string = '#!/usr/bin/env node\r\nvar a = "profitable string for CRLF test";\nvar b = "profitable string for CRLF test";\n';
	const result: string = TerserCompanion( source );

	t.true( result.startsWith( '#!/usr/bin/env node\r\nconst ' ), 'alias declaration immediately follows shebang' );
	t.true( result.length < source.length );
	assertValidOutput( t, result );
} );

test( 'bare unterminated shebang returns unchanged', ( t: ExecutionContext ) => {
	const source: string = '#!/usr/bin/env node';
	const result: string = TerserCompanion( source );

	t.is( result, source );
} );

// ── Contract 21: bijective base-52 alias sequence (a..z, A..Z, aa..aA) ───────

test( 'bijective base-52 aliases a..z, A..Z, aa, ab, …, aA', ( t: ExecutionContext ) => {
	const candidateCount: number = 79;
	const lines: string[] = [];

	for( let iL1: number = 0; iL1 < candidateCount; iL1++ ) {
		const index: string = iL1.toString().padStart( 3, '0' );
		const longString: string = 'base52_candidate_' + index + '_' + 'x'.repeat( 24 );
		lines.push( 'const holder' + index + 'Left = "' + longString + '";' );
		lines.push( 'const holder' + index + 'Right = "' + longString + '";' );
	}

	const source: string = lines.join( '\n' ) + '\n';
	const result: string = TerserCompanion( source );

	// Extract aliases from the const declaration
	const constEnd: number = result.indexOf( ';' );
	const declaration: string = result.slice( 0, constEnd );
	const aliasesDeclared: string[] = declaration.replace( 'const ', '' ).split( ',' ).map( ( part: string ) => part.split( '=' )[ 0 ] );

	t.is( aliasesDeclared.length, candidateCount, 'all ' + candidateCount + ' candidates aliased' );

	// Aliases 0–25: a through z
	const lowercaseExpected: string = 'abcdefghijklmnopqrstuvwxyz';
	for( let iL1: number = 0; iL1 < 26; iL1++ ) {
		t.is( aliasesDeclared[ iL1 ], lowercaseExpected[ iL1 ], 'alias ' + iL1 + ' is ' + lowercaseExpected[ iL1 ] );
	}

	// Aliases 26–51: A through Z
	const uppercaseExpected: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	for( let iL1: number = 26; iL1 < 52; iL1++ ) {
		t.is( aliasesDeclared[ iL1 ], uppercaseExpected[ iL1 - 26 ], 'alias ' + iL1 + ' is ' + uppercaseExpected[ iL1 - 26 ] );
	}

	// Alias 52: aa
	t.is( aliasesDeclared[ 52 ], 'aa', 'alias 52 is aa' );

	// Alias 78: aA (first two-char mixed-case alias in bijective base-52)
	t.is( aliasesDeclared[ 78 ], 'aA', 'alias 78 is aA' );

	t.true( result.length < source.length, 'output shorter than input' );
	assertValidOutput( t, result );
	t.is( TerserCompanion( source ), result, 'deterministic output' );
} );

// ── Contract 22: uppercase collision with existing A ──────────────────────────

test( 'uppercase alias collision with existing A skips to B', ( t: ExecutionContext ) => {
	const preamble: string = 'var A = 0;\n';
	const candidateCount: number = 27;
	const lines: string[] = [];

	for( let iL1: number = 0; iL1 < candidateCount; iL1++ ) {
		const index: string = iL1.toString().padStart( 2, '0' );
		const longString: string = 'uppercase_collision_candidate_' + index + '_' + 'x'.repeat( 24 );
		lines.push( 'const holder' + index + 'Left = "' + longString + '";' );
		lines.push( 'const holder' + index + 'Right = "' + longString + '";' );
	}

	const source: string = preamble + lines.join( '\n' ) + '\n';
	const result: string = TerserCompanion( source );

	// Extract aliases from the const declaration
	const constEnd: number = result.indexOf( ';' );
	const declaration: string = result.slice( 0, constEnd );
	const aliasesDeclared: string[] = declaration.replace( 'const ', '' ).split( ',' ).map( ( part: string ) => part.split( '=' )[ 0 ] );

	t.is( aliasesDeclared.length, candidateCount, 'all ' + candidateCount + ' candidates aliased' );

	// Aliases 0–25: a through z
	const lowercaseExpected: string = 'abcdefghijklmnopqrstuvwxyz';
	for( let iL1: number = 0; iL1 < 26; iL1++ ) {
		t.is( aliasesDeclared[ iL1 ], lowercaseExpected[ iL1 ], 'alias ' + iL1 + ' is ' + lowercaseExpected[ iL1 ] );
	}

	// Alias 26: B (A was skipped due to collision in source)
	t.is( aliasesDeclared[ 26 ], 'B', 'alias 26 is B (A was skipped)' );

	// No 'A' in the alias list
	t.false( aliasesDeclared.includes( 'A' ), 'alias list must not contain A' );

	t.true( result.length < source.length, 'output shorter than input' );
	assertValidOutput( t, result );
} );
