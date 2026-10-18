"use client";

import { useEffect, useRef, useState } from "react";
import {
  DotsThreeIcon,
  WaveformIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { formatTime, type PlaylistTrack } from "@/lib/audio-playlist";

interface PlaylistProps {
  tracks: PlaylistTrack[];
  activeId: string | null;
  playing: boolean;
  loading: boolean;
  onSelect: (id: string) => void;
  onToggle: () => void;
  onRemove: (id: string) => void;
}

export default function Playlist({
  tracks,
  activeId,
  playing,
  loading,
  onSelect,
  onToggle,
  onRemove,
}: PlaylistProps) {
  const [menu, setMenu] = useState<{ id: string; top: number } | null>(null);
  const openId = menu?.id;
  const menuTrack = tracks.find((track) => track.id === openId);
  const menuActive = menuTrack?.id === activeId;
  const list = useRef<HTMLOListElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>("[data-active=true]");
    // Scroll the queue only; scrollIntoView would also move the mobile page.
    if (row && list.current) {
      const top = row.offsetTop;
      if (top < list.current.scrollTop) list.current.scrollTop = top;
      else if (
        top + row.offsetHeight >
        list.current.scrollTop + list.current.clientHeight
      )
        list.current.scrollTop =
          top + row.offsetHeight - list.current.clientHeight;
    }
  }, [activeId]);

  useEffect(() => {
    if (!openId) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !panel.current
          ?.querySelector(".playlist-row.is-menu-open")
          ?.contains(target) &&
        !panel.current?.querySelector(".playlist-menu")?.contains(target)
      )
        setMenu(null);
    };
    panel.current
      ?.querySelector<HTMLButtonElement>(".playlist-menu > button")
      ?.focus();
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [openId]);

  return (
    <aside
      ref={panel}
      className="playlist"
      aria-labelledby="playlist-heading"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu) {
          event.stopPropagation();
          panel.current
            ?.querySelector<HTMLButtonElement>(".is-menu-open .playlist-more")
            ?.focus();
          setMenu(null);
        }
      }}
    >
      <header className="playlist-header">
        <h2 id="playlist-heading">Playlist</h2>
        <span aria-live="polite">{tracks.length} tracks</span>
      </header>
      <ol
        ref={list}
        className="playlist-tracks"
        aria-label="Uploaded tracks"
        onScroll={() => setMenu(null)}
      >
        {tracks.map((track, index) => {
          const active = track.id === activeId;
          const open = track.id === openId;
          return (
            <li
              key={track.id}
              className={`playlist-row ${active ? "is-active" : ""} ${open ? "is-menu-open" : ""}`}
              data-active={active}
            >
              <button
                className="playlist-track"
                onClick={() => (active ? onToggle() : onSelect(track.id))}
                disabled={loading}
                aria-current={active ? "true" : undefined}
                aria-label={`${active && playing ? "Pause" : "Play"} ${track.name}`}
                title={
                  track.failed
                    ? `${track.name} — could not be opened; select to retry`
                    : track.name
                }
              >
                <span className="playlist-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="playlist-title">
                  {active && (
                    <WaveformIcon
                      size={16}
                      weight="bold"
                      className={playing ? "is-playing" : ""}
                      aria-hidden="true"
                    />
                  )}
                  <span>{track.name}</span>
                </span>
                <span className="playlist-duration">
                  {track.failed
                    ? "Error"
                    : track.duration === null
                      ? "--:--"
                      : formatTime(track.duration)}
                </span>
              </button>
              <div className="playlist-actions">
                <button
                  className="playlist-more"
                  aria-label={`Options for ${track.name}`}
                  aria-expanded={open}
                  aria-controls={`track-actions-${track.id}`}
                  onClick={(event) => {
                    const button = event.currentTarget.getBoundingClientRect();
                    const bounds = panel.current!.getBoundingClientRect();
                    setMenu(
                      open
                        ? null
                        : {
                            id: track.id,
                            top: Math.max(
                              36,
                              Math.min(
                                button.bottom - bounds.top,
                                bounds.height - 90,
                              ),
                            ),
                          },
                    );
                  }}
                  disabled={loading}
                >
                  <DotsThreeIcon size={22} weight="bold" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {menu && menuTrack && (
        <div
          id={`track-actions-${menu.id}`}
          className="playlist-menu"
          style={{ top: menu.top }}
        >
          <button
            disabled={loading}
            onClick={() => {
              setMenu(null);
              if (menuActive) onToggle();
              else onSelect(menu.id);
            }}
          >
            {menuActive && playing ? (
              <PauseIcon size={14} />
            ) : (
              <PlayIcon size={14} />
            )}
            {menuActive && playing ? "Pause" : "Play track"}
          </button>
          <button
            disabled={loading}
            onClick={() => {
              setMenu(null);
              onRemove(menu.id);
            }}
          >
            <TrashIcon size={14} />
            Remove track
          </button>
        </div>
      )}
      <footer className="playlist-footer">Sound lives further</footer>
    </aside>
  );
}
