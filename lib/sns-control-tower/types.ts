export type SnsPostStatus =
  | "active_final"
  | "superseded"
  | "delete_pending"
  | "delete_failed_permission"
  | "manually_deleted"
  | "unknown";

export type SnsPlatform = "instagram" | "threads" | "unknown";

export type SnsPublishedPost = {
  itemId: string;
  groupKey: string;
  topic: string;
  platform: SnsPlatform;
  mediaId: string | null;
  permalink: string | null;
  shortcode: string | null;
  publishedAt: string | null;
  renderer: string | null;
  renderManifest: string | null;
  renderOk: boolean | null;
  assetCount: number;
  status: SnsPostStatus;
  deletion: SnsDeletionAttempt | null;
  reportPath: string;
};

export type SnsDeletionAttempt = {
  attemptedAt: string | null;
  deleteHttpStatus: number | null;
  verifyGetHttpStatus: number | null;
  reason: string | null;
  reportPath: string;
};

export type SnsControlTowerSnapshot = {
  generatedAt: string;
  posts: SnsPublishedPost[];
  stats: {
    total: number;
    activeFinal: number;
    superseded: number;
    deleteFailedPermission: number;
    missingPermalink: number;
  };
  warnings: string[];
};
