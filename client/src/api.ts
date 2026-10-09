
import imageCompression from "browser-image-compression";

const API = "/api";

export interface User {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface Post {
  _id: string;
  title: string;
  content: string;
  coverUrl: string;
  author: {
    id: string;
    name: string;
    picture: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface FeedResponse {
  posts: Post[];
  page: number;
  pages: number;
  total: number;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>("/auth/me"),

  login: (credential: string) =>
    request<{ user: User }>("/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    }),

  logout: () =>
    request<{ message: string }>("/auth/logout", {
      method: "POST",
    }),

  feed: (page = 1) =>
    request<FeedResponse>(`/posts?page=${page}&limit=10`),

  getPost: (id: string) =>
    request<{ post: Post }>(`/posts/${encodeURIComponent(id)}`),

  myPosts: (page = 1) =>
    request<FeedResponse>(`/posts/mine?page=${page}&limit=10`),

  createPost: (form: FormData) =>
    request<{ post: Post }>("/posts", {
      method: "POST",
      body: form,
    }),

  updatePost: (id: string, form: FormData) =>
    request<{ post: Post }>(`/posts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: form,
    }),

  deletePost: (id: string) =>
    request<{ message: string }>(
      `/posts/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};

export async function compressCover(file: File): Promise<File> {
  const maxInputSize = 2 * 1024 * 1024;

  if (file.size > maxInputSize) {
    throw new Error("Cover images must be 2 MB or smaller.");
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/webp",
  });

  if (compressed.size > maxInputSize) {
    throw new Error("The compressed image is still too large.");
  }

  return new File(
    [compressed],
    "cover.webp",
    { type: "image/webp" },
  );
}
