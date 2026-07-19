export function toUserDto(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  telegramChatId: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    telegram_chat_id: user.telegramChatId,
    email_verified_at: user.emailVerifiedAt,
    is_active: user.isActive,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

export function toWebsiteDto(website: {
  id: string;
  name: string;
  domain: string;
  url: string;
  ownerId: string | null;
  monitoringIntervalMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: website.id,
    name: website.name,
    domain: website.domain,
    url: website.url,
    owner_id: website.ownerId,
    monitoring_interval_minutes: website.monitoringIntervalMinutes,
    is_active: website.isActive,
    created_at: website.createdAt,
    updated_at: website.updatedAt,
  };
}

export function toMonitoringResultDto(result: {
  id: string;
  websiteId: string;
  scheduledAt: Date;
  checkedAt: Date;
  status: string;
  httpStatus: number | null;
  responseTimeMs: number | null;
  renderTimeMs: number | null;
  screenshotUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
}) {
  return {
    id: result.id,
    website_id: result.websiteId,
    scheduled_at: result.scheduledAt,
    checked_at: result.checkedAt,
    status: result.status,
    http_status: result.httpStatus,
    response_time_ms: result.responseTimeMs,
    render_time_ms: result.renderTimeMs,
    screenshot_url: result.screenshotUrl,
    error_message: result.errorMessage,
    created_at: result.createdAt,
  };
}

export function toIncidentDto(incident: {
  id: string;
  websiteId: string;
  title: string;
  severity: string;
  status: string;
  startedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: incident.id,
    website_id: incident.websiteId,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    started_at: incident.startedAt,
    resolved_at: incident.resolvedAt,
    closed_at: incident.closedAt,
    created_at: incident.createdAt,
    updated_at: incident.updatedAt,
  };
}

export function toTicketDto(ticket: {
  id: string;
  incidentId: string;
  title: string;
  assignedTo: string | null;
  priority: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    id: ticket.id,
    incident_id: ticket.incidentId,
    title: ticket.title,
    assigned_to: ticket.assignedTo,
    priority: ticket.priority,
    status: ticket.status,
    created_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    resolved_at: ticket.resolvedAt,
  };
}

export function toNotificationDto(notification: {
  id: string;
  userId: string | null;
  incidentId: string | null;
  channel: string;
  title: string;
  message: string;
  status: string;
  sentAt: Date | null;
  readAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}) {
  return {
    id: notification.id,
    user_id: notification.userId,
    incident_id: notification.incidentId,
    channel: notification.channel,
    title: notification.title,
    message: notification.message,
    status: notification.status,
    sent_at: notification.sentAt,
    read_at: notification.readAt,
    error_message: notification.errorMessage,
    created_at: notification.createdAt,
  };
}

export function paginatedMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  };
}
