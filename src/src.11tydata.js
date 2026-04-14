import { execSync } from "child_process";
import dotenv from "dotenv";
import { OAUTH_SCOPES } from "./oauthScopes.js";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

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
  oauthOrigin: process.env.OAUTH_ORIGIN ?? "",
  environment: process.env.ENVIRONMENT ?? defaultEnvironment,
  oauthScopes: OAUTH_SCOPES,
};
