import React from 'react';
import { Composition } from 'remotion';
import { BaseReel, type BaseReelProps } from './compositions/BaseReel';
import reelConfig from '../../config/reel.config.json';

const cfg = reelConfig as any;

const defaultProps: BaseReelProps = {
  width: cfg.output.width,
  height: cfg.output.height,
  bgColor: cfg.style.bgLight,
  textColor: cfg.style.textPrimary,
  accent: cfg.style.accent,
  fontFamily: cfg.style.fontFamily,
  captionY: cfg.style.captionPosition.y,
  beats: [],
  broll: undefined,
  overlays: undefined,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="BaseReel"
      component={BaseReel as unknown as React.FC}
      durationInFrames={Math.round(cfg.duration.targetSec * cfg.output.fps)}
      fps={cfg.output.fps}
      width={cfg.output.width}
      height={cfg.output.height}
      defaultProps={defaultProps as unknown as Record<string, unknown>}
    />
  );
};