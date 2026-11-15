export interface NativeFollowStatus {
  following: number;
  knownZombies: number;
  unknownActivity: number;
  generation: number;
  complete: boolean;
  updatedAt: number;
}
