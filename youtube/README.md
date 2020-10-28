# YouTube Metadata

Fetch all YouTube metadata,
convert to SQL,
insert in database.

This is what you run to do everything.
- `clear-and-reload-everything.sh` - Main shell script to replace **everything** with udates from YouTube
- `client_secret.json` - YouTutube client secrets

A Node program to do all the work
- `fetch-metadata.js` - Fetch all the YouTube metadata
- `package.json`
- `yarn.lock`

Useful SQL
- `delete-all-data.sql` - Delete all the data in the database
- `insert-all-*.sql` - SQL file to insert all data as of a given date
- `all-videos.sql` - List all videos in the database

- 
