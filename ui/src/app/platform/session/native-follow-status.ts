export interface NativeFollowStatus {
  following: number;
  knownZombies: number;
  unknownActivity: number;
  generation: number;
  complete: boolean;
  updatedAt: number;
}

export interface NativeNotificationReport {
  imported: number;
  complete: boolean;
}
