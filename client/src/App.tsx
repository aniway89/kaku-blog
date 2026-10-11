import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Route,
  Routes,
} from "react-router-dom";

import { api, type User } from "./api";
import Navbar from "./Navbar";

import { Feed, MyPosts } from "./pages/Feed";
import PostPage from "./pages/Post";
import Editor from "./pages/Editor";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState("");

  // Check whether the user already has a valid login session.
  useEffect(() => {
    async function checkLogin() {
      try {
        const result = await api.me();
        setUser(result.user);
      } catch {
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    }

    void checkLogin();
  }, []);

  // GoogleLogin calls this after Google provides a credential.
  const login = useCallback(async (credential: string) => {
    const result = await api.login(credential);

    setUser(result.user);
    setAuthError("");
  }, []);

  // Sign the user out.
  async function logout() {
    try {
      await api.logout();
      setUser(null);
      setAuthError("");
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Could not sign out.",
      );
    }
  }

  return (
    <>
      <Navbar
        user={user}
        checkingAuth={checkingAuth}
        authError={authError}
        onLogin={login}
        onLogout={() => void logout()}
      />

      <Routes>
        {/* Home feed */}
        <Route path="/" element={<Feed />} />

        {/* View one post */}
        <Route
          path="/post/:id"
          element={<PostPage user={user} />}
        />

        {/* Create a new post */}
        <Route
          path="/write"
          element={<Editor user={user} />}
        />

        {/* Edit an existing post */}
        <Route
          path="/write/:id"
          element={<Editor user={user} />}
        />

        {/* Posts created by the current user */}
        <Route
          path="/mine"
          element={<MyPosts user={user} />}
        />

        {/* Any URL that does not match the routes above */}
        <Route
          path="*"
          element={
            <main>
              <h1>Page not found</h1>
              <Link to="/">Return home</Link>
            </main>
          }
        />
      </Routes>
    </>
  );
}
