/**
 * InterviewIO -- abstraction over terminal I/O for testability.
 * Production uses node:readline/promises. Tests inject createMockIO.
 *
 * Mirrors provider-core's io.ts.
 */

import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export interface InterviewIO {
  question(prompt: string): Promise<string>;
  select(prompt: string, options: string[]): Promise<number>;
  confirm(prompt: string): Promise<boolean>;
  display(text: string): void;
  close(): void;
}

export function createTerminalIO(): InterviewIO {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const io: InterviewIO = {
    async question(prompt: string): Promise<string> {
      const answer = await rl.question(prompt);
      return answer.trim();
    },

    async select(prompt: string, options: string[]): Promise<number> {
      const display = options.map((opt, i) => `  ${i + 1}. ${opt}`).join('\n');
      const answer = await rl.question(`${prompt}\n${display}\n> `);
      const index = parseInt(answer, 10) - 1;
      if (isNaN(index) || index < 0 || index >= options.length) {
        return io.select(prompt, options);
      }
      return index;
    },

    async confirm(prompt: string): Promise<boolean> {
      const answer = await rl.question(`${prompt} (y/n) `);
      return answer.toLowerCase().startsWith('y');
    },

    display(text: string): void {
      console.log(text);
    },

    close(): void {
      rl.close();
    },
  };

  return io;
}

export function createMockIO(responses: string[]): InterviewIO & { getOutput(): string[] } {
  let idx = 0;
  const output: string[] = [];

  return {
    async question(): Promise<string> {
      return responses[idx++] || '';
    },

    async select(_prompt: string, options: string[]): Promise<number> {
      const answer = parseInt(responses[idx++] || '0', 10);
      return Math.min(answer, options.length - 1);
    },

    async confirm(): Promise<boolean> {
      return (responses[idx++] || 'n').toLowerCase().startsWith('y');
    },

    display(text: string): void {
      output.push(text);
    },

    close(): void { /* no-op */ },

    getOutput(): string[] {
      return output;
    },
  };
}
