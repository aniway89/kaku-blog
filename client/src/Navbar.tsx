import { Link } from "react-router-dom";
import type { User } from "./api";
import { ErrorMessage, GoogleLogin } from "./components";

type NavbarProps = {
  user: User | null;
  checkingAuth: boolean;
  authError: string;
  onLogin: (credential: string) => Promise<void>;
  onLogout: () => void;
};

export default function Navbar({
  user,
  checkingAuth,
  authError,
  onLogin,
  onLogout,
}: NavbarProps) {
  return (
    <header>
      <Link to="/">Blog</Link>

      <nav>
        <Link to="/">Feed</Link>{" "}

        {user && (
          <>
            <Link to="/write">Write</Link>{" "}
            <Link to="/mine">My posts</Link>{" "}
            <span>{user.name}</span>{" "}
            <button onClick={onLogout}>Sign out</button>
          </>
        )}
      </nav>

      {!user && !checkingAuth && (
        <GoogleLogin onLogin={onLogin} />
      )}

      {checkingAuth && <p>Checking sign-in...</p>}

      <ErrorMessage message={authError} />
    </header>
  );
}
