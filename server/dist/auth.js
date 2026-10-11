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
exports.requireAuth = exports.User = void 0;
const express_1 = require("express");
const google_auth_library_1 = require("google-auth-library");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importStar(require("mongoose"));
const router = (0, express_1.Router)();
const googleClient = new google_auth_library_1.OAuth2Client();
const UserSchema = new mongoose_1.Schema({
    googleId: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true },
    picture: { type: String, default: "" },
}, { timestamps: true });
exports.User = mongoose_1.default.model("User", UserSchema);
function jwtSecret() {
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
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };
}
function publicUser(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        picture: user.picture || "",
    };
}
const requireAuth = (req, res, next) => {
    const token = req.cookies?.blog_session;
    if (!token) {
        res.status(401).json({ error: "Please sign in first." });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, jwtSecret(), {
            issuer: "blog-app",
            audience: "blog-app-users",
        });
        if (!payload.sub || !mongoose_1.default.isValidObjectId(payload.sub)) {
            res.status(401).json({ error: "Invalid session." });
            return;
        }
        void exports.User.findById(payload.sub)
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
    }
    catch {
        res.status(401).json({ error: "Invalid or expired session." });
    }
};
exports.requireAuth = requireAuth;
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
        const user = await exports.User.findOneAndUpdate({ googleId: payload.sub }, {
            $set: {
                name: (payload.name || payload.email).slice(0, 100),
                email: payload.email.toLowerCase(),
                picture: payload.picture || "",
            },
            $setOnInsert: { googleId: payload.sub },
        }, { upsert: true, new: true, runValidators: true });
        const token = jsonwebtoken_1.default.sign({ sub: user._id.toString() }, jwtSecret(), { expiresIn: "7d", issuer: "blog-app", audience: "blog-app-users" });
        res.cookie("blog_session", token, cookieOptions());
        res.json({ user: publicUser(user) });
    }
    catch (error) {
        next(error);
    }
});
router.get("/me", exports.requireAuth, (req, res) => {
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
exports.default = router;
