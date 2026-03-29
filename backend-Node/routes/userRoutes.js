import express from "express"
import {
  authUser,
  registerUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  updateLinkedInCredentials,
  getLinkedInStatus,
} from "../controllers/userController.js"
import { protect } from "../middlewares/authMiddleware.js"
import dotenv from "dotenv"
dotenv.config()

const router = express.Router()

router.post("/", registerUser)
router.post("/auth", authUser)
router.post("/logout", logoutUser)
router
  .route("/profile")
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)

router
  .route("/profile/linkedin")
  .get(protect, getLinkedInStatus)
  .put(protect, updateLinkedInCredentials)

router.get("/get" ,(req,res) =>{
  res.send("backend working")
})



export default router
