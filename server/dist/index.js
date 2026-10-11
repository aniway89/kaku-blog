"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = __importDefault(require("./auth"));
const posts_1 = __importDefault(require("./posts"));
const multer_1 = __importDefault(require("multer"));
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 5000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.disable("x-powered-by");
app.use((0, cors_1.default)({
    origin: CLIENT_ORIGIN,
    credentials: true,
}));
app.use((req, res, next) => {
    const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
    const origin = req.get("origin");
    if (isMutation && origin && origin !== CLIENT_ORIGIN) {
        res.status(403).json({ error: "Request origin is not allowed." });
        return;
    }
    next();
});
app.use(express_1.default.json({ limit: "100kb" }));
app.use((0, cookie_parser_1.default)());
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use("/api/auth", auth_1.default);
app.use("/api/posts", posts_1.default);
app.use((_req, res) => {
    res.status(404).json({ error: "Route not found." });
});
app.use((error, _req, res, _next) => {
    if (error instanceof multer_1.default.MulterError) {
        res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
            error: error.code === "LIMIT_FILE_SIZE"
                ? "Cover images must be 2 MB or smaller."
                : "Invalid upload.",
        });
        return;
    }
    if (error instanceof mongoose_1.default.Error.ValidationError) {
        res.status(400).json({ error: "Invalid post data." });
        return;
    }
    if (error instanceof SyntaxError && "body" in error) {
        res.status(400).json({ error: "Invalid JSON request." });
        return;
    }
    console.error("Request failed:", error);
    res.status(500).json({ error: "Internal server error." });
});
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
    await mongoose_1.default.connect(mongoUri);
    console.log("Connected to MongoDB.");
    app.listen(PORT, () => {
        console.log(`Blog API running at http://localhost:${PORT}`);
    });
}
start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
