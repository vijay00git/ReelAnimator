import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, OffthreadVideo } from 'remotion';

export interface BaseReelProps {
  width: number;
  height: number;
  bgColor: string;
  textColor: string;
  accent: string;
  fontFamily: string;
  captionY: number;
  /** Plain-text script beats with timings (seconds). */
  beats: Array<{ index: number; id: string; start: number; end: number; textEn: string; textTa: string }>;
  /** Optional full-frame background clips keyed by beat index (paths served from public/). */
  broll?: Record<number, string>;
  /** Optional motion-graphic overlay clips keyed by beat index. */
  overlays?: Record<number, string>;
}

/**
 * BaseReel composition: renders the background + per-beat captions.
 * B-roll and motion overlays are layered per-beat via <OffthreadVideo>.
 */
export const BaseReel: React.FC<BaseReelProps> = ({
  width, height, bgColor, textColor, accent, fontFamily, captionY, beats, broll, overlays,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {beats.map((b) => {
        const bg = broll?.[b.index];
        const ov = overlays?.[b.index];
        return (
          <Sequence key={b.id} from={Math.round(b.start * 30)} durationInFrames={Math.round((b.end - b.start) * 30)}>
            <BeatFrame
              beat={b}
              width={width}
              height={height}
              textColor={textColor}
              accent={accent}
              fontFamily={fontFamily}
              captionY={captionY}
              bg={bg}
              overlay={ov}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const BeatFrame: React.FC<{
  beat: BaseReelProps['beats'][number];
  width: number;
  height: number;
  textColor: string;
  accent: string;
  fontFamily: string;
  captionY: number;
  bg?: string;
  overlay?: string;
}> = ({ beat, width, height, textColor, accent, fontFamily, captionY, bg, overlay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      {bg ? (
        // @ts-ignore - staticFile resolved by caller-provided path
        <OffthreadVideo src={bg} style={{ width, height, objectFit: 'cover' }} muted />
      ) : null}
      {overlay ? (
        // @ts-ignore
        <OffthreadVideo src={overlay} style={{ position: 'absolute', inset: 0, width, height, objectFit: 'cover' }} muted />
      ) : null}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height - captionY, opacity }}>
        <div
          style={{
            fontFamily,
            fontSize: 34,
            fontWeight: 700,
            color: textColor,
            textAlign: 'center',
            maxWidth: width * 0.86,
            textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}
        >
          {/* English text primary; Tamil shown smaller underneath */}
          <div>{beat.textEn}</div>
          <div style={{ color: accent, fontSize: 26, marginTop: 6 }}>{beat.textTa}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Lazy import to avoid pulling remotion media at module eval in non-remotion contexts