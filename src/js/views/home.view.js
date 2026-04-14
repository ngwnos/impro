import { View } from "./view.js";
import { html, render } from "/js/lib/lit-html.js";
import { linkToProfile } from "/js/navigation.js";
import { postFeedTemplate } from "/js/templates/postFeed.template.js";
import { menuIconTemplate } from "/js/templates/icons/menuIcon.template.js";
import { mainLayoutTemplate } from "/js/templates/mainLayout.template.js";
import { tabBarTemplate } from "/js/templates/tabBar.template.js";
import { PostSeenObserver } from "/js/postSeenObserver.js";
import { PostInteractionHandler } from "/js/postInteractionHandler.js";
import { FEED_PAGE_SIZE, DISCOVER_FEED_URI } from "/js/config.js";
import { showToast } from "/js/toasts.js";
import { classnames } from "/js/utils.js";
import {
  WINDOW_EFFECT_TOOLS,
  getActiveWindowEffectTool,
  toggleWindowEffectTool,
} from "/js/windowEffectsOverlay.js";

class HomeView extends View {
  async render({
    root,
    context: {
      dataLayer,
      api,
      notificationService,
      chatNotificationService,
      postComposerService,
      reportService,
      isAuthenticated,
    },
  }) {
    function createPersistedState(namespace) {
      return new Proxy(
        {},
        {
          get: (target, prop) => {
            const value = localStorage.getItem(`${namespace}-${prop}`);
            return value ? JSON.parse(value) : null;
          },
          set: (target, prop, value) => {
            localStorage.setItem(`${namespace}-${prop}`, JSON.stringify(value));
            return true;
          },
        },
      );
    }

    const persistedState = isAuthenticated
      ? createPersistedState("home-view")
      : {};

    function resetToDefaultFeed() {
      persistedState.currentFeedUri = isAuthenticated
        ? "following"
        : DISCOVER_FEED_URI;
    }

    if (!persistedState.currentFeedUri) {
      resetToDefaultFeed();
    }

    function getProxyUrl(feedGenerator) {
      if (feedGenerator.uri === "following") {
        return null;
      }
      return `${feedGenerator.did}#bsky_fg`;
    }

    const postSeenObservers = new Map();

    // Initialize post seen observers for feeds with proxy URLs
    function initializePostSeenObservers(pinnedFeedGenerators) {
      if (!isAuthenticated) {
        return;
      }
      const interactableFeedGenerators = pinnedFeedGenerators.filter(
        (pinnedFeedGenerator) =>
          pinnedFeedGenerator.acceptsInteractions ||
          pinnedFeedGenerator.uri === DISCOVER_FEED_URI,
      );
      for (const pinnedFeedGenerator of interactableFeedGenerators) {
        const proxyUrl = getProxyUrl(pinnedFeedGenerator);
        if (proxyUrl) {
          postSeenObservers.set(
            pinnedFeedGenerator.uri,
            new PostSeenObserver(api, proxyUrl),
          );
        }
      }
    }

    async function handleMenuClick() {
      const sidebar = root.querySelector("animated-sidebar");
      sidebar.open();
    }

    function rightColumnTemplate({ feedGenerators, activeWindowEffectTool }) {
      const tools = [
        { id: WINDOW_EFFECT_TOOLS.LASER, label: "Laser" },
        {
          id: WINDOW_EFFECT_TOOLS.BASKETBALLIZE,
          label: "Basketballize",
        },
      ];

      return html`
        <div class="desktop-secondary-column" data-testid="home-right-column">
          <section class="desktop-secondary-section">
            <div class="feeds-list-header">Feeds</div>
            <div class="feeds-list">
              ${feedGenerators && feedGenerators.length > 0
                ? feedGenerators.map(
                    (feedGenerator) => html`
                      <button
                        type="button"
                        class=${classnames(
                          "feeds-list-item",
                          "desktop-secondary-button",
                          {
                            selected:
                              persistedState.currentFeedUri ===
                              feedGenerator.uri,
                          },
                        )}
                        @click=${() => handleTabClick(feedGenerator.uri)}
                      >
                        <div class="feeds-list-item-avatar">
                          <img
                            src=${feedGenerator.avatar ||
                            "/img/list-avatar-fallback.svg"}
                            alt=${feedGenerator.displayName}
                            class="feed-avatar"
                          />
                        </div>
                        <div class="feeds-list-item-content">
                          <div class="feeds-list-item-title">
                            ${feedGenerator.displayName}
                          </div>
                          ${feedGenerator.creator
                            ? html`<div class="feeds-list-item-creator">
                                by @${feedGenerator.creator.handle}
                              </div>`
                            : ""}
                        </div>
                      </button>
                    `,
                  )
                : html`<div class="loading-spinner"></div>`}
            </div>
          </section>
          <section
            class="desktop-secondary-section"
            data-testid="window-tools-panel"
          >
            <div class="feeds-list-header">Tools</div>
            <div class="feeds-list">
              ${tools.map(
                (tool) => html`
                  <button
                    type="button"
                    class=${classnames(
                      "feeds-list-item",
                      "desktop-secondary-button",
                      { selected: activeWindowEffectTool === tool.id },
                    )}
                    data-testid="window-tool-${tool.id}"
                    @click=${() => {
                      toggleWindowEffectTool(tool.id);
                      renderPage();
                    }}
                  >
                    <div class="feeds-list-item-content">
                      <div class="feeds-list-item-title">${tool.label}</div>
                    </div>
                  </button>
                `,
              )}
            </div>
          </section>
        </div>
      `;
    }

    // When supported, replace with: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoViewIfNeeded
    function scrollIntoViewIfNeeded(element) {
      const isVisible =
        element.getBoundingClientRect().top < window.innerHeight &&
        element.getBoundingClientRect().bottom > 0;
      if (!isVisible) {
        element.scrollIntoView();
      }
    }

    const postInteractionHandler = new PostInteractionHandler(
      dataLayer,
      postComposerService,
      reportService,
      {
        renderFunc: () => renderPage(),
      },
    );

    async function handleShowLess(post, feedContext, feedGenerator) {
      dataLayer.mutations.sendShowLessInteraction(
        post.uri,
        feedContext,
        getProxyUrl(feedGenerator),
      );
      // Render optimistic update
      renderPage();
      // Scroll to keep the feedback message in view (it might be hidden by the header, but that's okay)
      const feedFeedbackMessageElement = document.querySelector(
        `.feed-feedback-message[data-post-uri="${post.uri}"]`,
      );
      if (feedFeedbackMessageElement) {
        scrollIntoViewIfNeeded(feedFeedbackMessageElement);
      }
    }

    async function handleShowMore(post, feedContext, feedGenerator) {
      dataLayer.mutations.sendShowMoreInteraction(
        post.uri,
        feedContext,
        getProxyUrl(feedGenerator),
      );
      showToast("Feedback sent to feed operator");
    }

    const feedScrollState = new Map();

    async function scrollAndReloadFeed() {
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      // TODO - add setting to prevent reload?
      await loadCurrentFeed({ reload: true });
    }

    async function handleTabClick(feedUri) {
      if (feedUri === persistedState.currentFeedUri) {
        scrollAndReloadFeed();
        return;
      }
      // Save scroll state
      feedScrollState.set(persistedState.currentFeedUri, window.scrollY);
      // Switch feed
      persistedState.currentFeedUri = feedUri;
      renderPage();
      scrollActiveTabIntoView({ behavior: "smooth" });
      // Scroll to saved scroll state
      if (feedScrollState.has(persistedState.currentFeedUri)) {
        window.scrollTo(0, feedScrollState.get(persistedState.currentFeedUri));
      } else {
        window.scrollTo(0, 0);
      }
      if (!dataLayer.hasCachedFeed(persistedState.currentFeedUri)) {
        await loadCurrentFeed();
      }
      // Trigger post seen checks for the new feed
      const postSeenObserver = postSeenObservers.get(
        persistedState.currentFeedUri,
      );
      if (postSeenObserver) {
        postSeenObserver.checkAllIntersections();
      }
    }

    function feedErrorTemplate({ feedGenerator }) {
      return html`<div class="error-state">
        <div>
          An issue occurred when contacting the feed server.<br />
          Please let the feed owner know about this issue.<br />
          <a href=${linkToProfile(feedGenerator.creator)}>View profile</a>
        </div>
      </div>`;
    }

    async function renderPage() {
      const showLessInteractions =
        dataLayer.selectors.getShowLessInteractions() ?? [];
      const hiddenPostUris = showLessInteractions.map(
        (interaction) => interaction.item,
      );
      const numNotifications =
        notificationService?.getNumNotifications() ?? null;
      const numChatNotifications =
        chatNotificationService?.getNumNotifications() ?? null;
      const currentUser = dataLayer.selectors.getCurrentUser();
      const feedGenerators =
        dataLayer.selectors.getPinnedFeedGenerators() ?? [];
      const activeWindowEffectTool = getActiveWindowEffectTool();
      render(
        html`<div id="home-view">
          ${mainLayoutTemplate({
            isAuthenticated,
            onClickActiveNavItem: () => {
              scrollAndReloadFeed();
            },
            numNotifications,
            numChatNotifications,
            currentUser,
            activeNavItem: "home",
            showFloatingComposeButton: true,
            onClickComposeButton: () =>
              postComposerService.composePost({ currentUser }),
            rightColumn: rightColumnTemplate({
              feedGenerators,
              activeWindowEffectTool,
            }),
            children: html` <header>
                <div class="header-row">
                  <button class="menu-button" @click=${() => handleMenuClick()}>
                    ${menuIconTemplate()}
                  </button>
                </div>
                <div class="header-row">
                  <div class="tab-bar-horizontal-scroll-container">
                    ${tabBarTemplate({
                      tabs: feedGenerators.map((fg) => ({
                        value: fg.uri,
                        label: fg.displayName,
                      })),
                      activeTab: persistedState.currentFeedUri,
                      onTabClick: handleTabClick,
                    })}
                  </div>
                </div>
              </header>
              <main>
                ${feedGenerators.map((feedGenerator) => {
                  const acceptsInteractions =
                    feedGenerator.acceptsInteractions ||
                    feedGenerator.uri === DISCOVER_FEED_URI;
                  const feed = dataLayer.selectors.getFeed(feedGenerator.uri);
                  const feedRequestStatus = dataLayer.requests.getStatus(
                    "loadNextFeedPage-" + feedGenerator.uri,
                  );
                  return html`<div
                    class="feed-container"
                    ?hidden=${persistedState.currentFeedUri !==
                    feedGenerator.uri}
                  >
                    ${feedRequestStatus.error
                      ? feedErrorTemplate({ feedGenerator })
                      : postFeedTemplate({
                          feed,
                          currentUser,
                          feedGenerator,
                          hiddenPostUris,
                          postInteractionHandler,
                          onClickShowLess: (post, feedContext) =>
                            handleShowLess(post, feedContext, feedGenerator),
                          onClickShowMore: (post, feedContext) =>
                            handleShowMore(post, feedContext, feedGenerator),
                          enableFeedFeedback: acceptsInteractions,
                          onLoadMore: () => loadCurrentFeed(),
                        })}
                  </div>`;
                })}
              </main>`,
          })}
        </div>`,
        root,
      );
      const feedItems = document.querySelectorAll(".feed-item");
      feedItems.forEach((feedItem) => {
        const { feedGeneratorUri, feedContext, postUri } = feedItem.dataset;
        if (feedGeneratorUri) {
          const postSeenObserver = postSeenObservers.get(feedGeneratorUri);
          if (postSeenObserver) {
            postSeenObserver.register(feedItem, postUri, feedContext);
          }
        }
      });
    }

    async function loadCurrentFeed({ reload = false } = {}) {
      await dataLayer.requests.loadNextFeedPage(persistedState.currentFeedUri, {
        reload,
        limit: FEED_PAGE_SIZE + 1,
      });
      renderPage();
    }

    async function preloadHiddenFeeds(pinnedFeedGenerators) {
      const feedsToPreload = pinnedFeedGenerators
        .filter((feed) => feed.uri !== persistedState.currentFeedUri)
        .slice(0, 5); // Up to 5 feeds
      for (const feed of feedsToPreload) {
        await dataLayer.requests.loadNextFeedPage(feed.uri, {
          limit: FEED_PAGE_SIZE + 1,
        });
      }
    }

    function scrollActiveTabIntoView({ behavior = "instant" } = {}) {
      const activeTabButton = document.querySelector(".tab-bar-button.active");
      if (activeTabButton) {
        activeTabButton.scrollIntoView({
          behavior,
          block: "nearest",
          // inline: "center",
        });
      }
    }

    root.addEventListener("page-enter", async () => {
      window.scrollTo(0, 0);

      // Initial empty state
      renderPage();

      await dataLayer.declarative
        .ensurePinnedFeedGenerators()
        .then((pinnedFeedGenerators) => {
          // If the current feed is not in the pinned feed generators, reset to default feed
          if (
            !pinnedFeedGenerators.some(
              (feed) => feed.uri === persistedState.currentFeedUri,
            )
          ) {
            resetToDefaultFeed();
          }
          renderPage();
          preloadHiddenFeeds(pinnedFeedGenerators);
          initializePostSeenObservers(pinnedFeedGenerators);
          scrollActiveTabIntoView();
          window.scrollTo(0, 0);
        });

      // Ensure current user before loading feed to prevent flash of unfiltered feed
      let currentUser = null;
      if (isAuthenticated) {
        currentUser = await dataLayer.declarative.ensureCurrentUser();
        renderPage();
      }

      // If /intent/compose, open the post composer and redirect to root
      const url = new URL(window.location);
      if (url.pathname === "/intent/compose" && currentUser) {
        postComposerService.composePost({ currentUser });
        window.history.replaceState(null, "", "/");
      }

      await loadCurrentFeed();
    });

    root.addEventListener("page-restore", (e) => {
      const scrollY = e.detail?.scrollY ?? 0;
      window.scrollTo(0, scrollY);
      renderPage();
    });

    notificationService?.on("update", () => {
      renderPage();
    });

    chatNotificationService?.on("update", () => {
      renderPage();
    });
  }
}

export default new HomeView();
