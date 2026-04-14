import "dotenv/config";
import { execSync } from "child_process";
import { OAUTH_SCOPES } from "./oauthScopes.js";

const isProductionBuild = process.env.NODE_ENV === "production";
const defaultHostName = isProductionBuild
  ? "impro.vibe-coded.com"
  : "dev.impro.social";
const defaultEnvironment = isProductionBuild ? "production" : "development";

export default {
  // Output the page as a HTML file
  permalink: (data) => (data.page.fileSlug || "index") + ".html",
  version: execSync("node -p -e \"require('./package.json').version\"")
    .toString()
    .trim(),
  gitCommit: () => execSync("git rev-parse --short=8 HEAD").toString().trim(),
  hostName: process.env.HOST_NAME ?? defaultHostName,
  environment: process.env.ENVIRONMENT ?? defaultEnvironment,
  oauthScopes: OAUTH_SCOPES,
};
