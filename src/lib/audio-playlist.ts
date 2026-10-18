export interface PlaylistTrack {
  id: string;
  file: File;
  name: string;
  duration: number | null;
  failed?: boolean;
}

export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export function isAudioFile(file: File) {
  return (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|flac|aac|aiff|aif|webm)$/i.test(file.name)
  );
}

// Read queued durations without retaining a decoded AudioBuffer per track.
export function readAudioDuration(file: File, signal: AbortSignal) {
  return new Promise<number | null>((resolve) => {
    if (signal.aborted) return resolve(null);
    const media = new Audio();
    const url = URL.createObjectURL(file);
    const finish = (duration: number | null) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    const abort = () => finish(null);
    const timeout = setTimeout(() => finish(null), 10000);
    signal.addEventListener("abort", abort, { once: true });
    media.preload = "metadata";
    media.onloadedmetadata = () =>
      finish(Number.isFinite(media.duration) ? media.duration : null);
    media.onerror = () => finish(null);
    media.src = url;
  });
}
