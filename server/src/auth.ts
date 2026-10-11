
import { Router, type RequestHandler } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import mongoose, { Schema } from "mongoose";

const router = Router();
const googleClient = new OAuth2Client();

const UserSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true },
    picture: { type: String, default: "" },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", UserSchema);

interface SessionPayload {
  sub: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        picture: string;
      };
    }
  }
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes.");
  }

  return secret;
}

function cookieOptions() {
  const production = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function publicUser(user: {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  picture?: string;
}) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    picture: user.picture || "",
  };
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.blog_session;

  if (!token) {
    res.status(401).json({ error: "Please sign in first." });
    return;
  }

  try {   
    const payload = jwt.verify(token, jwtSecret(), {
        issuer: "blog-app",
        audience: "blog-app-users",
    }) as jwt.JwtPayload & SessionPayload;


    if (!payload.sub || !mongoose.isValidObjectId(payload.sub)) {
      res.status(401).json({ error: "Invalid session." });
      return;
    }

    void User.findById(payload.sub)
      .then((user) => {
        if (!user) {
          res.clearCookie("blog_session", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
          res.status(401).json({ error: "User no longer exists." });
          return;
        }

        req.user = {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          picture: user.picture || "",
        };

        next();
      })
      .catch(next);
  } catch {
    res.status(401).json({ error: "Invalid or expired session." });
  }
};

router.post("/google", async (req, res, next) => {
  try {
    const credential = req.body?.credential;

    if (typeof credential !== "string" || credential.length > 10000) {
      res.status(400).json({ error: "Invalid Google credential." });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is missing.");
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      res.status(401).json({ error: "Google account could not be verified." });
      return;
    }

    const user = await User.findOneAndUpdate(
      { googleId: payload.sub },
      {
        $set: {
          name: (payload.name || payload.email).slice(0, 100),
          email: payload.email.toLowerCase(),
          picture: payload.picture || "",
        },
        $setOnInsert: { googleId: payload.sub },
      },
      { upsert: true, new: true, runValidators: true },
    );

    const token = jwt.sign(
      { sub: user._id.toString() },
      jwtSecret(),
      { expiresIn: "7d", issuer: "blog-app", audience: "blog-app-users" },
    );

    res.cookie("blog_session", token, cookieOptions());
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("blog_session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  res.json({ message: "Signed out successfully." });
});

export default router;
