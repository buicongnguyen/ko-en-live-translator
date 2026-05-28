(() => {
  const STORAGE_KEY = "translator-theme";

  function storedTheme() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, options = {}) {
    const isDark = theme === "dark";
    if (isDark) {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }

    if (options.persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
      } catch {
        // Ignore storage failures; the visible theme still updates.
      }
    }

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.textContent = isDark ? "Light" : "Dark";
      button.setAttribute("aria-pressed", String(isDark));
    });
  }

  function initializeTheme() {
    applyTheme(storedTheme() === "dark" ? "dark" : currentTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(currentTheme() === "dark" ? "light" : "dark", {
          persist: true,
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTheme);
  } else {
    initializeTheme();
  }
})();
