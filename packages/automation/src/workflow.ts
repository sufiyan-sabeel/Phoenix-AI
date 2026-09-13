import { randomUUID } from 'node:crypto';
import type {
  Workflow,
  WorkflowStep,
  WorkflowRunResult,
  StepResult,
  Trigger,
} from './types.js';

export class WorkflowEngine {
  private workflows = new Map<string, Workflow>();
  private stepExecutors = new Map<string, StepExecutor>();

  createWorkflow(
    name: string,
    trigger: Trigger,
    steps: WorkflowStep[],
    description?: string
  ): Workflow {
    const id = `wf_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date();

    const workflow: Workflow = {
      id,
      name,
      description,
      trigger,
      steps,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    this.workflows.set(id, workflow);
    return workflow;
  }

  updateWorkflow(id: string, updates: Partial<Omit<Workflow, 'id' | 'createdAt'>>): Workflow | null {
    const workflow = this.workflows.get(id);
    if (!workflow) return null;

    const updated: Workflow = {
      ...workflow,
      ...updates,
      updatedAt: new Date(),
    };

    this.workflows.set(id, updated);
    return updated;
  }

  deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  registerStepExecutor(type: string, executor: StepExecutor): void {
    this.stepExecutors.set(type, executor);
  }

  async executeWorkflow(id: string, triggerData: Record<string, unknown>): Promise<WorkflowRunResult> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow is disabled: ${id}`);
    }

    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const result: WorkflowRunResult = {
      workflowId: id,
      runId,
      startedAt: new Date(),
      status: 'running',
      stepResults: [],
    };

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const stepResult = await this.executeStep(step, i, triggerData, result);
        result.stepResults.push(stepResult);

        if (stepResult.status === 'failed') {
          if (step.onError === 'stop' || step.onError === undefined) {
            result.status = 'failed';
            result.error = stepResult.error;
            result.completedAt = new Date();
            return result;
          }

          if (step.onError === 'retry' && step.retryCount) {
            let retrySuccess = false;
            for (let r = 0; r < step.retryCount; r++) {
              await this.sleep(step.retryDelay ?? 1000);
              const retryResult = await this.executeStep(step, i, triggerData, result);
              if (retryResult.status === 'completed') {
                result.stepResults[result.stepResults.length - 1] = retryResult;
                retrySuccess = true;
                break;
              }
            }
            if (!retrySuccess) {
              result.status = 'failed';
              result.error = `Step ${i} failed after ${step.retryCount} retries`;
              result.completedAt = new Date();
              return result;
            }
          }
        }
      }

      result.status = 'completed';
      result.completedAt = new Date();
      workflow.lastRun = new Date();
      return result;
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      result.completedAt = new Date();
      return result;
    }
  }

  private async executeStep(
    step: WorkflowStep,
    index: number,
    triggerData: Record<string, unknown>,
    runResult: WorkflowRunResult
  ): Promise<StepResult> {
    const startTime = Date.now();

    const executor = this.stepExecutors.get(step.type);
    if (!executor) {
      return {
        stepIndex: index,
        type: step.type,
        status: 'failed',
        error: `No executor registered for step type: ${step.type}`,
        duration: Date.now() - startTime,
      };
    }

    try {
      const result = await executor.execute(step.config, triggerData, runResult);
      return {
        stepIndex: index,
        type: step.type,
        status: 'completed',
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        stepIndex: index,
        type: step.type,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export interface StepExecutor {
  execute(
    config: Record<string, unknown>,
    triggerData: Record<string, unknown>,
    runResult: WorkflowRunResult
  ): Promise<unknown>;
}