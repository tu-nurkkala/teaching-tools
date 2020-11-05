#!/usr/bin/env bash -x

DB_NAME=course-videos
NOW=$(date +%Y-%m-%d_%H:%M:%S)
SQL_FILE_NAME="insert-all-$NOW.sql"

node fetch-metadata.js > $SQL_FILE_NAME
psql --file=delete-all-data.sql $DB_NAME 
psql --file=$SQL_FILE_NAME $DB_NAME 
psql --csv --file=all-videos.sql $DB_NAME > all-videos.csv
