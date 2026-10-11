"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importStar(require("mongoose"));
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const node_stream_1 = require("node:stream");
const cloudinary_1 = require("cloudinary");
const auth_1 = require("./auth");
const router = (0, express_1.Router)();
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const PostSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
PostSchema.index({ createdAt: -1 });
const Post = mongoose_1.default.model("Post", PostSchema);
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
function cleanText(value, maxLength) {
    if (typeof value !== "string")
        return "";
    return value.trim().slice(0, maxLength);
}
function pagination(req) {
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
async function uploadCover(file) {
    if (file.size > 2 * 1024 * 1024) {
        throw new Error("Cover images must be 2 MB or smaller.");
    }
    const input = (0, sharp_1.default)(file.buffer, {
        failOn: "error",
        limitInputPixels: 40_000_000,
    });
    const metadata = await input.metadata();
    if (!metadata.format ||
        !["jpeg", "png", "webp"].includes(metadata.format)) {
        throw new Error("The uploaded file is not a supported image.");
    }
    const webp = await (0, sharp_1.default)(file.buffer, {
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
    const result = await new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({
            folder: "blog-covers",
            resource_type: "image",
            format: "webp",
        }, (error, result) => {
            if (error || !result) {
                reject(error || new Error("Image upload failed."));
                return;
            }
            resolve({
                secure_url: result.secure_url,
                public_id: result.public_id,
            });
        });
        node_stream_1.Readable.from(webp).pipe(stream);
    });
    return {
        coverUrl: result.secure_url,
        coverPublicId: result.public_id,
    };
}
async function removeCover(publicId) {
    if (!publicId)
        return;
    try {
        await cloudinary_1.v2.uploader.destroy(publicId, {
            resource_type: "image",
        });
    }
    catch (error) {
        console.error("Cloudinary cleanup failed:", error);
    }
}
const imageUpload = (req, res, next) => {
    upload.single("cover")(req, res, (error) => {
        if (error instanceof multer_1.default.MulterError) {
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
    }
    catch (error) {
        next(error);
    }
});
// GET /api/posts/mine — authenticated user's posts
router.get("/mine", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { page, limit } = pagination(req);
        const filter = { "author.id": req.user.id };
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
    }
    catch (error) {
        next(error);
    }
});
// GET /api/posts/:id — public post
router.get("/:id", async (req, res, next) => {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            res.status(400).json({ error: "Invalid post ID." });
            return;
        }
        const post = await Post.findById(req.params.id).lean();
        if (!post) {
            res.status(404).json({ error: "Post not found." });
            return;
        }
        res.json({ post });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/posts — create a post
router.post("/", auth_1.requireAuth, imageUpload, async (req, res, next) => {
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
                id: req.user.id,
                name: req.user.name,
                picture: req.user.picture,
            },
        });
        res.status(201).json({ post });
    }
    catch (error) {
        if (uploadedPublicId)
            await removeCover(uploadedPublicId);
        next(error);
    }
});
// PATCH /api/posts/:id — author only
router.patch("/:id", auth_1.requireAuth, imageUpload, async (req, res, next) => {
    let newPublicId = "";
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            res.status(400).json({ error: "Invalid post ID." });
            return;
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            res.status(404).json({ error: "Post not found." });
            return;
        }
        if (post.get("author.id") !== req.user.id) {
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
        let replacement;
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
        }
        catch (error) {
            if (newPublicId)
                await removeCover(newPublicId);
            next(error);
            return;
        }
        if (replacement)
            await removeCover(oldPublicId);
        res.json({ post });
    }
    catch (error) {
        if (newPublicId)
            await removeCover(newPublicId);
        next(error);
    }
});
// DELETE /api/posts/:id — author only
router.delete("/:id", auth_1.requireAuth, async (req, res, next) => {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            res.status(400).json({ error: "Invalid post ID." });
            return;
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            res.status(404).json({ error: "Post not found." });
            return;
        }
        if (post.get("author.id") !== req.user.id) {
            res.status(403).json({ error: "You cannot delete this post." });
            return;
        }
        await post.deleteOne();
        await removeCover(post.coverPublicId);
        res.json({ message: "Post deleted successfully." });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
