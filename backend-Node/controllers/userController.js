import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import generateToken from "../utils/generateToken.js"
import { encryptField, decryptField } from "../utils/fieldEncryption.js"

// @desc user token
// route /api/users/auth
// @method post
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({ email })

  if (user && (await user.matchPassword(password))) {
    generateToken(res, user._id)

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
    })
  } else {
    res.status(401)
    throw new Error("Invalid email or password")
  }
})

// @desc register user
// route /api/users
// @method post
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body

  const userExists = await User.findOne({ email })

  if (userExists) {
    res.status(400)
    throw new Error("User already exists")
  }

  const user = await User.create({
    name,
    email,
    password,
  })

  if (!user) {
    res.status(400)
    throw new Error("Invalid data")
  }

  generateToken(res, user._id)

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
  })
})

// @desc logout user
// route /api/users/logout
// @method post
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0),
    sameSite: "strict",
  })
  res.status(200).json({ message: "User logged out" })
})

// @desc get user profile
// route /api/users/profile
// @method get
const getUserProfile = asyncHandler(async (req, res) => {
  const user = {
    _id: req.user.id,
    name: req.user.name,
    email: req.user.email,
  }
  res.status(200).json(user)
})

// @desc update user profile
// route /api/users/profile
// @method put
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)

  if (user) {
    user.name = req.body.name || user.name
    user.email = req.body.email || user.email

    if (req.body.password) {
      user.password = req.body.password
    }

    const updatedUser = await user.save()

    res.status(200).json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
    })
  } else {
    res.status(404)
    throw new Error("User not found")
  }
})

// @desc Save LinkedIn credentials (encrypted at rest; never returned in full)
// PUT /api/users/profile/linkedin
const updateLinkedInCredentials = asyncHandler(async (req, res) => {
  const { linkedinUsername, linkedinPassword } = req.body
  if (!linkedinUsername || !linkedinPassword) {
    res.status(400)
    throw new Error("linkedinUsername and linkedinPassword are required")
  }

  const user = await User.findById(req.user._id)
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }
  user.linkedinUsernameEnc = encryptField(String(linkedinUsername).trim())
  user.linkedinPasswordEnc = encryptField(String(linkedinPassword))
  await user.save()

  res.status(200).json({
    message: "LinkedIn credentials stored securely (encrypted)",
    configured: true,
  })
})

// @desc Whether LinkedIn is configured (no secrets returned)
// GET /api/users/profile/linkedin
const getLinkedInStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "linkedinUsernameEnc linkedinPasswordEnc"
  )
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }
  const configured = !!(user.linkedinPasswordEnc && user.linkedinUsernameEnc)
  let usernameHint = ""
  if (configured && user.linkedinUsernameEnc) {
    try {
      const u = decryptField(user.linkedinUsernameEnc)
      if (u.includes("@")) {
        const [local, dom] = u.split("@")
        usernameHint = `${local.slice(0, 2)}***@${dom?.slice(0, 1) ?? ""}***`
      } else {
        usernameHint = `${u.slice(0, 3)}***`
      }
    } catch {
      usernameHint = "••••"
    }
  }
  res.status(200).json({ configured, usernameHint })
})

export {
  authUser,
  registerUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  updateLinkedInCredentials,
  getLinkedInStatus,
}
