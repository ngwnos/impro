import { OAUTH_SCOPES } from "./src/oauthScopes.js";

function buildOauthClientMetadata(origin) {
  return {
    client_id: `${origin}/oauth-client-metadata.json`,
    client_name: "Impro",
    client_uri: origin,
    logo_uri: `${origin}/img/impro-logo.jpg`,
    redirect_uris: [`${origin}/callback.html`],
    scope: OAUTH_SCOPES,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    dpop_bound_access_tokens: true,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/oauth-client-metadata.json") {
      return new Response(
        JSON.stringify(buildOauthClientMetadata(url.origin), null, 2),
        {
          headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
          },
        },
      );
    }

    return env.ASSETS.fetch(request);
  },
};
