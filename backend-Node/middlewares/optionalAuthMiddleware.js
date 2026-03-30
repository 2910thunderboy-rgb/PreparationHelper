import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

/**
 * Attaches req.user when a valid JWT cookie is present; otherwise continues without user.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  req.user = null;
  const token = req.cookies?.jwt;
  if (!token || !process.env.JWT_SECRET) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    if (user) req.user = user;
  } catch {
    /* ignore invalid token */
  }
  next();
});

export { optionalAuth };
