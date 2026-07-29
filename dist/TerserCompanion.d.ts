export interface TerserCompanionOptions {
    functionsToAlias?: readonly string[];
    classesToAlias?: readonly string[];
}
export default function TerserCompanion(source: string, options?: TerserCompanionOptions): string;
