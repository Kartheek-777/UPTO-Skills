const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const JWT_SECRET = (process.env.JWT_SECRET || "").trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Register a new user
const registerUser = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Username, email, and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedUsername = username.trim();

        const existingUser = await User.findOne({
            $or: [
                { username: normalizedUsername },
                { email: normalizedEmail }
            ]
        });

        if (existingUser) {
            return res.status(409).json({
                message: "Username or email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            username: normalizedUsername,
            email: normalizedEmail,
            password: hashedPassword
        });

        return res.status(201).json({
            message: "Registration successful!",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Registration error:", error.message);

        if (error.code === 11000) {
            return res.status(409).json({
                message: "Username or email already exists."
            });
        }

        return res.status(500).json({
            message: "Registration failed."
        });
    }
};

// Login using username and password
const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required."
            });
        }

        const user = await User.findOne({
            username: username.trim()
        });

        if (!user || !user.password) {
            return res.status(401).json({
                message: "Invalid username or password."
            });
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Invalid username or password."
            });
        }

        if (!JWT_SECRET) {
            console.error("JWT_SECRET is missing.");

            return res.status(500).json({
                message: "Authentication is not configured."
            });
        }

        const token = jwt.sign(
            { userId: user._id },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.status(200).json({
            message: "Login successful!",
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profilePicture: user.profilePicture || ""
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            message: "Login failed."
        });
    }
};

// Login or register using Google
const googleLogin = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                message: "Google credential is required."
            });
        }

        if (!GOOGLE_CLIENT_ID || !JWT_SECRET) {
            console.error(
                "Google login error: GOOGLE_CLIENT_ID or JWT_SECRET is missing."
            );

            return res.status(500).json({
                message: "Google login is not configured."
            });
        }

        // Verify the Google ID token on the backend
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();

        if (!payload) {
            return res.status(401).json({
                message: "Invalid Google account information."
            });
        }

        const googleId = payload.sub;
        const email = payload.email?.trim().toLowerCase();
        const emailVerified = payload.email_verified;
        const profilePicture = payload.picture || "";

        if (!googleId || !email || emailVerified !== true) {
            return res.status(401).json({
                message: "A verified Google email is required."
            });
        }

        // Find an account by Google ID or verified email
        let user = await User.findOne({
            $or: [
                { googleId },
                { email }
            ]
        });

        if (user) {
            // Link Google to the existing account.
            // Google has verified ownership of this email.
            if (user.googleId && user.googleId !== googleId) {
                return res.status(409).json({
                    message: "This email is linked to another Google account."
                });
            }

            if (!user.googleId) {
                user.googleId = googleId;
            }

            user.profilePicture = profilePicture;

            await user.save();

        } else {
            // Create a new account for a first-time Google user
            const username =
                `${email.split("@")[0]}_${googleId.slice(-5)}`;

            user = await User.create({
                username,
                email,
                googleId,
                profilePicture
            });
        }

        // Generate the application's JWT
        const token = jwt.sign(
            { userId: user._id },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        return res.status(200).json({
            message: "Google login successful!",
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profilePicture: user.profilePicture || ""
            }
        });

    } catch (error) {
        console.error("Google login error:", error.message);

        if (
            error.name === "ValidationError" ||
            error.code === 11000
        ) {
            return res.status(409).json({
                message: "Unable to create or update the Google account."
            });
        }

        return res.status(401).json({
            message: "Google authentication failed. Please try again."
        });
    }
};

module.exports = {
    registerUser,
    loginUser,
    googleLogin
};