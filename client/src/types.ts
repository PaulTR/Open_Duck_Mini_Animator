export type InterpolationType = 'linear' | 'bezier' | 'bezier_viscous' | 'bezier_clamped';
export type AntennaPosition = 'back' | 'center' | 'forward';

export interface Keyframe {
  id: string;
  durationMs: number;
  pauseMs: number;
  motors: Record<string, number>;
  lightsOn: boolean;
  projectorOn: boolean;
  interpolation: InterpolationType;
  antennas: {
    left: AntennaPosition;
    right: AntennaPosition;
  };
}
