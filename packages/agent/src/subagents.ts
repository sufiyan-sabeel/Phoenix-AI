import type { ChatModel, ToolDefinition } from '@phoenix/ai';
import type {
  AgentEngine,
  AgentMode,
  AgentPlan,
  StepResult,
  ToolExecutor,
} from './types.js';
import { DefaultAgentEngine } from './engine.js';
import { getModeConfig, isModeTransitionAllowed } from './modes.js';

export interface ChildAgent {
  id: string;
  engine: AgentEngine;
  mode: AgentMode;
  status: 'idle' | 'running' | 'completed' | 'failed';
  result?: StepResult;
  error?: string;
}

export interface SubAgentTask {
  id: string;
  description: string;
  mode: AgentMode;
  tools?: string[];
  input: string;
}

export interface SubAgentResult {
  taskId: string;
  childId: string;
  output: string;
  error?: string;
  completedAt: number;
}

export interface OrchestrationResult {
  results: SubAgentResult[];
  aggregated: string;
  success: boolean;
  errors: string[];
}

export function spawnChild(
  parentEngine: AgentEngine,
  mode: AgentMode,
  tools: ToolDefinition[],
  task: string
): ChildAgent {
  const parentMode = parentEngine.getMode();
  if (!isModeTransitionAllowed(parentMode, mode)) {
    throw new Error(
      `Mode transition from ${parentMode} to ${mode} is not allowed`
    );
  }
  const modeConfig = getModeConfig(mode);
  const allowedTools = tools.filter(t => modeConfig.allowedTools.includes(t.name));
  const childEngine = new DefaultAgentEngine({
    model: createChildModel(parentEngine),
    tools: allowedTools,
    mode,
  });
  return {
    id: `child_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    engine: childEngine,
    mode,
    status: 'idle',
  };
}

function createChildModel(_parentEngine: AgentEngine): ChatModel {
  return {
    async chat(options) {
      return {
        content: `[Child agent processing: ${options.messages[options.messages.length - 1]?.content?.substring(0, 100) ?? ''}]`,
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    },
    async *chatStream(options) {
      yield {
        delta: `[Child agent processing: ${options.messages[options.messages.length - 1]?.content?.substring(0, 100) ?? ''}]`,
        finishReason: 'stop',
      };
    },
  };
}

export async function coordinateChildren(
  parentEngine: AgentEngine,
  tasks: SubAgentTask[],
  tools: ToolDefinition[]
): Promise<OrchestrationResult> {
  const results: SubAgentResult[] = [];
  const errors: string[] = [];
  let allSuccess = true;
  const taskGroups = groupTasksByDependency(tasks);
  for (const group of taskGroups) {
    const childPromises = group.map(async task => {
      const child = spawnChild(parentEngine, task.mode, tools, task.input);
      child.status = 'running';
      try {
        const result = await child.engine.executeStep(task.input);
        child.status = result.error ? 'failed' : 'completed';
        child.result = result;
        if (result.error) {
          child.error = result.error;
          allSuccess = false;
          errors.push(`Task ${task.id} failed: ${result.error}`);
        }
        return {
          taskId: task.id,
          childId: child.id,
          output: result.output,
          error: result.error,
          completedAt: Date.now(),
        };
      } catch (error) {
        child.status = 'failed';
        child.error = error instanceof Error ? error.message : String(error);
        allSuccess = false;
        errors.push(`Task ${task.id} error: ${child.error}`);
        return {
          taskId: task.id,
          childId: child.id,
          output: '',
          error: child.error,
          completedAt: Date.now(),
        };
      }
    });
    const groupResults = await Promise.all(childPromises);
    results.push(...groupResults);
  }
  const aggregated = aggregateResults(results);
  return {
    results,
    aggregated,
    success: allSuccess,
    errors,
  };
}

function groupTasksByDependency(tasks: SubAgentTask[]): SubAgentTask[][] {
  const independent: SubAgentTask[] = [];
  const dependent: SubAgentTask[] = [];
  for (const task of tasks) {
    if (task.mode === 'reviewer' || task.mode === 'tester') {
      dependent.push(task);
    } else {
      independent.push(task);
    }
  }
  const groups: SubAgentTask[][] = [];
  if (independent.length > 0) groups.push(independent);
  if (dependent.length > 0) groups.push(dependent);
  return groups.length > 0 ? groups : [tasks];
}

function aggregateResults(results: SubAgentResult[]): string {
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  const parts: string[] = [];
  if (successful.length > 0) {
    parts.push(`Successfully completed ${successful.length} task(s):`);
    for (const r of successful) {
      parts.push(`  - ${r.taskId}: ${r.output.substring(0, 200)}`);
    }
  }
  if (failed.length > 0) {
    parts.push(`Failed ${failed.length} task(s):`);
    for (const r of failed) {
      parts.push(`  - ${r.taskId}: ${r.error}`);
    }
  }
  return parts.join('\n');
}

export async function handoffResult(
  sourceChild: ChildAgent,
  targetEngine: AgentEngine,
  context: string
): Promise<StepResult> {
  const sourceResult = sourceChild.result;
  if (!sourceResult) {
    return {
      output: '',
      toolCalls: [],
      done: true,
      error: 'Source child has no result to hand off',
    };
  }
  const handoffMessage = `Context from previous step (${sourceChild.mode} agent):
${context}

Result:
${sourceResult.output}

Continue working on this task.`;
  return targetEngine.executeStep(handoffMessage);
}

export function getAggregatedPlanResults(plan: AgentPlan): string {
  const parts: string[] = [`Goal: ${plan.goal}`, `Status: ${plan.status}`, ''];
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    parts.push(`Step ${i + 1}:`);
    parts.push(`  Input: ${step.input.substring(0, 100)}`);
    parts.push(`  Output: ${step.output.substring(0, 200)}`);
    if (step.toolCalls.length > 0) {
      parts.push(`  Tool calls: ${step.toolCalls.map(tc => tc.name).join(', ')}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}
