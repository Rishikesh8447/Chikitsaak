import VideoCall, { VideoCallUnavailable } from "./_components/video-call";
import { getVideoCallCredentials } from "@/actions/appointments";

export default async function VideoCallPage({ searchParams }) {
  const params = await searchParams;
  const appointmentId = params?.appointmentId || params?.sessionId;

  let credentials = null;
  let error = null;

  if (!appointmentId) {
    error = "Appointment ID is required to join a video consultation.";
  } else {
    try {
      credentials = await getVideoCallCredentials(appointmentId);
    } catch (err) {
      error = err instanceof Error ? err.message : "Unable to join video consultation.";
    }
  }

  if (error || !credentials) {
    return <VideoCallUnavailable error={error} />;
  }

  return (
    <VideoCall
      appId={credentials.appId}
      sessionId={credentials.videoSessionId}
      token={credentials.token}
      appointmentId={appointmentId}
      userRole={credentials.userRole}
    />
  );
}
