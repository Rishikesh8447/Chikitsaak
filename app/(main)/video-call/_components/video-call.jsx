"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  User,
  AlertCircle,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markAppointmentCompleted } from "@/actions/doctor";
import { toast } from "sonner";

export default function VideoCall({ appId: providedAppId, sessionId, token, appointmentId, userRole }) {
  const [isLoading, setIsLoading] = useState(true);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hasOtherParticipant, setHasOtherParticipant] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [publisherReady, setPublisherReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [deviceError, setDeviceError] = useState("");
  const [isRetryingDevice, setIsRetryingDevice] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const initializingRef = useRef(false);
  const timeoutRef = useRef(null);
  const connectedRef = useRef(false);

  const router = useRouter();
  const appId = providedAppId;

  // Fully stop local tracks and clean up publisher/session
  const cleanupMedia = useCallback(() => {
    if (publisherRef.current) {
      try {
        const stream = publisherRef.current.getMediaStream?.();
        if (stream && typeof stream.getTracks === "function") {
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch {
        // ignore track stop error
      }
      try {
        if (sessionRef.current && publisherReady) {
          sessionRef.current.unpublish(publisherRef.current);
        }
      } catch {
        // ignore unpublish error
      }
      try {
        publisherRef.current.destroy();
      } catch {
        // ignore destroy error
      }
      publisherRef.current = null;
    }

    if (sessionRef.current) {
      try {
        sessionRef.current.disconnect();
      } catch {
        // ignore disconnect error
      }
      sessionRef.current = null;
    }

    connectedRef.current = false;
    setPublisherReady(false);
    setIsConnected(false);
  }, [publisherReady]);

  // Initialize publisher stream on connected session
  const initPublisher = useCallback(() => {
    if (!window.OT || !sessionRef.current || !connectedRef.current) return;
    setDeviceError("");
    setIsRetryingDevice(true);

    try {
      if (publisherRef.current) {
        try {
          const stream = publisherRef.current.getMediaStream?.();
          if (stream && typeof stream.getTracks === "function") {
            stream.getTracks().forEach((track) => track.stop());
          }
        } catch {
          // ignore
        }
        try {
          publisherRef.current.destroy();
        } catch {
          // ignore cleanup error
        }
        publisherRef.current = null;
      }
      setPublisherReady(false);

      publisherRef.current = window.OT.initPublisher(
        "publisher",
        {
          insertMode: "replace",
          width: "100%",
          height: "100%",
          publishAudio: isAudioEnabled,
          publishVideo: isVideoEnabled,
        },
        (error) => {
          setIsRetryingDevice(false);
          if (error) {
            console.error("Publisher initialization error:", error.name || error.code, error.message);
            setPublisherReady(false);
            const isHardwareBusy =
              error.name === "OT_HARDWARE_UNAVAILABLE" ||
              error.name === "NotReadableError" ||
              error.code === 1500 ||
              /hardware unavailable|notreadable|in use|could not start/i.test(error.message || "");
            const isDenied =
              error.name === "OT_USER_MEDIA_ACCESS_DENIED" ||
              /permission denied|not allowed/i.test(error.message || "");

            if (isHardwareBusy) {
              setDeviceError(
                "Camera or microphone is currently in use by another application or browser tab. If testing both accounts on the same PC, please close camera usage in the other window and retry."
              );
              toast.error("Camera or microphone in use by another application");
            } else if (isDenied) {
              setDeviceError("Camera or microphone access was denied. Please allow permissions in your browser.");
              toast.error("Camera or microphone access denied");
            } else {
              setDeviceError("Failed to initialize camera or microphone. Please check device connections and retry.");
              toast.error("Device initialization failed");
            }
          } else {
            setDeviceError("");
            setPublisherReady(true);
            if (sessionRef.current && connectedRef.current) {
              sessionRef.current.publish(publisherRef.current, (publishError) => {
                if (publishError) {
                  console.error("Publish error:", publishError.code, publishError.message);
                  setPublisherReady(false);
                  if (publishError.code === 1500 || /hardware unavailable|in use/i.test(publishError.message || "")) {
                    setDeviceError(
                      "Unable to publish media stream (Error 1500): Camera or microphone may be in use by another tab or app. Please close other video windows and retry."
                    );
                    toast.error("Camera or microphone in use by another application (Error 1500)");
                  } else {
                    setDeviceError("Unable to publish your video. Please check permissions and network, then retry.");
                    toast.error("Unable to publish your video stream");
                  }
                }
              });
            }
          }
        }
      );
    } catch (err) {
      setIsRetryingDevice(false);
      setPublisherReady(false);
      setDeviceError("Unable to access camera or microphone devices. Please check permissions and retry.");
      toast.error("Device access error");
    }
  }, [isAudioEnabled, isVideoEnabled]);

  // Retry publisher helper
  const retryPublisher = () => {
    setIsRetryingDevice(true);
    setDeviceError("");
    if (publisherRef.current) {
      try {
        const stream = publisherRef.current.getMediaStream?.();
        if (stream && typeof stream.getTracks === "function") {
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch {
        // ignore
      }
      try {
        publisherRef.current.destroy();
      } catch {
        // ignore
      }
      publisherRef.current = null;
    }
    setPublisherReady(false);
    setTimeout(() => {
      initPublisher();
    }, 300);
  };

  // Initialize video session
  const initializeSession = useCallback(() => {
    if (initializingRef.current || sessionRef.current) return;
    initializingRef.current = true;
    setConnectionError("");
    setDeviceError("");

    if (!appId || !sessionId || !token) {
      toast.error("Missing required video call parameters");
      initializingRef.current = false;
      router.push("/appointments");
      return;
    }

    try {
      // Initialize the session
      sessionRef.current = window.OT.initSession(appId, sessionId);

      // Subscribe to new streams
      sessionRef.current.on("streamCreated", (event) => {
        setHasOtherParticipant(true);
        if (sessionRef.current) {
          sessionRef.current.subscribe(
            event.stream,
            "subscriber",
            {
              insertMode: "append",
              width: "100%",
              height: "100%",
            },
            (error) => {
              if (error) {
                toast.error("Error connecting to other participant's stream");
              }
            }
          );
        }
      });

      // Handle session events
      sessionRef.current.on("sessionConnected", () => {
        connectedRef.current = true;
        setIsConnected(true);
        setIsLoading(false);
        initializingRef.current = false;
        clearTimeout(timeoutRef.current);

        initPublisher();
      });

      sessionRef.current.on("sessionDisconnected", () => {
        connectedRef.current = false;
        setIsConnected(false);
      });

      sessionRef.current.on("streamDestroyed", () => setHasOtherParticipant(false));

      // Connect to the session
      sessionRef.current.connect(token, (error) => {
        if (error) {
          toast.error("Error connecting to video session");
          setConnectionError("Unable to connect to the video call. Please try again.");
          setIsLoading(false);
          initializingRef.current = false;
        }
      });

      // Set timeout for connection
      timeoutRef.current = setTimeout(() => {
        if (!connectedRef.current) {
          toast.error("Connection timeout. Please check your internet connection.");
          setConnectionError("Connection timeout. Please try again.");
          setIsLoading(false);
          initializingRef.current = false;
        }
      }, 20000); // 20 seconds timeout
    } catch (error) {
      toast.error("Failed to initialize video session");
      setIsLoading(false);
      setConnectionError("Unable to initialize the video call. Please try again.");
      initializingRef.current = false;
    }
  }, [appId, sessionId, token, initPublisher, router]);

  // Handle script load
  const handleScriptLoad = () => {
    setScriptLoaded(true);
    if (!window.OT) {
      toast.error("Failed to load Vonage Video API");
      setIsLoading(false);
      return;
    }
    initializeSession();
  };

  const retryConnection = () => {
    cleanupMedia();
    initializingRef.current = false;
    setIsLoading(true);
    initializeSession();
  };

  // Toggle video
  const toggleVideo = () => {
    if (publisherRef.current) {
      publisherRef.current.publishVideo(!isVideoEnabled);
      setIsVideoEnabled((prev) => !prev);
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (publisherRef.current) {
      publisherRef.current.publishAudio(!isAudioEnabled);
      setIsAudioEnabled((prev) => !prev);
    }
  };

  // Doctor: Complete consultation and exit
  const handleCompleteConsultation = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      const formData = new FormData();
      formData.append("appointmentId", appointmentId);
      await markAppointmentCompleted(formData);
      toast.success("Consultation completed successfully");
    } catch (err) {
      console.error("Complete consultation error:", err);
      toast.error(err?.message || "Failed to mark consultation completed");
    } finally {
      cleanupMedia();
      router.push(`/doctor?completed=${encodeURIComponent(appointmentId)}`);
    }
  };

  // Doctor: Leave call without completing
  const handleLeaveCallOnly = () => {
    cleanupMedia();
    router.push("/doctor");
  };

  // Patient / Generic: End call
  const endCall = () => {
    cleanupMedia();
    if (appointmentId) {
      router.push(`/appointments?completed=${encodeURIComponent(appointmentId)}`);
    } else {
      router.push("/appointments");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      cleanupMedia();
    };
  }, [cleanupMedia]);

  if (!sessionId || !token || !appId) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground text-sm">
          Missing call details. Return to your appointments to join a consultation.
        </p>
        <Button onClick={() => router.push(userRole === "DOCTOR" ? "/doctor" : "/appointments")} className="mt-4" size="sm">
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://static.opentok.com/v2/js/opentok.min.js"
        onLoad={handleScriptLoad}
        onError={() => {
          toast.error("Failed to load video calling libraries");
          setIsLoading(false);
          setConnectionError("Could not load the video SDK. Please check your network or ad blocker.");
        }}
      />

      <main className="container mx-auto max-w-5xl px-4 py-4 sm:py-6">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h1 className="text-lg font-bold text-foreground">Video Consultation</h1>
              <p className="text-muted-foreground text-xs">
                Encrypted peer-to-peer session
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={isConnected ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                {isConnected ? "Connected" : "Connecting…"}
              </Badge>
              {hasOtherParticipant && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  Remote party present
                </Badge>
              )}
            </div>
          </div>

          {/* Error banner */}
          {connectionError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center">
              <p className="text-sm font-medium text-destructive mb-2">{connectionError}</p>
              <Button size="sm" variant="outline" onClick={retryConnection} className="text-xs">
                Retry Connection
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && !connectionError && (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center sm:min-h-[440px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium text-foreground">Joining consultation room…</p>
              <p className="text-muted-foreground text-xs mt-1">Preparing secure media connection</p>
            </div>
          )}

          {/* Video grid */}
          {!isLoading && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Remote Participant Box */}
                <div className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium">
                    <span>Remote Participant</span>
                    <span className="text-[11px] text-muted-foreground">
                      {hasOtherParticipant ? "Connected" : "Waiting to join…"}
                    </span>
                  </div>
                  <div
                    id="subscriber"
                    className="relative min-h-[220px] flex-1 bg-muted/20 sm:min-h-[280px]"
                  >
                    {!hasOtherParticipant && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <div className="rounded-full bg-muted/40 p-3 text-muted-foreground">
                          <User className="h-8 w-8" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Waiting for the other participant to join…
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Local Participant (You) Box */}
                <div className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium">
                    <span>You</span>
                    <span className="text-[11px] text-muted-foreground">
                      {publisherReady ? "Live" : "Initializing…"}
                    </span>
                  </div>
                  <div
                    id="publisher"
                    className="relative min-h-[220px] flex-1 bg-muted/20 sm:min-h-[280px]"
                  >
                    {deviceError && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card/95 p-4 text-center gap-3">
                        <AlertCircle className="size-8 text-amber-500 shrink-0" />
                        <p className="text-xs font-medium text-foreground max-w-sm leading-relaxed">
                          {deviceError}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={retryPublisher}
                          disabled={isRetryingDevice}
                          className="text-xs gap-1.5"
                        >
                          {isRetryingDevice ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                          Retry Camera Access
                        </Button>
                      </div>
                    )}

                    {!scriptLoaded && !deviceError && (
                      <div className="flex items-center justify-center h-full">
                        <div className="bg-muted/30 rounded-full p-6 text-muted-foreground">
                          <User className="h-10 w-10 text-primary" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Call Controls Bar */}
              <div className="flex shrink-0 items-center justify-center gap-4 border-t border-border pt-4 pb-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={toggleVideo}
                  className={`rounded-full h-14 w-14 p-0 shrink-0 transition-colors ${
                    isVideoEnabled
                      ? "border-border hover:bg-muted"
                      : "bg-red-500/10 border-red-500/30 text-destructive hover:bg-red-500/20"
                  }`}
                  disabled={!publisherReady}
                  aria-label={isVideoEnabled ? "Turn camera off" : "Turn camera on"}
                >
                  {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={toggleAudio}
                  className={`rounded-full h-14 w-14 p-0 shrink-0 transition-colors ${
                    isAudioEnabled
                      ? "border-border hover:bg-muted"
                      : "bg-red-500/10 border-red-500/30 text-destructive hover:bg-red-500/20"
                  }`}
                  disabled={!publisherReady}
                  aria-label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
                >
                  {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </Button>

                {/* End / Complete Consultation Button */}
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={userRole === "DOCTOR" ? () => setEndModalOpen(true) : endCall}
                  className="rounded-full px-5 h-14 min-w-[3.5rem] bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2 text-white font-medium shrink-0 shadow-md"
                  aria-label={userRole === "DOCTOR" ? "Conclude consultation" : "End call"}
                >
                  <PhoneOff className="h-5 w-5 shrink-0" />
                  <span className="hidden sm:inline font-semibold">
                    {userRole === "DOCTOR" ? "End / Complete" : "End Call"}
                  </span>
                </Button>
              </div>

              <div className="text-center pb-2">
                <p className="text-muted-foreground text-xs">
                  {isVideoEnabled ? "Camera on" : "Camera off"} •
                  {isAudioEnabled ? " Microphone on" : " Microphone off"}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  When your consultation is finished, click {userRole === "DOCTOR" ? "End / Complete" : "End Call"} to return to your dashboard.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Doctor Completion Dialog */}
      <Dialog open={endModalOpen} onOpenChange={setEndModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Conclude Consultation</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you finished with this consultation, or do you only want to step away from the video call?
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">Complete & Conclude Consultation</p>
              <p className="text-muted-foreground">
                Marks the appointment as <strong className="text-primary font-medium">COMPLETED</strong>, updates the patient dashboard, and redirects you to review or write a prescription.
              </p>
            </div>

            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">Leave Call Only</p>
              <p className="text-muted-foreground">
                Leaves the appointment <strong className="text-foreground font-medium">IN_PROGRESS</strong> so you can rejoin or finish later.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLeaveCallOnly}
              disabled={isCompleting}
              className="text-xs"
            >
              Leave Call Only
            </Button>
            <Button
              size="sm"
              onClick={handleCompleteConsultation}
              disabled={isCompleting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5" />
                  Complete Consultation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
