use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::time::Duration;
use tokio::time::interval;
use chrono::{Timelike, Datelike, Local};
use crate::backup::{BackupTask, execute_backup};
use tauri::AppHandle;

#[derive(Clone, Debug)]
pub struct ScheduledJob {
    pub task_id: String,
    pub cron_expression: String,
    pub task: BackupTask,
}

pub struct Scheduler {
    jobs: Arc<Mutex<HashMap<String, ScheduledJob>>>,
}

impl Scheduler {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_loop(&self, app: AppHandle) {
        let jobs = self.jobs.clone();
        tauri::async_runtime::spawn(async move {
            // Align with the start of the next minute
            let now = Local::now();
            let seconds_to_wait = 60 - now.second();
            tokio::time::sleep(Duration::from_secs(seconds_to_wait as u64)).await;

            let mut ticker = interval(Duration::from_secs(60));
            loop {
                ticker.tick().await;
                let current_time = Local::now();
                let min = current_time.minute();
                let hour = current_time.hour();
                let day = current_time.day();
                let month = current_time.month();
                
                // Chrono weekday: Mon=0, Tue=1, ..., Sun=6
                // In node-schedule / standard cron: Sun=0 or 7, Mon=1, ..., Sat=6
                let chrono_wd = current_time.weekday().num_days_from_sunday(); // Sun=0, Mon=1, ..., Sat=6
                let dow = chrono_wd; 

                let tasks_to_run: Vec<BackupTask> = {
                    let mut matched = Vec::new();
                    let active_jobs = jobs.lock().unwrap();
                    for job in active_jobs.values() {
                        if cron_matches(&job.cron_expression, min, hour, day, month, dow) {
                            matched.push(job.task.clone());
                        }
                    }
                    matched
                };

                for task in tasks_to_run {
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = execute_backup(app_clone, task).await;
                    });
                }
            }
        });
    }

    pub fn schedule_task(&self, task: BackupTask) {
        if let Some(ref cron) = task.schedule {
            let mut active_jobs = self.jobs.lock().unwrap();
            active_jobs.insert(task.id.clone(), ScheduledJob {
                task_id: task.id.clone(),
                cron_expression: cron.clone(),
                task,
            });
        }
    }

    pub fn cancel_task(&self, task_id: &str) {
        let mut active_jobs = self.jobs.lock().unwrap();
        active_jobs.remove(task_id);
    }

    pub fn cancel_all(&self) {
        let mut active_jobs = self.jobs.lock().unwrap();
        active_jobs.clear();
    }

    pub fn get_jobs(&self) -> Vec<serde_json::Value> {
        let active_jobs = self.jobs.lock().unwrap();
        active_jobs.values().map(|j| {
            let next_run = estimate_next_run(&j.cron_expression);
            serde_json::json!({
                "taskId": j.task_id,
                "cronExpression": j.cron_expression,
                "nextInvocation": next_run,
            })
        }).collect()
    }
}

// Helper to match cron strings
fn cron_matches(cron: &str, min: u32, hour: u32, day: u32, month: u32, dow: u32) -> bool {
    let parts: Vec<&str> = cron.split_whitespace().collect();
    if parts.len() < 5 { return false; }
    
    let m_match = part_matches(parts[0], min);
    let h_match = part_matches(parts[1], hour);
    let d_match = part_matches(parts[2], day);
    let mo_match = part_matches(parts[3], month);
    let dow_match = part_matches(parts[4], dow);

    m_match && h_match && d_match && mo_match && dow_match
}

fn part_matches(part: &str, val: u32) -> bool {
    if part == "*" { return true; }
    if let Ok(num) = part.parse::<u32>() {
        return num == val;
    }
    if part.contains(',') {
        return part.split(',').any(|p| p.parse::<u32>().map(|n| n == val).unwrap_or(false));
    }
    false
}

fn estimate_next_run(cron: &str) -> Option<String> {
    let parts: Vec<&str> = cron.split_whitespace().collect();
    if parts.len() < 5 { return None; }
    
    let now = Local::now();
    let next = if parts[0] != "*" && parts[1] == "*" {
        // Hourly
        let mut t = now;
        t = t.with_minute(parts[0].parse().unwrap_or(0)).unwrap_or(now);
        if t <= now {
            t = t + chrono::Duration::hours(1);
        }
        t
    } else if parts[0] != "*" && parts[1] != "*" && parts[4] == "*" {
        // Daily
        let mut t = now;
        t = t.with_minute(parts[0].parse().unwrap_or(0)).unwrap_or(now);
        t = t.with_hour(parts[1].parse().unwrap_or(0)).unwrap_or(now);
        if t <= now {
            t = t + chrono::Duration::days(1);
        }
        t
    } else {
        // Weekly or custom default to tomorrow
        now + chrono::Duration::days(1)
    };
    Some(next.to_rfc3339())
}
