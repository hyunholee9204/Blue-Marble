import { useEffect, useRef, useState, type ChangeEvent } from 'react';

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YTPlayerOptions {
  width: number;
  height: number;
  videoId: string;
  playerVars: Record<string, number>;
  events: {
    onReady: () => void;
    onStateChange: (e: { data: number }) => void;
    onError: () => void;
  };
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ENDED = 0;
const YT_PLAYING = 1;
const VOLUME_KEY = 'metro-marble:bgm-volume';
const DEFAULT_VOLUME = 40;

let apiReady: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  apiReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiReady;
}

function readVolume(): number {
  try {
    const saved = Number(localStorage.getItem(VOLUME_KEY) ?? DEFAULT_VOLUME);
    return Number.isFinite(saved) ? Math.min(100, Math.max(0, saved)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

type BgmStatus = 'loading' | 'playing' | 'paused' | 'error';

/** Plays one YouTube video on loop; switching `videoId` changes the track, undefined pauses. */
export default function BgmPlayer({ videoId }: { videoId?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const creatingRef = useRef(false);
  /** Bumped on unmount so a player that finishes loading afterwards is discarded. */
  const generationRef = useRef(0);
  const loadedRef = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<BgmStatus>('loading');
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const audible = muted ? 0 : volume;
  const audibleRef = useRef(audible);
  audibleRef.current = audible;

  useEffect(() => {
    const host = hostRef.current;
    return () => {
      generationRef.current++;
      creatingRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedRef.current = undefined;
      host?.replaceChildren();
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!videoId) {
      if (ready) playerRef.current?.pauseVideo();
      return;
    }
    if (ready) {
      if (loadedRef.current !== videoId) {
        loadedRef.current = videoId;
        setStatus('loading');
        playerRef.current?.loadVideoById(videoId);
      } else {
        playerRef.current?.playVideo();
      }
      return;
    }
    if (creatingRef.current) return;

    // First track: create the player once the API script has loaded.
    creatingRef.current = true;
    const generation = generationRef.current;
    loadYouTubeApi().then(() => {
      const host = hostRef.current;
      if (generation !== generationRef.current || !window.YT || !host) return;
      const el = document.createElement('div');
      host.appendChild(el);
      loadedRef.current = videoId;
      playerRef.current = new window.YT.Player(el, {
        width: 200,
        height: 200,
        videoId,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            playerRef.current?.setVolume(audibleRef.current);
            playerRef.current?.playVideo();
            setReady(true);
          },
          onStateChange: ({ data }) => {
            if (data === YT_ENDED) {
              playerRef.current?.seekTo(0, true);
              playerRef.current?.playVideo();
            }
            setStatus(data === YT_PLAYING ? 'playing' : 'paused');
          },
          onError: () => setStatus('error'),
        },
      });
    });
  }, [videoId, ready]);

  useEffect(() => {
    if (ready) playerRef.current?.setVolume(audible);
  }, [ready, audible]);

  const changeVolume = (e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setVolume(next);
    setMuted(false);
    try {
      localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // Volume just won't be remembered.
    }
  };

  const onIconClick = () => {
    if (status === 'paused') playerRef.current?.playVideo();
    else setMuted((m) => !m);
  };

  const icon = status === 'paused' ? '▶' : audible === 0 ? '🔇' : '🔊';
  const label = status === 'paused' ? 'BGM 재생' : muted ? '음소거 해제' : '음소거';

  return (
    <section className="panel bgm-panel" data-status={status} data-video={loadedRef.current}>
      <button
        className="bgm-icon"
        aria-label={label}
        title={label}
        disabled={status === 'error'}
        onClick={(e) => {
          onIconClick();
          e.currentTarget.blur();
        }}
      >
        {icon}
      </button>
      {status === 'error' ? (
        <span className="bgm-error">BGM을 재생할 수 없습니다</span>
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={100}
            value={audible}
            aria-label="BGM 볼륨"
            onChange={changeVolume}
            onPointerUp={(e) => e.currentTarget.blur()}
          />
          <span className="bgm-value">{audible}</span>
        </>
      )}
      <div ref={hostRef} className="bgm-host" aria-hidden="true" />
    </section>
  );
}
