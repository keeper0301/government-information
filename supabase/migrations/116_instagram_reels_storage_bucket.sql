-- Instagram Reels public storage bucket
-- Meta Graph API 가 video_url 을 직접 fetch 해야 하므로 public bucket 으로 둔다.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('instagram-reels', 'instagram-reels', true, 52428800, ARRAY['video/mp4'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4'];
