import ora, { type Ora } from 'ora';
import inquirer from 'inquirer';

export interface Spinner {
  start(text?: string): Spinner;
  stop(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  warn(text?: string): Spinner;
  info(text?: string): Spinner;
  setText(text: string): Spinner;
  isSpinning: boolean;
}

export function spinner(text: string): Spinner {
  const instance = ora({
    text,
    spinner: 'dots',
    color: 'cyan',
  });
  
  return {
    start: (t?: string) => { instance.start(t); return this as unknown as Spinner; },
    stop: () => { instance.stop(); return this as unknown as Spinner; },
    succeed: (t?: string) => { instance.succeed(t); return this as unknown as Spinner; },
    fail: (t?: string) => { instance.fail(t); return this as unknown as Spinner; },
    warn: (t?: string) => { instance.warn(t); return this as unknown as Spinner; },
    info: (t?: string) => { instance.info(t); return this as unknown as Spinner; },
    setText: (t: string) => { instance.text = t; return this as unknown as Spinner; },
    get isSpinning() { return instance.isSpinning; },
  } as Spinner;
}

export async function prompt(message: string, defaultValue?: string): Promise<string> {
  const { answer } = await inquirer.prompt([
    {
      type: 'input',
      name: 'answer',
      message,
      default: defaultValue,
    },
  ]);
  return answer;
}

export async function confirm(message: string, defaultValue = true): Promise<boolean> {
  const { answer } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'answer',
      message,
      default: defaultValue,
    },
  ]);
  return answer;
}

export async function select<T extends string>(
  message: string,
  choices: { name: string; value: T }[]
): Promise<T> {
  const { answer } = await inquirer.prompt([
    {
      type: 'list',
      name: 'answer',
      message,
      choices,
    },
  ]);
  return answer;
}

export async function multiSelect(
  message: string,
  choices: { name: string; value: string }[]
): Promise<string[]> {
  const { answer } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'answer',
      message,
      choices,
    },
  ]);
  return answer;
}

export async function password(message: string): Promise<string> {
  const { answer } = await inquirer.prompt([
    {
      type: 'password',
      name: 'answer',
      message,
      mask: '*',
    },
  ]);
  return answer;
}

export function progress(current: number, total: number, width = 30): string {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percent}%`;
}

export async function pager(content: string): Promise<void> {
  const lines = content.split('\n');
  const pageSize = process.stdout.rows - 3;
  
  for (let i = 0; i < lines.length; i += pageSize) {
    const page = lines.slice(i, i + pageSize).join('\n');
    console.log(page);
    
    if (i + pageSize < lines.length) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'More:',
          choices: [
            { name: 'Next page', value: 'next' },
            { name: 'Quit', value: 'quit' },
          ],
        },
      ]);
      
      if (action === 'quit') break;
    }
  }
}

export async function_editor(initialValue: string): Promise<string> {
  const { answer } = await inquirer.prompt([
    {
      type: 'editor',
      name: 'answer',
      message: 'Edit:',
      default: initialValue,
    },
  ]);
  return answer;
}

export async function checkbox(
  message: string,
  choices: { name: string; value: string; checked?: boolean }[]
): Promise<string[]> {
  const { answer } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'answer',
      message,
      choices,
    },
  ]);
  return answer;
}

export function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

export function moveToTop(): void {
  process.stdout.write('\x1B[H');
}

export function hideCursor(): void {
  process.stdout.write('\x1B[?25l');
}

export function showCursor(): void {
  process.stdout.write('\x1B[?25h');
}

export function terminalSize(): { width: number; height: number } {
  return {
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
  };
}
