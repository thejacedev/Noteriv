"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  generateRecordingFilename,
  formatDuration,
  saveAudioToVault,
} from "@/lib/audio-utils";
import "@/styles/audio-recorder.css";

interface AudioRecorderProps {
  vaultPath: string;
  onInsert: (markdownLink: string) => void;
  onClose: () => void;
}

type RecorderState = "idle" | "requesting" | "recording" | "recorded" | "saving";

export default function AudioRecorder({
  vaultPath,
  onInsert,
  onClose,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const filenameRef = useRef<string>("");

  // ── Clean up on unmount ──
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Draw waveform on canvas ──
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const { width, height } = canvas;
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--bg-surface").trim() || "#313244";
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#89b4fa";
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    draw();
  }, []);

  // ── Draw flat line on canvas (idle state) ──
  const drawFlatLine = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--bg-surface").trim() || "#313244";
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--text-muted").trim() || "#6c7086";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }, []);

  // ── Set canvas size and draw initial flat line ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      // reset canvas logical drawing size
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    drawFlatLine();
  }, [drawFlatLine]);

  // ── Start recording ──
  const startRecording = useCallback(async () => {
    setError(null);
    setState("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up Web Audio analyser for waveform
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Choose codec: prefer opus in webm
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("recorded");

        // Stop waveform animation
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }

        // Stop stream tracks
        stream.getTracks().forEach((t) => t.stop());

        // Close audio context
        audioCtx.close().catch(() => {});
      };

      recorder.start(250); // collect data in 250ms chunks

      // Start timer
      setElapsed(0);
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 200);

      // Start waveform drawing
      drawWaveform();

      setState("recording");
      filenameRef.current = generateRecordingFilename();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setError("Microphone permission was denied. Please allow access and try again.");
      } else {
        setError(`Could not access microphone: ${msg}`);
      }
      setState("idle");
    }
  }, [drawWaveform]);

  // ── Stop recording ──
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Toggle record/stop ──
  const toggleRecording = useCallback(() => {
    if (state === "idle") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
  }, [state, startRecording, stopRecording]);

  // ── Playback controls ──
  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setPlaybackTime(time);
  }, []);

  // ── Set up audio element callbacks ──
  useEffect(() => {
    if (!audioUrl || state !== "recorded") return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setPlaybackDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      setPlaybackTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setPlaybackTime(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [audioUrl, state]);

  // ── Save recording ──
  const handleSave = useCallback(async () => {
    if (!blobRef.current) return;
    setState("saving");
    setError(null);

    try {
      const filename = filenameRef.current || generateRecordingFilename();
      const relativePath = await saveAudioToVault(blobRef.current, vaultPath, filename);
      onInsert(`![Audio](${relativePath})`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save recording";
      setError(msg);
      setState("recorded");
    }
  }, [vaultPath, onInsert, onClose]);

  // ── Discard recording ──
  const handleDiscard = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    blobRef.current = null;
    chunksRef.current = [];
    setElapsed(0);
    setPlaybackTime(0);
    setPlaybackDuration(0);
    setIsPlaying(false);
    setError(null);
    setState("idle");
    drawFlatLine();
  }, [audioUrl, drawFlatLine]);

  // ── Close handler (also stops recording if active) ──
  const handleClose = useCallback(() => {
    if (state === "recording") {
      stopRecording();
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    onClose();
  }, [state, audioUrl, stopRecording, onClose]);

  return (
    <div className="ar-overlay" onClick={handleClose}>
      <div className="ar-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ar-header">
          <span className="ar-title">Audio Recorder</span>
          <button className="ar-close-btn" onClick={handleClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3L11 11M11 3L3 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="ar-body">
          {/* Waveform */}
          <canvas ref={canvasRef} className="ar-waveform" />

          {/* Timer */}
          <div className="ar-timer">{formatDuration(elapsed)}</div>

          {/* Status */}
          <div className="ar-status">
            <span
              className={`ar-status-dot${state === "recording" ? " ar-status-dot-recording" : ""}`}
            />
            <span>
              {state === "idle" && "Ready to record"}
              {state === "requesting" && "Requesting microphone..."}
              {state === "recording" && "Recording..."}
              {state === "recorded" && "Recording complete"}
              {state === "saving" && "Saving..."}
            </span>
          </div>

          {/* Record button (shown when idle or recording) */}
          {(state === "idle" || state === "recording") && (
            <div className="ar-controls">
              <button
                className={`ar-record-btn${state === "recording" ? " ar-record-btn-active" : ""}`}
                onClick={toggleRecording}
                disabled={false}
                title={state === "recording" ? "Stop recording" : "Start recording"}
              >
                <span className="ar-record-inner" />
              </button>
            </div>
          )}

          {/* Playback preview (shown after recording) */}
          {state === "recorded" && audioUrl && (
            <div className="ar-playback">
              <div className="ar-playback-controls">
                <button className="ar-play-btn" onClick={togglePlayback}>
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <rect x="3" y="2" width="3" height="10" rx="1" />
                      <rect x="8" y="2" width="3" height="10" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <path d="M4 2L12 7L4 12V2Z" />
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  className="ar-seek-bar"
                  min={0}
                  max={playbackDuration || 0}
                  step={0.1}
                  value={playbackTime}
                  onChange={handleSeek}
                />
                <span className="ar-playback-time">
                  {formatDuration(playbackTime)}
                </span>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && <div className="ar-error">{error}</div>}
        </div>

        {/* Action buttons (shown after recording) */}
        {state === "recorded" && (
          <div className="ar-actions">
            <button
              className="ar-btn ar-btn-discard"
              onClick={handleDiscard}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 3L11 11M11 3L3 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              Discard
            </button>
            <button
              className="ar-btn ar-btn-save"
              onClick={handleSave}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7L5.5 10.5L12 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Save Recording
            </button>
          </div>
        )}

        {/* Saving state */}
        {state === "saving" && (
          <div className="ar-actions">
            <button className="ar-btn ar-btn-save" disabled>
              Saving...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
