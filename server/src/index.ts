
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRouter from "./auth";
import postsRouter from "./posts";
import multer from "multer";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.disable("x-powered-by");

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);

app.use((req, res, next) => {
  const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
  const origin = req.get("origin");

  if (isMutation && origin && origin !== CLIENT_ORIGIN) {
    res.status(403).json({ error: "Request origin is not allowed." });
    return;
  }

  next();
});

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/posts", postsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof multer.MulterError) {
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Cover images must be 2 MB or smaller."
            : "Invalid upload.",
      });
      return;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({ error: "Invalid post data." });
      return;
    }

    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Invalid JSON request." });
      return;
    }

    console.error("Request failed:", error);

    res.status(500).json({ error: "Internal server error." });
  },
);

async function start() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing from server/.env");
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is missing from server/.env");
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary environment variables are missing.");
  }

  if (!process.env.JWT_SECRET ||
      Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes.");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  app.listen(PORT, () => {
    console.log(`Blog API running at http://localhost:${PORT}`);
  });
}

start().catch((error: unknown) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
