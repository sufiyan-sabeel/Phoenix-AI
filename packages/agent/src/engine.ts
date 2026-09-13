import type { ChatModel, ChatMessage, ToolDefinition, ToolCall } from '@phoenix/ai';
import type {
  AgentEngine,
  AgentMode,
  AgentContext,
  AgentStep,
  AgentPlan,
  StepResult,
  ToolResult,
  ToolExecutor,
} from './types.js';
import { getModeConfig } from './modes.js';

const MAX_CONTEXT_TOKENS = 120000;
const TOKENS_PER_CHAR = 0.25;

export interface EngineConfig {
  model: ChatModel;
  toolExecutor?: ToolExecutor;
  tools?: ToolDefinition[];
  mode?: AgentMode;
  maxSteps?: number;
  contextWindowLimit?: number;
}

export class DefaultAgentEngine implements AgentEngine {
  private model: ChatModel;
  private toolExecutor: ToolExecutor | null;
  private mode: AgentMode;
  private context: AgentContext;
  private maxSteps: number;
  private contextWindowLimit: number;

  constructor(config: EngineConfig) {
    this.model = config.model;
    this.toolExecutor = config.toolExecutor ?? null;
    this.mode = config.mode ?? 'planner';
    this.maxSteps = config.maxSteps ?? 50;
    this.contextWindowLimit = config.contextWindowLimit ?? MAX_CONTEXT_TOKENS;
    this.context = {
      messages: [],
      plan: null,
      mode: this.mode,
      availableTools: config.tools ?? [],
      workingMemory: '',
      history: [],
    };
  }

  async executeStep(input: string): Promise<StepResult> {
    const modeConfig = getModeConfig(this.mode);
    const allowedTools = this.context.availableTools.filter(t =>
      modeConfig.allowedTools.includes(t.name)
    );
    this.context.messages.push({ role: 'user', content: input });
    this.trimContext();
    const systemMessage: ChatMessage = {
      role: 'system',
      content: this.buildSystemPrompt(modeConfig.systemPrompt),
    };
    const messages = [systemMessage, ...this.context.messages];
    try {
      const response = await this.model.chat({
        model: this.model.constructor.name,
        messages,
        tools: allowedTools.length > 0 ? allowedTools : undefined,
        temperature: 0.3,
      });
      const toolResults: ToolResult[] = [];
      if (response.toolCalls.length > 0 && this.toolExecutor) {
        for (const tc of response.toolCalls) {
          const result = await this.executeToolCall(tc);
          toolResults.push(result);
          this.context.messages.push({
            role: 'tool',
            content: result.error ?? result.result,
            toolCallId: tc.id,
          });
        }
      }
      const step: AgentStep = {
        input,
        output: response.content,
        toolCalls: response.toolCalls,
        toolResults,
        reasoning: this.extractReasoning(response.content),
        timestamp: Date.now(),
      };
      this.context.history.push(step);
      this.context.messages.push({ role: 'assistant', content: response.content });
      const done = response.toolCalls.length === 0 || this.context.history.length >= modeConfig.maxSteps;
      return {
        output: response.content,
        toolCalls: response.toolCalls,
        done,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        output: '',
        toolCalls: [],
        done: true,
        error: errorMsg,
      };
    }
  }

  async executePlan(goal: string): Promise<AgentPlan> {
    const modeConfig = getModeConfig(this.mode);
    const plan: AgentPlan = {
      goal,
      steps: [],
      status: 'in_progress',
      currentStep: 0,
      maxSteps: this.maxSteps,
    };
    this.context.plan = plan;
    let currentInput = goal;
    let stepCount = 0;
    while (stepCount < plan.maxSteps) {
      const stepResult = await this.executeStep(currentInput);
      plan.steps.push({
        input: currentInput,
        output: stepResult.output,
        toolCalls: stepResult.toolCalls,
        toolResults: [],
        reasoning: this.extractReasoning(stepResult.output),
        timestamp: Date.now(),
      });
      plan.currentStep = stepCount + 1;
      if (stepResult.error) {
        plan.status = 'failed';
        break;
      }
      if (stepResult.done) {
        plan.status = 'completed';
        break;
      }
      currentInput = this.generateFollowUp(stepResult.output, modeConfig.exitCriteria);
      stepCount++;
    }
    if (stepCount >= plan.maxSteps && plan.status === 'in_progress') {
      plan.status = 'completed';
    }
    return plan;
  }

  getMode(): AgentMode {
    return this.mode;
  }

  setMode(mode: AgentMode): void {
    this.mode = mode;
    this.context.mode = mode;
  }

  getTools(): ToolDefinition[] {
    return this.context.availableTools;
  }

  getContext(): AgentContext {
    return { ...this.context };
  }

  private buildSystemPrompt(basePrompt: string): string {
    const memorySection = this.context.workingMemory
      ? `\n\nWorking Memory:\n${this.context.workingMemory}`
      : '';
    const historySummary = this.context.history.length > 0
      ? `\n\nPrevious steps completed: ${this.context.history.length}`
      : '';
    return `${basePrompt}${memorySection}${historySummary}`;
  }

  private async executeToolCall(tc: ToolCall): Promise<ToolResult> {
    if (!this.toolExecutor) {
      return {
        toolCallId: tc.id,
        name: tc.name,
        result: '',
        error: 'No tool executor configured',
      };
    }
    try {
      const args = JSON.parse(tc.arguments);
      const result = await this.toolExecutor.execute(tc.name, args);
      return {
        toolCallId: tc.id,
        name: tc.name,
        result,
      };
    } catch (error) {
      return {
        toolCallId: tc.id,
        name: tc.name,
        result: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private extractReasoning(content: string): string {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      return thinkMatch[1].trim();
    }
    return '';
  }

  private generateFollowUp(output: string, exitCriteria: string): string {
    return `Previous step completed. Output: ${output.substring(0, 500)}...
    
Continue working. Exit criteria: ${exitCriteria}.
What is the next step to take?`;
  }

  private trimContext(): void {
    let totalChars = 0;
    for (const msg of this.context.messages) {
      totalChars += msg.content.length;
    }
    const estimatedTokens = totalChars * TOKENS_PER_CHAR;
    if (estimatedTokens > this.contextWindowLimit) {
      const excess = estimatedTokens - this.contextWindowLimit;
      const charsToTrim = Math.ceil(excess / TOKENS_PER_CHAR);
      let trimmed = 0;
      const newMessages: ChatMessage[] = [];
      for (let i = this.context.messages.length - 1; i >= 0; i--) {
        const msg = this.context.messages[i];
        if (trimmed >= charsToTrim) {
          newMessages.unshift(msg);
        } else {
          const msgChars = msg.content.length;
          if (trimmed + msgChars <= charsToTrim) {
            trimmed += msgChars;
          } else {
            const keepChars = msgChars - (charsToTrim - trimmed);
            newMessages.unshift({
              ...msg,
              content: msg.content.slice(keepChars),
            });
            trimmed = charsToTrim;
          }
        }
      }
      this.context.messages = newMessages;
    }
  }
}
