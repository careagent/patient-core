import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/entry/openclaw.ts',
    'src/entry/standalone.ts',
    'src/entry/core.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['openclaw', 'openclaw/*'],
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
});
