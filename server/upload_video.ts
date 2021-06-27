import { Credentials, OAuth2Client } from "google-auth-library";
import * as http from "http";

const fs = require("fs");
const url = require("url");
const { google } = require("googleapis");
const opn = require("opn");
const destroyer = require("destroyer");

const OAuth2 = google.auth.OAuth2;
const youtube = google.youtube("v3");

const TOKEN_PATH = "youtube-tokens.json";
const CREDENTIAL_PATH = "client_secret.json";

const scope = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtubepartner",
];

fs.readFile(CREDENTIAL_PATH, (err: Error, content: string) => {
  if (err) {
    console.log("Error loading client secret file: " + err);
    return;
  }

  const oauth2Client = getOuath2Client(JSON.parse(content));

  authorize(oauth2Client)
    // .then(() => uploadVideo(oauth2Client))
    .then(() => getChannels(oauth2Client))
    .catch(console.log);
});

function authorize(oauth2Client: OAuth2Client) {
  return new Promise<OAuth2Client>((resolve, reject) => {
    fs.readFile(TOKEN_PATH, (err: Error, tokens: string) => {
      if (err) {
        console.log("previous token not found");
        getNewToken(oauth2Client)
          .then(() => resolve(oauth2Client))
          .catch((e) => reject(e));
      } else {
        console.log("previous token exist");
        const token: Credentials = JSON.parse(tokens);

        oauth2Client.setCredentials(token);
        oauth2Client
          .getAccessToken()
          .then(() => {
            resolve(oauth2Client);
          })
          .catch((e) => reject(e));
      }
    });
  });
}

function getOuath2Client(credentials: any) {
  const clientSecret = credentials.web.client_secret;
  const clientId = credentials.web.client_id;
  const redirectUrl = credentials.web.redirect_uris[0];
  return new OAuth2(clientId, clientSecret, redirectUrl);
}

function getNewToken(oauth2Client: OAuth2Client): Promise<OAuth2Client> {
  console.log("get new token");
  return new Promise((resolve, reject) => {
    startServer(resolve, reject, oauth2Client);
  });
}

const startServer = (
  resolve: Function,
  reject: Function,
  oauth2Client: OAuth2Client
) => {
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope,
  });

  const server = http
    .createServer(async (req) => {
      try {
        if (req && req.url && req.url.indexOf("/api/oauth2callback") > -1) {
          const qs = new url.URL(req.url, "http://localhost:3000").searchParams;

          destroyer(server);
          const { tokens } = await oauth2Client.getToken(qs.get("code"));
          console.log(tokens);
          oauth2Client.credentials = tokens;
          storeToken(tokens);
          resolve(oauth2Client);
        }
      } catch (e) {
        reject(e);
      }
    })
    .listen(3000, () => {
      opn(authorizeUrl, { waith: false }).then((cp: any) => cp.unref());
    });
};

function storeToken(token: Credentials) {
  try {
    fs.mkdirSync("./");
  } catch (err) {
    if (err.code != "EEXIST") {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err: Error) => {
    if (err) throw err;
    console.log("Token stored to " + TOKEN_PATH);
  });
}

async function uploadVideo(auth: OAuth2Client) {
  youtube.videos
    .insert({
      auth,
      part: "snippet,status",
      requestBody: {
        snippet: {
          title: "Home Instagram test video",
          description: "Home Instagram test video",
        },
        status: {
          privacyStatus: "private",
        },
      },
      media: {
        body: fs.createReadStream("video.mp4"),
      },
    })
    .then((response: any) => {
      var playlists = response.data.items;
      if (!playlists || playlists.length == 0) {
        console.log("No channel found.");
      } else {
        console.log("This Playlist:", playlists);
      }
    })
    .catch((e: any) => console.log(e.errors[0].message));
}

async function getChannels(auth: OAuth2Client) {
  youtube.channels
    .list({
      auth: auth,
      part: "snippet,contentDetails,statistics",
      mine: true,
    })
    .then((response: any) => {
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
    })
    .catch((e: any) => console.log(e.errors[0].message));
}
