import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/vendor/**',
        // Stub modules -- future phase implementations (not testable yet)
        'src/credentials/**',
        'src/skills/**',
        'src/neuron/**',
        'src/protocol/**',
        'src/refinement/**',
        'src/onboarding/**',
        'src/chart/**',
        'src/cli/init-command.ts',
        'src/cli/status-command.ts',
        'src/cli/io.ts',
        'src/cli/prompts.ts',
        'src/activation/cans-schema.ts',
        'src/activation/cans-parser.ts',
        'src/activation/cans-integrity.ts',
        'src/audit/entry-schema.ts',
        'src/audit/writer.ts',
        'src/audit/integrity-service.ts',
        // Types-only and re-export modules (no executable code)
        'src/hardening/types.ts',
        'src/hardening/index.ts',
        'src/adapters/index.ts',
        'src/adapters/types.ts',
        'src/index.ts',
        // Entry points depend on Phase 2 activation gate -- active branches
        // untestable until ActivationGate is implemented (always returns inactive)
        'src/entry/core.ts',
        'src/entry/openclaw.ts',
        'src/entry/standalone.ts',
        // Audit pipeline is a Phase 3 stub (throws on all methods)
        'src/audit/pipeline.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
