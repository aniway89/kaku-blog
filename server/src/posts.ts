
import { Router, type RequestHandler } from "express";
import mongoose, { Schema } from "mongoose";
import multer from "multer";
import sharp from "sharp";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { requireAuth } from "./auth";

const router = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PostSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    content: {
      type: String,
      required: true,
      maxlength: 50000,
    },
    coverUrl: { type: String, required: true },
    coverPublicId: { type: String, required: true },
    author: {
      id: { type: String, required: true, index: true },
      name: { type: String, required: true },
      picture: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

PostSchema.index({ createdAt: -1 });

const Post = mongoose.model("Post", PostSchema);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.mimetype)) {
      callback(new Error("Only JPEG, PNG, and WebP images are allowed."));
      return;
    }

    callback(null, true);
  },
});

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function pagination(req: {
  query: Record<string, unknown>;
}) {
  const rawPage = Number(req.query.page ?? 1);
  const rawLimit = Number(req.query.limit ?? 10);

  const page = Number.isFinite(rawPage)
    ? Math.max(1, Math.floor(rawPage))
    : 1;

  const limit = Number.isFinite(rawLimit)
    ? Math.min(20, Math.max(1, Math.floor(rawLimit)))
    : 10;

  return { page, limit };
}

async function uploadCover(file: Express.Multer.File) {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Cover images must be 2 MB or smaller.");
  }

  const input = sharp(file.buffer, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  });

  const metadata = await input.metadata();

  if (
    !metadata.format ||
    !["jpeg", "png", "webp"].includes(metadata.format)
  ) {
    throw new Error("The uploaded file is not a supported image.");
  }

  const webp = await sharp(file.buffer, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();

  const result = await new Promise<{
    secure_url: string;
    public_id: string;
  }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "blog-covers",
        resource_type: "image",
        format: "webp",
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Image upload failed."));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    Readable.from(webp).pipe(stream);
  });

  return {
    coverUrl: result.secure_url,
    coverPublicId: result.public_id,
  };
}

async function removeCover(publicId: string) {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
  } catch (error) {
    console.error("Cloudinary cleanup failed:", error);
  }
}

const imageUpload: RequestHandler = (req, res, next) => {
  upload.single("cover")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: "Cover images must be 2 MB or smaller.",
        });
        return;
      }

      res.status(400).json({ error: error.message });
      return;
    }

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    next();
  });
};

// GET /api/posts — public feed
router.get("/", async (req, res, next) => {
  try {
    const { page, limit } = pagination(req);
    const total = await Post.countDocuments();

    const posts = await Post.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      posts,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/posts/mine — authenticated user's posts
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = pagination(req);
    const filter = { "author.id": req.user!.id };
    const total = await Post.countDocuments(filter);

    const posts = await Post.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      posts,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/posts/:id — public post
router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ error: "Invalid post ID." });
      return;
    }

    const post = await Post.findById(req.params.id).lean();

    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }

    res.json({ post });
  } catch (error) {
    next(error);
  }
});

// POST /api/posts — create a post
router.post("/", requireAuth, imageUpload, async (req, res, next) => {
  let uploadedPublicId = "";

  try {
    const title = cleanText(req.body.title, 160);
    const content = cleanText(req.body.content, 50000);

    if (!title || !content) {
      res.status(400).json({
        error: "Title and content are required.",
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "A cover image is required." });
      return;
    }

    const cover = await uploadCover(req.file);
    uploadedPublicId = cover.coverPublicId;

    const post = await Post.create({
      title,
      content,
      ...cover,
      author: {
        id: req.user!.id,
        name: req.user!.name,
        picture: req.user!.picture,
      },
    });

    res.status(201).json({ post });
  } catch (error) {
    if (uploadedPublicId) await removeCover(uploadedPublicId);
    next(error);
  }
});

// PATCH /api/posts/:id — author only
router.patch(
  "/:id",
  requireAuth,
  imageUpload,
  async (req, res, next) => {
    let newPublicId = "";

    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        res.status(400).json({ error: "Invalid post ID." });
        return;
      }

      const post = await Post.findById(req.params.id);

      if (!post) {
        res.status(404).json({ error: "Post not found." });
        return;
      }

      if (post.get("author.id") !== req.user!.id) {
        res.status(403).json({ error: "You cannot edit this post." });
        return;
      }

      const title = cleanText(req.body.title, 160);
      const content = cleanText(req.body.content, 50000);

      if (!title || !content) {
        res.status(400).json({
          error: "Title and content are required.",
        });
        return;
      }

      let replacement: Awaited<ReturnType<typeof uploadCover>> | undefined;

      if (req.file) {
        replacement = await uploadCover(req.file);
        newPublicId = replacement.coverPublicId;
      }

      const oldPublicId = post.coverPublicId;

      post.title = title;
      post.content = content;

      if (replacement) {
        post.coverUrl = replacement.coverUrl;
        post.coverPublicId = replacement.coverPublicId;
      }

      try {
        await post.save();
      } catch (error) {
        if (newPublicId) await removeCover(newPublicId);
        next(error);
        return;
      }

      if (replacement) await removeCover(oldPublicId);

      res.json({ post });
    } catch (error) {
      if (newPublicId) await removeCover(newPublicId);
      next(error);
    }
  },
);

// DELETE /api/posts/:id — author only
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ error: "Invalid post ID." });
      return;
    }

    const post = await Post.findById(req.params.id);

    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }

    if (post.get("author.id") !== req.user!.id) {
      res.status(403).json({ error: "You cannot delete this post." });
      return;
    }

    await post.deleteOne();
    await removeCover(post.coverPublicId);

    res.json({ message: "Post deleted successfully." });
  } catch (error) {
    next(error);
  }
});

export default router;
