import schedule from "node-schedule";
import { BackupEngine, BackupTask } from "./backupEngine";

interface ScheduledJob {
  taskId: string;
  job: schedule.Job;
  cronExpression: string;
}

export class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private engine: BackupEngine | null = null;

  init(engine: BackupEngine): void {
    this.engine = engine;
  }

  scheduleTask(task: BackupTask): void {
    if (!task.schedule || !this.engine) return;

    this.cancelTask(task.id);

    const job = schedule.scheduleJob(task.schedule, async () => {
      try {
        await this.engine!.executeBackup(task);
      } catch (err) {
        console.error(`Scheduled backup failed for task "${task.name}":`, err);
      }
    });

    if (job) {
      this.jobs.set(task.id, { taskId: task.id, job, cronExpression: task.schedule });
    }
  }

  cancelTask(taskId: string): void {
    const existing = this.jobs.get(taskId);
    if (existing) {
      existing.job.cancel();
      this.jobs.delete(taskId);
    }
  }

  cancelAll(): void {
    for (const [, scheduled] of this.jobs) {
      scheduled.job.cancel();
    }
    this.jobs.clear();
  }

  getJobs(): { taskId: string; cronExpression: string; nextInvocation: Date | null }[] {
    return Array.from(this.jobs.values()).map((s) => ({
      taskId: s.taskId,
      cronExpression: s.cronExpression,
      nextInvocation: s.job.nextInvocation(),
    }));
  }
}
