
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api, compressCover, type Post, type User } from "./api";

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

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function ErrorMessage({ message }: { message: string }) {
  return message ? <p role="alert">{message}</p> : null;
}

function GoogleLogin({
  onLogin,
}: {
  onLogin: (credential: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("Missing VITE_GOOGLE_CLIENT_ID in client/.env");
      return;
    }

    let interval: number | undefined;

    const initialize = () => {
      const google = window.google;

      if (!google) return false;

      const container = document.getElementById("google-login");
      if (!container) return false;

      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setLoading(true);
          setError("");

          try {
            await onLogin(credential);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Google login failed.",
            );
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
    };

    if (!initialize()) {
      interval = window.setInterval(() => {
        if (initialize() && interval !== undefined) {
          window.clearInterval(interval);
        }
      }, 200);
    }

    return () => {
      if (interval !== undefined) window.clearInterval(interval);
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

function PostCard({ post }: { post: Post }) {
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

      <p>{post.content.slice(0, 180)}{post.content.length > 180 ? "…" : ""}</p>
    </article>
  );
}

function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    api.feed(page)
      .then((data) => {
        if (!active) return;
        setPosts(data.posts);
        setPages(data.pages);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load feed.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page]);

  return (
    <main>
      <h1>Explore blogs</h1>
      <ErrorMessage message={error} />

      {loading && <p>Loading posts...</p>}
      {!loading && posts.length === 0 && <p>No posts yet.</p>}

      {posts.map((post) => (
        <PostCard key={post._id} post={post} />
      ))}

      <nav aria-label="Feed pagination">
        <button
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>

        <span> Page {page} of {pages} </span>

        <button
          disabled={page >= pages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </nav>
    </main>
  );
}

function PostPage({
  user,
  onDelete,
}: {
  user: User | null;
  onDelete: (id: string) => Promise<void>;
}) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setPost(null);

    api.getPost(id)
      .then(({ post }) => {
        if (active) setPost(post);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Post not found.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  async function removePost() {
    if (!post || !window.confirm("Delete this post permanently?")) return;

    try {
      await onDelete(post._id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete post.");
    }
  }

  if (loading) return <p>Loading post...</p>;
  if (!post) return <main><ErrorMessage message={error} /></main>;

  const isAuthor = user?.id === post.author.id;

  return (
    <main>
      <ErrorMessage message={error} />
      <article>
        <h1>{post.title}</h1>
        <p>
          By {post.author.name} ·{" "}
          {new Date(post.createdAt).toLocaleString()}
        </p>
        <img src={post.coverUrl} alt={`Cover for ${post.title}`} />
        <div>
          {post.content.split("\n").map((paragraph, index) => (
            <p key={index}>{paragraph || "\u00a0"}</p>
          ))}
        </div>
      </article>

      {isAuthor && (
        <div>
          <Link to={`/write/${post._id}`}>Edit post</Link>{" "}
          <button onClick={removePost}>Delete post</button>
        </div>
      )}
    </main>
  );
}

function Editor({ user }: { user: User | null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [existingCover, setExistingCover] = useState("");
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let active = true;

    api.getPost(id)
      .then(({ post }) => {
        if (!active) return;

        if (post.author.id !== user?.id) {
          setError("You cannot edit another user's post.");
          return;
        }

        setTitle(post.title);
        setContent(post.content);
        setExistingCover(post.coverUrl);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load post.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, user?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!user) {
      setError("Sign in before publishing.");
      return;
    }

    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }

    if (!id && !cover) {
      setError("Choose a cover image.");
      return;
    }

    setSaving(true);

    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("content", content.trim());

      if (cover) {
        const compressed = await compressCover(cover);
        form.append("cover", compressed, compressed.name);
      }

      const result = id
        ? await api.updatePost(id, form)
        : await api.createPost(form);

      navigate(`/post/${result.post._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save post.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <p>Sign in to write a post.</p>;
  if (loading) return <p>Loading editor...</p>;

  return (
    <main>
      <h1>{id ? "Edit post" : "Write a post"}</h1>
      <ErrorMessage message={error} />

      <form onSubmit={submit}>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            required
          />
        </label>

        <label>
          Content
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={50000}
            rows={14}
            required
          />
        </label>

        <label>
          Cover image (JPEG, PNG, or WebP; maximum 2 MB)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setCover(file);
              setError("");
            }}
            required={!id}
          />
        </label>

        {existingCover && !cover && (
          <img src={existingCover} alt="Current cover" width={240} />
        )}

        {cover && <p>Selected: {cover.name}</p>}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : id ? "Update post" : "Publish post"}
        </button>
      </form>
    </main>
  );
}

function MyPosts({ user }: { user: User | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api.myPosts(page);
      setPosts(result.posts);
      setPages(result.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your posts.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (user) void load();
    else setLoading(false);
  }, [user, load]);

  async function removePost(id: string) {
    if (!window.confirm("Delete this post permanently?")) return;

    try {
      await api.deletePost(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete post.");
    }
  }

  if (!user) return <p>Sign in to view your posts.</p>;

  return (
    <main>
      <h1>My posts</h1>
      <ErrorMessage message={error} />
      {loading && <p>Loading...</p>}
      {!loading && posts.length === 0 && <p>You haven't published anything yet.</p>}

      {posts.map((post) => (
        <article key={post._id}>
          <PostCard post={post} />
          <Link to={`/write/${post._id}`}>Edit</Link>{" "}
          <button onClick={() => void removePost(post._id)}>Delete</button>
        </article>
      ))}

      <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
        Previous
      </button>
      <span> Page {page} of {pages} </span>
      <button disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
        Next
      </button>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  const login = useCallback(async (credential: string) => {
    const result = await api.login(credential);
    setUser(result.user);
    setAuthError("");
  }, []);

  async function logout() {
    try {
      await api.logout();
      setUser(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Could not sign out.");
    }
  }

  async function deletePost(id: string) {
    await api.deletePost(id);
  }

  return (
    <>
      <header>
        <Link to="/">Blog</Link>{" "}
        <nav>
          <Link to="/">Feed</Link>{" "}
          {user && (
            <>
              <Link to="/write">Write</Link>{" "}
              <Link to="/mine">My posts</Link>{" "}
              <span>{user.name}</span>{" "}
              <button onClick={() => void logout()}>Sign out</button>
            </>
          )}
        </nav>

        {!user && !checkingAuth && <GoogleLogin onLogin={login} />}
        {checkingAuth && <p>Checking sign-in...</p>}
        <ErrorMessage message={authError} />
      </header>

      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/post/:id" element={<PostPage user={user} onDelete={deletePost} />} />
        <Route path="/write" element={<Editor user={user} />} />
        <Route path="/write/:id" element={<Editor user={user} />} />
        <Route path="/mine" element={<MyPosts user={user} />} />
        <Route path="*" element={<main><h1>Page not found</h1><Link to="/">Home</Link></main>} />
      </Routes>
    </>
  );
}
