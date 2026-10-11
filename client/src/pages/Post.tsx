import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Post, type User } from "../api";
import { ErrorMessage } from "../components";

type PostPageProps = {
  user: User | null;
};

export default function PostPage({ user }: PostPageProps) {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPost() {
      setLoading(true);
      setError("");
      setPost(null);

      try {
        const result = await api.getPost(id);

        if (active) {
          setPost(result.post);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Post not found.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPost();

    return () => {
      active = false;
    };
  }, [id]);

  async function deletePost() {
    if (!post) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this post permanently?",
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.deletePost(post._id);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete post.",
      );
    }
  }

  if (loading) {
    return <p>Loading post...</p>;
  }

  if (!post) {
    return (
      <main>
        <ErrorMessage message={error} />
        <Link to="/">Back to feed</Link>
      </main>
    );
  }

  // Only the author should see the edit and delete buttons.
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

        <img
          src={post.coverUrl}
          alt={`Cover for ${post.title}`}
        />

        <div>
          {post.content.split("\n").map((paragraph, index) => (
            <p key={index}>{paragraph || "\u00a0"}</p>
          ))}
        </div>
      </article>

      {isAuthor && (
        <div>
          <Link to={`/write/${post._id}`}>Edit post</Link>{" "}

          <button onClick={() => void deletePost()}>
            Delete post
          </button>
        </div>
      )}
    </main>
  );
}
