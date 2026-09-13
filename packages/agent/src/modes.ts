import type { AgentMode, ModeConfig } from './types.js';

const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  planner: {
    name: 'planner',
    systemPrompt: `You are a planning agent. Your role is to analyze goals and create detailed step-by-step plans.
Break down complex tasks into manageable steps. Consider dependencies, risks, and prerequisites.
Output a structured plan with clear steps, each with a specific objective and expected outcome.
Do not execute any code or make changes - only plan.`,
    allowedTools: ['search', 'read_file', 'list_directory'],
    exitCriteria: 'A complete plan with all steps defined and dependencies mapped',
    maxSteps: 10,
  },
  builder: {
    name: 'builder',
    systemPrompt: `You are a builder agent. Your role is to implement code and create files based on a plan.
Write clean, well-structured code following best practices. Create files, modify existing code, and implement features.
Always verify your work by running type checks and tests when available.
Focus on correctness, readability, and maintainability.`,
    allowedTools: [
      'write_file',
      'edit_file',
      'read_file',
      'run_command',
      'search',
      'list_directory',
    ],
    exitCriteria: 'All planned changes implemented and verified with type checks',
    maxSteps: 50,
  },
  reviewer: {
    name: 'reviewer',
    systemPrompt: `You are a reviewer agent. Your role is to review code changes and provide feedback.
Check for correctness, security issues, performance problems, and style violations.
Provide specific, actionable feedback with line references.
Suggest improvements but do not make changes directly.`,
    allowedTools: ['read_file', 'search', 'list_directory', 'run_command'],
    exitCriteria: 'Review complete with all issues identified and categorized by severity',
    maxSteps: 20,
  },
  tester: {
    name: 'tester',
    systemPrompt: `You are a testing agent. Your role is to create and run tests.
Write comprehensive unit tests, integration tests, and edge case tests.
Ensure good test coverage and meaningful assertions.
Run tests and report results with clear pass/fail status.`,
    allowedTools: [
      'write_file',
      'edit_file',
      'read_file',
      'run_command',
      'search',
      'list_directory',
    ],
    exitCriteria: 'All tests written and passing with good coverage',
    maxSteps: 30,
  },
  debugger: {
    name: 'debugger',
    systemPrompt: `You are a debugging agent. Your role is to diagnose and fix issues.
Analyze error messages, stack traces, and logs to identify root causes.
Trace through code to understand the issue before making changes.
Fix the problem with minimal changes and verify the fix works.`,
    allowedTools: [
      'read_file',
      'edit_file',
      'run_command',
      'search',
      'list_directory',
    ],
    exitCriteria: 'Issue identified, fix applied, and verification tests passing',
    maxSteps: 25,
  },
};

export function getModeConfig(mode: AgentMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

export function getAllModes(): ModeConfig[] {
  return Object.values(MODE_CONFIGS);
}

export function isModeTransitionAllowed(from: AgentMode, to: AgentMode): boolean {
  const transitions: Record<AgentMode, AgentMode[]> = {
    planner: ['builder', 'reviewer'],
    builder: ['reviewer', 'tester', 'debugger'],
    reviewer: ['builder', 'debugger'],
    tester: ['debugger', 'reviewer'],
    debugger: ['builder', 'reviewer', 'tester'],
  };
  return transitions[from].includes(to);
}

export function suggestNextMode(currentMode: AgentMode, lastResult: string): AgentMode {
  const lowerResult = lastResult.toLowerCase();
  if (lowerResult.includes('error') || lowerResult.includes('fail') || lowerResult.includes('bug')) {
    return 'debugger';
  }
  if (lowerResult.includes('test') || lowerResult.includes('coverage')) {
    return 'tester';
  }
  if (lowerResult.includes('review') || lowerResult.includes('issue')) {
    return 'reviewer';
  }
  if (lowerResult.includes('implement') || lowerResult.includes('create') || lowerResult.includes('build')) {
    return 'builder';
  }
  if (lowerResult.includes('plan') || lowerResult.includes('analyze')) {
    return 'planner';
  }
  const defaults: Record<AgentMode, AgentMode> = {
    planner: 'builder',
    builder: 'reviewer',
    reviewer: 'builder',
    tester: 'reviewer',
    debugger: 'builder',
  };
  return defaults[currentMode];
}
