"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import axios from "axios";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const LANDING = process.env.NEXT_PUBLIC_LANDING_PAGE_URL || "https://mawsool.tech";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

function permissionItems(scopeStr) {
  const raw = String(scopeStr || "")
    .split(/[\s+]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const items = [
    {
      title: "Search people & companies",
      detail: "Browse Mawsool results with your normal daily search limits.",
    },
    {
      title: "Reveal contacts with your credits",
      detail: "Email and phone reveals use your Mawsool wallet (same rules as the website).",
    },
  ];

  if (raw.includes("offline_access")) {
    items.push({
      title: "Stay connected",
      detail: "Claude can keep access until you disconnect the connector.",
    });
  }

  return items;
}

const OAuthAuthorizeContent = () => {
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [clientName, setClientName] = useState("Claude");
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const redirectedRef = useRef(false);

  const queryString = searchParams.toString();

  const params = useMemo(
    () => ({
      client_id: searchParams.get("client_id") || "",
      redirect_uri: searchParams.get("redirect_uri") || "",
      response_type: searchParams.get("response_type") || "code",
      state: searchParams.get("state") || "",
      code_challenge: searchParams.get("code_challenge") || "",
      code_challenge_method: searchParams.get("code_challenge_method") || "S256",
      scope: searchParams.get("scope") || "mcp offline_access",
      resource: searchParams.get("resource") || "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryString]
  );

  const permissions = useMemo(
    () => permissionItems(params.scope),
    [params.scope]
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        setChecking(true);
        setError("");

        try {
          const me = await api.get("/api/auth/me");
          if (!cancelled) {
            setUser(me.data);
            try {
              sessionStorage.removeItem("mawsool_oauth_signin_hops");
            } catch (_) {}
          }
        } catch (meErr) {
          // Only bounce to signin on auth failure (not network/CORS noise loops)
          const status = meErr?.response?.status;
          if (cancelled || redirectedRef.current) return;
          if (status && status !== 401) {
            if (!cancelled) {
              setError(
                meErr?.response?.data?.msg ||
                  "Unable to verify your Mawsool session. Check API URL / CORS."
              );
              setChecking(false);
            }
            return;
          }
          redirectedRef.current = true;
          const returnUrl = `/oauth/authorize?${queryString}`;
          window.location.replace(
            `/signin?returnUrl=${encodeURIComponent(returnUrl)}&redirect=1`
          );
          return;
        }

        if (!params.client_id || !params.redirect_uri || !params.code_challenge) {
          if (!cancelled) {
            setError(
              "This connection link is incomplete. Please start again from Claude."
            );
            setChecking(false);
          }
          return;
        }

        const validate = await api.get("/api/oauth/authorize/validate", {
          params: {
            client_id: params.client_id,
            redirect_uri: params.redirect_uri,
          },
        });

        if (!cancelled) {
          const name = validate.data?.clientName || "Claude";
          setClientName(name.replace(/\.ai$/i, "") || "Claude");
        }
      } catch (err) {
        console.error("OAuth consent bootstrap failed:", err);
        if (!cancelled) {
          setError(
            err?.response?.data?.msg ||
              "Unable to validate this authorization request."
          );
        }
      } finally {
        if (!cancelled && !redirectedRef.current) setChecking(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [params.client_id, params.redirect_uri, params.code_challenge, queryString]);

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      const response = await api.post("/api/oauth/authorize", params);
      window.location.href = response.data.redirectUrl;
    } catch (err) {
      console.error("OAuth consent approval failed:", err);
      if (err?.response?.status === 401) {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          const returnUrl = `/oauth/authorize?${queryString}`;
          window.location.replace(
            `/signin?returnUrl=${encodeURIComponent(returnUrl)}&redirect=1`
          );
        }
        return;
      }
      setError(
        err?.response?.data?.msg ||
          "Unable to approve access right now. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (params.redirect_uri) {
      try {
        const url = new URL(params.redirect_uri);
        url.searchParams.set("error", "access_denied");
        if (params.state) url.searchParams.set("state", params.state);
        window.location.href = url.toString();
        return;
      } catch (_) {
        // fall through
      }
    }
    window.location.href = "/search";
  };

  if (checking) {
    return <OAuthAuthorizeFallback />;
  }

  return (
    <div className="p-4 flex items-center w-full min-h-screen">
      <div className="flex flex-col items-center w-full h-full justify-center">
        <div className="flex flex-col items-start gap-6 w-full max-w-[426px] animate-[oauthIn_420ms_ease-out]">
          <Link href={LANDING}>
            <Image src="/basic/logo.png" alt="Mawsool" width={145} height={26} />
          </Link>

          <div className="flex flex-col items-start gap-5 w-full">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0004ff]" />
              <span className="text-xs font-medium text-[#434343]">
                Connect Claude to Mawsool
              </span>
            </div>

            <h1 className="text-2xl font-bold text-[#222222] leading-[130%]">
              {clientName} wants to use your Mawsool account
            </h1>

            <p className="text-sm text-[#434343] leading-[150%]">
              Approve to let {clientName} search and enrich leads with your Mawsool
              credits and limits — the same rules as the website.
            </p>

            {user && (
              <div className="w-full rounded-2xl border border-gray-200 bg-[#F7F8FA] px-4 py-3">
                <p className="text-xs font-medium text-[#6B7271] mb-1">
                  Signed in as
                </p>
                <p className="text-sm font-semibold text-[#222222] truncate">
                  {user.name || "Mawsool user"}
                </p>
                <p className="text-xs text-[#434343] truncate">{user.email}</p>
              </div>
            )}

            <div className="w-full flex flex-col gap-3">
              {permissions.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0004ff]/10 text-[#0004ff] text-xs font-bold">
                    ✓
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#222222]">
                      {item.title}
                    </p>
                    <p className="text-xs text-[#6B7271] leading-[150%] mt-0.5">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-1">
              <button
                type="button"
                onClick={handleApprove}
                disabled={isSubmitting || !!error}
                className="w-full rounded-xl bg-[#0004ff] px-2.5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Connecting..." : "Approve & connect"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-gray-200 px-2.5 py-3 text-sm font-medium text-[#364153] hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-[#6B7271] leading-[150%]">
              You can disconnect later from Claude settings. Mawsool never shares
              your password with Claude.
            </p>
          </div>

          <div className="flex items-center justify-between w-full pt-2">
            <span className="text-xs font-medium leading-[130%] text-[#222222]">
              Copyright © 2026 Mawsool
            </span>
            <div className="flex items-center gap-4">
              <a
                href="https://mawsool.tech/privacy-policy"
                target="_blank"
                rel="noreferrer"
                className="text-[#434343] text-xs leading-[130%] hover:underline hover:opacity-80 transition-all"
              >
                Privacy Policy
              </a>
              <a
                href="https://mawsool.tech/terms-of-service/"
                target="_blank"
                rel="noreferrer"
                className="text-[#434343] text-xs leading-[130%] hover:underline hover:opacity-80 transition-all"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex flex-col items-center w-full h-full justify-center relative bg-signup rounded-2xl overflow-hidden">
        <Image
          src="/user/signUp.png"
          alt="Mawsool"
          width={618}
          height={618}
          className="h-[618px] w-auto"
          priority
        />
        <Image
          src="/user/chromeExtention.svg"
          alt=""
          width={100}
          height={100}
          className="absolute top-2/3 animate-topBottom left-1/2"
        />
        <div className="absolute bottom-8 left-8 right-8 rounded-2xl bg-white/90 backdrop-blur-sm border border-white/60 px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-[#222222]">
            Same Mawsool account. Same credits.
          </p>
          <p className="text-xs text-[#434343] mt-1 leading-[150%]">
            Claude tools follow your website search limits and reveal pricing.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes oauthIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

const OAuthAuthorizeFallback = () => (
  <div className="p-4 flex items-center w-full min-h-screen">
    <div className="flex flex-col items-center w-full h-full justify-center">
      <div className="flex flex-col items-start gap-6 w-full max-w-[426px]">
        <div className="h-[26px] w-[145px] bg-gray-200 rounded animate-pulse" />
        <div className="w-full space-y-4">
          <div className="h-8 w-3/4 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-16 w-full bg-gray-200 rounded-2xl animate-pulse" />
          <div className="h-16 w-full bg-gray-200 rounded-2xl animate-pulse" />
          <div className="h-12 w-full bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
    <div className="hidden lg:flex flex-col items-center w-full h-full justify-center relative bg-signup rounded-2xl" />
  </div>
);

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<OAuthAuthorizeFallback />}>
      <OAuthAuthorizeContent />
    </Suspense>
  );
}
