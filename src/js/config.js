// shared constants, etc.

function getRuntimeHostNames() {
  if (typeof window === "undefined") {
    return [];
  }

  const configuredHostName = window.env?.hostName;
  return [window.location.hostname, configuredHostName].filter(Boolean);
}

export const NOTIFICATIONS_PAGE_SIZE = 40;
export const FEED_PAGE_SIZE = 40;
export const HASHTAG_FEED_PAGE_SIZE = 40;
export const BOOKMARKS_PAGE_SIZE = 40;
export const AUTHOR_FEED_PAGE_SIZE = 40;
export const DISCOVER_FEED_URI =
  "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
export const CHAT_MESSAGES_PAGE_SIZE = 100;
export const BSKY_LABELER_DID = "did:plc:ar7c4by46qjdydhdevvrndac";
export const IN_APP_LINK_DOMAINS = [
  ...new Set([
    "bsky.app",
    "impro.social",
    "impro.vibe-coded.com",
    "dev.impro.social",
    "localhost",
    ...getRuntimeHostNames(),
  ]),
];
