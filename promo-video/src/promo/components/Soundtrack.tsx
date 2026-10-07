import React from "react";
import { Html5Audio, Sequence, interpolate } from "remotion";
import { ASSETS, optionalAsset } from "../assets";
import type { SfxCue } from "../timeline";
import { CLAMP } from "../utils";

const BGM_VOLUME = 0.5;

/** Background music plus cue-synced effects; any file missing from public/ is skipped. */
export const Soundtrack: React.FC<{ cues: SfxCue[]; duration: number }> = ({ cues, duration }) => {
  const bgm = optionalAsset(ASSETS.bgm);
  const effects = {
    swoosh: optionalAsset(ASSETS.swoosh),
    success: optionalAsset(ASSETS.success),
  };

  return (
    <>
      {bgm ? (
        <Html5Audio
          src={bgm}
          loop
          volume={(f) =>
            interpolate(
              f,
              [0, 15, duration - 30, duration],
              [0, BGM_VOLUME, BGM_VOLUME, 0],
              CLAMP,
            )
          }
        />
      ) : null}
      {cues.map((cue) => {
        const src = effects[cue.sound];
        return src ? (
          <Sequence
            key={`${cue.sound}-${cue.frame}`}
            from={cue.frame}
            name={`SFX · ${cue.sound}`}
            layout="none"
          >
            <Html5Audio src={src} volume={cue.volume} />
          </Sequence>
        ) : null;
      })}
    </>
  );
};
