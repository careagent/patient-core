// Vendored YAML parser -- bundled by tsdown into dist output.
// The yaml package (ISC license) is zero-dependency.
// This exists so YAML parsing is centralized and replaceable.
//
// IMPORTANT: `yaml` is listed as a devDependency because tsdown inlines it
// into the dist bundle at build time. The published package has zero runtime
// dependencies. If you import this source directly (e.g. via path aliases in
// a monorepo), ensure `yaml` is installed or the import will fail.
export { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
