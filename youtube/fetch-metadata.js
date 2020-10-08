// Started from https://developers.google.com/youtube/v3/quickstart/nodejs

var fs = require("fs");
var readline = require("readline");
var { google } = require("googleapis");
var OAuth2 = google.auth.OAuth2;

const knex = require("knex")({
  client: "pg",
  connection: {
    host: "localhost",
    database: "course-videos",
  },
});
const debug = require("debug")("fetch");

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"];
var TOKEN_DIR =
  (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) +
  "/.credentials/";
var TOKEN_PATH = TOKEN_DIR + "youtube-nodejs-quickstart.json";

// Load client secrets from a local file.
fs.readFile("client_secret.json", function processClientSecrets(err, content) {
  if (err) {
    console.log("Error loading client secret file: " + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the YouTube API.
  authorize(JSON.parse(content), getPlaylists);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function (err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url: ", authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", function (code) {
    rl.close();
    oauth2Client.getToken(code, function (err, token) {
      if (err) {
        console.log("Error while trying to retrieve access token", err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != "EEXIST") {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
    if (err) throw err;
    console.log("Token stored to " + TOKEN_PATH);
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getChannel(auth) {
  var service = google.youtube("v3");
  service.channels.list(
    {
      auth: auth,
      part: "snippet,contentDetails,statistics",
      mine: true,
    },
    function (err, response) {
      if (err) {
        console.log("The API returned an error: " + err);
        return;
      }
      var channels = response.data.items;
      if (channels.length == 0) {
        console.log("No channel found.");
      } else {
        console.log(
          "This channel's ID is %s. Its title is '%s', and " +
            "it has %s views.",
          channels[0].id,
          channels[0].snippet.title,
          channels[0].statistics.viewCount
        );
      }
    }
  );
}

async function getPlaylists(auth) {
  const service = google.youtube("v3");
  const videoMap = new Map();

  const channels = await service.channels.list({
    auth: auth,
    part: "snippet,contentDetails",
    fields: "items(id,snippet(publishedAt,title,description))",
    mine: true,
    maxResults: 50,
  });

  for (channel of channels.data.items) {
    debug("CHANNEL %O", channel);
    console.log(
      knex("channel")
        .insert({
          id: channel.id,
          published_at: channel.snippet.publishedAt,
          title: channel.snippet.title,
          description: channel.snippet.description,
        })
        .toString() + ";"
    );
    const playlists = await service.playlists.list({
      auth,
      channelId: channel.id,
      part: "snippet,contentDetails",
      fields: "items(id,snippet(publishedAt,channelId,title,description))",
      maxResults: 50,
    });

    for (playlist of playlists.data.items) {
      debug("PLAYLIST %O", playlist);
      console.log(
        knex("playlist")
          .insert({
            id: playlist.id,
            published_at: playlist.snippet.publishedAt,
            channel_id: playlist.snippet.channelId,
            title: playlist.snippet.title,
            description: playlist.snippet.description,
          })
          .toString() + ";"
      );
      const playlistItems = await service.playlistItems.list({
        auth,
        mine: true,
        part: "contentDetails,snippet",
        playlistId: playlist.id,
        fields:
          "items(id,snippet(publishedAt,channelId,title,description),contentDetails)",
        maxResults: 50,
      });

      const videos = await service.videos.list({
        auth,
        mine: true,
        part: "contentDetails,snippet",
        fields: "items(id,snippet(publishedAt,channelId,title,description))",
        id: playlistItems.data.items
          .map((item) => item.contentDetails.videoId)
          .join(","),
        maxResults: 50,
      });
      for (video of videos.data.items) {
        if (videoMap.has(video.id)) {
          debug("ALREADY INSERTED VIDEO %O", video);
        } else {
          debug("INSERT VIDEO %O", video);
          videoMap.set(video.id, video);

          console.log(
            knex("video")
              .insert({
                id: video.id,
                url: `https://youtu.be/${video.id}`,
                published_at: video.snippet.publishedAt,
                title: video.snippet.title,
                description: video.snippet.description,
              })
              .toString() + ";"
          );
        }
        console.log(
          knex("playlist_video")
            .insert({
              playlist_id: playlist.id,
              video_id: video.id,
            })
            .toString() + ";"
        );
      }
    }
  }
}
