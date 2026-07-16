export interface TerserCompanionOptions {
    /** Exact function paths whose call expressions may be aliased. */
    functionsToAlias?: readonly string[];
    /** Roots whose static method calls may share one alias. */
    classesToAlias?: readonly string[];
}
/**
 * Moves profitable repeated string literals and whitelisted call targets into
 * one top-level const declaration. Alias names are assigned as a..z, aa..zz,
 * and so on. Existing identifiers and reserved words are skipped.
 */
export default function TerserCompanion(source: string, options?: TerserCompanionOptions): string;
