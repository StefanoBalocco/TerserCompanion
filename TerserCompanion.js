import ts from 'typescript';
const defaultFunctionsToAlias = [
    'Date.now',
    'JSON.parse',
    'JSON.stringify',
    'Math.floor',
    'Math.max',
    'Math.min',
    'Math.round',
    'Number.isFinite',
    'Number.isInteger',
    'Number.isNaN',
    'Object.assign',
    'Object.entries',
    'Object.keys',
    'Object.values',
    'RegExp',
    'Reflect.get',
    'Reflect.has',
    'Reflect.ownKeys',
    'Reflect.set',
    'String.fromCharCode',
    'String.fromCodePoint'
];
const defaultClassesToAlias = [
    'Array',
    'Promise'
];
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
const config = {
    sourceFileName: 'source.js',
    minimumAliasOccurrences: 2,
    perCandidateDeclarationOverhead: 2,
    fixedAliasDeclarationOverhead: 7,
    aliasAlphabetSize: 26,
    aliasFirstCharacterCode: 97
};
/**
 * Moves profitable repeated string literals and whitelisted call targets into
 * one top-level const declaration. Alias names are assigned as a..z, aa..zz,
 * and so on. Existing identifiers and reserved words are skipped.
 */
export default function TerserCompanion(source, options = {}) {
    const functionsToAliasRaw = options.functionsToAlias ?? defaultFunctionsToAlias;
    const classesToAliasRaw = options.classesToAlias ?? defaultClassesToAlias;
    // Deduplicate preserving first-seen order via Set insertion order
    const functionsToAlias = [...new Set(functionsToAliasRaw)];
    const classesToAlias = [...new Set(classesToAliasRaw)];
    // Overlap: remove function paths whose root is also in classesToAlias
    const classRoots = new Set(classesToAlias);
    const filteredFunctionsToAlias = functionsToAlias.filter((path) => {
        const dotIndex = path.indexOf('.');
        const root = (0 <= dotIndex) ? path.substring(0, dotIndex) : path;
        return !classRoots.has(root);
    });
    const sourceFile = ts.createSourceFile(config.sourceFileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    // In-memory TypeScript Program over the single .js source for syntactic
    // diagnostics that reject TS-only grammar in ScriptKind.JS mode.
    const compilerOptions = {
        allowJs: true,
        noEmit: true,
        noLib: true,
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext
    };
    const host = ts.createCompilerHost(compilerOptions, false);
    host.getSourceFile = (fileName) => {
        return ((config.sourceFileName === fileName) ? sourceFile : undefined);
    };
    host.fileExists = (fileName) => config.sourceFileName === fileName;
    host.getCanonicalFileName = (fileName) => fileName;
    host.getCurrentDirectory = () => '';
    host.getNewLine = () => '\n';
    host.useCaseSensitiveFileNames = () => true;
    const program = ts.createProgram([config.sourceFileName], compilerOptions, host);
    let diagnostics = [...program.getSyntacticDiagnostics(sourceFile)];
    const { identifiers, bindings, hasJsx, jsxStart, jsxLength, hasNamespaceExport, namespaceExportStart, namespaceExportLength, hasDecorator, decoratorStart, decoratorLength } = collectIdentifiersAndBindings(sourceFile);
    if (hasJsx) {
        diagnostics.push({
            file: sourceFile,
            start: jsxStart,
            length: jsxLength,
            messageText: 'JSX syntax is not valid in JavaScript source files.',
            category: ts.DiagnosticCategory.Error,
            code: 9999
        });
    }
    if (hasNamespaceExport) {
        diagnostics.push({
            file: sourceFile,
            start: namespaceExportStart,
            length: namespaceExportLength,
            messageText: 'Namespace export declarations are not valid in JavaScript source files.',
            category: ts.DiagnosticCategory.Error,
            code: 9999
        });
    }
    if (hasDecorator) {
        diagnostics.push({
            file: sourceFile,
            start: decoratorStart,
            length: decoratorLength,
            messageText: 'Decorators are not valid in JavaScript source files.',
            category: ts.DiagnosticCategory.Error,
            code: 9999
        });
    }
    let returnValue = source;
    if (0 < diagnostics.length) {
        throw new Error(ts.formatDiagnostics(diagnostics, host));
    }
    else {
        const candidates = collectCandidates(sourceFile, bindings, filteredFunctionsToAlias, classesToAlias);
        // Inline compareCandidates
        candidates.sort((left, right) => {
            let comparison = right.count - left.count;
            if (0 === comparison) {
                comparison = right.priorityLength - left.priorityLength;
            }
            if (0 === comparison) {
                comparison = right.replacedLength - left.replacedLength;
            }
            if (0 === comparison) {
                comparison = left.key.localeCompare(right.key);
            }
            return comparison;
        });
        const aliases = generateAliases(candidates.length, identifiers);
        const insertion = findInsertion(source, sourceFile);
        const selected = selectCandidates(candidates, aliases, config.fixedAliasDeclarationOverhead + insertion.prefix.length);
        if (0 < selected.length) {
            const transformed = applyCandidates(source, selected, insertion);
            if (transformed.length < source.length) {
                returnValue = transformed;
            }
        }
    }
    return returnValue;
}
/**
 * Single AST traversal that collects all identifiers, declared bindings,
 * JSX presence, namespace export declarations, and decorators.
 */
function collectIdentifiersAndBindings(sourceFile) {
    const identifiers = new Set();
    const bindings = new Set();
    let hasJsx = false;
    let jsxStart = 0;
    let jsxLength = 0;
    let hasNamespaceExport = false;
    let namespaceExportStart = 0;
    let namespaceExportLength = 0;
    let hasDecorator = false;
    let decoratorStart = 0;
    let decoratorLength = 0;
    function addBindingName(name) {
        if (ts.isIdentifier(name)) {
            bindings.add(name.text);
        }
        else {
            const cL1 = name.elements.length;
            for (let iL1 = 0; iL1 < cL1; iL1++) {
                const element = name.elements[iL1];
                if (!ts.isOmittedExpression(element)) {
                    addBindingName(element.name);
                }
            }
        }
    }
    function visit(node) {
        if (ts.isIdentifier(node)) {
            identifiers.add(node.text);
        }
        if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
            addBindingName(node.name);
        }
        else if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isEnumDeclaration(node)) {
            if (node.name) {
                bindings.add(node.name.text);
            }
        }
        else if (ts.isImportClause(node)) {
            if (node.name) {
                bindings.add(node.name.text);
            }
        }
        else if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node) || ts.isImportEqualsDeclaration(node)) {
            bindings.add(node.name.text);
        }
        else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
            bindings.add(node.name.text);
        }
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
            if (!hasJsx) {
                hasJsx = true;
                jsxStart = node.getStart(sourceFile);
                jsxLength = node.end - node.getStart(sourceFile);
            }
        }
        if (ts.isNamespaceExportDeclaration(node)) {
            if (!hasNamespaceExport) {
                hasNamespaceExport = true;
                namespaceExportStart = node.getStart(sourceFile);
                namespaceExportLength = node.end - node.getStart(sourceFile);
            }
        }
        if (ts.SyntaxKind.Decorator === node.kind) {
            if (!hasDecorator) {
                hasDecorator = true;
                decoratorStart = node.getStart(sourceFile);
                decoratorLength = node.end - node.getStart(sourceFile);
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return {
        identifiers,
        bindings,
        hasJsx,
        jsxStart,
        jsxLength,
        hasNamespaceExport,
        namespaceExportStart,
        namespaceExportLength,
        hasDecorator,
        decoratorStart,
        decoratorLength
    };
}
function collectCandidates(sourceFile, bindings, functionsToAlias, classesToAlias) {
    const strings = new Map();
    const functionOccurrences = new Map();
    const classOccurrences = new Map();
    const functionSet = new Set(functionsToAlias);
    const classSet = new Set(classesToAlias);
    const roots = new Set();
    const returnValue = [];
    // Extract root identifiers for function paths
    const cL1 = functionsToAlias.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        const path = functionsToAlias[iL1];
        const dotIndex = path.indexOf('.');
        const root = (0 <= dotIndex) ? path.substring(0, dotIndex) : path;
        roots.add(root);
    }
    const cL2 = classesToAlias.length;
    for (let iL2 = 0; iL2 < cL2; iL2++) {
        roots.add(classesToAlias[iL2]);
    }
    const blockedRoots = new Set();
    for (const binding of bindings) {
        if (roots.has(binding)) {
            blockedRoots.add(binding);
        }
    }
    function addOccurrence(map, key, occurrence) {
        let occurrences = map.get(key);
        if (!occurrences) {
            occurrences = [];
            map.set(key, occurrences);
        }
        occurrences.push(occurrence);
    }
    function visit(node, parent) {
        if (ts.isStringLiteral(node) && !isUnsafeStringLiteral(node, parent)) {
            let candidate = strings.get(node.text);
            if (!candidate) {
                candidate = {
                    text: node.text,
                    occurrences: []
                };
                strings.set(node.text, candidate);
            }
            candidate.occurrences.push({
                start: node.getStart(sourceFile),
                end: node.end
            });
        }
        if (ts.isCallExpression(node) && !node.questionDotToken) {
            const callee = node.expression;
            if (ts.isIdentifier(callee)) {
                const path = callee.text;
                if (functionSet.has(path) && !blockedRoots.has(path)) {
                    // Bare function identifier: root = path
                    addOccurrence(functionOccurrences, path, {
                        start: callee.getStart(sourceFile),
                        end: callee.end
                    });
                }
            }
            else if (ts.isPropertyAccessExpression(callee) && !callee.questionDotToken) {
                // Walk the property access chain to find the leftmost
                // identifier and build the full dotted path.
                const pathParts = [];
                let currentExpr = callee;
                while (ts.isPropertyAccessExpression(currentExpr) && !currentExpr.questionDotToken) {
                    pathParts.unshift(currentExpr.name.text);
                    currentExpr = currentExpr.expression;
                }
                if (ts.isIdentifier(currentExpr)) {
                    const root = currentExpr.text;
                    pathParts.unshift(root);
                    const fullPath = pathParts.join('.');
                    if (!blockedRoots.has(root)) {
                        if (functionSet.has(fullPath)) {
                            // Root-based aliasing: record root identifier span,
                            // grouping all whitelisted root.method calls under
                            // the same root key.
                            addOccurrence(functionOccurrences, root, {
                                start: currentExpr.getStart(sourceFile),
                                end: currentExpr.end
                            });
                        }
                        else if (classSet.has(root)) {
                            addOccurrence(classOccurrences, root, {
                                start: currentExpr.getStart(sourceFile),
                                end: currentExpr.end
                            });
                        }
                    }
                }
            }
        }
        ts.forEachChild(node, (child) => visit(child, node));
    }
    visit(sourceFile, undefined);
    for (const [, candidate] of strings) {
        if (config.minimumAliasOccurrences <= candidate.occurrences.length) {
            const initializer = quoteString(candidate.text);
            returnValue.push(createCandidate('string', 'string:' + candidate.text, initializer, candidate.occurrences));
        }
    }
    // Build function candidates: iterate functionsToAlias, deduplicate by root
    const processedFunctionRoots = new Set();
    const cL3 = functionsToAlias.length;
    for (let iL3 = 0; iL3 < cL3; iL3++) {
        const path = functionsToAlias[iL3];
        const dotIndex = path.indexOf('.');
        const root = (0 <= dotIndex) ? path.substring(0, dotIndex) : path;
        if (!processedFunctionRoots.has(root)) {
            processedFunctionRoots.add(root);
            const occurrences = functionOccurrences.get(root);
            if (occurrences && config.minimumAliasOccurrences <= occurrences.length) {
                returnValue.push(createCandidate('function', 'function:' + root, root, occurrences));
            }
        }
    }
    const cL4 = classesToAlias.length;
    for (let iL4 = 0; iL4 < cL4; iL4++) {
        const root = classesToAlias[iL4];
        const occurrences = classOccurrences.get(root);
        if (occurrences && config.minimumAliasOccurrences <= occurrences.length) {
            returnValue.push(createCandidate('class', 'class:' + root, root, occurrences));
        }
    }
    return returnValue;
}
function createCandidate(kind, key, initializer, occurrences) {
    let replacedLength = 0;
    const cL1 = occurrences.length;
    for (let iL1 = 0; iL1 < cL1; iL1++) {
        replacedLength += occurrences[iL1].end - occurrences[iL1].start;
    }
    return {
        kind,
        key,
        initializer,
        occurrences,
        count: occurrences.length,
        replacedLength,
        priorityLength: initializer.length
    };
}
/**
 * Determines whether a string literal is in a position where aliasing would
 * be unsafe: directives, import/export specifiers, dynamic-import arguments,
 * import attributes, element-access keys, binding-element property names, and
 * declaration names (property names, methods, class members, etc.).
 */
function isUnsafeStringLiteral(node, parent) {
    let returnValue = false;
    if (parent) {
        if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
            returnValue = true;
        }
        else if (ts.isExpressionStatement(parent) && parent.expression === node) {
            returnValue = true;
        }
        else if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) {
            returnValue = true;
        }
        else if (ts.isCallExpression(parent) && ts.SyntaxKind.ImportKeyword === parent.expression.kind && parent.arguments[0] === node) {
            returnValue = true;
        }
        else if (ts.isImportAttribute(parent) && (parent.name === node || parent.value === node)) {
            returnValue = true;
        }
        else if (ts.isBindingElement(parent) && parent.propertyName === node) {
            returnValue = true;
        }
        else if ((ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) && (parent.name === node || parent.propertyName === node)) {
            returnValue = true;
        }
        // Folded isUnsafeDeclarationName checks — when the string literal is
        // used as a declaration name (property, method, class member, etc.)
        else if (ts.isPropertyAssignment(parent)
            || ts.isMethodDeclaration(parent)
            || ts.isPropertyDeclaration(parent)
            || ts.isGetAccessorDeclaration(parent)
            || ts.isSetAccessorDeclaration(parent)
            || ts.isPropertySignature(parent)
            || ts.isMethodSignature(parent)
            || ts.isEnumMember(parent)
            || ts.isModuleDeclaration(parent)) {
            returnValue = parent.name === node;
        }
    }
    return returnValue;
}
function quoteString(value) {
    const doubleQuoted = JSON.stringify(value);
    const singleQuoted = "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\u0008/g, '\\b').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\f/g, '\\f').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/[\u0000-\u0007\u000B\u000E-\u001F]/g, (character) => {
        const code = character.charCodeAt(0).toString(16).padStart(2, '0');
        return '\\x' + code;
    }) + "'";
    let returnValue = doubleQuoted;
    if (singleQuoted.length < doubleQuoted.length) {
        returnValue = singleQuoted;
    }
    return returnValue;
}
/**
 * Generates alias names (a, b, …, z, aa, ab, …) skipping any identifier
 * already present in the source or in the reserved-word set. The alias-from-
 * index encoding is inlined from the former aliasFromIndex helper.
 */
function generateAliases(count, identifiers) {
    const returnValue = [];
    let index = 0;
    while (returnValue.length < count) {
        // Inline aliasFromIndex
        let value = index;
        let alias = '';
        do {
            const digit = value % config.aliasAlphabetSize;
            alias = String.fromCharCode(config.aliasFirstCharacterCode + digit) + alias;
            value = Math.floor(value / config.aliasAlphabetSize) - 1;
        } while (0 <= value);
        if (!identifiers.has(alias) && !reservedIdentifiers.has(alias)) {
            returnValue.push(alias);
        }
        index++;
    }
    return returnValue;
}
/**
 * Dynamic-programming selection of candidates that maximise net length saving
 * under a fixed declaration cost. Candidate-value arithmetic is inlined from
 * the former getCandidateValue helper. Returns the selected candidates paired
 * with their assigned aliases, ordered by alias index.
 */
function selectCandidates(candidates, aliases, fixedDeclarationCost) {
    const count = candidates.length;
    const decisions = new Array(count + 1);
    let previous = new Float64Array(count + 1);
    let current = new Float64Array(count + 1);
    const returnValue = [];
    previous.fill(Number.NEGATIVE_INFINITY);
    previous[0] = 0;
    decisions[0] = new Uint8Array(count + 1);
    for (let candidateIndex = 1; candidateIndex <= count; candidateIndex++) {
        current.fill(Number.NEGATIVE_INFINITY);
        const decision = new Uint8Array(count + 1);
        const candidate = candidates[candidateIndex - 1];
        const maximumSelected = candidateIndex;
        current[0] = previous[0];
        for (let selectedCount = 1; selectedCount <= maximumSelected; selectedCount++) {
            const skippedValue = previous[selectedCount];
            const alias = aliases[selectedCount - 1];
            // Inline getCandidateValue:
            // value = replacedLength - initializer.length - 2 - (count + 1) * alias.length
            const candidateValue = candidate.replacedLength
                - candidate.initializer.length
                - config.perCandidateDeclarationOverhead
                - (candidate.count + 1) * alias.length;
            const takenValue = previous[selectedCount - 1] + candidateValue;
            current[selectedCount] = skippedValue;
            if (skippedValue < takenValue) {
                current[selectedCount] = takenValue;
                decision[selectedCount] = 1;
            }
        }
        decisions[candidateIndex] = decision;
        const swap = previous;
        previous = current;
        current = swap;
    }
    let bestSelectedCount = 0;
    let bestSaving = 0;
    for (let selectedCount = 1; selectedCount <= count; selectedCount++) {
        const saving = previous[selectedCount] - fixedDeclarationCost;
        if (bestSaving < saving) {
            bestSaving = saving;
            bestSelectedCount = selectedCount;
        }
    }
    if (0 < bestSelectedCount) {
        const selectedIndices = [];
        let selectedCount = bestSelectedCount;
        for (let candidateIndex = count; 0 < candidateIndex; candidateIndex--) {
            if (0 < selectedCount && 1 === decisions[candidateIndex][selectedCount]) {
                selectedIndices.push(candidateIndex - 1);
                selectedCount--;
            }
        }
        selectedIndices.reverse();
        const cL1 = selectedIndices.length;
        for (let iL1 = 0; iL1 < cL1; iL1++) {
            returnValue.push({
                candidate: candidates[selectedIndices[iL1]],
                alias: aliases[iL1]
            });
        }
    }
    return returnValue;
}
function applyCandidates(source, selected, insertion) {
    const replacements = [];
    const declarationParts = [];
    for (const item of selected) {
        declarationParts.push(item.alias + '=' + item.candidate.initializer);
        const cL1 = item.candidate.occurrences.length;
        for (let iL1 = 0; iL1 < cL1; iL1++) {
            const occurrence = item.candidate.occurrences[iL1];
            replacements.push({
                start: occurrence.start,
                end: occurrence.end,
                text: item.alias
            });
        }
    }
    replacements.sort((left, right) => right.start - left.start);
    let returnValue = source;
    const cL2 = replacements.length;
    for (let iL2 = 0; iL2 < cL2; iL2++) {
        const replacement = replacements[iL2];
        returnValue = returnValue.slice(0, replacement.start)
            + replacement.text
            + returnValue.slice(replacement.end);
    }
    const declaration = insertion.prefix + 'const ' + declarationParts.join(',') + ';\n';
    returnValue = returnValue.slice(0, insertion.point)
        + declaration
        + returnValue.slice(insertion.point);
    return returnValue;
}
/**
 * Finds the point in source where alias declarations should be inserted:
 * after a leading shebang line (if present), after any leading directive
 * prologue strings, and after any leading import declarations.
 */
function findInsertion(source, sourceFile) {
    let shebangEnd = 0;
    if (source.startsWith('#!')) {
        const cL1 = source.length;
        let foundTerminator = false;
        let iL1 = 2;
        while (iL1 < cL1 && !foundTerminator) {
            const ch = source[iL1];
            if ('\n' === ch || '\r' === ch) {
                shebangEnd = iL1 + 1;
                if ('\r' === ch && (iL1 + 1) < cL1 && '\n' === source[iL1 + 1]) {
                    shebangEnd = iL1 + 2;
                }
                foundTerminator = true;
            }
            iL1++;
        }
        if (!foundTerminator) {
            shebangEnd = source.length;
        }
    }
    let point = shebangEnd;
    let scanning = true;
    let prefix = '';
    for (const statement of sourceFile.statements) {
        if (scanning) {
            if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
                point = statement.end;
            }
            else if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
                point = statement.end;
            }
            else {
                scanning = false;
            }
        }
    }
    if (shebangEnd < point && ';' !== source[point - 1]) {
        prefix = ';\n';
    }
    else if (source.startsWith('#!') && source.length === shebangEnd && !source.endsWith('\n')) {
        prefix = '\n';
    }
    return {
        point,
        prefix
    };
}
//# sourceMappingURL=TerserCompanion.js.map