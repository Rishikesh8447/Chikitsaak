"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  User,
} from "lucide-react";
import { toast } from "sonner";

export default function VideoCall({ appId: providedAppId, sessionId, token }) {
  const [isLoading, setIsLoading] = useState(true);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hasOtherParticipant, setHasOtherParticipant] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [publisherReady, setPublisherReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  const sessionRef = useRef(null);
  const publisherRef = useRef(null);
  const initializingRef = useRef(false);
  const timeoutRef = useRef(null);
  const connectedRef = useRef(false);

  const router = useRouter();

  const appId = providedAppId;

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

  // Initialize video session
  const initializeSession = () => {
    if (initializingRef.current || sessionRef.current) return;
    initializingRef.current = true;
    setConnectionError("");
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
      });

      // Handle session events
      sessionRef.current.on("sessionConnected", () => {
        connectedRef.current = true;
        setIsConnected(true);
        setIsLoading(false);
        initializingRef.current = false;
        clearTimeout(timeoutRef.current);

        publisherRef.current = window.OT.initPublisher(
          "publisher", // This targets the div with id="publisher"
          {
            insertMode: "replace", // Change from "append" to "replace"
            width: "100%",
            height: "100%",
            publishAudio: isAudioEnabled,
            publishVideo: isVideoEnabled,
          },
          (error) => {
            if (error) {
              console.error("Publisher initialization failed");
              toast.error("Error initializing your camera and microphone");
            } else {
              setPublisherReady(true);
              sessionRef.current.publish(publisherRef.current, (publishError) => {
                if (publishError) toast.error("Unable to publish your video. Check camera permissions and try again.");
              });
            }
          }
        );
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
        } else {
        }
      });
      timeoutRef.current = setTimeout(() => {
        if (!connectedRef.current) {
          setConnectionError("The video call took too long to connect. Please try again.");
          setIsLoading(false);
          initializingRef.current = false;
        }
      }, 20000);
    } catch (error) {
      toast.error("Failed to initialize video call");
      setIsLoading(false);
      setConnectionError("Unable to initialize the video call. Please try again.");
      initializingRef.current = false;
    }
  };

  const retryConnection = () => {
    publisherRef.current?.destroy();
    sessionRef.current?.disconnect();
    publisherRef.current = null;
    sessionRef.current = null;
    initializingRef.current = false;
    setPublisherReady(false);
    setIsConnected(false);
    setHasOtherParticipant(false);
    connectedRef.current = false;
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

  // End call
  const endCall = () => {
    // Properly destroy publisher
    if (publisherRef.current) {
      publisherRef.current.destroy();
      publisherRef.current = null;
    }

    // Disconnect session
    if (sessionRef.current) {
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }

    router.push("/appointments");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      if (publisherRef.current) {
        publisherRef.current.destroy();
      }
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
      connectedRef.current = false;
    };
  }, []);

  if (!sessionId || !token || !appId) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-white mb-4">
          Invalid Video Call
        </h1>
        <p className="text-muted-foreground mb-6">
          Missing required parameters for the video call.
        </p>
        <Button
          onClick={() => router.push("/appointments")}
          className="bg-primary hover:bg-primary/90"
        >
          Back to Appointments
        </Button>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://unpkg.com/@vonage/client-sdk-video@2.29.0/dist/js/opentok.js"
        onLoad={handleScriptLoad}
        onError={() => {
          toast.error("Failed to load video call script");
          setConnectionError("Unable to load the video call. Please try again.");
          setIsLoading(false);
        }}
      />

      <main className="min-h-[calc(100dvh-4rem)] overflow-x-hidden bg-background">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl flex-col px-3 py-3 sm:px-6 sm:py-4">
        <div className="mb-4 flex shrink-0 items-center justify-between border-b border-border pb-3">
          <div><p className="text-sm font-semibold">Chikitsaak</p><p className="text-xs text-muted-foreground">Consultation</p></div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Video Consultation
          </h1>
          <p className="text-muted-foreground">
            {isConnected
              ? "Connected"
              : isLoading
              ? "Connecting to video call..."
              : "Connection failed"}
          </p>
        </div>

        {connectionError ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <p className="text-destructive">{connectionError}</p>
            <Button onClick={retryConnection} variant="outline">Retry</Button>
          </div>
        ) : isLoading && !scriptLoaded ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-white text-lg">
              Loading video call components...
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 sm:gap-6">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              {/* Publisher (Your video) */}
              <div className="order-2 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
                <div className="bg-emerald-900/10 px-3 py-2 text-primary text-sm font-medium">
                  You
                </div>
                <div
                  id="publisher"
                  className="relative min-h-[220px] flex-1 bg-muted/30 sm:min-h-[280px]"
                >
                  {!scriptLoaded && (
                    <div className="flex items-center justify-center h-full">
                      <div className="bg-muted/20 rounded-full p-8">
                        <User className="h-12 w-12 text-primary" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Subscriber (Other person's video) */}
              <div className="order-1 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border">
                <div className="bg-emerald-900/10 px-3 py-2 text-primary text-sm font-medium">
                  Other Participant
                </div>
                <div
                  id="subscriber"
                  className="relative min-h-[220px] flex-1 bg-muted/30 sm:min-h-[280px]"
                >
                  {(!hasOtherParticipant || !scriptLoaded) && (
                    <div className="flex items-center justify-center h-full">
                      <div className="bg-muted/20 rounded-full p-8">
                        <User className="h-12 w-12 text-primary" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Video controls */}
            <div className="flex shrink-0 justify-center gap-3 border-t border-border pt-3 pb-1 sm:gap-4">
              <Button
                variant="outline"
                size="lg"
                onClick={toggleVideo}
                className={`rounded-full p-4 h-14 w-14 ${
                  isVideoEnabled
                    ? "border-emerald-900/30"
                    : "bg-red-900/20 border-red-900/30 text-destructive"
                }`}
                disabled={!publisherReady}
                aria-label={isVideoEnabled ? "Turn camera off" : "Turn camera on"}
              >
                {isVideoEnabled ? <Video /> : <VideoOff />}
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={toggleAudio}
                className={`rounded-full p-4 h-14 w-14 ${
                  isAudioEnabled
                    ? "border-emerald-900/30"
                    : "bg-red-900/20 border-red-900/30 text-destructive"
                }`}
                disabled={!publisherReady}
                aria-label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                {isAudioEnabled ? <Mic /> : <MicOff />}
              </Button>

              <Button
                variant="destructive"
                size="lg"
                onClick={endCall}
                className="rounded-full p-4 h-14 w-14 bg-red-600 hover:bg-red-700"
                aria-label="End call"
              >
                <PhoneOff className="mr-2" />
                <span className="sr-only sm:not-sr-only">End Call</span>
              </Button>
            </div>

            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                {isVideoEnabled ? "Camera on" : "Camera off"} •
                {isAudioEnabled ? " Microphone on" : " Microphone off"}
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                When you&apos;re finished with your consultation, click the red
                button to end the call
              </p>
            </div>
          </div>
        )}
      </div>
      </main>
    </>
  );
}
