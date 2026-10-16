"use client";

import {
  CircleNotchIcon,
  FlowerLotusIcon,
  SpiralIcon,
  HexagonIcon,
  GraphIcon,
  AsteriskIcon,
  MountainsIcon,
  DropIcon,
  DotsThreeIcon,
  WaveformIcon,
  PulseIcon,
  BroadcastIcon,
  type Icon,
} from "@phosphor-icons/react";
import { SCENES, type VisualMode } from "@/lib/visual-scenes";

const ICONS: Record<VisualMode, Icon> = {
  Orbit: CircleNotchIcon,
  Senbonzakura: FlowerLotusIcon,
  Galaxy: SpiralIcon,
  Warp: HexagonIcon,
  Constellation: GraphIcon,
  Mandala: AsteriskIcon,
  Terrain: MountainsIcon,
  Rain: DropIcon,
  Particle: DotsThreeIcon,
  Wave: WaveformIcon,
  Beat: PulseIcon,
  Visual: BroadcastIcon,
};

export default function ScenePicker({
  value,
  onChange,
}: {
  value: VisualMode;
  onChange: (mode: VisualMode) => void;
}) {
  return (
    <fieldset className="scene-picker">
      <legend className="section-caption">Scenes</legend>
      <div className="scene-grid">
        {SCENES.map((scene) => {
          const Icon = ICONS[scene.id];
          return (
            <label
              className="scene-choice"
              key={scene.id}
              title={scene.description}
            >
              <input
                type="radio"
                name="Display"
                value={scene.id}
                checked={value === scene.id}
                onChange={() => onChange(scene.id)}
              />
              <span className="scene-tile">
                <Icon size={20} weight="light" aria-hidden="true" />
                <span>{scene.name}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
