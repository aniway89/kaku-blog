import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, compressCover, type User } from "../api";
import { ErrorMessage } from "../components";

type EditorProps = {
  user: User | null;
};

export default function Editor({ user }: EditorProps) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [existingCover, setExistingCover] = useState("");

  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // If an ID exists in the URL, load that post for editing.
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let active = true;

    async function loadPost() {
      setLoading(true);
      setError("");

      try {
        if (!id) {
            throw new Error("Post ID is missing");
            }

            const result = await api.getPost(id);
        const post = result.post;

        if (!active) {
          return;
        }

        if (post.author.id !== user?.id) {
          setError("You cannot edit another user's post.");
          return;
        }

        setTitle(post.title);
        setContent(post.content);
        setExistingCover(post.coverUrl);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load post.",
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
  }, [id, user?.id]);

  // Called when the user submits the form.
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
        // Validate and compress the image before uploading it.
        const compressedCover = await compressCover(cover);

        form.append(
          "cover",
          compressedCover,
          compressedCover.name,
        );
      }

      let result;

      if (id) {
        // Update the existing post.
        result = await api.updatePost(id, form);
      } else {
        // Create a new post.
        result = await api.createPost(form);
      }

      // Open the saved post.
      navigate(`/post/${result.post._id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save post.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <p>Sign in to write a post.</p>;
  }

  if (loading) {
    return <p>Loading editor...</p>;
  }

  return (
    <main>
      <h1>{id ? "Edit post" : "Write a post"}</h1>

      <ErrorMessage message={error} />

      <form onSubmit={submit}>
        <label>
          Title

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            required
          />
        </label>

        <label>
          Content

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
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
            onChange={(event) => {
              const selectedFile = event.target.files?.[0] ?? null;

              setCover(selectedFile);
              setError("");
            }}
            required={!id}
          />
        </label>

        {existingCover && !cover && (
          <div>
            <p>Current cover:</p>

            <img
              src={existingCover}
              alt="Current cover"
              width={240}
            />
          </div>
        )}

        {cover && <p>Selected image: {cover.name}</p>}

        <button type="submit" disabled={saving}>
          {saving
            ? "Saving..."
            : id
              ? "Update post"
              : "Publish post"}
        </button>
      </form>
    </main>
  );
}
