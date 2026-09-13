import type { ChatModel, ChatOptions, ChatResponse, StreamChunk, ToolDefinition } from '@phoenix/ai';
import type {
  AgentEngine,
  AgentMode,
  AgentContext,
  AgentStep,
  AgentPlan,
  StepResult,
} from './types.js';

interface OhMyPiConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

interface OhMyPiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface OhMyPiMessage {
  role: string;
  content: string;
}

interface OhMyPiRequest {
  messages: OhMyPiMessage[];
  tools?: OhMyPiTool[];
  model?: string;
}

interface OhMyPiResponse {
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface OhMyPiAgent {
  chat(request: OhMyPiRequest): Promise<OhMyPiResponse>;
  chatStream(request: OhMyPiRequest): AsyncGenerator<OhMyPiResponse>;
}

let ohMyPiModule: {
  createAgent: (config: OhMyPiConfig) => OhMyPiAgent;
} | null = null;

async function loadOhMyPi(): Promise<typeof ohMyPiModule> {
  if (ohMyPiModule) return ohMyPiModule;
  try {
    const mod = await import('@oh-my-pi/pi-agent-core');
    ohMyPiModule = mod as typeof ohMyPiModule;
    return ohMyPiModule;
  } catch {
    return null;
  }
}

function isOhMyPiAvailable(): boolean {
  return process.env.PHOENIX_ENGINE === 'oh-my-pi';
}

function mapToolsToOhMyPi(tools: ToolDefinition[]): OhMyPiTool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

function mapMessagesToOhMyPi(
  messages: Array<{ role: string; content: string }>
): OhMyPiMessage[] {
  return messages
    .filter(m => m.role !== 'tool')
    .map(m => ({
      role: m.role,
      content: m.content,
    }));
}

function mapResponseFromOhMyPi(response: OhMyPiResponse): ChatResponse {
  return {
    content: response.content ?? '',
    toolCalls: (response.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.name,
      arguments: JSON.stringify(tc.arguments),
    })),
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    },
  };
}

export class OhMyPiAdapter implements AgentEngine {
  private agent: OhMyPiAgent | null = null;
  private mode: AgentMode = 'planner';
  private context: AgentContext;
  private tools: ToolDefinition[] = [];
  private model: ChatModel | null = null;

  constructor(config?: OhMyPiConfig) {
    this.context = {
      messages: [],
      plan: null,
      mode: this.mode,
      availableTools: [],
      workingMemory: '',
      history: [],
    };
    if (config) {
      this.init(config).catch(() => {
        // initialization failed, will use fallback
      });
    }
  }

  private async init(config: OhMyPiConfig): Promise<void> {
    const mod = await loadOhMyPi();
    if (mod) {
      this.agent = mod.createAgent({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
      });
    }
  }

  setFallbackModel(model: ChatModel): void {
    this.model = model;
  }

  async executeStep(input: string): Promise<StepResult> {
    if (this.agent && isOhMyPiAvailable()) {
      return this.executeStepWithOhMyPi(input);
    }
    if (this.model) {
      return this.executeStepWithFallback(input);
    }
    return {
      output: '',
      toolCalls: [],
      done: true,
      error: 'No engine available: oh-my-pi not loaded and no fallback model set',
    };
  }

  private async executeStepWithOhMyPi(input: string): Promise<StepResult> {
    this.context.messages.push({ role: 'user', content: input, toolCalls: [] });
    const ohMyPiTools = mapToolsToOhMyPi(this.tools);
    const ohMyPiMessages = mapMessagesToOhMyPi(this.context.messages);
    try {
      const response = await this.agent!.chat({
        messages: ohMyPiMessages,
        tools: ohMyPiTools.length > 0 ? ohMyPiTools : undefined,
      });
      const mapped = mapResponseFromOhMyPi(response);
      const step: AgentStep = {
        input,
        output: mapped.content,
        toolCalls: mapped.toolCalls,
        toolResults: [],
        reasoning: '',
        timestamp: Date.now(),
      };
      this.context.history.push(step);
      this.context.messages.push({ role: 'assistant', content: mapped.content, toolCalls: mapped.toolCalls });
      return {
        output: mapped.content,
        toolCalls: mapped.toolCalls,
        done: mapped.toolCalls.length === 0,
      };
    } catch (error) {
      return {
        output: '',
        toolCalls: [],
        done: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeStepWithFallback(input: string): Promise<StepResult> {
    this.context.messages.push({ role: 'user', content: input, toolCalls: [] });
    try {
      const response = await this.model!.chat({
        model: '',
        messages: this.context.messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content: m.content,
          toolCalls: m.toolCalls,
        })),
        tools: this.tools.length > 0 ? this.tools : undefined,
      });
      const step: AgentStep = {
        input,
        output: response.content,
        toolCalls: response.toolCalls,
        toolResults: [],
        reasoning: '',
        timestamp: Date.now(),
      };
      this.context.history.push(step);
      this.context.messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
      return {
        output: response.content,
        toolCalls: response.toolCalls,
        done: response.toolCalls.length === 0,
      };
    } catch (error) {
      return {
        output: '',
        toolCalls: [],
        done: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async executePlan(goal: string): Promise<AgentPlan> {
    const plan: AgentPlan = {
      goal,
      steps: [],
      status: 'in_progress',
      currentStep: 0,
      maxSteps: 50,
    };
    let currentInput = goal;
    let stepCount = 0;
    while (stepCount < plan.maxSteps) {
      const result = await this.executeStep(currentInput);
      plan.steps.push({
        input: currentInput,
        output: result.output,
        toolCalls: result.toolCalls,
        toolResults: [],
        reasoning: '',
        timestamp: Date.now(),
      });
      plan.currentStep = stepCount + 1;
      if (result.error) {
        plan.status = 'failed';
        break;
      }
      if (result.done) {
        plan.status = 'completed';
        break;
      }
      currentInput = `Continue. Previous: ${result.output.substring(0, 300)}`;
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
    return this.tools;
  }

  getContext(): AgentContext {
    return { ...this.context };
  }
}

export async function createOhMyPiEngine(
  config?: OhMyPiConfig,
  fallbackModel?: ChatModel
): Promise<AgentEngine> {
  if (!isOhMyPiAvailable()) {
    if (fallbackModel) {
      const adapter = new OhMyPiAdapter(config);
      adapter.setFallbackModel(fallbackModel);
      return adapter;
    }
    throw new Error(
      'oh-my-pi engine not available. Set PHOENIX_ENGINE=oh-my-pi or provide a fallback model.'
    );
  }
  const adapter = new OhMyPiAdapter(config);
  if (fallbackModel) {
    adapter.setFallbackModel(fallbackModel);
  }
  return adapter;
}
