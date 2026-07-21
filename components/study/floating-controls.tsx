import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  PictureInPicture,
  Maximize2,
  Minimize2,
  Settings,
  Volume2,
  Grid,
  Sparkles,
  BarChart2,
  HelpCircle,
  X,
  ChevronUp,
  Check,
  Radio,
  Monitor,
} from "lucide-react";
import { RoomStateStore, useRoomState } from "./room-state-store";

type FloatingControlsProps = {
  store: RoomStateStore;
  joinConferenceCall: () => Promise<void>;
  startRoomStream: () => Promise<void>;
  watchRoomStream: () => Promise<void>;
  leaveRoomCall: () => void;
  toggleAudioTrack: () => Promise<void>;
  toggleVideoTrack: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleRoomFullscreen: () => void;
  startPictureInPicture: () => Promise<void>;
  isHost: boolean;
};

export const FloatingControls: React.FC<FloatingControlsProps> = React.memo(({
  store,
  joinConferenceCall,
  startRoomStream,
  watchRoomStream,
  leaveRoomCall,
  toggleAudioTrack,
  toggleVideoTrack,
  toggleScreenShare,
  toggleRoomFullscreen,
  startPictureInPicture,
  isHost,
}) => {
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"devices" | "layout" | "effects" | "stats" | "help">("devices");
  
  // Subscribe to room states
  const callJoined = useRoomState(store, "callJoined", false);
  const callJoining = useRoomState(store, "callJoining", false);
  const callSessionMode = useRoomState(store, "callSessionMode", null);
  const audioEnabled = useRoomState(store, "audioEnabled", false);
  const videoEnabled = useRoomState(store, "videoEnabled", false);
  const isSharingScreen = useRoomState(store, "isSharingScreen", false);
  const isRoomFullscreen = useRoomState(store, "isRoomFullscreen", false);
  const streamHostUser = useRoomState(store, "streamHostUser", null);
  const layoutMode = useRoomState(store, "layoutMode", "grid") as "grid" | "focus" | "sidebar";
  const backgroundEffect = useRoomState(store, "backgroundEffect", "none") as "none" | "blur" | "vintage";
  const mediaDebugInfo = useRoomState(store, "mediaDebugInfo", null) as any;
  const selectedAudioInputId = useRoomState(store, "selectedAudioInputId", "");
  const selectedVideoInputId = useRoomState(store, "selectedVideoInputId", "");
  const selectedAudioOutputId = useRoomState(store, "selectedAudioOutputId", "");

  // Media devices states
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Initialize and list media devices
  const updateDeviceList = useCallback(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices()
      .then((deviceInfos) => {
        setDevices(deviceInfos);
        
        // Auto-select first device if none is selected yet
        const audioInputs = deviceInfos.filter(d => d.kind === "audioinput");
        const videoInputs = deviceInfos.filter(d => d.kind === "videoinput");
        const audioOutputs = deviceInfos.filter(d => d.kind === "audiooutput");

        if (audioInputs.length && !store.get("selectedAudioInputId")) {
          store.set("selectedAudioInputId", audioInputs[0].deviceId);
        }
        if (videoInputs.length && !store.get("selectedVideoInputId")) {
          store.set("selectedVideoInputId", videoInputs[0].deviceId);
        }
        if (audioOutputs.length && !store.get("selectedAudioOutputId")) {
          store.set("selectedAudioOutputId", audioOutputs[0].deviceId);
        }
      })
      .catch((err) => console.error("[FloatingControls] enumerateDevices failed:", err));
  }, [store]);

  useEffect(() => {
    setMounted(true);
    updateDeviceList();

    // Listen for device changes
    navigator.mediaDevices?.addEventListener("devicechange", updateDeviceList);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", updateDeviceList);
    };
  }, [updateDeviceList]);

  // Handle outside clicks to close the options menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const fullscreenElement = typeof document !== "undefined"
    ? (document.fullscreenElement || document.querySelector(".study-room-stage-wrapper"))
    : null;
  const portalTarget = (isRoomFullscreen && fullscreenElement)
    ? fullscreenElement
    : (typeof document !== "undefined" ? document.body : null);

  if (!mounted || !portalTarget) return null;

  const audioInputs = devices.filter((d) => d.kind === "audioinput");
  const videoInputs = devices.filter((d) => d.kind === "videoinput");
  const audioOutputs = devices.filter((d) => d.kind === "audiooutput");

  // Determine active PiP representation:
  // - If call is active -> PiP shows video + timer overlay
  // - If stream is active -> PiP shows stream + timer
  // - If ONLY timer is active -> PiP shows timer
  // - If nothing is active -> PiP is disabled
  const isTimerActive = store.get("status") === "running";
  const isPipEnabled = callJoined || isTimerActive;

  return createPortal(
    <div className="floating-controls-container">
      {/* Options Menu Drop-up */}
      {menuOpen && (
        <div className="floating-options-menu" ref={dropdownRef}>
          {/* Tabs header */}
          <div className="options-tabs">
            <button
              onClick={() => setActiveTab("devices")}
              className={`tab-btn ${activeTab === "devices" ? "active" : ""}`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Devices</span>
            </button>
            <button
              onClick={() => setActiveTab("layout")}
              className={`tab-btn ${activeTab === "layout" ? "active" : ""}`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Layout</span>
            </button>
            <button
              onClick={() => setActiveTab("effects")}
              className={`tab-btn ${activeTab === "effects" ? "active" : ""}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Effects</span>
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`tab-btn ${activeTab === "stats" ? "active" : ""}`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Stats</span>
            </button>
            <button
              onClick={() => setActiveTab("help")}
              className={`tab-btn ${activeTab === "help" ? "active" : ""}`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Shortcuts</span>
            </button>
          </div>

          {/* Tab content panels */}
          <div className="options-tab-content">
            {activeTab === "devices" && (
              <div className="devices-grid">
                <div className="device-select-group">
                  <label className="device-label">Microphone (Input)</label>
                  <select
                    className="device-select"
                    value={selectedAudioInputId}
                    onChange={(e) => store.set("selectedAudioInputId", e.target.value)}
                  >
                    {audioInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                    {audioInputs.length === 0 && <option value="">No microphone found</option>}
                  </select>
                </div>

                <div className="device-select-group">
                  <label className="device-label">Camera (Video)</label>
                  <select
                    className="device-select"
                    value={selectedVideoInputId}
                    onChange={(e) => store.set("selectedVideoInputId", e.target.value)}
                  >
                    {videoInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                    {videoInputs.length === 0 && <option value="">No camera found</option>}
                  </select>
                </div>

                <div className="device-select-group">
                  <label className="device-label">Speakers (Output)</label>
                  <select
                    className="device-select"
                    value={selectedAudioOutputId}
                    onChange={(e) => store.set("selectedAudioOutputId", e.target.value)}
                  >
                    {audioOutputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speakers ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                    {audioOutputs.length === 0 && <option value="">Default Speaker</option>}
                  </select>
                </div>
              </div>
            )}

            {activeTab === "layout" && (
              <div className="layout-modes-grid">
                <button
                  onClick={() => store.set("layoutMode", "grid")}
                  className={`layout-mode-btn ${layoutMode === "grid" ? "active" : ""}`}
                >
                  <Grid className="w-5 h-5 mb-1.5" />
                  <span className="layout-mode-title">Grid Grid</span>
                  <span className="layout-mode-desc">Equal sizes for all callers</span>
                </button>

                <button
                  onClick={() => store.set("layoutMode", "focus")}
                  className={`layout-mode-btn ${layoutMode === "focus" ? "active" : ""}`}
                >
                  <Monitor className="w-5 h-5 mb-1.5" />
                  <span className="layout-mode-title">Focus Speaker</span>
                  <span className="layout-mode-desc">Main speaker or shared screen takes stage</span>
                </button>

                <button
                  onClick={() => store.set("layoutMode", "sidebar")}
                  className={`layout-mode-btn ${layoutMode === "sidebar" ? "active" : ""}`}
                >
                  <Volume2 className="w-5 h-5 mb-1.5" />
                  <span className="layout-mode-title">Active Speaker</span>
                  <span className="layout-mode-desc">Only highlights the person speaking</span>
                </button>
              </div>
            )}

            {activeTab === "effects" && (
              <div className="effects-list">
                <div className="effect-header">Video Background Effects</div>
                <div className="effects-grid">
                  <button
                    onClick={() => store.set("backgroundEffect", "none")}
                    className={`effect-btn ${backgroundEffect === "none" ? "active" : ""}`}
                  >
                    <X className="w-4 h-4 mr-2" />
                    <span>None</span>
                  </button>
                  <button
                    onClick={() => store.set("backgroundEffect", "blur")}
                    className={`effect-btn ${backgroundEffect === "blur" ? "active" : ""}`}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    <span>Background Blur</span>
                  </button>
                  <button
                    onClick={() => store.set("backgroundEffect", "vintage")}
                    className={`effect-btn ${backgroundEffect === "vintage" ? "active" : ""}`}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    <span>Warm Vintage</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === "stats" && (
              <div className="connection-stats-panel">
                {mediaDebugInfo ? (
                  <div className="stats-grid">
                    <div className="stat-row">
                      <span className="stat-name">Connection Quality</span>
                      <span className="stat-value text-green-400">Excellent</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-name">Active Tracks</span>
                      <span className="stat-value">
                        {mediaDebugInfo.remoteVideoTrackCount} Video / {mediaDebugInfo.remoteAudioTrackCount} Audio
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-name">Video Bytes Recv</span>
                      <span className="stat-value">{mediaDebugInfo.receiverVideoBytes.toLocaleString()} B</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-name">Frames Decoded</span>
                      <span className="stat-value">{mediaDebugInfo.receiverFramesDecoded}</span>
                    </div>
                  </div>
                ) : (
                  <div className="no-stats-msg">
                    No active call stream to measure statistics.
                  </div>
                )}
              </div>
            )}

            {activeTab === "help" && (
              <div className="shortcuts-list">
                <div className="shortcut-row">
                  <span className="shortcut-key">M</span>
                  <span className="shortcut-action">Toggle Microphone</span>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-key">V</span>
                  <span className="shortcut-action">Toggle Camera</span>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-key">S</span>
                  <span className="shortcut-action">Toggle Screen Share</span>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-key">F</span>
                  <span className="shortcut-action">Toggle Room Fullscreen</span>
                </div>
                <div className="shortcut-row">
                  <span className="shortcut-key">P</span>
                  <span className="shortcut-action">Toggle Picture-in-Picture</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Control Bar */}
      <div className={`floating-controls-bar ${callJoined ? "in-call" : "pre-call"}`}>
        {!callJoined ? (
          /* STATE 1: BEFORE JOINING CALL / STREAM */
          <>
            {/* Primary Action: Join Call */}
            <button
              onClick={joinConferenceCall}
              disabled={callJoining || !!streamHostUser}
              className={`primary-control-btn join ${callJoining && callSessionMode === "conference" ? "loading" : ""}`}
              title="Join Room Call"
            >
              {callJoining && callSessionMode === "conference" ? (
                <span className="btn-spinner" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
              <span className="btn-text">Join Call</span>
            </button>

            {/* Primary Action: Start / Watch Stream */}
            {isHost ? (
              <button
                onClick={startRoomStream}
                disabled={callJoining}
                className={`primary-control-btn stream ${callJoining && callSessionMode === "stream_host" ? "loading" : ""}`}
                title="Start Room Live Stream"
              >
                {callJoining && callSessionMode === "stream_host" ? (
                  <span className="btn-spinner" />
                ) : (
                  <Radio className="w-4 h-4" />
                )}
                <span className="btn-text">Start Stream</span>
              </button>
            ) : streamHostUser ? (
              <button
                onClick={watchRoomStream}
                disabled={callJoining}
                className={`primary-control-btn stream ${callJoining && callSessionMode === "stream_viewer" ? "loading" : ""}`}
                title="Watch Host Stream"
              >
                {callJoining && callSessionMode === "stream_viewer" ? (
                  <span className="btn-spinner" />
                ) : (
                  <Radio className="w-4 h-4" />
                )}
                <span className="btn-text">Watch Stream</span>
              </button>
            ) : null}

            {/* Mic Toggle (Pre-join state) */}
            <button
              onClick={toggleAudioTrack}
              className={`control-btn icon-only ${audioEnabled ? "on" : "off"}`}
              title={audioEnabled ? "Mic is active on join" : "Mic is muted on join"}
            >
              {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            {/* Camera Toggle (Pre-join state) */}
            <button
              onClick={toggleVideoTrack}
              className={`control-btn icon-only ${videoEnabled ? "on" : "off"}`}
              title={videoEnabled ? "Camera is active on join" : "Camera is off on join"}
            >
              {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
          </>
        ) : (
          /* STATE 2: AFTER JOINING CALL OR STARTING STREAM */
          <>
            {/* Mic Toggle */}
            <button
              onClick={toggleAudioTrack}
              disabled={callSessionMode === "stream_viewer"}
              className={`control-btn icon-only ${audioEnabled ? "on" : "off-active"}`}
              title={audioEnabled ? "Mute Microphone" : "Unmute Microphone"}
            >
              {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            {/* Camera Toggle */}
            <button
              onClick={toggleVideoTrack}
              disabled={callSessionMode === "stream_viewer"}
              className={`control-btn icon-only ${videoEnabled ? "on" : "off-active"}`}
              title={videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
            >
              {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>

            {/* Screen Share (Only for conference/stream host) */}
            {(callSessionMode === "conference" || callSessionMode === "stream_host") && (
              <button
                onClick={toggleScreenShare}
                className={`control-btn icon-only ${isSharingScreen ? "on active-glow" : "off"}`}
                title={isSharingScreen ? "Stop Sharing Screen" : "Share Screen"}
              >
                <Monitor className="w-4 h-4" />
              </button>
            )}

            {/* Primary Action: Leave Call */}
            <button
              onClick={leaveRoomCall}
              className="primary-control-btn leave"
              title={callSessionMode === "stream_host" ? "End Stream" : "Leave Call"}
            >
              <PhoneOff className="w-4 h-4" />
              <span className="btn-text">
                {callSessionMode === "stream_host" ? "End Stream" : "Leave"}
              </span>
            </button>
          </>
        )}

        {/* Global Action: PiP */}
        <button
          onClick={startPictureInPicture}
          disabled={!isPipEnabled}
          className={`control-btn icon-only ${!isPipEnabled ? "disabled" : "secondary"}`}
          title="Global Picture-in-Picture"
        >
          <PictureInPicture className="w-4 h-4" />
        </button>

        {/* Global Action: Fullscreen */}
        <button
          onClick={toggleRoomFullscreen}
          className="control-btn icon-only secondary"
          title={isRoomFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isRoomFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Options Menu Toggle */}
        <button
          ref={menuButtonRef}
          onClick={() => setMenuOpen(!menuOpen)}
          className={`control-btn icon-only secondary ${menuOpen ? "active-border" : ""}`}
          title="Call Options"
        >
          <ChevronUp className={`w-4 h-4 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
        </button>
      </div>
    </div>,
    portalTarget
  );
});

FloatingControls.displayName = "FloatingControls";
