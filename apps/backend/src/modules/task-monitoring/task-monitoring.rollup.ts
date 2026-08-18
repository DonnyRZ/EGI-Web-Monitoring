import { TaskBusinessStatus, TicketStatus, UserStoryStatus } from "@egi/database";

export function rollupTaskStatus(input: {
  override: TaskBusinessStatus | null;
  ticketStatus: TicketStatus;
  hasPicDeveloper: boolean;
  storyStatuses: UserStoryStatus[];
}): TaskBusinessStatus {
  if (input.override) return input.override;

  if (input.storyStatuses.length > 0) {
    if (input.storyStatuses.includes(UserStoryStatus.blocked)) return TaskBusinessStatus.blocked;
    if (input.storyStatuses.some((status) => status === UserStoryStatus.in_progress || status === UserStoryStatus.review)) {
      return TaskBusinessStatus.in_progress;
    }
    if (input.storyStatuses.every((status) => status === UserStoryStatus.done)) return TaskBusinessStatus.done;
    return TaskBusinessStatus.new;
  }

  if (input.ticketStatus === TicketStatus.resolved || input.ticketStatus === TicketStatus.closed) {
    return TaskBusinessStatus.done;
  }
  if (input.ticketStatus === TicketStatus.in_progress) return TaskBusinessStatus.in_progress;
  if (!input.hasPicDeveloper) return TaskBusinessStatus.waiting_pic;
  return TaskBusinessStatus.new;
}

export function isTaskOverdue(status: TaskBusinessStatus, dueDate: Date | null, now = new Date()) {
  return status !== TaskBusinessStatus.done && Boolean(dueDate && dueDate < now);
}

export function needsTaskAction(status: TaskBusinessStatus, overdue: boolean) {
  return status !== TaskBusinessStatus.done && (
    overdue
    || status === TaskBusinessStatus.new
    || status === TaskBusinessStatus.waiting_pic
    || status === TaskBusinessStatus.blocked
  );
}
