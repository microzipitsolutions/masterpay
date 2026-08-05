import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE_URL } from "../config/apiConfig";

const DEFAULTS = {
  company_name: "MasterPay",
  logo_url: null,
  theme_color: "#1E88FF",
};

const BrandingContext = createContext({ ...DEFAULTS, loading: false });

export function BrandingProvider({ children }) {
  // Start with null values — no MasterPay defaults leak before the API responds
  const [branding, setBranding] = useState({
    company_name: null,
    logo_url: null,
    theme_color: null,
    loading: true,
  });

  useEffect(() => {
    // Clear immediately so a cached page never briefly shows the old HTML title
    document.title = "";

    fetch(`${API_BASE_URL}/api/public/client-config`, {
      headers: { "x-forwarded-host": window.location.hostname },
    })
      .then((r) => r.json())
      .then((data) => {
        // API returns { company_name: null } for the main platform domain (not in clients table)
        const isMainPlatform = !data.company_name;
        const company_name = data.company_name || DEFAULTS.company_name;
        const theme_color  = data.theme_color  || DEFAULTS.theme_color;
        const logo_url     = data.logo_url     || null;

        setBranding({ company_name, logo_url, theme_color, loading: false });

        document.title = company_name;
        document.documentElement.style.setProperty("--brand-color", theme_color);

        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        if (logo_url) {
          // Client has a custom logo — use it as favicon
          link.href = logo_url;
        } else if (isMainPlatform) {
          // Main platform domain (no client record) — restore the platform favicon
          link.href = "/favicon.svg";
        }
        // else: client domain without a custom logo — leave the blank data:, favicon
        // (avoids showing the platform's icon on a white-label domain)
      })
      .catch(() => {
        setBranding({ ...DEFAULTS, loading: false });
        document.title = DEFAULTS.company_name;
        document.documentElement.style.setProperty("--brand-color", DEFAULTS.theme_color);
        // Network error — assume main platform, restore its favicon
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = "/favicon.svg";
      });
  }, []);

  // Block the entire app until branding resolves — prevents MasterPay flash on client domains
  if (branding.loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "4px solid #e8f3ff",
            borderTopColor: "#1E88FF",
            animation: "mp-spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
