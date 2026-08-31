export async function createNotification(tx, { userId, appointmentId, type, title, message, dedupeKey }) {
  await tx.notification.createMany({
    data: [{ userId, appointmentId, type, title, message, dedupeKey }],
    skipDuplicates: true,
  });
}

export async function createAppointmentNotificationPair(tx, appointment, { type, title, patientMessage, doctorMessage, key }) {
  await tx.notification.createMany({
    data: [
      { userId: appointment.patientId, appointmentId: appointment.id, type, title, message: patientMessage, dedupeKey: `${key}:patient` },
      { userId: appointment.doctorId, appointmentId: appointment.id, type, title, message: doctorMessage, dedupeKey: `${key}:doctor` },
    ],
    skipDuplicates: true,
  });
}
