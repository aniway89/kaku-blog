import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "./api";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Shows an error only when there is a message.
export function ErrorMessage({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return <p role="alert">{message}</p>;
}

// Describes the Google login button.
type GoogleLoginProps = {
  onLogin: (credential: string) => Promise<void>;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, string>,
          ) => void;
        };
      };
    };
  }
}

export function GoogleLogin({ onLogin }: GoogleLoginProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Missing VITE_GOOGLE_CLIENT_ID in client/.env");
      return;
    }

    let interval: number | undefined;

    function initializeGoogleLogin() {
      const google = window.google;
      const container = document.getElementById("google-login");

      // Wait until Google's script and our container are available.
      if (!google || !container) {
        return false;
      }

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setLoading(true);
          setError("");

          try {
            await onLogin(credential);
          } catch (err) {
            if (err instanceof Error) {
              setError(err.message);
            } else {
              setError("Google login failed.");
            }
          } finally {
            setLoading(false);
          }
        },
      });

      container.replaceChildren();

      google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
      });

      return true;
    }

    // Try immediately first.
    if (!initializeGoogleLogin()) {
      // If Google hasn't loaded, check again every 200 milliseconds.
      interval = window.setInterval(() => {
        if (initializeGoogleLogin() && interval !== undefined) {
          window.clearInterval(interval);
        }
      }, 200);
    }

    return () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [onLogin]);

  return (
    <div>
      <div id="google-login" />

      {loading && <p>Signing in...</p>}

      <ErrorMessage message={error} />
    </div>
  );
}

// A small preview card used in the feed and My Posts page.
export function PostCard({ post }: { post: Post }) {
  const shortContent = post.content.slice(0, 180);

  return (
    <article>
      <Link to={`/post/${post._id}`}>
        <img
          src={post.coverUrl}
          alt={`Cover for ${post.title}`}
          width={320}
          loading="lazy"
        />

        <h2>{post.title}</h2>
      </Link>

      <p>
        By {post.author.name} ·{" "}
        {new Date(post.createdAt).toLocaleDateString()}
      </p>

      <p>
        {shortContent}
        {post.content.length > 180 ? "…" : ""}
      </p>
    </article>
  );
}
