export type CronJobStatus = "active" | "paused" | "error" | "disabled" | "unknown";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  schedule_human: string;
  command: string;
  description: string;
  status: CronJobStatus;
  last_run: string | null;
  next_run: string | null;
  enabled: boolean;
  source_file: string;
  created_at: string;
  updated_at: string;
}

export interface CronJobListResponse {
  jobs: CronJob[];
  total: number;
  source: string;
}
