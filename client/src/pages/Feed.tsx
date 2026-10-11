import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Post, type User } from "../api";
import { ErrorMessage, PostCard } from "../components";

// Home page: displays all published posts.
export function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPosts() {
      setLoading(true);
      setError("");

      try {
        const result = await api.feed(page);

        if (active) {
          setPosts(result.posts);
          setPages(result.pages);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load feed.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPosts();

    // Prevent state updates if the page changes before the request finishes.
    return () => {
      active = false;
    };
  }, [page]);

  return (
    <main>
      <h1>Explore blogs</h1>

      <ErrorMessage message={error} />

      {loading && <p>Loading posts...</p>}

      {!loading && posts.length === 0 && !error && (
        <p>No posts yet.</p>
      )}

      {posts.map((post) => (
        <PostCard key={post._id} post={post} />
      ))}

      <nav aria-label="Feed pagination">
        <button
          disabled={page <= 1 || loading}
          onClick={() => setPage((currentPage) => currentPage - 1)}
        >
          Previous
        </button>

        <span>
          {" "}Page {page} of {pages}{" "}
        </span>

        <button
          disabled={page >= pages || loading}
          onClick={() => setPage((currentPage) => currentPage + 1)}
        >
          Next
        </button>
      </nav>
    </main>
  );
}

// My Posts page: displays posts belonging to the signed-in user.
export function MyPosts({ user }: { user: User | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadPosts() {
    setLoading(true);
    setError("");

    try {
      const result = await api.myPosts(page);

      setPosts(result.posts);
      setPages(result.pages);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your posts.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      void loadPosts();
    } else {
      setLoading(false);
    }
  }, [user, page]);

  async function deletePost(id: string) {
    const confirmed = window.confirm(
      "Delete this post permanently?",
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.deletePost(id);
      await loadPosts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete post.",
      );
    }
  }

  if (!user) {
    return <p>Sign in to view your posts.</p>;
  }

  return (
    <main>
      <h1>My posts</h1>

      <ErrorMessage message={error} />

      {loading && <p>Loading your posts...</p>}

      {!loading && posts.length === 0 && !error && (
        <p>You haven't published anything yet.</p>
      )}

      {posts.map((post) => (
        <article key={post._id}>
          <PostCard post={post} />

          <Link to={`/write/${post._id}`}>Edit</Link>{" "}

          <button onClick={() => void deletePost(post._id)}>
            Delete
          </button>
        </article>
      ))}

      <button
        disabled={page <= 1 || loading}
        onClick={() => setPage((currentPage) => currentPage - 1)}
      >
        Previous
      </button>

      <span>
        {" "}Page {page} of {pages}{" "}
      </span>

      <button
        disabled={page >= pages || loading}
        onClick={() => setPage((currentPage) => currentPage + 1)}
      >
        Next
      </button>
    </main>
  );
}
