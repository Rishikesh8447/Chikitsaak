import VideoCall from "./_components/video-call";
import { getVideoCallCredentials } from "@/actions/appointments";

export default async function VideoCallPage({ searchParams }) {
  const { appointmentId } = await searchParams;
  const credentials = await getVideoCallCredentials(appointmentId);

  return <VideoCall appId={credentials.appId} sessionId={credentials.videoSessionId} token={credentials.token} />;
}
