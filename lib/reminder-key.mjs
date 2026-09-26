export function appointmentReminderKey(appointmentId, type, startTime) {
  return `appointment:${appointmentId}:reminder:${type}:${new Date(startTime).toISOString()}`;
}
