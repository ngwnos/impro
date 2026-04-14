import { html, render } from "/js/lib/lit-html.js";
import { Component, getChildrenFragment } from "./component.js";
import { ScrollLock } from "/js/scrollLock.js";

class AnimatedSidebar extends Component {
  connectedCallback() {
    if (this._initialized) {
      return;
    }
    this.scrollLock = new ScrollLock(this);
    this.isOpen = false;
    this._children = getChildrenFragment(this);
    this.render();
    this._initialized = true;
  }

  render() {
    render(
      html`<div class="sidebar-overlay" @click=${() => this.close()}></div>
        <aside class="sidebar">
          <div class="sidebar-content"></div>
        </aside>`,
      this,
    );
    this.sidebarOverlay = this.querySelector(".sidebar-overlay");
    this.sidebar = this.querySelector(".sidebar");
    this.sidebarContent = this.querySelector(".sidebar-content");
    this.sidebarContent.appendChild(this._children);
    this.syncState();
  }

  syncState() {
    this.sidebarOverlay?.classList.toggle("open", this.isOpen);
    this.sidebar?.classList.toggle("open", this.isOpen);
  }

  open() {
    this.isOpen = true;
    this.scrollLock.lock();
    this.syncState();
  }

  close() {
    this.isOpen = false;
    this.scrollLock.unlock();
    this.syncState();
  }
}

AnimatedSidebar.register();
