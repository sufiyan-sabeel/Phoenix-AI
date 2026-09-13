import chalk from 'chalk';
import { getConfigValue } from './config.js';

let useColor = true;

export function initOutput(): void {
  if (process.env.NO_COLOR === '1' || process.env.NO_COLOR === 'true') {
    useColor = false;
  }
  const configColor = getConfigValue<boolean>('ui.color');
  if (configColor === false) {
    useColor = false;
  }
}

export function disableColor(): void {
  useColor = false;
}

function c(color: typeof chalk): typeof chalk {
  return useColor ? color : (chalk as unknown as { [key: string]: (s: string) => string });
}

export function printBanner(): void {
  const banner = `
  ████████╗██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██╗  ██╗ ██████╗ ██████╗ 
  ╚══██╔══╝██║  ██║██║   ██║██╔══██╗██╔════╝██╔══██╗██║  ██║██╔═══██╗██╔══██╗
     ██║   ███████║██║   ██║██████╔╝█████╗  ██████╔╝███████║██║   ██║██████╔╝
     ██║   ██╔══██║██║   ██║██╔═══╝ ██╔══╝  ██╔══██╗██╔══██║██║   ██║██╔══██╗
     ██║   ██║  ██║╚██████╔╝██║     ███████╗██║  ██║██║  ██║╚██████╔╝██║  ██║
     ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝`;
  
  console.log(c(chalk.cyan)(banner));
  console.log(c(chalk.dim)('  AI Agent Platform v0.1.0\n'));
}

export function printToken(token: string): void {
  process.stdout.write(token);
}

export function printToolCall(toolCall: { name: string; arguments?: Record<string, unknown> }): void {
  const name = c(chalk.yellow)(`⚡ ${toolCall.name}`);
  const args = toolCall.arguments ? c(chalk.dim)(JSON.stringify(toolCall.arguments, null, 2)) : '';
  
  console.log(`\n${name}`);
  if (args) {
    console.log(c(chalk.dim)(args));
  }
}

export function printToolResult(toolName: string, result: unknown): void {
  const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const truncated = output.length > 500 ? output.slice(0, 500) + '...' : output;
  
  console.log(c(chalk.green)(`✓ ${toolName} completed`));
  if (truncated) {
    console.log(c(chalk.dim)(truncated));
  }
}

export function printError(error: string | Error): void {
  const message = error instanceof Error ? error.message : error;
  console.error(c(chalk.red)(`✗ Error: ${message}`));
}

export function printSuccess(message: string): void {
  console.log(c(chalk.green)(`✓ ${message}`));
}

export function printWarning(message: string): void {
  console.log(c(chalk.yellow)(`⚠ ${message}`));
}

export function printInfo(message: string): void {
  console.log(c(chalk.blue)(`ℹ ${message}`));
}

export function printStatus(status: 'success' | 'error' | 'warning' | 'info' | 'pending', message: string): void {
  const icons: Record<string, string> = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    pending: '◌',
  };
  
  const colors: Record<string, typeof chalk.green> = {
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    pending: chalk.dim,
  };
  
  console.log(c(colors[status])(`${icons[status]} ${message}`));
}

export function printSection(title: string): void {
  console.log(`\n${c(chalk.bold)(title)}`);
  console.log(c(chalk.dim)('─'.repeat(50)));
}

export function printKeyValue(key: string, value: string | number | boolean): void {
  const formattedValue = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  console.log(`  ${c(chalk.dim)(key + ':')} ${c(chalk.white)(formattedValue)}`);
}

export function printTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map(r => r[i]?.length ?? 0));
    return Math.max(h.length, maxRow);
  });
  
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  console.log(c(chalk.bold)(headerLine));
  console.log(c(chalk.dim)(colWidths.map(w => '─'.repeat(w)).join('  ')));
  
  for (const row of rows) {
    const line = row.map((cell, i) => (cell ?? '').padEnd(colWidths[i])).join('  ');
    console.log(line);
  }
}

export function printJSON(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printEmpty(): void {
  console.log('');
}
