import test from 'ava';
import * as ts from 'typescript';
import TerserCompanion from '../../dist/TerserCompanion.js';
const reservedIdentifiers = new Set([
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
]);
function assertValidOutput(t, output) {
    const parsed = ts.createSourceFile('verify.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const diagnostics = parsed.parseDiagnostics;
    t.is(diagnostics.length, 0, 'output must be syntactically valid JavaScript');
}
test('default export accepts options and returns a string', (t) => {
    const source = 'var x = 1;';
    const result = TerserCompanion(source);
    t.is(typeof result, 'string');
    const resultWithOptions = TerserCompanion(source, { functionsToAlias: [] });
    t.is(typeof resultWithOptions, 'string');
    const resultWithEmptyClasses = TerserCompanion(source, { classesToAlias: [] });
    t.is(typeof resultWithEmptyClasses, 'string');
});
test('empty source returns unchanged', (t) => {
    const source = '';
    t.is(TerserCompanion(source), source);
});
test('source without repeated expressions returns unchanged', (t) => {
    const source = 'var a = 1;\nvar b = 2;\nconsole.log( a + b );\n';
    t.is(TerserCompanion(source), source);
});
test('short repeated string below alias threshold unchanged', (t) => {
    const source = 'var a = "x";\nvar b = "x";\n';
    t.is(TerserCompanion(source), source);
});
test('repeated long string literal produces shorter output and alias declaration', (t) => {
    const longString = 'a very long string literal that is profitable to alias';
    const source = 'var a = "' + longString + '";\nvar b = "' + longString + '";\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    t.regex(result, /^const\s+[a-z]=\s*["']/);
    const countInResult = (result.match(/a very long string literal/g) || []).length;
    t.is(countInResult, 1);
    assertValidOutput(t, result);
});
test('repeated default function call is aliased', (t) => {
    const source = 'var v0 = Math.floor( 1.5 );\nvar v1 = Math.floor( 2.5 );\nvar v2 = Math.floor( 3.5 );\nvar v3 = Math.floor( 4.5 );\nvar v4 = Math.floor( 5.5 );\nvar v5 = Math.floor( 6.5 );\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    t.regex(result, /\bconst\s+[a-z]+=Math\.floor\b/);
    const callSiteFloor = result.match(/\bvar\s+v\d+\s*=\s*Math\.floor\b/);
    t.falsy(callSiteFloor, 'call sites must use exact alias, not Math.floor');
    assertValidOutput(t, result);
});
test('custom functionsToAlias is honored', (t) => {
    const source = 'var v0 = Custom.call( x );\nvar v1 = Custom.call( y );\nvar v2 = Custom.call( z );\nvar v3 = Custom.call( w );\nvar v4 = Custom.call( p );\nvar v5 = Custom.call( q );\n';
    const result = TerserCompanion(source, {
        functionsToAlias: ['Custom.call']
    });
    t.true(result.length < source.length);
    t.regex(result, /\bconst\s+[a-z]+=Custom\.call\b/);
    assertValidOutput(t, result);
});
test('repeated default class root is aliased', (t) => {
    const source = 'var a = Array.isArray( x );\nvar b = Array.isArray( y );\nvar c = Array.isArray( z );\nvar d = Array.isArray( w );\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    const arrayCount = (result.match(/\bArray\b/g) || []).length;
    t.true(arrayCount <= 1);
    assertValidOutput(t, result);
});
test('custom classesToAlias is honored', (t) => {
    const source = 'var a = Custom.create( "test" );\nvar b = Custom.create( "test2" );\nvar c = Custom.create( "test3" );\nvar d = Custom.create( "test4" );\n';
    const result = TerserCompanion(source, {
        classesToAlias: ['Custom']
    });
    t.true(result.length < source.length);
    const customCount = (result.match(/\bCustom\b/g) || []).length;
    t.true(customCount <= 1);
    assertValidOutput(t, result);
});
test('local binding shadowing Math blocks aliasing', (t) => {
    const source = 'const Math = {};\nvar a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\n';
    const result = TerserCompanion(source);
    const floorCount = (result.match(/Math\.floor/g) || []).length;
    t.is(floorCount, 2);
});
test('repeated strings in unsafe contexts remain unchanged', (t) => {
    const directiveSource = '"use strict";\n"use strict";\n';
    t.is(TerserCompanion(directiveSource), directiveSource);
    const importSource = 'import "mod";\nimport "mod";\n';
    t.is(TerserCompanion(importSource), importSource);
    const dynamicImportSource = 'const a = import( "mod" );\nconst b = import( "mod" );\n';
    t.is(TerserCompanion(dynamicImportSource), dynamicImportSource);
    const propertySource = 'var obj = { "key": 1, "key": 2 };\n';
    t.is(TerserCompanion(propertySource), propertySource);
});
test('insertion after shebang, directive, and import', (t) => {
    const shebangSource = '#!/usr/bin/env node\nvar a = "repeated long string for shebang test";\nvar b = "repeated long string for shebang test";\n';
    const shebangResult = TerserCompanion(shebangSource);
    t.true(shebangResult.startsWith('#!/usr/bin/env node\nconst ') || shebangResult.startsWith('#!/usr/bin/env node\n\nconst '));
    t.true(shebangResult.length < shebangSource.length);
    const directiveSource = '"use strict";\nvar a = "repeated long string for directive test";\nvar b = "repeated long string for directive test";\n';
    const directiveResult = TerserCompanion(directiveSource);
    t.true(directiveResult.startsWith('"use strict";const '));
    t.true(directiveResult.length < directiveSource.length);
    const importSource = 'import fs from "fs";\nvar a = "repeated long string for import test";\nvar b = "repeated long string for import test";\n';
    const importResult = TerserCompanion(importSource);
    t.true(importResult.startsWith('import fs from "fs";const '));
    t.true(importResult.length < importSource.length);
});
test('insertion after directive without semicolon', (t) => {
    const source = '"use strict"\nvar a = "repeated long string for no-semicolon directive";\nvar b = "repeated long string for no-semicolon directive";\n';
    const result = TerserCompanion(source);
    t.true(result.startsWith('"use strict";\nconst '));
    t.true(result.length < source.length);
});
test('aliases skip existing identifiers and reserved words', (t) => {
    const source = 'var a = 0;\nvar bVal = Math.floor( 1.5 );\nvar cVal = Math.floor( 2.5 );\nvar dVal = Math.floor( 3.5 );\nvar eVal = Math.floor( 4.5 );\nvar fVal = Math.floor( 5.5 );\nvar s1 = "some long profitable string for alias test";\nvar s2 = "some long profitable string for alias test";\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    const aliasRegex = /(?:\bconst\s+|,\s*)([a-zA-Z]+)=/g;
    let aliasMatch = aliasRegex.exec(result);
    while (aliasMatch) {
        const alias = aliasMatch[1];
        t.not(alias, 'a', 'alias "' + alias + '" must not collide with existing binding "a"');
        t.false(reservedIdentifiers.has(alias), 'alias "' + alias + '" must not be a reserved identifier');
        aliasMatch = aliasRegex.exec(result);
    }
    assertValidOutput(t, result);
});
test('malformed JavaScript throws', (t) => {
    t.throws(() => {
        TerserCompanion('var x = ;\n');
    }, { instanceOf: Error });
});
const invalidSources = [
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
invalidSources.forEach(({ source, description }) => {
    test('rejects ' + description, (t) => {
        const error = t.throws(() => {
            TerserCompanion(source);
        }, { instanceOf: Error });
        t.truthy(error.message.includes('source.js'), 'error message must contain source.js');
        t.truthy(error.message.includes('error TS'), 'error message must contain error TS');
    });
});
test('duplicate options deduplicated and empty arrays disable defaults', (t) => {
    const dedupSource = 'var a = Custom.call( 1 );\nvar b = Custom.call( 2 );\nvar c = Custom.call( 3 );\n';
    const resultDeduped = TerserCompanion(dedupSource, {
        functionsToAlias: ['Custom.call', 'Custom.call']
    });
    const resultSingle = TerserCompanion(dedupSource, {
        functionsToAlias: ['Custom.call']
    });
    t.is(resultDeduped, resultSingle);
    assertValidOutput(t, resultDeduped);
    const emptySource = 'var a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\nvar c = Math.floor( 3.5 );\nvar d = Array.isArray( x );\nvar e = Array.isArray( y );\nvar f = Array.isArray( z );\nvar g = Array.isArray( w );\n';
    const emptyResult = TerserCompanion(emptySource, {
        functionsToAlias: [],
        classesToAlias: []
    });
    const mathFloorCount = (emptyResult.match(/Math\.floor/g) || []).length;
    t.is(mathFloorCount, 3, 'Math.floor must remain with empty functionsToAlias');
    const arrayAccessCount = (emptyResult.match(/Array\./g) || []).length;
    t.is(arrayAccessCount, 4, 'Array.* must remain with empty classesToAlias');
    t.is(emptyResult, emptySource, 'without profitable strings, output must equal input');
    assertValidOutput(t, emptyResult);
});
test('identical input produces identical output', (t) => {
    const source = 'var a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\nvar c = Math.floor( 3.5 );\n';
    const result1 = TerserCompanion(source);
    const result2 = TerserCompanion(source);
    t.is(result1, result2);
});
test('output is never longer than input', (t) => {
    const sources = [
        '',
        'var a = 1;',
        'var a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\n',
        'import "mod";\nimport "mod";\n',
        '"use strict";\nvar a = "hello world hello world";\nvar b = "hello world hello world";\n',
        '#!/usr/bin/env node\n"use strict";\nimport fs from "fs";\nvar a = "repeated string for length test";\nvar b = "repeated string for length test";\n'
    ];
    sources.forEach((source) => {
        const result = TerserCompanion(source);
        t.true(result.length <= source.length, 'output length (' + result.length + ') must not exceed input length (' + source.length + ')');
    });
});
test('sort comparator exercises priorityLength, replacedLength, and stable encounter order', (t) => {
    const source = [
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
    ].join('\n') + '\n';
    const result1 = TerserCompanion(source);
    const result2 = TerserCompanion(source);
    t.is(result1, result2, 'deterministic output for tiebreak candidates');
    t.true(result1.length < source.length, 'output strictly shorter');
    const constStart1 = result1.indexOf('const ');
    const declEnd1 = result1.indexOf(';\n', constStart1);
    const decl1 = result1.slice(constStart1, declEnd1);
    const aaaaInDecl = (decl1.match(/"aaaa_really_long_profitable_repeated_literal"/g) || []).length;
    t.is(aaaaInDecl, 1, 'aaaa initializer appears exactly once in declaration');
    const bbbbInDecl = (decl1.match(/"bbbb_really_long_profitable_repeated_literal"/g) || []).length;
    t.is(bbbbInDecl, 1, 'bbbb initializer appears exactly once in declaration');
    const ccccInDecl = (decl1.match(/"cccc_longer_profitable_repeated_demo"/g) || []).length;
    t.is(ccccInDecl, 1, 'cccc initializer appears exactly once in declaration');
    const ddddInDecl = (decl1.match(/"dddd_longer_profitable_repeated_demo"/g) || []).length;
    t.is(ddddInDecl, 1, 'dddd initializer appears exactly once in declaration');
    const eeeeInDecl = (decl1.match(/"eeee_short_profitable_repeated"/g) || []).length;
    t.is(eeeeInDecl, 1, 'eeee initializer appears exactly once in declaration');
    const ffffInDecl = (decl1.match(/"ffff_short_profitable_repeated"/g) || []).length;
    t.is(ffffInDecl, 1, 'ffff initializer appears exactly once in declaration');
    const aaaaTotal = (result1.match(/"aaaa_really_long_profitable_repeated_literal"/g) || []).length;
    t.is(aaaaTotal, 1, 'aaaa literal appears exactly once in output');
    const ffffTotal = (result1.match(/"ffff_short_profitable_repeated"/g) || []).length;
    t.is(ffffTotal, 1, 'ffff literal appears exactly once in output');
    t.true(decl1.indexOf('aaaa') < decl1.indexOf('bbbb'), 'aaaa initializer precedes bbbb initializer in declaration');
    t.true(decl1.indexOf('cccc') < decl1.indexOf('dddd'), 'cccc initializer precedes dddd initializer in declaration');
    t.true(decl1.indexOf('eeee') < decl1.indexOf('ffff'), 'eeee initializer precedes ffff initializer in declaration');
    assertValidOutput(t, result1);
});
test('destructuring with omitted element and local Math blocks aliasing', (t) => {
    const source = 'const [ , Math ] = values;\nvar a = Math.floor( 1.5 );\nvar b = Math.floor( 2.5 );\nvar c = Math.floor( 3.5 );\nvar d = Math.floor( 4.5 );\nvar e = Math.floor( 5.5 );\nvar f = Math.floor( 6.5 );\n';
    const result = TerserCompanion(source);
    t.is(result, source, 'output unchanged when Math is shadowed via destructuring');
    assertValidOutput(t, result);
});
test('bare RegExp identifier calls are aliased', (t) => {
    const source = 'var a0 = RegExp( "p1" );\nvar a1 = RegExp( "p2" );\nvar a2 = RegExp( "p3" );\nvar a3 = RegExp( "p4" );\nvar a4 = RegExp( "p5" );\nvar a5 = RegExp( "p6" );\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter with RegExp alias');
    t.false(/\bRegExp\s*\(/m.test(result), 'call sites must not contain bare RegExp(');
    t.regex(result, /\bconst\s+[a-z]=RegExp\b/);
    assertValidOutput(t, result);
});
test('element-access keys remain literal', (t) => {
    const longKey = 'a sufficiently long repeated string for element access key test';
    const source = 'var v = record[ "' + longKey + '" ];\nvar w = record[ "' + longKey + '" ];\n';
    t.is(TerserCompanion(source), source);
});
test('binding property names remain literal', (t) => {
    const longKey = 'a sufficiently long repeated string for binding property name test';
    const source = 'var { "' + longKey + '": first } = record;\nvar { "' + longKey + '": second } = record;\n';
    t.is(TerserCompanion(source), source);
});
test('import attributes remain literal', (t) => {
    const longAttr = 'a sufficiently long repeated string value for import attribute safety';
    const source = 'import data from "pkg" with { type: "' + longAttr + '" };\nimport more from "pkg" with { type: "' + longAttr + '" };\n';
    t.is(TerserCompanion(source), source);
});
test('export string names remain literal', (t) => {
    const longName = 'a sufficiently long repeated string for export name safety test';
    const source = 'const value = 1;\nexport { value as "' + longName + '" };\nconst other = 2;\nexport { other as "' + longName + '" };\n';
    t.is(TerserCompanion(source), source);
});
test('import string names remain literal', (t) => {
    const longName = 'a sufficiently long repeated string for import name safety test';
    const source = 'import { "' + longName + '" as value } from "pkg";\nimport { "' + longName + '" as other } from "pkg";\n';
    t.is(TerserCompanion(source), source);
});
test('low control character uses \\\\xHH form', (t) => {
    const controlChar = String.fromCharCode(0x01);
    const source = [
        'var a00 = "' + controlChar + '";', 'var a01 = "' + controlChar + '";',
        'var a02 = "' + controlChar + '";', 'var a03 = "' + controlChar + '";',
        'var a04 = "' + controlChar + '";', 'var a05 = "' + controlChar + '";',
        'var a06 = "' + controlChar + '";', 'var a07 = "' + controlChar + '";',
        'var a08 = "' + controlChar + '";', 'var a09 = "' + controlChar + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    t.regex(result, /\\x01/);
    assertValidOutput(t, result);
});
test('double-quoted string aliased with single quotes when shorter', (t) => {
    const source = 'var a = "a \\"test\\"";\nvar b = "a \\"test\\"";\nvar c = "a \\"test\\"";\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    t.regex(result, /const\s+[a-z]='[^']+'/);
    assertValidOutput(t, result);
});
test('single-quoted string aliased with double quotes when shorter', (t) => {
    const source = "var a = 'a \\'test\\'';\nvar b = 'a \\'test\\'';\nvar c = 'a \\'test\\'';\n";
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    t.regex(result, /const\s+[a-z]="[^"]+"/);
    assertValidOutput(t, result);
});
test('missing triple-slash reference with profitable string succeeds', (t) => {
    const source = '/// <reference path="./missing.js" />\nvar first = "a repeated string long enough to alias";\nvar second = "a repeated string long enough to alias";\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length);
    assertValidOutput(t, result);
});
test('insertion after CRLF-terminated shebang', (t) => {
    const source = '#!/usr/bin/env node\r\nvar a = "profitable string for CRLF test";\nvar b = "profitable string for CRLF test";\n';
    const result = TerserCompanion(source);
    t.true(result.startsWith('#!/usr/bin/env node\r\nconst '), 'alias declaration immediately follows shebang');
    t.true(result.length < source.length);
    assertValidOutput(t, result);
});
test('bare unterminated shebang returns unchanged', (t) => {
    const source = '#!/usr/bin/env node';
    const result = TerserCompanion(source);
    t.is(result, source);
});
test('bijective base-52 aliases a..z, A..Z, aa, ab, …, aA', (t) => {
    const candidateCount = 79;
    const lines = [];
    for (let iL1 = 0; iL1 < candidateCount; iL1++) {
        const index = iL1.toString().padStart(3, '0');
        const longString = 'base52_candidate_' + index + '_' + 'x'.repeat(24);
        lines.push('const holder' + index + 'Left = "' + longString + '";');
        lines.push('const holder' + index + 'Right = "' + longString + '";');
    }
    const source = lines.join('\n') + '\n';
    const result = TerserCompanion(source);
    const constEnd = result.indexOf(';');
    const declaration = result.slice(0, constEnd);
    const aliasesDeclared = declaration.replace('const ', '').split(',').map((part) => part.split('=')[0]);
    t.is(aliasesDeclared.length, candidateCount, 'all ' + candidateCount + ' candidates aliased');
    const lowercaseExpected = 'abcdefghijklmnopqrstuvwxyz';
    for (let iL1 = 0; iL1 < 26; iL1++) {
        t.is(aliasesDeclared[iL1], lowercaseExpected[iL1], 'alias ' + iL1 + ' is ' + lowercaseExpected[iL1]);
    }
    const uppercaseExpected = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let iL1 = 26; iL1 < 52; iL1++) {
        t.is(aliasesDeclared[iL1], uppercaseExpected[iL1 - 26], 'alias ' + iL1 + ' is ' + uppercaseExpected[iL1 - 26]);
    }
    t.is(aliasesDeclared[52], 'aa', 'alias 52 is aa');
    t.is(aliasesDeclared[78], 'aA', 'alias 78 is aA');
    t.true(result.length < source.length, 'output shorter than input');
    assertValidOutput(t, result);
    t.is(TerserCompanion(source), result, 'deterministic output');
});
test('uppercase alias collision with existing A skips to B', (t) => {
    const preamble = 'var A = 0;\n';
    const candidateCount = 27;
    const lines = [];
    for (let iL1 = 0; iL1 < candidateCount; iL1++) {
        const index = iL1.toString().padStart(2, '0');
        const longString = 'uppercase_collision_candidate_' + index + '_' + 'x'.repeat(24);
        lines.push('const holder' + index + 'Left = "' + longString + '";');
        lines.push('const holder' + index + 'Right = "' + longString + '";');
    }
    const source = preamble + lines.join('\n') + '\n';
    const result = TerserCompanion(source);
    const constEnd = result.indexOf(';');
    const declaration = result.slice(0, constEnd);
    const aliasesDeclared = declaration.replace('const ', '').split(',').map((part) => part.split('=')[0]);
    t.is(aliasesDeclared.length, candidateCount, 'all ' + candidateCount + ' candidates aliased');
    const lowercaseExpected = 'abcdefghijklmnopqrstuvwxyz';
    for (let iL1 = 0; iL1 < 26; iL1++) {
        t.is(aliasesDeclared[iL1], lowercaseExpected[iL1], 'alias ' + iL1 + ' is ' + lowercaseExpected[iL1]);
    }
    t.is(aliasesDeclared[26], 'B', 'alias 26 is B (A was skipped)');
    t.false(aliasesDeclared.includes('A'), 'alias list must not contain A');
    t.true(result.length < source.length, 'output shorter than input');
    assertValidOutput(t, result);
});
test('CaseClause string literals are aliased with leading separator', (t) => {
    const source = 'switch(e){case"Array":f();break;case"Array":g();break;case"Array":h();break;case"Array":i()}';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output must be shorter than input');
    const caseAliasCount = (result.match(/\bcase [a-z]:/g) || []).length;
    t.is(caseAliasCount, 4, 'all four clauses must use alias with space after case');
    const fusedCase = result.match(/\bcase[a-z]:/g);
    t.falsy(fusedCase, 'no fused case<alias>: token');
    const literalCount = (result.match(/"Array"/g) || []).length;
    t.is(literalCount, 1, 'original literal must appear exactly once');
    assertValidOutput(t, result);
    const parsed = ts.createSourceFile('verify.js', result, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let caseClauseCount = 0;
    function countClauses(node) {
        if (ts.isCaseClause(node)) {
            caseClauseCount++;
        }
        ts.forEachChild(node, countClauses);
    }
    countClauses(parsed);
    t.is(caseClauseCount, 4, 'output must contain exactly four CaseClause nodes');
});
test('typeof left boundary requires separator space', (t) => {
    const literal = 'left_boundary_test_repeated_literal_string_xyz';
    const source = [
        'x=typeof"' + literal + '";',
        'y=typeof"' + literal + '";',
        'z=typeof"' + literal + '";',
        'w=typeof"' + literal + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output must be shorter than input');
    const typeOfAliasCount = (result.match(/\btypeof [a-z];/g) || []).length;
    t.is(typeOfAliasCount, 4, 'all four typeof expressions must have space before alias');
    const fusedTypeof = result.match(/\btypeof[a-z];/g);
    t.falsy(fusedTypeof, 'no fused typeof<alias> token');
    assertValidOutput(t, result);
});
test('"…" in expression right boundary requires separator space', (t) => {
    const literal = 'right_boundary_test_repeated_literal_string_xyz';
    const source = [
        'x="' + literal + '"in a;',
        'y="' + literal + '"in b;',
        'z="' + literal + '"in c;',
        'w="' + literal + '"in d;'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output must be shorter than input');
    const aliasInCount = (result.match(/\b[a-z] in [a-z];/g) || []).length;
    t.is(aliasInCount, 4, 'all four in-expressions must have space between alias and in');
    const fusedIn = result.match(/\b[a-z]in [a-z];/g);
    t.falsy(fusedIn, 'no fused <alias>in token');
    assertValidOutput(t, result);
});
test('mixed contexts apply separators per occurrence', (t) => {
    const literal = 'mixed_context_test_repeated_literal_string_xyz';
    const source = [
        'x="' + literal + '";',
        'y="' + literal + '";',
        'switch(e){case"' + literal + '":f();break;case"' + literal + '":g();break}'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    const literalPattern = new RegExp('"' + literal + '"', 'g');
    const literalCount = (result.match(literalPattern) || []).length;
    t.is(literalCount, 1, 'original literal must appear exactly once');
    t.true(result.length < source.length, 'output must be shorter than input');
    assertValidOutput(t, result);
});
test('separator cost deduction rejects break-even case', (t) => {
    const source = 'switch(x){case"abcdefghijk":case"abcdefghijk":break}';
    t.is(TerserCompanion(source), source, 'break-even case must remain unchanged');
});
test('exact declaration-cost one-character saving', (t) => {
    const source = 'x="abcdefghij";y="abcdefghij";';
    const result = TerserCompanion(source);
    t.is(result, 'const a="abcdefghij";x=a;y=a;', 'output must match exact expected alias form');
    t.true(result.length < source.length, 'output must be strictly shorter than input');
    assertValidOutput(t, result);
});
test('direct delete operand remains literal while safe occurrences alias', (t) => {
    const literal = 'a repeated delete literal long enough for alias';
    const source = [
        'var a = "' + literal + '";',
        'var b = "' + literal + '";',
        'var c = "' + literal + '";',
        'var d = delete"' + literal + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter');
    t.true(result.includes('delete"' + literal + '"'), 'delete operand remains literal');
    const literalCount = (result.match(new RegExp('"' + literal + '"', 'g')) || []).length;
    t.is(literalCount, 2, 'literal appears exactly twice: alias initializer plus delete operand');
    assertValidOutput(t, result);
});
test('with statement combined with profitable candidates returns unchanged', (t) => {
    const source = 'with( obj ) {\nvar a = "repeated long profitable string which should remain";\nvar b = "repeated long profitable string which should remain";\n}\n';
    t.is(TerserCompanion(source), source);
});
test('direct eval with profitable candidate returns unchanged', (t) => {
    const source = 'eval( "code" );\nvar a = "a long profitable repeated string that would otherwise be aliased";\nvar b = "a long profitable repeated string that would otherwise be aliased";\n';
    t.is(TerserCompanion(source), source);
});
test('parenthesized direct eval with profitable candidate returns unchanged', (t) => {
    const source = '( eval )( "code" );\nvar a = "a long profitable repeated string that would otherwise be aliased too";\nvar b = "a long profitable repeated string that would otherwise be aliased too";\n';
    t.is(TerserCompanion(source), source);
});
test('indirect eval, property eval, optional eval, and Function still transform candidates', (t) => {
    const tests = [
        {
            description: 'comma-indirect eval',
            source: '(0,eval)( "x" );\nvar a = "a long enough repeated string for comma eval";\nvar b = "a long enough repeated string for comma eval";\n'
        },
        {
            description: 'globalThis.eval',
            source: 'globalThis.eval( "x" );\nvar a = "a long enough repeated string for global eval";\nvar b = "a long enough repeated string for global eval";\n'
        },
        {
            description: 'optional eval',
            source: 'eval?.( "x" );\nvar a = "a long enough repeated string for optional eval";\nvar b = "a long enough repeated string for optional eval";\n'
        },
        {
            description: 'Function',
            source: 'Function( "x" );\nvar a = "a long enough repeated string for Function test";\nvar b = "a long enough repeated string for Function test";\n'
        },
        {
            description: 'new Function',
            source: 'new Function( "x" );\nvar a = "a long enough repeated string for new Function test";\nvar b = "a long enough repeated string for new Function test";\n'
        }
    ];
    const cL1 = tests.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        const { description, source } = tests[iL1];
        t.true(TerserCompanion(source).length < source.length, description + ' must be transformed');
    }
});
test('direct require and require.resolve first argument remains literal', (t) => {
    const literal = 'a-very-long-module-name-for-require-protection-test';
    const source = [
        'var mod1 = require( "' + literal + '" );',
        'var mod2 = require( "' + literal + '" );',
        'var safe = "' + literal + '";',
        'var safe2 = "' + literal + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter (safe occurrences aliased)');
    const requirePattern = new RegExp('require\\( "' + literal + '" \\)', 'g');
    const requireMatchCount = (result.match(requirePattern) || []).length;
    t.is(requireMatchCount, 2, 'both require( "literal" ) calls retain the literal first argument');
    assertValidOutput(t, result);
});
test('require.resolve first argument remains literal while safe occurrences alias', (t) => {
    const literal = 'a-very-long-resolve-target-for-require-dot-resolve-test';
    const source = [
        'var path1 = require.resolve( "' + literal + '" );',
        'var path2 = require.resolve( "' + literal + '" );',
        'var safe = "' + literal + '";',
        'var safe2 = "' + literal + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter (safe occurrences aliased)');
    const resolvePattern = new RegExp('require\\.resolve\\( "' + literal + '" \\)', 'g');
    const resolveMatchCount = (result.match(resolvePattern) || []).length;
    t.is(resolveMatchCount, 2, 'both require.resolve( "literal" ) calls retain the literal first argument');
    assertValidOutput(t, result);
});
test('indirect require is not protected, same string aliases', (t) => {
    const literal = 'a-string-that-appears-in-both-indirect-require-and-safe-contexts';
    const source = [
        '(0,require)( "' + literal + '" );',
        '(0,require)( "' + literal + '" );',
        'var safe = "' + literal + '";',
        'var safe2 = "' + literal + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter (indirect require not protected)');
    assertValidOutput(t, result);
});
test('independent same-root function candidates', (t) => {
    const source = [
        'var a0 = Math.floor( 1.5 );', 'var a1 = Math.floor( 2.5 );',
        'var a2 = Math.floor( 3.5 );', 'var a3 = Math.floor( 4.5 );',
        'var a4 = Math.floor( 5.5 );', 'var a5 = Math.floor( 6.5 );',
        'var b0 = Math.round( 1.5 );', 'var b1 = Math.round( 2.5 );',
        'var b2 = Math.round( 3.5 );', 'var b3 = Math.round( 4.5 );',
        'var b4 = Math.round( 5.5 );', 'var b5 = Math.round( 6.5 );'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter');
    const floorInits = (result.match(/\bMath\.floor\b/g) || []).length;
    t.is(floorInits, 1, 'Math.floor appears only in the declaration initializer');
    const roundInits = (result.match(/\bMath\.round\b/g) || []).length;
    t.is(roundInits, 1, 'Math.round appears only in the declaration initializer');
    assertValidOutput(t, result);
});
test('class root takes precedence over overlapping function path', (t) => {
    const source = [
        'var a = Array.isArray( x );', 'var b = Array.from( y );',
        'var c = Array.isArray( z );', 'var d = Array.from( w );',
        'var e = Math.floor( 1.5 );', 'var f = Math.floor( 2.5 );',
        'var g = Math.floor( 3.5 );', 'var h = Math.floor( 4.5 );',
        'var i = Math.floor( 5.5 );', 'var j = Math.floor( 6.5 );'
    ].join('\n') + '\n';
    const result = TerserCompanion(source, {
        functionsToAlias: ['Array.from', 'Math.floor'],
        classesToAlias: ['Array']
    });
    t.true(result.length < source.length, 'output shorter');
    t.regex(result, /[a-z]+=Array\b/, 'Array is a root-class alias');
    t.regex(result, /[a-z]+=Math\.floor\b/, 'Math.floor is an independent exact alias');
    const arrayFromInit = result.match(/\bconst\s+[a-z]+=Array\.from\b/);
    t.falsy(arrayFromInit, 'Array.from is not an independent initializer');
    assertValidOutput(t, result);
});
test('reverse-alphabetical encounter-order tiebreak replaces localeCompare', (t) => {
    const source = [
        'var z = "zzzz_really_really_long_profitable_repeated";',
        'var z2 = "zzzz_really_really_long_profitable_repeated";',
        'var a = "aaaa_really_really_long_profitable_repeated";',
        'var a2 = "aaaa_really_really_long_profitable_repeated";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter');
    const constStartR = result.indexOf('const ');
    const declEndR = result.indexOf(';\n', constStartR);
    const declR = result.slice(constStartR, declEndR);
    const zzzzInDecl = (declR.match(/"zzzz_really_really_long_profitable_repeated"/g) || []).length;
    t.is(zzzzInDecl, 1, 'zzzz initializer appears exactly once in declaration');
    const aaaaInDeclR = (declR.match(/"aaaa_really_really_long_profitable_repeated"/g) || []).length;
    t.is(aaaaInDeclR, 1, 'aaaa initializer appears exactly once in declaration');
    const zzzzTotal = (result.match(/"zzzz_really_really_long_profitable_repeated"/g) || []).length;
    t.is(zzzzTotal, 1, 'zzzz literal appears exactly once in output');
    const aaaaTotalR = (result.match(/"aaaa_really_really_long_profitable_repeated"/g) || []).length;
    t.is(aaaaTotalR, 1, 'aaaa literal appears exactly once in output');
    t.true(declR.indexOf('zzzz') < declR.indexOf('aaaa'), 'zzzz initializer precedes aaaa in declaration');
    assertValidOutput(t, result);
});
test('plain source: first Math.floor starts at insertion point 0', (t) => {
    const source = 'Math.floor(1.5);var b=Math.floor(2.5);var c=Math.floor(3.5);var d=Math.floor(4.5);';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter');
    t.false(/^aconst/.test(result), 'no aconst... fusion');
    assertValidOutput(t, result);
});
test('directive followed immediately by Math.floor calls', (t) => {
    const source = '"use strict";Math.floor(1.5);var b=Math.floor(2.5);var c=Math.floor(3.5);var d=Math.floor(4.5);';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter');
    t.true(result.startsWith('"use strict";const '), 'declaration after directive');
    assertValidOutput(t, result);
});
test('import declaration followed immediately by Math.floor calls', (t) => {
    const source = 'import x from"y";Math.floor(1.5);var b=Math.floor(2.5);var c=Math.floor(3.5);var d=Math.floor(4.5);';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter');
    t.true(result.startsWith('import x from"y";const '), 'declaration after import');
    assertValidOutput(t, result);
});
test('shebang newline followed immediately by Math.floor calls', (t) => {
    const source = '#!/usr/bin/env node\nMath.floor(1.5);var b=Math.floor(2.5);var c=Math.floor(3.5);var d=Math.floor(4.5);';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter');
    t.true(result.startsWith('#!/usr/bin/env node\nconst '), 'declaration after shebang newline');
    assertValidOutput(t, result);
});
test('require first argument literal is preserved verbatim', (t) => {
    const literal = 'a-very-long-module-name-for-require-protection-test';
    const source = [
        'var mod1 = require( "' + literal + '" );',
        'var mod2 = require( "' + literal + '" );',
        'var safe = "' + literal + '";',
        'var safe2 = "' + literal + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter (safe occurrences aliased)');
    const requirePattern = new RegExp('require\\( "' + literal + '" \\)', 'g');
    const requireMatchCount = (result.match(requirePattern) || []).length;
    t.is(requireMatchCount, 2, 'both require( "literal" ) calls retain the literal in output');
    assertValidOutput(t, result);
});
test('require.resolve first argument literal is preserved verbatim', (t) => {
    const literal = 'a-very-long-resolve-target-for-require-dot-resolve-test';
    const source = [
        'var path1 = require.resolve( "' + literal + '" );',
        'var path2 = require.resolve( "' + literal + '" );',
        'var safe = "' + literal + '";',
        'var safe2 = "' + literal + '";'
    ].join('\n') + '\n';
    const result = TerserCompanion(source);
    t.true(result.length < source.length, 'output shorter (safe occurrences aliased)');
    const resolvePattern = new RegExp('require\\.resolve\\( "' + literal + '" \\)', 'g');
    const resolveMatchCount = (result.match(resolvePattern) || []).length;
    t.is(resolveMatchCount, 2, 'both require.resolve( "literal" ) calls retain the literal in output');
    assertValidOutput(t, result);
});
test('non-direct require forms still alias the first string argument', (t) => {
    const literal = 'a-very-long-repeated-literal-for-non-direct-require-test';
    const tests = [
        {
            description: 'parenthesized require',
            source: '( require )( "' + literal + '" );\n( require )( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'optional require call',
            source: 'require?.( "' + literal + '" );\nrequire?.( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'property-based require',
            source: 'globalThis.require( "' + literal + '" );\nglobalThis.require( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'comma-indirect require',
            source: '(0,require)( "' + literal + '" );\n(0,require)( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'later argument of direct require',
            source: 'require( "other", "' + literal + '" );\nrequire( "other", "' + literal + '" );\nvar a = "' + literal + '";\n'
        }
    ];
    const cL1 = tests.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        const { description, source } = tests[iL1];
        t.true(TerserCompanion(source).length < source.length, description + ' must be transformed');
    }
});
test('non-direct require.resolve forms still alias the first string argument', (t) => {
    const literal = 'a-very-long-repeated-literal-for-non-direct-resolve-test';
    const tests = [
        {
            description: 'parenthesized require.resolve',
            source: '( require.resolve )( "' + literal + '" );\n( require.resolve )( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'optional property require?.resolve',
            source: 'require?.resolve( "' + literal + '" );\nrequire?.resolve( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'optional call require.resolve?.',
            source: 'require.resolve?.( "' + literal + '" );\nrequire.resolve?.( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'property-based require.resolve',
            source: 'foo.require.resolve( "' + literal + '" );\nfoo.require.resolve( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'comma-indirect require.resolve',
            source: '(0,require.resolve)( "' + literal + '" );\n(0,require.resolve)( "' + literal + '" );\nvar a = "' + literal + '";\n'
        },
        {
            description: 'later argument of direct require.resolve',
            source: 'require.resolve( "other", "' + literal + '" );\nrequire.resolve( "other", "' + literal + '" );\nvar a = "' + literal + '";\n'
        }
    ];
    const cL1 = tests.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        const { description, source } = tests[iL1];
        t.true(TerserCompanion(source).length < source.length, description + ' must be transformed');
    }
});
test('config-order tiebreak for exact functions with equal lengths and counts', (t) => {
    const source = [
        'var a = Alfa.run( 1 );', 'var b = Alfa.run( 2 );', 'var c = Alfa.run( 3 );',
        'var d = Alfa.run( 4 );', 'var e = Alfa.run( 5 );', 'var f = Alfa.run( 6 );',
        'var g = Zulu.run( 1 );', 'var h = Zulu.run( 2 );', 'var i = Zulu.run( 3 );',
        'var j = Zulu.run( 4 );', 'var k = Zulu.run( 5 );', 'var l = Zulu.run( 6 );'
    ].join('\n') + '\n';
    const result = TerserCompanion(source, {
        functionsToAlias: ['Zulu.run', 'Alfa.run']
    });
    t.true(result.length < source.length, 'output shorter');
    const constStartF = result.indexOf('const ');
    const declEndF = result.indexOf(';\n', constStartF);
    const declF = result.slice(constStartF, declEndF);
    const zuluInDecl = (declF.match(/\bZulu\.run\b/g) || []).length;
    t.is(zuluInDecl, 1, 'Zulu.run initializer appears exactly once in declaration');
    const alfaInDecl = (declF.match(/\bAlfa\.run\b/g) || []).length;
    t.is(alfaInDecl, 1, 'Alfa.run initializer appears exactly once in declaration');
    const zuluTotal = (result.match(/\bZulu\.run\b/g) || []).length;
    t.is(zuluTotal, 1, 'Zulu.run appears exactly once in output');
    const alfaTotal = (result.match(/\bAlfa\.run\b/g) || []).length;
    t.is(alfaTotal, 1, 'Alfa.run appears exactly once in output');
    t.true(declF.indexOf('Zulu.run') < declF.indexOf('Alfa.run'), 'Zulu.run initializer precedes Alfa.run per config order');
    assertValidOutput(t, result);
});
test('config-order tiebreak for class roots with equal lengths and counts', (t) => {
    const source = [
        'var a = AlfaRoot.fn( 1 );', 'var b = AlfaRoot.fn( 2 );', 'var c = AlfaRoot.fn( 3 );',
        'var d = AlfaRoot.fn( 4 );', 'var e = AlfaRoot.fn( 5 );', 'var f = AlfaRoot.fn( 6 );',
        'var g = ZuluRoot.fn( 1 );', 'var h = ZuluRoot.fn( 2 );', 'var i = ZuluRoot.fn( 3 );',
        'var j = ZuluRoot.fn( 4 );', 'var k = ZuluRoot.fn( 5 );', 'var l = ZuluRoot.fn( 6 );'
    ].join('\n') + '\n';
    const result = TerserCompanion(source, {
        classesToAlias: ['ZuluRoot', 'AlfaRoot']
    });
    t.true(result.length < source.length, 'output shorter');
    const constStartC = result.indexOf('const ');
    const declEndC = result.indexOf(';\n', constStartC);
    const declC = result.slice(constStartC, declEndC);
    const zuluRootInDecl = (declC.match(/\bZuluRoot\b/g) || []).length;
    t.is(zuluRootInDecl, 1, 'ZuluRoot initializer appears exactly once in declaration');
    const alfaRootInDecl = (declC.match(/\bAlfaRoot\b/g) || []).length;
    t.is(alfaRootInDecl, 1, 'AlfaRoot initializer appears exactly once in declaration');
    const zuluRootTotal = (result.match(/\bZuluRoot\b/g) || []).length;
    t.is(zuluRootTotal, 1, 'ZuluRoot appears exactly once in output');
    const alfaRootTotal = (result.match(/\bAlfaRoot\b/g) || []).length;
    t.is(alfaRootTotal, 1, 'AlfaRoot appears exactly once in output');
    t.true(declC.indexOf('ZuluRoot') < declC.indexOf('AlfaRoot'), 'ZuluRoot initializer precedes AlfaRoot per config order');
    assertValidOutput(t, result);
});
