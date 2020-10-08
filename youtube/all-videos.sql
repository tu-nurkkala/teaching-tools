SELECT p.title,
       to_char(v.published_at, 'YYYY-MM-DD HH:MI:SS') AS published_at,
       v.url,
       v.title,
       v.description
FROM playlist p
         INNER JOIN playlist_video pv ON p.id = pv.playlist_id
         INNER JOIN video v ON v.id = pv.video_id
ORDER BY p.title, v.published_at
